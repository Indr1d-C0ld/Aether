// Effetto domino (regole in shared/domino.ts). Le dipendenze si calcolano dalla posizione dei nodi (il fornitore più
// vicino di ogni tipo che serve, nella stessa regione se c'è) e si ricalcolano ogni ora, così un trasloco le cambia.
// Un sabotaggio a un fornitore mette in disservizio i clienti: costi, morale, sistemi distratti, una notizia in Cronaca,
// un contratto per i rossi su un cliente e uno per i blu sul fornitore.
import type { Game, AgentDoc, NodeDoc } from "./game.ts";
import { regionAt } from "../shared/rules.ts";
import { CASCADE_CHANCE, INFECTION_OUTAGE, NEEDS, OUTAGE_H, OUTAGE_WATCH, SUPPLY_WHAT, outageCost, type OutageMark, type SupplyView } from "../shared/domino.ts";

type Org = { cash: number; rep: number; morale: number };
type Orgs = { news: (kind: "economia" | "sabotaggio", text: string, n: NodeDoc | null, feed?: boolean) => void; isOrg: (n: NodeDoc) => boolean; org: (n: NodeDoc) => Org };
type State = { down: Record<string, OutageMark>; cascades: number };

const H = 3600_000;
const now = () => Date.now();
const dev = () => process.env.AETHER_DEV === "1";
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;

