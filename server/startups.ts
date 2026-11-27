// Organizzazioni che aprono da zero (testi in server/startups-text.ts).
// Chi è rimasto senza lavoro, prima o poi, apre qualcosa: diventa amministratore del sistema nuovo e si porta dietro
// altri licenziati. Le aperture nascono deboli (difese da principianti, password da dizionario) e crescono con il
// resto del mondo: comprano difese se hanno paura, vanno in crisi, vengono comprate. Nessuna sparisce.
import type { Game, NodeDoc } from "./game.ts";
import { PEOPLE, type Person } from "./people.ts";
import { DICTIONARY } from "./content.ts";
import { STARTUP_KINDS } from "./startups-text.ts";

type State = { born: { id: string; at: number; founder: string }[]; seq: number; lastAt: number };
type Orgs = { news: (kind: "economia" | "gente", text: string, n: NodeDoc | null, feed?: boolean) => void; org: (n: NodeDoc) => { cash: number }; isOrg: (n: NodeDoc) => boolean };
type Citizens = { jobless: () => Person[]; hire: (pid: string, nodeId: string) => void; fire: (pid: string, nodeId: string) => void; employerId: (pid: string) => string | null };
export type StartupRow = { id: string; name: string; sub: string; city: string; founder: string; at: number };

const now = () => Date.now();
const H = 3600_000;
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;
/** Al massimo tante aperture vive insieme; fra un'apertura e l'altra almeno tante ore. */
export const STARTUP_MAX = 16;
const GAP_H = 3;

export function installStartups(game: Game, orgs: Orgs, citizens: Citizens) {
  const state: State = game.store.get<State>("startups", "state") ?? { born: [], seq: 0, lastAt: 0 };
  let dirty = false;
  const live = () => state.born.filter((b) => game.nodes.has(b.id));
  const usedIps = () => new Set([...game.nodes.values()].map((n) => n.ip));
  function freeIp() {
    const used = usedIps();
    for (;;) {
      const ip = `${11 + Math.floor(Math.random() * 210)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${2 + Math.floor(Math.random() * 250)}`;
      if (!used.has(ip)) return ip;
    }
  }

  /** Apre un'organizzazione nuova. «force» salta i tetti (solo per i test). */
  function found(force = false): NodeDoc | null {
    if (!force && live().length >= STARTUP_MAX) return null;
    const jobless = citizens.jobless();
    const founder: Person | undefined = pick(jobless.length ? jobless : PEOPLE.filter((p) => !citizens.employerId(p.id)).concat(PEOPLE).slice(0, 40));
    if (!founder) return null;
    const tpl = pick(STARTUP_KINDS);
    // vicino a un'organizzazione già esistente: le città restano città
    const anchors = [...game.nodes.values()].filter((n) => orgs.isOrg(n) && !n.hidden && !n.inner && n.city);
    const near = pick(anchors);
    if (!near) return null;
    state.seq += 1;
    const id = `s-${state.seq}-${Date.now().toString(36)}`;
    const word = pick(tpl.words);
    const tail = pick(tpl.tails);
    const org = `${word} ${tail}`;
    const n = {
      id,
      name: `${word.toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "").slice(0, 6)}-${tail.toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "").slice(0, 3)}`,
      org,
      kind: tpl.kind,
      ip: freeIp(),
      x: Math.max(2, Math.min(317, near.x + Math.round((Math.random() - 0.5) * 6))),
      y: Math.max(2, Math.min(177, near.y + Math.round((Math.random() - 0.5) * 6))),
      blurb: pick(tpl.blurb),
      proxy: Math.random() < 0.5 ? 0 : 1,
      firewall: 1,
      monitor: 1,
      password: pick(DICTIONARY),
      files: tpl.files.map(([name, size, enc, preview], i) => ({ id: `${id}-f${i}`, name, size, encryption: enc, value: 2 + enc * 2 + Math.round(size / 2), preview, deleted: false, deletedAt: null, honeypot: null })),
      records: [],
      logs: [],
      backdoors: [],
      patch: null,
      activity: 0.3,
      gen: true,
      sub: pick(tpl.sub),
      city: near.city,
      adminId: founder.id,
      homeOf: null,
    } as unknown as NodeDoc;
    game.nodes.set(id, n);
    game.touch("node", id);
    citizens.hire(founder.id, id);
    // il fondatore si porta dietro fino a due persone rimaste a casa
    const crew = jobless.filter((p) => p.id !== founder.id).slice(0, 2);
    for (const p of crew) citizens.hire(p.id, id);
    orgs.org(n).cash = 2500;
    state.born.push({ id, at: now(), founder: founder.id });
    state.lastAt = now();
    dirty = true;
    // a frasi separate e senza desinenze attaccate: così il client di chi gioca in inglese le traduce una per una
    const lost = jobless.some((p) => p.id === founder.id) ? " Aveva perso il lavoro." : "";
    const team = crew.length ? ` Nella squadra: ${crew.map((p) => p.name).join(", ")}.` : "";
    orgs.news("economia", `Apre ${org} a ${near.city}: ${n.sub}. La fonda ${founder.name}.${lost}${team} ${n.blurb}`, n);
    return n;
  }

  game.orgAcquired = (n) => {
    // chi compra taglia: metà del personale, mai l'amministratore
    const staff = PEOPLE.filter((p) => citizens.employerId(p.id) === n.id && p.id !== n.adminId);
    const cut = staff.filter((_, i) => i % 2 === 0);
    for (const p of cut) citizens.fire(p.id, n.id);
    if (cut.length) orgs.news("gente", `Dopo l'acquisizione, ${n.org} lascia a casa ${cut.length === 1 ? cut[0]!.name : `${cut.length} persone`}.`, n, false);
    dirty = true;
  };

  function pulse() {
    if (!game.on("npcActive")) return;
    if (live().length >= STARTUP_MAX) return;
    if (now() - state.lastAt < GAP_H * H) return;
    // più disoccupati ci sono, prima qualcuno si mette in proprio
    const k = Math.min(6, citizens.jobless().length);
    if (Math.random() < 0.004 + k * 0.004) found();
  }
  game.onPulse.push(pulse);

  const rows = (): StartupRow[] =>
    live()
      .map((b) => ({ b, n: game.nodes.get(b.id)! }))
      .reverse()
      .slice(0, 8)
      .map(({ b, n }) => ({ id: n.id, name: n.org, sub: n.sub ?? "", city: n.city ?? "", founder: game.personName(b.founder), at: b.at }));
  const prev = game.socialAct;
  game.socialAct = (agent, a, p) => {
    if (a === "world" && p.cmd === "found" && process.env.AETHER_DEV === "1") {
      const n = found(true);
      return n ? { ok: true, data: { id: n.id, org: n.org, ip: n.ip, adminId: n.adminId, password: n.password } } : { ok: false, error: "niente" };
    }
    const r = prev?.(agent, a, p) ?? null;
    if (a === "world" && !p.cmd && r?.ok && r.data) (r.data as { startups?: StartupRow[] }).startups = rows();
    return r;
  };
  return {
    found,
    save() {
      if (!dirty) return;
      dirty = false;
      game.store.put("startups", "state", state);
    },
  };
}
