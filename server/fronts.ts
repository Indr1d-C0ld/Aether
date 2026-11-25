// Le società di copertura dei giocatori (regole in shared/fronts.ts).
import type { Game, AgentDoc } from "./game.ts";
import { PEOPLE } from "./people.ts";
import { fmtCr } from "../shared/rules.ts";
import { isWeekend, localHour } from "../shared/clock.ts";
import { FRONT_ALIBI_COST, FRONT_CAP, FRONT_COST, FRONT_KINDS, FRONT_RATE, FRONT_STAFF_MAX, FRONT_UP, type FrontView } from "../shared/fronts.ts";

type R = { ok: boolean; error?: string; note?: string; data?: unknown };
type Front = { name: string; kind: string; level: number; till: number; frozenUntil: number; staff: string[]; alibiDay: number; earned: number };
type Orgs = { news: (kind: "economia" | "legge", text: string, n: null, feed?: boolean) => void };
const now = () => Date.now();
const DAY = 86400_000;

export function installFronts(game: Game, orgs: Orgs) {
  const frontOf = (a: AgentDoc) => (a as unknown as { front?: Front }).front ?? null;
  const homeX = (a: AgentDoc) => game.homeX(a);
  const open = (a: AgentDoc) => {
    if (game.clockForce) return game.clockForce === "giorno";
    const x = homeX(a);
    const h = localHour(x, now());
    return !isWeekend(x, now()) ? h >= 9 && h < 19 : h >= 10 && h < 13;
  };
  const fired = (a: AgentDoc) => {
    const known = (a as unknown as { contacts?: string[] }).contacts ?? [];
    return PEOPLE.filter((p) => known.includes(p.id));
  };
  function view(a: AgentDoc): FrontView {
    const f = frontOf(a);
    if (!f) return { has: false, name: "", kind: "", level: 0, till: 0, cap: 0, rate: 0, open: false, frozenUntil: 0, staff: [], hirable: [], alibiReady: false, earned: 0 };
    const rate = Math.round(FRONT_RATE[f.level]! * (1 + f.staff.length * 0.25));
    return { has: true, name: f.name, kind: FRONT_KINDS.find((k) => k.id === f.kind)?.name ?? f.kind, level: f.level, till: Math.floor(f.till), cap: FRONT_CAP[f.level]!, rate, open: open(a) && f.frozenUntil < now(), frozenUntil: f.frozenUntil, staff: f.staff.map((id) => ({ id, name: game.personName(id) })), hirable: fired(a).filter((p) => !f.staff.includes(p.id)).slice(0, 8).map((p) => ({ id: p.id, name: p.name, job: p.job })), alibiReady: f.alibiDay !== Math.floor(now() / DAY), earned: f.earned };
  }
  function pulse() {
    for (const a of game.agents.values()) {
      const f = frontOf(a);
      if (!f || a.npc) continue;
      if (f.frozenUntil > now()) continue;
      // chi scotta troppo attira la finanza: cassa sequestrata e sei ore di sigilli
      if (a.heat >= 75 && Math.random() < 0.04) {
        f.frozenUntil = now() + 6 * 3600_000;
        const lost = Math.floor(f.till);
        f.till = 0;
        game.mail(a, "GUARDIA DI FINANZA", `Verifica fiscale: ${f.name}`, `Durante un controllo presso ${f.name} sono state riscontrate irregolarità. L'attività è sospesa per sei ore e l'incasso (${fmtCr(lost)}) è sotto sequestro.`);
        orgs.news("legge", `Sigilli a «${f.name}»: la finanza sospetta che dietro ci sia altro.`, null, false);
        game.touch("agent", a.id);
        game.dirty.add(a.id);
        continue;
      }
      if (!open(a)) continue;
      const rate = FRONT_RATE[f.level]! * (1 + f.staff.length * 0.25);
      if (f.till < FRONT_CAP[f.level]!) (f.till = Math.min(FRONT_CAP[f.level]!, f.till + rate)), game.touch("agent", a.id);
    }
  }
  game.onPulse.push(pulse);

  function act(a: AgentDoc, q: Record<string, unknown>): R {
    const cmd = String(q.cmd ?? "view");
    const f = frontOf(a);
    const done = (note: string): R => (game.touch("agent", a.id), game.dirty.add(a.id), { ok: true, note, data: view(a) });
    if (cmd === "view") return { ok: true, data: view(a) };
    if (cmd === "dev" && process.env.AETHER_DEV === "1") {
      if (f) Object.assign(f, q.set ?? {});
      for (let i = 0; i < Number(q.pulses ?? 0); i += 1) pulse();
      return { ok: true, data: view(a) };
    }
    if (cmd === "found") {
      if (f) return { ok: false, error: "hai già un'attività" };
      const k = FRONT_KINDS.find((x) => x.id === q.kind);
      if (!k || k.side !== a.faction) return { ok: false, error: "scegli un'attività adatta alla tua cellula" };
      const name = String(q.name ?? "").replace(/[^\p{L}\p{N} .&'-]/gu, "").trim().slice(0, 28);
      if (name.length < 3) return { ok: false, error: "dalle un nome di almeno tre caratteri" };
      if (a.credits < FRONT_COST) return { ok: false, error: `aprire costa ${fmtCr(FRONT_COST)}` };
      a.credits -= FRONT_COST;
      (a as unknown as { front: Front }).front = { name, kind: k.id, level: 0, till: 0, frozenUntil: 0, staff: [], alibiDay: 0, earned: 0 };
      game.bump(a, "front:found");
      orgs.news("economia", `Apre «${name}», ${k.name.toLowerCase()}. Il titolare preferisce non farsi fotografare.`, null, false);
      return done(`«${name}» è aperta`);
    }
    if (!f) return { ok: false, error: "non hai un'attività" };
    switch (cmd) {
      case "collect": {
        const cr = Math.floor(f.till);
        if (cr <= 0) return { ok: false, error: "la cassa è vuota" };
        if (f.frozenUntil > now()) return { ok: false, error: "ci sono i sigilli" };
        f.till -= cr;
        f.earned += cr;
        a.credits += cr;
        game.bump(a, "front:cr", cr);
        return done(`incassati ${fmtCr(cr)}, tutti puliti`);
      }
      case "upgrade": {
        const lv = f.level + 1;
        if (lv >= FRONT_UP.length) return { ok: false, error: "più di così diventa una multinazionale" };
        if (a.credits < FRONT_UP[lv]!) return { ok: false, error: `ampliare costa ${fmtCr(FRONT_UP[lv]!)}` };
        a.credits -= FRONT_UP[lv]!;
        f.level = lv;
        return done("locali più grandi: incassa di più e tiene di più in cassa");
      }
      case "hire": {
        if (f.staff.length >= FRONT_STAFF_MAX) return { ok: false, error: `al massimo ${FRONT_STAFF_MAX} dipendenti` };
        const p = fired(a).find((x) => x.id === q.id);
        if (!p || f.staff.includes(p.id)) return { ok: false, error: "puoi assumere solo persone che conosci" };
        f.staff.push(p.id);
        game.bump(a, "front:hire");
        return done(`${p.name} lavora per te: +25% di incasso`);
      }
      case "fire": {
        f.staff = f.staff.filter((x) => x !== q.id);
        return done("licenziato");
      }
      case "alibi": {
        if (f.alibiDay === Math.floor(now() / DAY)) return { ok: false, error: "una fattura di comodo al giorno" };
        if (f.till < FRONT_ALIBI_COST) return { ok: false, error: `servono ${fmtCr(FRONT_ALIBI_COST)} in cassa` };
        if (a.heat <= 0) return { ok: false, error: "non hai niente da giustificare" };
        f.till -= FRONT_ALIBI_COST;
        f.alibiDay = Math.floor(now() / DAY);
        a.heat = Math.max(0, a.heat - 10);
        game.bump(a, "front:alibi");
        return done("«Ero in negozio fino a tardi, ecco la fattura.» Calore −10.");
      }
    }
    return { ok: false, error: "comando sconosciuto" };
  }
  const prev = game.socialAct;
  game.socialAct = (agent, a, q) => (a === "front" ? act(agent, q) : (prev?.(agent, a, q) ?? null));
}