export function installDomino(game: Game, orgs: Orgs) {
  const state: State = game.store.get<State>("domino", "state") ?? { down: {}, cascades: 0 };
  let dirty = false;

  // ---------------------------------------------------------------- chi rifornisce chi
  let suppliers = new Map<string, string[]>();
  let clients = new Map<string, string[]>();
  let builtAt = 0;
  const eligible = (n: NodeDoc) => orgs.isOrg(n) && !n.hidden && !n.inner && n.kind !== "home" && n.kind !== "relay" && n.kind !== "gateway";
  function build() {
    const all = [...game.nodes.values()].filter(eligible);
    const byKind = new Map<string, NodeDoc[]>();
    for (const n of all) (byKind.get(n.kind) ?? byKind.set(n.kind, []).get(n.kind)!).push(n);
    suppliers = new Map();
    clients = new Map();
    for (const n of all) {
      const out: string[] = [];
      for (const k of NEEDS[n.kind] ?? []) {
        const pool = (byKind.get(k) ?? []).filter((x) => x.id !== n.id);
        if (!pool.length) continue;
        const region = regionAt(n.x, n.y);
        const near = pool.filter((x) => regionAt(x.x, x.y) === region);
        const best = (near.length ? near : pool).reduce((a, b) => (Math.hypot(a.x - n.x, a.y - n.y) <= Math.hypot(b.x - n.x, b.y - n.y) ? a : b));
        out.push(best.id);
        (clients.get(best.id) ?? clients.set(best.id, []).get(best.id)!).push(n.id);
      }
      if (out.length) suppliers.set(n.id, out);
    }
    builtAt = now();
  }
  const fresh = () => (now() - builtAt > H ? build() : undefined);
  const down = (id: string) => {
    const d = state.down[id];
    return d && d.until > now() ? d : null;
  };

  // ---------------------------------------------------------------- il guasto che si propaga
  function cascade(src: NodeDoc, who: AgentDoc | null) {
    fresh();
    const hit: NodeDoc[] = [];
    const visit = (s: NodeDoc, depth: number) => {
      const what = SUPPLY_WHAT[s.kind];
      if (!what) return;
      for (const id of clients.get(s.id) ?? []) {
        const c = game.nodes.get(id);
        if (!c || down(id) || hit.includes(c)) continue;
        state.down[id] = { by: s.org, byId: s.id, what, until: now() + OUTAGE_H * H };
        const o = orgs.org(c);
        o.cash -= outageCost(game.tierOf(c));
        o.morale = Math.max(0, o.morale - 5);
        o.rep = Math.max(0, o.rep - 2);
        hit.push(c);
        // chi è a sua volta fornitore può far cadere un altro anello
        if (depth < 2 && clients.get(c.id)?.length && Math.random() < CASCADE_CHANCE) visit(c, depth + 1);
      }
    };
    visit(src, 1);
    if (!hit.length) return;
    state.cascades += 1;
    dirty = true;
    const names = hit.slice(0, 3).map((n) => n.org).join(", ");
    orgs.news("economia", `Effetto domino: dopo il sabotaggio a ${src.org}, ${hit.length === 1 ? `${names} resta` : `${hit.length} organizzazioni restano`} senza ${SUPPLY_WHAT[src.kind]}${hit.length > 1 ? ` (${names}${hit.length > 3 ? " e altre" : ""})` : ""}. Si lavora in emergenza per qualche ora.`, src);
    if (who && !who.npc) {
      game.bump(who, "dom:cascade");
      game.dirty.add(who.id);
    }
    jobs(src, hit);
  }
  function jobs(src: NodeDoc, hit: NodeDoc[]) {
    const c = pick(hit);
    const red = game.baseMission("red", "chain", c);
    red.title = `Disservizio: ${c.org}`;
    red.brief = `${c.org} lavora in emergenza da quando ${src.org} è giù: sistemi distratti, personale al telefono con i tecnici. Entra da admin e porta via un file prima che torni tutto normale.`;
    red.objectives = [{ deed: "admin", n: 1, nodeId: c.id, label: `Diventa admin su ${c.org}` }, { deed: "t:copy", n: 1, nodeId: c.id, label: "Copia un file" }];
    red.reward += 600 + game.tierOf(c) * 250;
    red.xp += 100;
    red.expiresAt = now() + OUTAGE_H * H;
    red.requires = game.secRequires(c);
    game.priced(red);
    game.missions.set(red.id, red);
    game.touch("mission", red.id);
    const blue = game.baseMission("blue", "audit", src);
    blue.title = `Ripristino: ${src.org}`;
    blue.brief = `Il sabotaggio a ${src.org} ha lasciato ${hit.length} client${hit.length === 1 ? "e" : "i"} senza servizio. Presidia il sistema e rinforzalo prima che qualcuno ci riprovi.`;
    blue.objectives = [{ deed: "preside", n: 1, nodeId: src.id, label: `Presidia ${src.org}` }, { deed: "t:patch", n: 1, nodeId: src.id, label: "Rinforza il sistema" }];
    blue.clientAccess = true;
    (blue as unknown as { clientNodes: string[] }).clientNodes = [src.id];
    blue.reward += 500 + game.tierOf(src) * 250;
    blue.xp += 100;
    blue.expiresAt = now() + OUTAGE_H * H;
    blue.requires = ["patch"];
    game.priced(blue);
    game.missions.set(blue.id, blue);
    game.touch("mission", blue.id);
  }

  const prevEvent = game.orgEvent;
  game.orgEvent = (n, kind, who) => {
    prevEvent?.(n, kind, who);
    if (!SUPPLY_WHAT[n.kind]) return;
    if (kind !== "sabotaggio" && !(kind === "infezione" && (n.kind === "util" || n.kind === "telco") && Math.random() < INFECTION_OUTAGE)) return;
    const a = who ? ([...game.agents.values()].find((x) => x.handle === who) ?? null) : null;
    cascade(n, a);
  };
  // in disservizio i sistemi guardano meno
  const prevWatch = game.orgWatch;
  game.orgWatch = (n) => (prevWatch?.(n) ?? 1) * (down(n.id) ? OUTAGE_WATCH : 1);
  // sulla mappa: chi rifornisce il nodo, e se è in disservizio
  const prevMarks = game.nodeMarks;
  game.nodeMarks = (n) => {
    fresh();
    return { ...(prevMarks?.(n) ?? {}), outage: down(n.id), suppliers: suppliers.get(n.id) ?? [] };
  };
  // nella scheda dell'organizzazione, in Cronaca
  game.orgSupply = (n): SupplyView => {
    fresh();
    return {
      suppliers: (suppliers.get(n.id) ?? []).map((id) => game.nodes.get(id)!).filter(Boolean).map((s) => ({ id: s.id, name: s.org, kind: s.kind, what: SUPPLY_WHAT[s.kind] ?? "", down: Boolean(down(s.id)) || (s.offlineUntil ?? 0) > now() })),
      clients: (clients.get(n.id) ?? []).map((id) => game.nodes.get(id)!).filter(Boolean).map((c) => ({ id: c.id, name: c.org, down: Boolean(down(c.id)) })),
      outage: down(n.id),
    };
  };
  game.onPulse.push(() => {
    for (const [id, d] of Object.entries(state.down)) if (d.until < now()) (delete state.down[id]), (dirty = true);
  });

  const prev = game.socialAct;
  game.socialAct = (agent, a, p) => {
    if (a !== "domino") return prev?.(agent, a, p) ?? null;
    const n = game.nodes.get(String(p.id ?? ""));
    if (p.dev && dev() && n && p.sabotage) game.orgEvent?.(n, "sabotaggio", agent.handle);
    if (p.dev && dev() && p.clear) state.down = {};
    return n ? { ok: true, data: game.orgSupply!(n) } : { ok: false, error: "organizzazione sconosciuta" };
  };

  return {
    save() {
      if (!dirty) return;
      dirty = false;
      game.store.put("domino", "state", state);
    },
  };
}
