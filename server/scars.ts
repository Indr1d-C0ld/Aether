// Le cicatrici del Reticolo (regole in shared/scars.ts): sistemi sabotati che restano segnati e in allerta,
// città al buio dopo un sabotaggio a una rete, organizzazioni che traslocano dopo troppi colpi.
// I traslochi sopravvivono ai riavvii: la posizione dei nodi viene dal contenuto, quindi qui si riapplica.
import type { Game, AgentDoc, NodeDoc } from "./game.ts";
import { WORLD_CITIES } from "./worldgen.ts";
import { project } from "../shared/rules.ts";
import { DARK_H, DARK_WATCH, MOVERS, MOVE_AT, MOVE_COOLDOWN_H, MOVE_TRAIL_H, MOVE_WINDOW_H, SCAR_ALERT_H, SCAR_H, type NodeMarks } from "../shared/scars.ts";

type Spot = { x: number; y: number; city: string };
type State = {
  hits: Record<string, { at: number; w: number; by: string | null }[]>;
  scars: Record<string, number>;
  dark: Record<string, number>;
  moves: Record<string, { from: Spot; to: Spot; at: number }>;
};
type Orgs = { news: (kind: "sabotaggio" | "economia", text: string, n: NodeDoc | null, feed?: boolean) => void; isOrg: (n: NodeDoc) => boolean };

const H = 3600_000;
const now = () => Date.now();
const dev = () => process.env.AETHER_DEV === "1";
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;

