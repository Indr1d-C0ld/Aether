// Leggi e contrappesi (regole in shared/law.ts): la fiducia nella Guardia del Reticolo, lo scandalo che le toglie
// i poteri, e l'aiuto da fuori per la parte che sta perdendo la guerra. Tutto si muove con fatti veri: furti e
// sabotaggi ai sistemi della Guardia, fascicoli venduti al ricettatore, arresti, soffiate, punti guerra.
import type { Game, AgentDoc, NodeDoc } from "./game.ts";
import {
  RALLY_H,
  RALLY_HEAT,
  RALLY_MIN,
  RALLY_NPC,
  RALLY_PAY,
  RALLY_RATIO,
  RALLY_SWEEP,
  SCANDAL_AT,
  SCANDAL_H,
  SCANDAL_RESET,
  TRUST_DELTA,
  TRUST_DRIFT_H,
  TRUST_HIGH,
  TRUST_LOW,
  TRUST_START,
  lawMult,
  moodOf,
  type LawView,
  type Side,
} from "../shared/law.ts";

type State = {
  trust: number;
  scandalUntil: number;
  rally: { side: Side; until: number } | null;
  snaps: { at: number; red: number; blue: number }[];
  hist: number[];
  blame: Record<string, number[]>; // chi ha fatto scendere la fiducia, e quando
  at: number;
};
type Orgs = { news: (kind: "legge" | "gente", text: string, n: NodeDoc | null, feed?: boolean) => void; endEmergency: () => void };

const H = 3600_000;
const now = () => Date.now();
const clamp = (v: number) => Math.max(0, Math.min(100, v));
const dev = () => process.env.AETHER_DEV === "1";

