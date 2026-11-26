// Operazioni lunghe (regole in shared/longops.ts). Girano sul battito del mondo: ogni sei ore ciascuna dà qualcosa,
// e può saltare. Gli esiti arrivano per posta e restano nel registro dell'operazione.
import type { Game, AgentDoc, NodeDoc } from "./game.ts";
import { PEOPLE } from "./people.ts";
import { fmtCr } from "../shared/rules.ts";
import {
  COVER_COST,
  COVER_DAYS,
  COVER_RISK,
  LONGOP_MAX,
  LONGOP_TICK_H,
  MOLE_COST,
  MOLE_DAYS,
  MOLE_DEBT,
  moleRisk,
  type LongOpKind,
  type LongOpsView,
} from "../shared/longops.ts";
import type { LeakContent } from "../shared/leaks.ts";

type R = { ok: boolean; error?: string; note?: string; data?: unknown };
type Op = { id: string; kind: LongOpKind; target: string; nodeId: string | null; since: number; until: number; nextAt: number; log: { at: number; text: string }[] };
type State = { ops: Record<string, Op[]>; seq: number };
type Orgs = { news: (kind: "gente", text: string, n: NodeDoc | null, feed?: boolean) => void; org: (n: NodeDoc) => { fear: number } };
type Zones = { opPass: (n: NodeDoc) => string };
type Citizens = { facts: (pid: string) => { debt: number; employer: string | null } | null; employerId: (pid: string) => string | null; fire: (pid: string, nodeId: string) => void };

const H = 3600_000;
const now = () => Date.now();
const dev = () => process.env.AETHER_DEV === "1";
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;

