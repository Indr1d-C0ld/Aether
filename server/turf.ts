// Territori (regole in shared/turf.ts). I punti dei giocatori vengono dalle loro imprese (Game.deed) e vanno alla loro
// crew; quelli degli abitanti dagli eventi delle organizzazioni (Game.orgEvent) e vanno alla loro banda. Chi tiene una
// città si ricalcola a ogni punto nuovo; i vantaggi passano dagli hook del trace, delle indagini e del collegamento.
import type { Game, AgentDoc, NodeDoc } from "./game.ts";
import type { Crew } from "./social.ts";
import { fmtCr } from "../shared/rules.ts";
import { TURF_DEED, TURF_HALF_H, TURF_HOME, TURF_LEAD, TURF_MIN, TURF_NPC, TURF_SWEEP, TURF_TOLL, TURF_TRACE, type TurfCity, type TurfHolder, type TurfView } from "../shared/turf.ts";

type Pts = { pts: number; at: number };
type State = { cities: Record<string, Record<string, Pts>>; holder: Record<string, string | null>; newsAt: Record<string, number> };
type Social = { crews: () => Record<string, Crew>; crewOfAgent: (a: AgentDoc) => Crew | null };
type Orgs = { news: (kind: "gente", text: string, n: NodeDoc | null, feed?: boolean) => void };

const H = 3600_000;
const now = () => Date.now();
const dev = () => process.env.AETHER_DEV === "1";
const initials = (s: string) => s.replace(/^(I|Il|La|Le|Lo|Gli)\s+/i, "").split(/\s+/).map((w) => w[0]!.toUpperCase()).join("").slice(0, 3).padEnd(3, "X");