export function installLaw(game: Game, orgs: Orgs) {
  const state: State = game.store.get<State>("law", "state") ?? { trust: TRUST_START, scandalUntil: 0, rally: null, snaps: [], hist: [], blame: {}, at: now() };
  let dirty = false;
  const scandal = () => state.scandalUntil > now();
  const rallying = (side: string) => Boolean(state.rally && state.rally.until > now() && state.rally.side === side);

  // ---------------------------------------------------------------- la fiducia
  function move(delta: number, who: AgentDoc | null) {
    if (!delta || scandal()) return;
    state.trust = clamp(state.trust + delta);
    if (delta < 0 && who && !who.npc) {
      const b = (state.blame[who.id] ??= []);
      b.push(now());
      b.splice(0, Math.max(0, b.length - 20));
    }
    dirty = true;
    if (state.trust < SCANDAL_AT) startScandal();
  }
  function startScandal() {
    state.scandalUntil = now() + SCANDAL_H * H;
    state.trust = SCANDAL_RESET;
    orgs.endEmergency();
    orgs.news("legge", `Scandalo alla Guardia del Reticolo: fascicoli rubati, sistemi violati, documenti in vendita. Il Parlamento sospende i poteri speciali per ${SCANDAL_H} ore: indagini più lente, custodie più brevi, cauzioni ridotte.`, null);
    // chi ci ha messo mano nelle ultime 24 ore lo sa
    for (const [id, at] of Object.entries(state.blame)) {
      const a = game.agents.get(id);
      if (!a || !at.some((t) => now() - t < 24 * H)) continue;
      game.bump(a, "law:scandal");
      game.mail(a, "Cronaca del Reticolo", "Lo scandalo è anche merito tuo", `La Guardia del Reticolo perde i poteri speciali per ${SCANDAL_H} ore. Fra i fatti che li hanno fatti cadere ce ne sono di tuoi.\n\nIndagini più lente, custodie più brevi, cauzioni ridotte: approfittane, ma non troppo.`);
      game.dirty.add(id);
    }
    state.blame = {};
    dirty = true;
  }
  game.lawTrust = (delta, who) => move(delta, who);
  game.lawScandal = () => scandal();

  // i fatti che la muovono
  const kindW = (n: NodeDoc) => (n.kind === "law" ? 1 : n.kind === "gov" ? 0.5 : 0);
  const prevEvent = game.orgEvent;
  game.orgEvent = (n, kind, who) => {
    prevEvent?.(n, kind, who);
    const w = kindW(n);
    if (!w) return;
    const d = kind === "furto" ? TRUST_DELTA.theft : kind === "sabotaggio" ? TRUST_DELTA.sabotage : kind === "intrusione" ? TRUST_DELTA.intrusion : kind === "infezione" ? TRUST_DELTA.infection : TRUST_DELTA.defense;
    const a = who ? ([...game.agents.values()].find((x) => x.handle === who) ?? null) : null;
    move(Math.round(d * w * 10) / 10, a);
  };
  const prevArrest = game.arrest.bind(game);
  game.arrest = (agent, reason) => {
    prevArrest(agent, reason);
    move(TRUST_DELTA.arrest, null);
  };
  const prevSold = game.fenceSold;
  game.fenceSold = (st, n, by) => {
    prevSold?.(st, n, by);
    if (!st.item && game.nodes.get(st.nodeId)?.kind === "law") move(TRUST_DELTA.leak, by ?? null);
  };

  // la fiducia cambia i numeri della giustizia; l'aiuto ai blu accelera le indagini
  const origNum = game.num.bind(game);
  game.num = (key) => {
    const v = origNum(key);
    const m = lawMult(state.trust, scandal());
    if (key === "sweepMult") return v * m.sweep * (rallying("blue") ? RALLY_SWEEP : 1);
    if (key === "jailMult") return v * m.jail;
    if (key === "bailMult") return v * m.bail;
    return v;
  };

  // ---------------------------------------------------------------- aiuto da fuori
  const origPriced = game.priced.bind(game);
  game.priced = (m) => {
    const r = origPriced(m);
    if (r && !r.postedBy && !r.ownerId && rallying(r.faction)) r.reward = Math.round((r.reward * RALLY_PAY) / 10) * 10;
    return r;
  };
  game.lifeRally = (side) => (rallying(side) ? RALLY_NPC : 1);
  function war24() {
    const cur = { red: game.meta.war.red, blue: game.meta.war.blue };
    const base = state.snaps.find((s) => s.at >= now() - 25 * H) ?? state.snaps[0] ?? { ...cur, at: now() };
    return { red: Math.max(0, cur.red - base.red), blue: Math.max(0, cur.blue - base.blue) };
  }
  function checkRally() {
    const w = war24();
    const lead: Side | null = w.red >= RALLY_MIN && w.blue < w.red * RALLY_RATIO ? "red" : w.blue >= RALLY_MIN && w.red < w.blue * RALLY_RATIO ? "blue" : null;
    const loser: Side | null = lead === "red" ? "blue" : lead === "blue" ? "red" : null;
    if (!loser) {
      if (state.rally && state.rally.until < now()) state.rally = null;
      return;
    }
    const fresh = !state.rally || state.rally.side !== loser || state.rally.until < now();
    state.rally = { side: loser, until: now() + RALLY_H * H };
    dirty = true;
    if (!fresh) return;
    const text =
      loser === "blue"
        ? `La capitale manda rinforzi alla Guardia del Reticolo: nelle ultime 24 ore i rossi hanno fatto ${w.red} punti, i blu ${w.blue}. Per ${RALLY_H} ore indagini più rapide e contratti blu pagati di più.`
        : `Soldi e attrezzi dall'estero per la cellula rossa: nelle ultime 24 ore i blu hanno fatto ${w.blue} punti, i rossi ${w.red}. Per ${RALLY_H} ore contratti rossi pagati di più e calore che scende prima.`;
    orgs.news(loser === "blue" ? "legge" : "gente", text, null);
    for (const a of game.agents.values()) {
      if (a.npc || a.faction !== loser) continue;
      game.mail(a, loser === "blue" ? "Comando della Guardia" : "Un amico all'estero", "Aiuto da fuori", loser === "blue" ? `Arrivano rinforzi. Per ${RALLY_H} ore le indagini corrono, i contratti della cellula pagano il ${Math.round((RALLY_PAY - 1) * 100)}% in più e i nostri sul campo sono più attivi.\n\nNon sprecateli.` : `Qualcuno, lontano, ha deciso che la cellula rossa non deve sparire. Per ${RALLY_H} ore i contratti pagano il ${Math.round((RALLY_PAY - 1) * 100)}% in più, il calore si raffredda prima e i nostri si fanno vedere di più.\n\nNon chiedere chi paga.`);
      game.dirty.add(a.id);
    }
  }
  // i contratti chiusi mentre la propria parte riceve aiuto
  const origBump = game.bump.bind(game);
  game.bump = (agent, key, n = 1) => {
    const r = origBump(agent, key, n);
    if (key.startsWith("m:") && !agent.npc && rallying(agent.faction)) origBump(agent, "law:rally");
    return r;
  };

  // ---------------------------------------------------------------- il battito
  function pulse() {
    const t = now();
    const dt = Math.min(2, (t - state.at) / H);
    state.at = t;
    if (!scandal()) {
      const d = TRUST_START - state.trust;
      state.trust = state.trust + Math.sign(d) * Math.min(Math.abs(d), TRUST_DRIFT_H * dt);
    }
    if (rallying("red")) for (const a of game.agents.values()) if (!a.npc && a.faction === "red" && a.heat > 0) a.heat = Math.max(0, a.heat - RALLY_HEAT);
    const last = state.snaps.at(-1);
    if (!last || t - last.at >= H) {
      state.snaps.push({ at: t, red: game.meta.war.red, blue: game.meta.war.blue });
      state.snaps.splice(0, Math.max(0, state.snaps.length - 26));
      state.hist.push(Math.round(state.trust));
      state.hist.splice(0, Math.max(0, state.hist.length - 24));
      checkRally();
    }
    dirty = true;
  }
  game.onPulse.push(pulse);

  // ---------------------------------------------------------------- vista
  function view(): LawView {
    const mood = moodOf(state.trust, scandal());
    const m = lawMult(state.trust, scandal());
    const effects: string[] = [];
    if (mood === "scandalo") effects.push("indagini più lente della metà", "custodie e cauzioni ridotte del 30%", "niente stato d'emergenza");
    else if (state.trust >= TRUST_HIGH) effects.push(`indagini più rapide del ${Math.round((1 - m.sweep) * 100)}%`);
    else if (state.trust <= TRUST_LOW) effects.push(`indagini più lente del ${Math.round((m.sweep - 1) * 100)}%`, `sotto ${SCANDAL_AT} scoppia lo scandalo`);
    const r = state.rally && state.rally.until > now() ? state.rally : null;
    return {
      trust: Math.round(state.trust),
      mood,
      scandalUntil: state.scandalUntil,
      effects,
      rally: r ? { side: r.side, until: r.until, text: r.side === "blue" ? `rinforzi alla Guardia: indagini più rapide, contratti blu +${Math.round((RALLY_PAY - 1) * 100)}%` : `aiuto dall'estero ai rossi: contratti rossi +${Math.round((RALLY_PAY - 1) * 100)}%, calore che scende prima` } : null,
      war24: war24(),
      hist: [...state.hist, Math.round(state.trust)],
    };
  }
  game.lawView = view;
  const prev = game.socialAct;
  game.socialAct = (agent, a, p) => {
    if (a !== "law") return prev?.(agent, a, p) ?? null;
    if (p.dev && dev()) {
      if (typeof p.trust === "number") state.trust = clamp(p.trust);
      if (p.scandalOff) state.scandalUntil = 0;
      if (p.rallyOff) state.rally = null;
      if (typeof p.hit === "number") move(p.hit, agent);
      if (p.pulse) pulse();
      if (Array.isArray(p.hist)) state.hist = (p.hist as unknown[]).map(Number).slice(-24);
      // «war»: punti guerra di 24 ore fa, per provare l'aiuto da fuori
      if (p.war && typeof p.war === "object") {
        const w = p.war as { red: number; blue: number };
        state.snaps = [{ at: now() - 24 * H, red: game.meta.war.red - w.red, blue: game.meta.war.blue - w.blue }];
        checkRally();
      }
      dirty = true;
    }
    return { ok: true, data: view() };
  };

  return {
    save() {
      if (!dirty) return;
      dirty = false;
      game.store.put("law", "state", state);
    },
  };
}