export function installLongOps(game: Game, orgs: Orgs, zones: Zones, citizens: Citizens) {
  const state: State = game.store.get<State>("longops", "state") ?? { ops: {}, seq: 0 };
  let dirty = false;
  let roll: number | null = null;
  const rnd = () => roll ?? Math.random();
  const mine = (a: AgentDoc) => (state.ops[a.id] ??= []);
  const log = (a: AgentDoc, op: Op, text: string) => {
    op.log.unshift({ at: now(), text });
    op.log.splice(10);
    dirty = true;
    game.dirty.add(a.id);
  };
  const close = (a: AgentDoc, op: Op) => {
    state.ops[a.id] = mine(a).filter((x) => x !== op);
    dirty = true;
    game.dirty.add(a.id);
  };
  const name = (pid: string) => PEOPLE.find((p) => p.id === pid)?.name ?? "?";

  // ---------------------------------------------------------------- un giro di un'operazione
  function tick(a: AgentDoc, op: Op) {
    op.nextAt = now() + LONGOP_TICK_H * H;
    if (op.kind === "mole") {
      const n = op.nodeId ? game.nodes.get(op.nodeId) : null;
      // licenziata nel frattempo, o l'azienda non c'è più
      if (!n || citizens.employerId(op.target) !== n.id) {
        log(a, op, `${name(op.target)} non lavora più lì: la talpa non serve più`);
        game.mail(a, name(op.target), "Non ci lavoro più", "Mi hanno spostata, o lasciata a casa. Da qui non vedo più niente.");
        return close(a, op);
      }
      if (rnd() < moleRisk(orgs.org(n).fear)) {
        citizens.fire(op.target, n.id);
        a.heat = Math.min(100, a.heat + 15);
        orgs.news("gente", `${n.org} licenzia ${name(op.target)}: passava informazioni a qualcuno di fuori. «Sappiamo a chi», dice l'azienda.`, n);
        game.mail(a, "Un amico", "La talpa è bruciata", `${n.org} ha scoperto ${name(op.target)}. L'hanno lasciata a casa, e qualcuno ora sa che dietro c'eri tu. Calore +15.`);
        log(a, op, "scoperta e licenziata: calore +15");
        return close(a, op);
      }
      const r = rnd();
      if (r < 0.3) {
        const pw = zones.opPass(n);
        game.mail(a, name(op.target), `${n.org}: l'operatore`, `La password dell'utenza operatore di ${n.org} questa settimana è ${pw}. Il sistema risponde al ${n.ip}.`);
        log(a, op, "ti ha passato la password dell'operatore");
      } else if (r < 0.55) {
        const half = n.password.slice(0, Math.ceil(n.password.length / 2));
        game.mail(a, name(op.target), `${n.org}: root`, `Ho visto il sistemista scriverla. Comincia per «${half}». Il resto non l'ho visto.`);
        log(a, op, "ti ha passato mezza password di root");
      } else if (r < 0.8) {
        const f = pick(n.files.filter((x) => !x.deleted && !x.encryption && !x.honeypot));
        if (f && a.storage.reduce((s, x) => s + x.size, 0) + f.size <= game.storageMax(a)) {
          const content: LeakContent | undefined = Math.random() < 0.35 ? { kind: ["lab", "corp", "mil"].includes(n.kind) ? "research" : "scandal", nodeId: n.id, org: n.org, tier: game.tierOf(n) } : undefined;
          a.storage.push({ key: `st_mole${++state.seq}${now().toString(36)}`, name: f.name, nodeId: n.id, fileId: f.id, size: f.size, at: now(), value: f.value, content });
          game.touch("agent", a.id);
          log(a, op, `ti ha portato una copia di ${f.name}${content ? ", e c'è dentro qualcosa" : ""}`);
        } else log(a, op, "aveva un file per te, ma il tuo archivio è pieno");
      } else {
        ((n as unknown as { badges?: { agentId: string; until: number }[] }).badges ??= []).push({ agentId: a.id, until: now() + 24 * H });
        game.touch("node", n.id);
        log(a, op, `ti ha lasciato il suo badge: per 24 ore entri in ${n.org} da operatore`);
        game.mail(a, name(op.target), "Il badge", `Il mio badge vale ancora un giorno. Usalo bene: se lo usi male, lo pago io.`);
      }
      game.bump(a, "op:yield");
      return;
    }
    // sotto copertura in una banda di abitanti rossi
    const g = (game.lifeGangs?.() ?? []).find((x) => x.id === op.target);
    if (!g) return close(a, op);
    if (rnd() < COVER_RISK) {
      for (const m of g.members) game.lifeFavor?.(a, m, -20);
      a.heat = Math.min(100, a.heat + 10);
      game.mail(a, "Un amico", "Ti hanno scoperto", `${g.name} ha capito chi sei. Da oggi per loro sei un nemico, e non ti diranno più niente.`);
      log(a, op, "scoperto: la banda ti considera un nemico");
      return close(a, op);
    }
    const who = pick(g.members);
    const t = pick([...game.nodes.values()].filter((n) => n.gen && !n.hidden && !n.inner && n.kind !== "home" && n.kind !== "relay" && game.tierOf(n) <= 2));
    if (t) {
      t.alertUntil = Math.max(t.alertUntil ?? 0, now() + 4 * H);
      game.touch("node", t.id);
      game.reveal(a, t.id);
    }
    let caught = false;
    if (rnd() < 0.25) {
      game.lifeHeat?.(who, 60);
      caught = true;
    }
    game.mail(a, "Sotto copertura", `${g.name}: ${who}`, `${who} ha in mente ${t?.org ?? "un colpo"}. ${t ? "Ho fatto mettere il sistema in allerta. " : ""}${caught ? "E ho passato il suo nome alla Guardia: stanotte lo vanno a prendere." : ""}`);
    log(a, op, `${who} punta ${t?.org ?? "?"}: sistema in allerta${caught ? ", e il suo nome alla Guardia" : ""}`);
    a.stats.defense += 1;
    game.bump(a, "op:yield");
  }

  game.onPulse.push(() => {
    const t = now();
    for (const [id, ops] of Object.entries(state.ops)) {
      const a = game.agents.get(id);
      if (!a) continue;
      for (const op of [...ops]) {
        if (op.until < t) {
          game.mail(a, op.kind === "mole" ? name(op.target) : "Sotto copertura", "Finito", op.kind === "mole" ? "Basta così. Non cercarmi più." : "L'operazione è chiusa. Si torna in superficie.");
          close(a, op);
          continue;
        }
        if (op.nextAt <= t) tick(a, op);
      }
    }
  });

  // ---------------------------------------------------------------- vista e azioni
  function view(a: AgentDoc): LongOpsView {
    const dossiers = (a as unknown as { dossiers?: string[] }).dossiers ?? [];
    const busy = new Set(Object.values(state.ops).flat().filter((o) => o.kind === "mole").map((o) => o.target));
    return {
      ops: mine(a).map((o) => ({ id: o.id, kind: o.kind, title: o.kind === "mole" ? `Talpa: ${name(o.target)}, ${game.nodes.get(o.nodeId ?? "")?.org ?? "?"}` : `Sotto copertura: ${(game.lifeGangs?.() ?? []).find((g) => g.id === o.target)?.name ?? "?"}`, since: o.since, until: o.until, nextAt: o.nextAt, log: o.log })),
      moles:
        a.faction === "red"
          ? dossiers
              .map((pid) => ({ pid, f: citizens.facts(pid), e: citizens.employerId(pid) }))
              .filter((x) => x.f && x.e && x.f.debt > MOLE_DEBT && !busy.has(x.pid))
              .map((x) => ({ pid: x.pid, name: name(x.pid), employer: x.f!.employer ?? "?", debt: x.f!.debt }))
          : [],
      gangs: a.faction === "blue" ? (game.lifeGangs?.() ?? []).filter((g) => g.side === "red").map((g) => ({ id: g.id, name: g.name })) : [],
      max: LONGOP_MAX,
    };
  }
  function act(a: AgentDoc, p: Record<string, unknown>): R {
    const cmd = String(p.cmd ?? "view");
    const ok = (note: string): R => (game.touch("agent", a.id), game.dirty.add(a.id), (dirty = true), { ok: true, note, data: view(a) });
    if (cmd === "view") return { ok: true, data: view(a) };
    if (cmd === "dev" && dev()) {
      if (p.roll !== undefined) roll = p.roll === null ? null : Number(p.roll);
      if (p.tick) for (const op of mine(a)) tick(a, op);
      if (p.end) for (const op of mine(a)) op.until = 0;
      return { ok: true, data: view(a) };
    }
    if (cmd === "recall") {
      const op = mine(a).find((o) => o.id === p.id);
      if (!op) return { ok: false, error: "operazione sconosciuta" };
      close(a, op);
      return ok("operazione chiusa");
    }
    if (mine(a).length >= LONGOP_MAX) return { ok: false, error: `al più ${LONGOP_MAX} operazioni alla volta` };
    if (cmd === "mole") {
      if (a.faction !== "red") return { ok: false, error: "non è il tuo mestiere" };
      const c = view(a).moles.find((m) => m.pid === p.pid);
      if (!c) return { ok: false, error: "serve un dipendente indebitato di cui hai il fascicolo" };
      if (a.credits < MOLE_COST) return { ok: false, error: `ti servono ${fmtCr(MOLE_COST)}` };
      a.credits -= MOLE_COST;
      const op: Op = { id: `lo${++state.seq}`, kind: "mole", target: c.pid, nodeId: citizens.employerId(c.pid), since: now(), until: now() + MOLE_DAYS * 24 * H, nextAt: now() + LONGOP_TICK_H * H, log: [] };
      mine(a).push(op);
      game.bump(a, "op:mole");
      log(a, op, `${c.name} accetta: per ${MOLE_DAYS} giorni ti passa quello che vede`);
      return ok(`${c.name} è la tua talpa in ${c.employer}. Ti scriverà ogni ${LONGOP_TICK_H} ore, finché non la scoprono.`);
    }
    if (cmd === "cover") {
      if (a.faction !== "blue") return { ok: false, error: "non è il tuo mestiere" };
      const g = view(a).gangs.find((x) => x.id === p.gang);
      if (!g) return { ok: false, error: "banda sconosciuta" };
      if (a.credits < COVER_COST) return { ok: false, error: `ti servono ${fmtCr(COVER_COST)}` };
      a.credits -= COVER_COST;
      const op: Op = { id: `lo${++state.seq}`, kind: "cover", target: g.id, nodeId: null, since: now(), until: now() + COVER_DAYS * 24 * H, nextAt: now() + LONGOP_TICK_H * H, log: [] };
      mine(a).push(op);
      game.bump(a, "op:cover");
      log(a, op, `sei dentro ${g.name}, sotto falso nome`);
      return ok(`Sei dentro ${g.name}. Per ${COVER_DAYS} giorni saprai prima di loro dove colpiranno.`);
    }
    return { ok: false, error: "comando sconosciuto" };
  }
  const prev = game.socialAct;
  game.socialAct = (agent, a, p) => (a === "longop" ? act(agent, p) : (prev?.(agent, a, p) ?? null));

  return {
    save() {
      if (!dirty) return;
      dirty = false;
      game.store.put("longops", "state", state);
    },
  };
}