export function installScars(game: Game, orgs: Orgs) {
  const state: State = game.store.get<State>("scars", "state") ?? { hits: {}, scars: {}, dark: {}, moves: {} };
  let dirty = false;
  // i traslochi di prima del riavvio
  for (const [id, m] of Object.entries(state.moves)) {
    const n = game.nodes.get(id);
    if (n) Object.assign(n, m.to);
  }
  const byHandle = (h: string | null): AgentDoc | null => (h ? ([...game.agents.values()].find((a) => a.handle === h && !a.npc) ?? null) : null);
  const freeIp = () => {
    const used = new Set([...game.nodes.values()].map((n) => n.ip));
    for (;;) {
      const ip = `${11 + Math.floor(Math.random() * 212)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 253)}`;
      if (!used.has(ip)) return ip;
    }
  };

  function relocate(n: NodeDoc, toCity?: string) {
    const cities = WORLD_CITIES.filter((c) => c[0] !== n.city);
    const c = cities.find((x) => x[0] === toCity) ?? pick(cities);
    const p = project(c[1], c[2]);
    const from: Spot = { x: n.x, y: n.y, city: n.city ?? n.name };
    const to: Spot = { x: Math.max(2, Math.min(317, p.x + Math.round(Math.random() * 4 - 2))), y: Math.max(2, Math.min(177, p.y + Math.round(Math.random() * 4 - 2))), city: c[0] };
    Object.assign(n, to);
    n.ip = freeIp();
    game.react(n, null); // sistemi nuovi, password nuove
    state.moves[n.id] = { from, to, at: now() };
    const who = new Set((state.hits[n.id] ?? []).map((h) => h.by).filter((x): x is string => Boolean(x)));
    for (const id of who) {
      const a = game.agents.get(id);
      if (a) game.bump(a, "scar:move"), game.dirty.add(a.id);
    }
    state.hits[n.id] = [];
    game.touch("node", n.id);
    orgs.news("economia", `${n.org} lascia ${from.city} dopo l'ennesimo colpo: nuova sede a ${to.city}, numero nuovo (${n.ip}), password nuove. «Ripartiamo da zero», dice l'azienda.`, n);
    dirty = true;
  }

  const prevEvent = game.orgEvent;
  game.orgEvent = (n, kind, who) => {
    prevEvent?.(n, kind, who);
    const a = byHandle(who);
    if (kind === "sabotaggio") {
      state.scars[n.id] = now();
      n.alertUntil = Math.max(n.alertUntil ?? 0, now() + SCAR_ALERT_H * H);
      game.touch("node", n.id);
      // una rete elettrica, idrica, del traffico: la città resta al buio
      if (n.kind === "util" && n.city) {
        const fresh = (state.dark[n.city] ?? 0) < now();
        state.dark[n.city] = now() + DARK_H * H;
        if (fresh) orgs.news("sabotaggio", `${n.city} al buio dopo il sabotaggio a ${n.org}: semafori spenti, uffici chiusi, sistemi in giro per la città che guardano meno del solito. Per qualche ora.`, n);
        if (a) game.bump(a, "scar:dark");
      }
    }
    if ((kind === "sabotaggio" || kind === "furto") && MOVERS.includes(n.kind) && n.gen && !n.inner && !n.hidden && orgs.isOrg(n)) {
      const h = (state.hits[n.id] ??= []).filter((x) => now() - x.at < MOVE_WINDOW_H * H);
      h.push({ at: now(), w: kind === "sabotaggio" ? 3 : 1, by: a?.id ?? null });
      state.hits[n.id] = h;
      const last = state.moves[n.id]?.at ?? 0;
      if (h.reduce((s, x) => s + x.w, 0) >= MOVE_AT && now() - last > MOVE_COOLDOWN_H * H) relocate(n);
    }
    dirty = true;
  };
  // in una città al buio i sistemi guardano meno
  const prevWatch = game.orgWatch;
  game.orgWatch = (n) => (prevWatch?.(n) ?? 1) * (n.city && (state.dark[n.city] ?? 0) > now() ? DARK_WATCH : 1);

  game.nodeMarks = (n): NodeMarks => {
    const t = now();
    const s = state.scars[n.id] ?? 0;
    const m = state.moves[n.id];
    return {
      scar: s && t - s < SCAR_H * H ? Math.round((1 - (t - s) / (SCAR_H * H)) * 100) / 100 : 0,
      scarAt: s,
      dark: Boolean(n.city && (state.dark[n.city] ?? 0) > t),
      moved: m && t - m.at < MOVE_TRAIL_H * H ? { ...m.from, at: m.at } : null,
    };
  };

  game.onPulse.push(() => {
    const t = now();
    for (const [c, u] of Object.entries(state.dark)) if (u < t) delete state.dark[c];
    for (const [id, at] of Object.entries(state.scars)) if (t - at > SCAR_H * H) delete state.scars[id];
    for (const [id, h] of Object.entries(state.hits)) {
      const f = h.filter((x) => t - x.at < MOVE_WINDOW_H * H);
      if (f.length) state.hits[id] = f;
      else delete state.hits[id];
    }
    dirty = true;
  });

  const prev = game.socialAct;
  game.socialAct = (agent, a, p) => {
    if (a !== "scars") return prev?.(agent, a, p) ?? null;
    if (p.dev && dev() && typeof p.move === "string") {
      const n = game.nodes.get(p.move);
      if (n) relocate(n, typeof p.to === "string" ? p.to : undefined);
    }
    if (p.dev && dev() && Array.isArray(p.reveal)) for (const id of p.reveal) game.reveal(agent, String(id)), game.dirty.add(agent.id);
    const t = now();
    return {
      ok: true,
      data: {
        dark: Object.entries(state.dark).filter(([, u]) => u > t).map(([city, until]) => ({ city, until })),
        moves: Object.entries(state.moves).filter(([, m]) => t - m.at < MOVE_TRAIL_H * H).map(([id, m]) => ({ id, org: game.nodes.get(id)?.org ?? "?", from: m.from.city, to: m.to.city, at: m.at })),
        scars: Object.values(state.scars).filter((s) => t - s < SCAR_H * H).length,
      },
    };
  };

  return {
    save() {
      if (!dirty) return;
      dirty = false;
      game.store.put("scars", "state", state);
    },
  };
}