export function installTurf(game: Game, orgs: Orgs, social: Social) {
  const state: State = game.store.get<State>("turf", "state") ?? { cities: {}, holder: {}, newsAt: {} };
  let dirty = false;
  const gangs = () => game.lifeGangs?.() ?? [];
  const gangOf = (handle: string) => gangs().find((g) => g.members.includes(handle)) ?? null;
  const value = (p: Pts) => p.pts * Math.pow(0.5, (now() - p.at) / (TURF_HALF_H * H));
  /** Chi è dietro una chiave: crew di giocatori o banda di abitanti. */
  function who(key: string): Omit<TurfHolder, "mine"> | null {
    if (key.startsWith("crew:")) {
      const c = social.crews()[key.slice(5)];
      return c ? { key, name: c.name, tag: c.tag, side: c.faction, npc: false } : null;
    }
    const g = gangs().find((x) => `gang:${x.id}` === key);
    return g ? { key, name: g.name, tag: initials(g.name), side: g.side, npc: true } : null;
  }
  function ranking(city: string) {
    return Object.entries(state.cities[city] ?? {})
      .map(([key, p]) => ({ key, pts: value(p) }))
      .filter((x) => x.pts >= 0.5 && who(x.key))
      .sort((a, b) => b.pts - a.pts);
  }
  function holderOf(city: string): { key: string | null; contested: boolean } {
    const r = ranking(city);
    const [a, b] = r;
    if (!a || a.pts < TURF_MIN) return { key: null, contested: false };
    if (b && b.pts >= TURF_MIN * 0.5 && a.pts < b.pts * TURF_LEAD) return { key: null, contested: true };
    return { key: a.key, contested: false };
  }
  function add(city: string, key: string, pts: number) {
    const c = (state.cities[city] ??= {});
    const p = c[key];
    c[key] = { pts: (p ? value(p) : 0) + pts, at: now() };
    dirty = true;
    const before = state.holder[city] ?? null;
    const h = holderOf(city);
    if (h.key === before) return;
    state.holder[city] = h.key;
    if (now() - (state.newsAt[city] ?? 0) < 6 * H) return;
    state.newsAt[city] = now();
    const w = h.key ? who(h.key) : null;
    const lead = ranking(city).slice(0, 2).map((x) => who(x.key)!.name);
    if (w) orgs.news("gente", `${city} passa a ${w.name}${before && who(before) ? `, che la toglie a ${who(before)!.name}` : ""}. Per un po' lì comandano loro.`, null);
    else if (h.contested && lead.length === 2) orgs.news("gente", `Guerra di territorio a ${city}: ${lead[0]} e ${lead[1]} si contendono la città.`, null);
    // i membri della crew che conquista lo ricordano
    if (h.key?.startsWith("crew:")) {
      const c = social.crews()[h.key.slice(5)];
      for (const id of c?.members ?? []) {
        const m = game.agents.get(id);
        if (m) game.bump(m, "turf:held"), game.dirty.add(m.id);
      }
    }
  }

  // i giocatori: le loro imprese, per la loro crew
  const prevDeed = game.deed.bind(game);
  game.deed = (agent, d, node) => {
    prevDeed(agent, d, node);
    const pts = TURF_DEED[d];
    if (!pts || !node?.city || agent.npc) return;
    const c = social.crewOfAgent(agent);
    if (c) add(node.city, `crew:${c.tag}`, pts);
  };
  // gli abitanti: quello che fanno alle organizzazioni, per la loro banda
  const prevEvent = game.orgEvent;
  game.orgEvent = (n, kind, handle) => {
    prevEvent?.(n, kind, handle);
    if (!handle || !n.city) return;
    const g = gangOf(handle);
    if (g && (g.side === "red" ? kind !== "difesa" : kind === "difesa")) add(n.city, `gang:${g.id}`, TURF_NPC);
  };

  // una banda torna dove è già forte: così le città si tengono anche senza giocatori
  game.lifeTarget = (handle, candidates) => {
    const g = gangOf(handle);
    if (!g || Math.random() >= TURF_HOME) return null;
    const key = `gang:${g.id}`;
    const strong = Object.entries(state.cities)
      .map(([city, c]) => ({ city, pts: c[key] ? value(c[key]!) : 0 }))
      .filter((x) => x.pts > 0)
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 3)
      .map((x) => x.city);
    const near = candidates.filter((n) => n.city && strong.includes(n.city));
    return near.length ? near[Math.floor(Math.random() * near.length)]! : null;
  };
  const holding = (city: string | undefined, agent: AgentDoc) => {
    if (!city) return false;
    const c = social.crewOfAgent(agent);
    return Boolean(c && state.holder[city] === `crew:${c.tag}` && holderOf(city).key === `crew:${c.tag}`);
  };
  // vantaggi: rossi, trace più lento a casa propria
  game.turfTrace = (op, agent) => (agent.faction === "red" && holding(game.nodes.get(op.chain.at(-1)!)?.city, agent) ? TURF_TRACE : 1);
  // blu: le intrusioni nelle loro città le indagano più in fretta
  const prevSweep = game.lifeSweep;
  game.lifeSweep = (n) => {
    const base = prevSweep?.(n) ?? 1;
    const h = n.city ? holderOf(n.city).key : null;
    const w = h ? who(h) : null;
    return base * (w && !w.npc && w.side === "blue" ? TURF_SWEEP : 1);
  };
  // il pedaggio: chi rimbalza sui relay di una città tenuta da un'altra crew di giocatori paga alla sua cassa
  const prevConnect = game.onConnect;
  game.onConnect = (op, agent, target) => {
    prevConnect?.(op, agent, target);
    if (agent.npc) return;
    const mine = social.crewOfAgent(agent)?.tag ?? null;
    let paid = 0;
    const to = new Map<string, number>();
    for (const id of op.chain.slice(0, -1)) {
      const r = game.nodes.get(id);
      const h = r?.kind === "relay" && r.city ? holderOf(r.city).key : null;
      if (!h?.startsWith("crew:") || h === `crew:${mine}`) continue;
      const c = social.crews()[h.slice(5)];
      if (!c || agent.credits < TURF_TOLL) continue;
      agent.credits -= TURF_TOLL;
      c.bank += TURF_TOLL;
      paid += TURF_TOLL;
      to.set(c.name, (to.get(c.name) ?? 0) + TURF_TOLL);
    }
    if (paid) game.out.toast(agent.id, `Pedaggio: ${fmtCr(paid)} a ${[...to.keys()].join(", ")}, che tiene${to.size > 1 ? "ngono" : ""} i relay su cui rimbalzi.`, "info");
    void target;
  };

  // ---------------------------------------------------------------- vista
  const where = new Map<string, { x: number; y: number }>();
  function center(city: string) {
    if (!where.has(city)) {
      const ns = [...game.nodes.values()].filter((n) => n.city === city && !n.hidden && n.kind !== "gateway");
      where.set(city, ns.length ? { x: Math.round(ns.reduce((s, n) => s + n.x, 0) / ns.length), y: Math.round(ns.reduce((s, n) => s + n.y, 0) / ns.length) } : { x: 0, y: 0 });
    }
    return where.get(city)!;
  }
  function view(a: AgentDoc): TurfView {
    const mine = social.crewOfAgent(a);
    const myKey = mine ? `crew:${mine.tag}` : null;
    const cities: TurfCity[] = [];
    for (const city of Object.keys(state.cities)) {
      const r = ranking(city);
      if (!r.length) continue;
      const h = holderOf(city);
      const hw = h.key ? who(h.key) : null;
      cities.push({ city, ...center(city), holder: hw ? { ...hw, mine: hw.key === myKey } : null, contested: h.contested, top: r.slice(0, 3).map((x) => ({ name: who(x.key)!.name, tag: who(x.key)!.tag, pts: Math.round(x.pts), mine: x.key === myKey })) });
    }
    return { cities: cities.sort((x, y) => (y.top[0]?.pts ?? 0) - (x.top[0]?.pts ?? 0)), mine: mine?.tag ?? null, held: cities.filter((c) => c.holder?.mine).map((c) => c.city) };
  }
  const prev = game.socialAct;
  game.socialAct = (agent, a, p) => {
    if (a !== "turf") return prev?.(agent, a, p) ?? null;
    if (p.dev && dev() && typeof p.city === "string" && typeof p.key === "string") add(p.city, p.key, Number(p.pts ?? 10));
    return { ok: true, data: view(agent) };
  };

  return {
    save() {
      if (!dirty) return;
      dirty = false;
      game.store.put("turf", "state", state);
    },
  };
}
