// Il mercato nero ha una memoria (regole in shared/blackmarket.ts): 0-day che invecchiano con l'uso e retate che
// svuotano il mercato per tre giorni. Tutto parte da fatti veri: exploit usati, arresti, stato d'emergenza.
import type { Game, NodeDoc } from "./game.ts";
import { exploitDef } from "../shared/depth.ts";
import {
  EXPLOIT_HALF_H,
  NPC_EXPLOIT_CHANCE,
  RAID_AT,
  RAID_H,
  ZERO_DAYS,
  freshLabel,
  freshness,
  isZeroDay,
  patchedChance,
  raidFenceMult,
  raidK,
  raidModMult,
  raidNpcMult,
  type BlackView,
} from "../shared/blackmarket.ts";

type State = { uses: Record<string, number>; at: number; raid: { start: number; why: string } | null; arrests: { at: number; w: number }[] };
type Orgs = { news: (kind: "legge" | "gente", text: string, n: NodeDoc | null, feed?: boolean) => void };

const H = 3600_000;
const now = () => Date.now();
const dev = () => process.env.AETHER_DEV === "1";
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;

export function installBlackMarket(game: Game, orgs: Orgs) {
  const state: State = game.store.get<State>("black", "state") ?? { uses: {}, at: now(), raid: null, arrests: [] };
  let dirty = false;
  let forceRoll: number | null = null;

  // ---------------------------------------------------------------- 0-day
  function decay() {
    const dt = (now() - state.at) / H;
    if (dt < 0.01) return;
    const k = Math.pow(0.5, dt / EXPLOIT_HALF_H);
    for (const c of Object.keys(state.uses)) state.uses[c] = state.uses[c]! * k;
    state.at = now();
    dirty = true;
  }
  const fresh = (code: string) => (isZeroDay(code) ? (decay(), freshness(state.uses[code] ?? 0)) : 1);
  const used = (code: string, n = 1) => {
    if (!isZeroDay(code)) return;
    decay();
    state.uses[code] = (state.uses[code] ?? 0) + n;
    dirty = true;
  };
  game.exploitFresh = fresh;
  game.exploitUsed = (agent, code) => {
    used(code);
    if (!agent.npc && isZeroDay(code) && fresh(code) >= 0.8) game.bump(agent, "bm:fresh");
  };
  /** Prima di un exploit tecnico: la falla è già chiusa su questo sistema? Se sì, l'exploit è bruciato. */
  game.exploitTry = (agent, code, target) => {
    if (!isZeroDay(code)) return null;
    const f = fresh(code);
    const p = patchedChance(f, game.tierOf(target));
    const roll = forceRoll ?? Math.random();
    if (roll >= p) return null;
    used(code); // anche un tentativo fallito lascia la firma
    if (!agent.npc) game.bump(agent, "bm:burned");
    return `${target.org} ha già la patch: «${exploitDef(code)?.name ?? code}» è bruciato (ormai è ${freshLabel(f)}).`;
  };

  // ---------------------------------------------------------------- retate
  const k = () => raidK(state.raid?.start ?? 0, now());
  function arrests24() {
    state.arrests = state.arrests.filter((a) => now() - a.at < 24 * H);
    return state.arrests.reduce((s, a) => s + a.w, 0);
  }
  function startRaid(why: string) {
    if (k() > 0) return;
    state.raid = { start: now(), why };
    state.arrests = [];
    dirty = true;
    orgs.news("legge", `Retata della Guardia del Reticolo nel giro del mercato nero: ${why}. Ricettatori chiusi, modem sequestrati, magazzini vuoti. Per qualche giorno i moduli costeranno cari e chi ha ancora exploit in tasca potrà farseli pagare bene.`, null);
    for (const a of game.agents.values()) {
      if (a.npc || a.faction !== "red") continue;
      game.mail(a, "Il Ricettatore", "Retata", `Stanotte hanno portato via mezzo giro. Io sono ancora qui, ma per un po' i moduli li trovi solo a prezzi da fame, e quello che hai in tasca, exploit, chip, gadget, te lo pago di più.\n\nDurerà tre giorni, a scendere. Non fare il furbo nel frattempo.`);
      game.dirty.add(a.id);
    }
  }
  function arrestPoint(w: number, why: string) {
    state.arrests.push({ at: now(), w });
    dirty = true;
    if (arrests24() >= RAID_AT) startRaid(why);
  }
  const prevArrest = game.arrest.bind(game);
  game.arrest = (agent, reason) => {
    prevArrest(agent, reason);
    arrestPoint(agent.npc ? 1 : 2, "dopo una serie di arresti");
  };
  game.lifeBust = () => arrestPoint(1, "dopo una serie di arresti");
  game.onEmergency = () => startRaid("con lo stato d'emergenza");
  game.blackMult = () => raidModMult(k());
  // il ricettatore paga meno gli 0-day bruciati, e di più exploit, chip e gadget durante una retata
  const prevDemand = game.fenceDemand;
  game.fenceDemand = (st) => {
    let m = prevDemand?.(st) ?? 1;
    if (st.item?.kind === "exploit") m *= 0.4 + 0.6 * fresh(st.item.code);
    if (st.item && ["exploit", "chip", "gadget"].includes(st.item.kind)) m *= raidFenceMult(k());
    return m;
  };
  const prevSold = game.fenceSold;
  game.fenceSold = (st, n, by) => {
    prevSold?.(st, n, by);
    if (by && !by.npc && st.item && k() > 0) game.bump(by, "bm:raid");
  };
  // durante una retata i rossi del Reticolo si fanno vedere meno
  const prevRally = game.lifeRally;
  game.lifeRally = (side) => (prevRally?.(side) ?? 1) * (side === "red" ? raidNpcMult(k()) : 1);

  // ---------------------------------------------------------------- battito
  game.onPulse.push(() => {
    decay();
    // anche gli abitanti usano 0-day: la notorietà si muove senza i giocatori
    if (Math.random() < NPC_EXPLOIT_CHANCE * raidNpcMult(k())) used(pick(ZERO_DAYS));
    if (state.raid && k() <= 0) {
      state.raid = null;
      orgs.news("legge", "Il mercato nero torna a respirare: la retata è finita, i ricettatori riaprono, i prezzi scendono.", null, false);
    }
    dirty = true;
  });

  function view(): BlackView {
    const kk = k();
    return {
      raid: state.raid && kk > 0 ? { start: state.raid.start, until: state.raid.start + RAID_H * H, k: Math.round(kk * 100) / 100, why: state.raid.why } : null,
      modMult: Math.round(raidModMult(kk) * 100) / 100,
      fenceMult: Math.round(raidFenceMult(kk) * 100) / 100,
      zerodays: ZERO_DAYS.map((c) => {
        const f = Math.round(fresh(c) * 100) / 100;
        return { code: c, name: exploitDef(c)?.name ?? c, fresh: f, label: freshLabel(f) };
      }).sort((a, b) => b.fresh - a.fresh),
      arrests24: arrests24(),
    };
  }
  const prev = game.socialAct;
  game.socialAct = (agent, a, p) => {
    if (a !== "black") return prev?.(agent, a, p) ?? null;
    if (p.dev && dev()) {
      if (p.uses && typeof p.uses === "object") for (const [c, n] of Object.entries(p.uses as Record<string, number>)) state.uses[c] = Number(n);
      if (p.roll !== undefined) forceRoll = p.roll === null ? null : Number(p.roll);
      if (typeof p.raid === "string") (state.raid = null), startRaid(p.raid);
      if (p.raidOff) state.raid = null;
      if (typeof p.age === "number" && state.raid) state.raid.start -= p.age * H;
      if (p.arrests) arrestPoint(Number(p.arrests), "dopo una serie di arresti");
      dirty = true;
    }
    return { ok: true, data: view() };
  };

  return {
    save() {
      if (!dirty) return;
      dirty = false;
      game.store.put("black", "state", state);
    },
  };
}

