// Il mercato del ricettatore (regole in shared/fence.ts). L'offerta di ogni categoria decade nel tempo;
// le vendite dei giocatori e i colpi degli abitanti la fanno salire.
import type { Game, NodeDoc } from "./game.ts";
import type { StoredFile } from "../shared/types.ts";
import { FENCE_CAT_NAME, SUPPLY_HALF_H, WANTED_BONUS, demandMult, supplyTarget, type FenceCat, type FenceMarket } from "../shared/fence.ts";

type State = { supply: Record<string, number>; at: number };
const now = () => Date.now();
const hash = (s: string) => [...s].reduce((q, c) => (Math.imul(q, 33) ^ c.charCodeAt(0)) >>> 0, 5381);
const CATS = Object.keys(FENCE_CAT_NAME) as FenceCat[];

export function installFence(game: Game) {
  const state: State = game.store.get<State>("fence", "state") ?? { supply: {}, at: now() };
  let dirty = false;
  const decay = () => {
    const dt = (now() - state.at) / 3600_000;
    if (dt < 0.01) return;
    // l'offerta torna verso il livello normale di oggi, non verso lo zero
    const k = Math.pow(0.5, dt / SUPPLY_HALF_H);
    const day = Math.floor(now() / 86400_000);
    for (const c of CATS) {
      const t = supplyTarget(c, day);
      state.supply[c] = t + ((state.supply[c] ?? t) - t) * k;
    }
    state.at = now();
    dirty = true;
  };
  const catOf = (st: StoredFile): FenceCat => (st.item ? (st.item.kind as FenceCat) : ((game.nodes.get(st.nodeId)?.kind ?? "corp") as FenceCat));
  const wanted = (): FenceCat => {
    const pool = CATS.filter((c) => !["exploit", "chip", "gadget", "home"].includes(c));
    return pool[hash(`fence:${Math.floor(now() / 86400_000)}`) % pool.length]!;
  };
  const multOf = (c: FenceCat) => {
    decay();
    return demandMult(state.supply[c] ?? supplyTarget(c, Math.floor(now() / 86400_000))) * (c === wanted() ? WANTED_BONUS : 1);
  };
  game.fenceDemand = (st) => multOf(catOf(st));
  game.fenceSold = (st, n = 1) => {
    decay();
    const c = catOf(st);
    state.supply[c] = (state.supply[c] ?? supplyTarget(c, Math.floor(now() / 86400_000))) + n;
    dirty = true;
  };
  /** Un colpo di un abitante porta merce al ricettatore come una vendita. */
  game.fenceFlood = (n: NodeDoc, amount = 1) => {
    decay();
    state.supply[n.kind] = (state.supply[n.kind] ?? supplyTarget(n.kind, Math.floor(now() / 86400_000))) + amount;
    dirty = true;
  };
  game.fenceMarket = (): FenceMarket =>
    CATS.map((c) => ({ cat: c, name: FENCE_CAT_NAME[c]!, mult: Math.round(multOf(c) * 100) / 100, wanted: c === wanted() })).sort((a, b) => b.mult - a.mult);
  const prev = game.socialAct;
  game.socialAct = (agent, a, p) => {
    if (a !== "fenceMarket") return prev?.(agent, a, p) ?? null;
    if (p.dev && process.env.AETHER_DEV === "1") {
      if (typeof p.cat === "string") state.supply[p.cat] = Number(p.supply ?? 0);
      if (p.reset) state.supply = {};
    }
    return { ok: true, data: game.fenceMarket!() };
  };
  return {
    save() {
      if (!dirty) return;
      dirty = false;
      game.store.put("fence", "state", state);
    },
  };
}
