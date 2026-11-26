// Imprevisti durante le intrusioni (regole in shared/surprises.ts). Ogni sessione viva può incontrarne uno, scelto fra
// quelli possibili in quel momento: l'amministratore si collega solo se è orario d'ufficio, il turno di notte controlla
// solo di notte, la linea gracchia solo con un blackout, una città al buio o un rimbalzo lunghissimo. Lo stato vive solo
// in memoria, come le connessioni.
import type { Game, AgentDoc, NodeDoc, OpDoc } from "./game.ts";
import { PEOPLE } from "./people.ts";
import { dayPart, hoursOf, staffed } from "../shared/clock.ts";
import { regionAt } from "../shared/rules.ts";
import {
  CANARY_CHANCE,
  CANARY_DECIDE_S,
  CANARY_FEAR,
  REBOOT_S,
  SURPRISE_CHANCE,
  SURPRISE_CHECK_S,
  SURPRISE_DECIDE_S,
  SURPRISE_GRACE_S,
  SURPRISE_NAME,
  bluffChance,
  type SurpriseChoice,
  type SurpriseKind,
  type SurpriseView,
} from "../shared/surprises.ts";

type Orgs = { org: (n: NodeDoc) => { fear: number }; isOrg: (n: NodeDoc) => boolean };
type Live = {
  opId: string;
  agentId: string;
  kind: SurpriseKind;
  view: SurpriseView;
  rival?: { opId?: string; agentId?: string; handle: string; ip: string };
  resolved: boolean;
  resultUntil: number;
};
type Fx = { trace: number; traceUntil: number; speed: number; speedUntil: number; modem: number; modemUntil: number; pauseUntil: number };

const S = 1000;
const now = () => Date.now();
const dev = () => process.env.AETHER_DEV === "1";
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;

export function installSurprises(game: Game, orgs: Orgs) {
  const live = new Map<string, Live>(); // per operazione
  const fx = new Map<string, Fx>();
  const seen = new Map<string, { last: number; had: boolean }>();
  let roll: number | null = null; // solo per i test: fissa l'esito dei tiri
  // nei test veloci gli imprevisti spontanei sono spenti: un amministratore a caso li renderebbe instabili
  let auto = process.env.AETHER_FAST !== "1";
  let chance = SURPRISE_CHANCE;
  let seq = 0;
  const rnd = () => roll ?? Math.random();
  const effects = (opId: string) => {
    let f = fx.get(opId);
    if (!f) fx.set(opId, (f = { trace: 1, traceUntil: 0, speed: 1, speedUntil: 0, modem: 1, modemUntil: 0, pauseUntil: 0 }));
    return f;
  };

  // gli effetti sugli strumenti e sul trace
  game.twistTrace = (op) => {
    const f = fx.get(op.id);
    return f && f.traceUntil > now() ? f.trace : 1;
  };
  game.twistSpeed = (op, usesModem) => {
    const f = fx.get(op.id);
    if (!f) return 1;
    const t = now();
    if (f.pauseUntil > t) return 0;
    return (f.speedUntil > t ? f.speed : 1) * (usesModem && f.modemUntil > t ? f.modem : 1);
  };

  // ---------------------------------------------------------------- quando può succedere cosa
  const target = (op: OpDoc) => game.nodes.get(op.chain.at(-1)!) ?? null;
  const office = (n: NodeDoc) => (game.clockForce === "giorno" ? hoursOf(n.kind) !== "nessuno" : game.clockForce === "notte" ? hoursOf(n.kind) === "sempre" : staffed(n.kind, n.x, now()));
  const night = (n: NodeDoc) => (game.clockForce ? game.clockForce === "notte" : dayPart(n.x, now()) === "notte");
  const noisy = (op: OpDoc, n: NodeDoc) => (game.meta.blackout?.[regionAt(n.x, n.y)] ?? 0) > now() || Boolean(game.nodeMarks?.(n).dark) || op.chain.length >= 6;
  const otherIntruder = (op: OpDoc) => [...game.ops.values()].find((o) => o.id !== op.id && o.chain.at(-1) === op.chain.at(-1) && !game.agents.get(o.agentId)?.npc) ?? null;
  function possible(op: OpDoc, a: AgentDoc, n: NodeDoc): [SurpriseKind, number][] {
    const out: [SurpriseKind, number][] = [];
    const org = orgs.isOrg(n) && n.kind !== "home" && n.kind !== "relay";
    if (a.faction === "red") {
      if (org && n.adminId && office(n)) out.push(["admin", 3]);
      if (org && night(n)) out.push(["patrol", 3]);
    }
    if (org) out.push(["rival", otherIntruder(op) ? 4 : 2]);
    if (n.kind !== "gateway" && n.kind !== "relay") out.push(["reboot", 1]);
    if (noisy(op, n)) out.push(["static", 2]);
    return out;
  }

  // ---------------------------------------------------------------- un imprevisto comincia
  const ch = (id: string, label: string, hint: string, why: string | null = null): SurpriseChoice => ({ id, label, hint, why });
  function start(op: OpDoc, a: AgentDoc, n: NodeDoc, kind: SurpriseKind): Live | null {
    const t = now();
    const s = seen.get(op.id) ?? { last: t, had: false };
    s.had = true;
    seen.set(op.id, s);
    const admin = n.adminId ? PEOPLE.find((p) => p.id === n.adminId) : null;
    const base = { id: `s${++seq}`, kind, title: SURPRISE_NAME[kind], until: t + SURPRISE_DECIDE_S * S, deadline: null as number | null, result: null };
    let L: Live;
    const isAdmin = op.access === "admin";
    switch (kind) {
      case "admin":
        L = {
          opId: op.id,
          agentId: a.id,
          kind,
          resolved: false,
          resultUntil: 0,
          view: {
            ...base,
            text: `Sul terminale compare una riga: «Chi c'è collegato da ${game.prevIp(op, a)}? Non ricordo di aver aperto sessioni.» È ${admin?.name ?? "l'amministratore"}, ${n.org}.`,
            choices: [ch("bluff", "Fingiti un collega", "Rispondi come se fossi uno di loro. Va meglio se conosci chi scrive, o se sei dentro da operatore."), ch("drop", "Stacca subito", "Esci prima che guardi meglio."), ch("silent", "Resta zitto", "Forse se ne va. Forse no.")],
            fallback: "resti zitto",
          },
        };
        break;
      case "reboot":
        L = {
          opId: op.id,
          agentId: a.id,
          kind,
          resolved: false,
          resultUntil: 0,
          view: {
            ...base,
            deadline: t + REBOOT_S * S,
            text: `Broadcast message from root@${n.name}: il sistema si riavvia fra ${REBOOT_S} secondi per l'aggiornamento programmato. Salvate il lavoro.`,
            choices: [
              ch("rush", "Finisci in fretta", "Gli strumenti vanno al massimo fino al riavvio, poi la linea cade."),
              ch("postpone", "Rimanda il riavvio", "Da admin si può: resta una riga nel log, e qualcuno potrebbe notarla.", isAdmin ? null : "serve l'accesso admin"),
              ch("drop", "Stacca ora", "Esci pulito, quello che non hai finito resta lì."),
            ],
            fallback: "il sistema si riavvia e la linea cade",
          },
        };
        break;
      case "rival": {
        const other = otherIntruder(op);
        const oa = other ? game.agents.get(other.agentId)! : null;
        const persona = oa ? null : pick((game.lifeBuyers?.() ?? []).filter((x) => x.side !== "blue"));
        if (!oa && !persona) return null;
        const handle = oa?.handle ?? persona!.handle;
        const ip = oa ? game.prevIp(other!, oa) : `${10 + Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
        const blue = a.faction === "blue";
        L = {
          opId: op.id,
          agentId: a.id,
          kind,
          resolved: false,
          resultUntil: 0,
          rival: { opId: other?.id, agentId: oa?.id, handle, ip },
          view: {
            ...base,
            text: blue ? `Mentre lavori vedi un'altra sessione aperta su ${n.org}, da ${ip}. Qualcuno è dentro adesso.` : `C'è un'altra sessione aperta su ${n.org}, da ${ip}. Due intrusi fanno il doppio del rumore: il monitor se ne accorgerà prima.`,
            choices: blue
              ? [ch("trace", "Traccialo", "Lavori su di lui invece che sul sistema: forse scopri chi è."), ch("ignore", "Lascia perdere", "Finisci il tuo lavoro.")]
              : [ch("follow", "Seguilo", "Guardi cosa fa e dove va: impari qualcosa, ma potrebbe accorgersene."), ch("kick", "Chiudigli la porta", "Da admin puoi buttarlo fuori. Non la prenderà bene.", isAdmin ? null : "serve l'accesso admin"), ch("ignore", "Ignoralo", "Il rumore in più accelera il trace per un minuto.")],
            fallback: blue ? "lasci perdere" : "lo ignori, e il rumore resta",
          },
        };
        break;
      }
      case "patrol":
        L = {
          opId: op.id,
          agentId: a.id,
          kind,
          resolved: false,
          resultUntil: 0,
          view: {
            ...base,
            text: `Il turno di notte di ${n.org} sta scorrendo i log in tempo reale. Per ora non ha visto niente.`,
            choices: [
              ch("wait", "Fermati e aspetta", "Strumenti e trace fermi per dodici secondi: lui passa oltre."),
              ch("push", "Continua", "Forse non nota niente. Se nota, il trace accelera."),
              ch("mask", "Confondi le righe", "Con un Log Deleter v2 o meglio, le tue righe sembrano routine.", (a.tools.logdel ?? 0) >= 2 ? null : "serve un Log Deleter v2"),
            ],
            fallback: "continui",
          },
        };
        break;
      case "static":
        L = {
          opId: op.id,
          agentId: a.id,
          kind,
          resolved: false,
          resultUntil: 0,
          view: {
            ...base,
            text: "La linea gracchia: il modem perde la portante a tratti. A questa velocità può cadere da un momento all'altro.",
            choices: [ch("slow", "Abbassa la velocità", "Copie e caricamenti a metà velocità per quaranta secondi, ma la linea tiene."), ch("push", "Tieni duro", "Una volta su tre la linea cade.")],
            fallback: "tieni duro",
          },
        };
        break;
      case "canary":
        L = {
          opId: op.id,
          agentId: a.id,
          kind,
          resolved: false,
          resultUntil: 0,
          view: {
            ...base,
            until: t + CANARY_DECIDE_S * S,
            text: `Il file che hai appena copiato da ${n.org} aveva un segnalatore dentro: sta chiamando casa con il tuo indirizzo.`,
            choices: [
              ch("cut", "Taglia la linea", "Stacchi subito: di solito il segnale non fa in tempo."),
              ch("bounce", "Rimbalzalo su un relay", "Con le chiavi di un relay del rimbalzo, il segnale porta lì.", op.chain.slice(0, -1).some((id) => a.relayKeys.includes(id)) ? null : "non hai le chiavi di nessun relay del rimbalzo"),
              ch("let", "Lascia correre", "Il tuo indirizzo arriva ai blu, e il calore sale."),
            ],
            fallback: "lasci correre",
          },
        };
        break;
    }
    live.set(op.id, L);
    game.bump(a, "sur:seen");
    game.dirty.add(a.id);
    return L;
  }

  // ---------------------------------------------------------------- una scelta (o il caso)
  function finish(L: Live, text: string, tone: "ok" | "warn" | "bad") {
    L.resolved = true;
    L.view.result = { text, tone };
    L.view.choices = [];
    L.resultUntil = now() + 8 * S;
    game.dirty.add(L.agentId);
  }
  function traceJump(op: OpDoc, frac: number) {
    const total = op.trace.hopTimes.reduce((q, v) => q + v, 0);
    op.trace.active = true;
    op.trace.progressMs = Math.min(total, op.trace.progressMs + total * frac);
  }
  function alert(n: NodeDoc, min: number) {
    n.alertUntil = Math.max(n.alertUntil ?? 0, now() + min * 60 * S);
    game.touch("node", n.id);
  }
  function resolve(L: Live, choice: string | null) {
    const op = game.ops.get(L.agentId);
    const a = game.agents.get(L.agentId);
    if (!op || op.id !== L.opId || !a) return;
    const n = target(op)!;
    const from = game.prevIp(op, a);
    const c = choice ?? { admin: "silent", reboot: "", rival: "ignore", patrol: "push", canary: "let", static: "push" }[L.kind];
    const t = now();
    switch (L.kind) {
      case "admin": {
        const admin = PEOPLE.find((p) => p.id === n.adminId);
        const first = admin?.name.split(" ")[0] ?? "root";
        if (c === "bluff") {
          const knows = ((a as unknown as { contacts?: string[] }).contacts ?? []).includes(n.adminId ?? "");
          const sub = /ferie/.test(game.lifeStaffed?.(n) ?? "");
          if (rnd() < bluffChance(knows, op.clearance, a.heat, sub)) {
            op.frozenUntil = Math.max(op.frozenUntil, t + 15 * S);
            game.bump(a, "sur:bluff");
            return finish(L, `«Ah, sei tu. Non toccare il backup.» ${first} se ne va: per quindici secondi nessuno guarda.`, "ok");
          }
          traceJump(op, 0.25);
          alert(n, 30);
          game.log(n, "root: suspicious session flagged from {FROM}", { opId: op.id, actorId: a.id, fromIp: from });
          return finish(L, `«Bel tentativo.» ${first} non ci casca: il trace fa un balzo in avanti e ${n.org} va in allerta.`, "bad");
        }
        if (c === "drop") {
          game.endOp(op, "clean");
          return finish(L, "Stacchi prima che guardi meglio.", "warn");
        }
        if (rnd() < 0.5) return finish(L, `${first} aspetta un po', poi chiude la finestra. Ti è andata bene.`, "ok");
        alert(n, 30);
        a.heat = Math.min(100, a.heat + 8);
        game.log(n, "root: killed session from {FROM}", { opId: op.id, actorId: a.id, fromIp: from });
        game.endOp(op, "clean");
        return finish(L, `${first} chiude la tua sessione a mano. ${n.org} va in allerta, e il tuo calore sale.`, "bad");
      }
      case "reboot": {
        if (c === "rush") {
          const f = effects(op.id);
          f.speed = 1.4;
          f.speedUntil = L.view.deadline ?? t;
          L.view.choices = L.view.choices.filter((x) => x.id === "drop");
          L.view.result = { text: "Strumenti al massimo fino al riavvio.", tone: "warn" };
          game.dirty.add(a.id);
          return; // il riavvio arriva comunque
        }
        if (c === "postpone") {
          if (op.access !== "admin") return;
          game.log(n, "shutdown -c by root from {FROM}", { opId: op.id, actorId: a.id, fromIp: from });
          L.view.deadline = null;
          if (rnd() < 0.3) {
            alert(n, 20);
            return finish(L, "Il riavvio è rimandato, ma qualcuno si chiede chi l'abbia fatto: il sistema va in allerta.", "warn");
          }
          return finish(L, "Riavvio rimandato. Nel log resta la riga, se non la cancelli.", "ok");
        }
        if (c === "drop") {
          game.endOp(op, "clean");
          return finish(L, "Stacchi prima del riavvio.", "warn");
        }
        return;
      }
      case "rival": {
        const r = L.rival!;
        const rop = r.opId ? game.ops.get(r.agentId!) : null;
        const ra = r.agentId ? game.agents.get(r.agentId) : null;
        if (a.faction === "blue") {
          if (c === "trace") {
            game.bump(a, "sur:rival");
            a.stats.defense += 1;
            if (ra && rop) {
              game.learn(a, ra.gatewayIp, ra.handle, `sorpreso dentro ${n.org}`);
              rop.boostUntil = t + 20 * S;
              rop.boostPower = 1.5;
              rop.boostBy = a.handle;
              game.dirty.add(ra.id);
              return finish(L, `Era ${ra.handle}. Il suo indirizzo è in rubrica, e il suo trace accelera.`, "ok");
            }
            game.lifeHeat?.(r.handle, 40);
            return finish(L, `Era ${r.handle}. L'hai segnalato alla Guardia: per lui la notte si fa lunga.`, "ok");
          }
          return finish(L, "Lasci perdere: non è il tuo lavoro, stanotte.", "warn");
        }
        if (c === "follow") {
          game.bump(a, "sur:rival");
          if (ra) {
            game.learn(a, ra.gatewayIp, ra.handle, `seguito dentro ${n.org}`);
            if (rnd() < 0.3) game.out.toast(ra.id, `Qualcuno ti ha seguito dentro ${n.org}.`, "warn");
            return finish(L, `Era ${ra.handle}. Lo segui fino a casa: il suo gateway è nella tua rubrica.`, "ok");
          }
          const next = pick([...game.nodes.values()].filter((x) => orgs.isOrg(x) && !x.hidden && !x.inner && !a.knownNodes.includes(x.id)));
          if (next) game.reveal(a, next.id);
          if (rnd() < 0.3) game.lifeFavor?.(a, r.handle, -5);
          return finish(L, `Era ${r.handle}. Dopo di qui va su ${next?.org ?? "un altro sistema"}: ora è sulla tua mappa.`, "ok");
        }
        if (c === "kick") {
          if (op.access !== "admin") return;
          game.bump(a, "sur:rival");
          if (ra && rop) {
            game.endOp(rop, "clean");
            ra.heat = Math.min(100, ra.heat + 5);
            game.out.toast(ra.id, `Qualcuno con l'accesso admin ti ha chiuso fuori da ${n.org}.`, "warn");
            game.dirty.add(ra.id);
            return finish(L, `Chiudi fuori ${ra.handle}. Il sistema è di nuovo tutto tuo.`, "ok");
          }
          game.lifeFavor?.(a, r.handle, -8);
          game.lifeHeat?.(r.handle, 15);
          return finish(L, `Chiudi fuori ${r.handle}. Se lo ricorderà.`, "ok");
        }
        const f = effects(op.id);
        f.trace = 1.2;
        f.traceUntil = t + 60 * S;
        return finish(L, "Lo lasci fare. Per un minuto il trace corre di più.", "warn");
      }
      case "patrol": {
        if (c === "wait") {
          op.frozenUntil = Math.max(op.frozenUntil, t + 12 * S);
          effects(op.id).pauseUntil = t + 12 * S;
          return finish(L, "Ti fermi. Dodici secondi dopo il turno di notte è passato oltre.", "ok");
        }
        if (c === "mask" && (a.tools.logdel ?? 0) >= 2) {
          const f = effects(op.id);
          f.trace = 0.9;
          f.traceUntil = t + 30 * S;
          return finish(L, "Le tue righe sembrano manutenzione ordinaria. Il turno di notte sbadiglia.", "ok");
        }
        if (rnd() < 0.4) {
          const f = effects(op.id);
          f.trace = 1.5;
          f.traceUntil = t + 20 * S;
          op.trace.active = true;
          return finish(L, "Ti ha visto. Per venti secondi il trace corre molto di più.", "bad");
        }
        return finish(L, "Non nota niente.", "ok");
      }
      case "canary": {
        const leak = () => {
          a.heat = Math.min(100, a.heat + 15);
          for (const b of game.agents.values()) if (!b.npc && b.faction === "blue" && b.id !== a.id) game.learn(b, a.gatewayIp, a.handle, `segnalatore in un file di ${n.org}`), game.dirty.add(b.id);
        };
        if (c === "cut") {
          game.endOp(op, "clean");
          if (rnd() < 0.7) {
            game.bump(a, "sur:canary");
            return finish(L, "Stacchi in tempo: il segnalatore non è riuscito a chiamare.", "ok");
          }
          leak();
          return finish(L, "Troppo tardi: il segnale è partito prima. Il tuo indirizzo è arrivato ai blu.", "bad");
        }
        if (c === "bounce" && op.chain.slice(0, -1).some((id) => a.relayKeys.includes(id))) {
          game.bump(a, "sur:canary");
          return finish(L, "Il segnale porta a un relay di cui hai le chiavi. Che cerchino lì.", "ok");
        }
        leak();
        return finish(L, "Il segnalatore chiama casa: il tuo indirizzo arriva ai blu, e il calore sale.", "bad");
      }
      case "static": {
        if (c === "slow") {
          const f = effects(op.id);
          f.modem = 0.5;
          f.modemUntil = t + 40 * S;
          return finish(L, "A metà velocità la linea tiene.", "ok");
        }
        if (rnd() < 1 / 3) {
          game.endOp(op, "clean");
          return finish(L, "NO CARRIER. La linea è caduta.", "bad");
        }
        return finish(L, "La linea gracchia, ma tiene.", "ok");
      }
    }
  }

  // ---------------------------------------------------------------- il tempo che passa
  let lastRun = 0;
  const origTick = game.tick.bind(game);
  game.tick = (dt) => {
    origTick(dt);
    const t = now();
    if (t - lastRun < 1000) return;
    lastRun = t;
    for (const [opId, L] of live) {
      const op = game.ops.get(L.agentId);
      if (!op || op.id !== opId) {
        if (L.resultUntil < t) live.delete(opId);
        continue;
      }
      if (!L.resolved && L.view.until < t && L.kind !== "reboot") resolve(L, null);
      if (L.kind === "reboot" && L.view.deadline && L.view.deadline < t && !L.resolved) {
        game.endOp(op, "clean");
        finish(L, "Il sistema si è riavviato. NO CARRIER.", "warn");
      }
      if (L.kind === "reboot" && !L.resolved && L.view.until < t && L.view.choices.length > 1) {
        L.view.choices = L.view.choices.filter((x) => x.id === "drop");
        game.dirty.add(L.agentId);
      }
    }
    for (const id of [...fx.keys()]) if (![...game.ops.values()].some((o) => o.id === id)) fx.delete(id);
    for (const id of [...seen.keys()]) if (![...game.ops.values()].some((o) => o.id === id)) seen.delete(id);
    for (const op of auto ? game.ops.values() : []) {
      const a = game.agents.get(op.agentId);
      if (!a || a.npc || live.has(op.id)) continue;
      const s = seen.get(op.id) ?? { last: t, had: false };
      seen.set(op.id, s);
      if (s.had || t - op.connectedAt < SURPRISE_GRACE_S * S || t - s.last < SURPRISE_CHECK_S * S) continue;
      s.last = t;
      if (Math.random() >= chance) continue;
      const n = target(op);
      if (!n) continue;
      const opts = possible(op, a, n);
      if (!opts.length) continue;
      let w = Math.random() * opts.reduce((q, o) => q + o[1], 0);
      const kind = opts.find((o) => (w -= o[1]) < 0)?.[0] ?? opts[0]![0];
      start(op, a, n, kind);
    }
  };

  // il segnalatore: dipende da un file copiato, non dal caso
  const prevDeed = game.deed.bind(game);
  game.deed = (agent, d, node) => {
    prevDeed(agent, d, node);
    if (!auto || d !== "t:copy" || !node || agent.npc || agent.faction !== "red" || !orgs.isOrg(node)) return;
    const op = game.ops.get(agent.id);
    if (!op || (live.has(op.id) && !live.get(op.id)!.resolved)) return;
    if (orgs.org(node).fear >= CANARY_FEAR && rnd() < CANARY_CHANCE) start(op, agent, node, "canary");
  };

  // la vista nella Console
  const prevExtra = game.opExtra;
  game.opExtra = (op, me, t) => {
    const L = live.get(op.id);
    return { ...(prevExtra?.(op, me, t) ?? {}), surprise: L && (!L.resolved || L.resultUntil > now()) ? L.view : null };
  };

  const prev = game.socialAct;
  game.socialAct = (agent, a, p) => {
    if (a !== "surprise") return prev?.(agent, a, p) ?? null;
    const op = game.ops.get(agent.id);
    if (p.dev && dev()) {
      if (p.roll !== undefined) roll = p.roll === null ? null : Number(p.roll);
      if (typeof p.auto === "boolean") auto = p.auto;
      if (typeof p.chance === "number") chance = p.chance;
      if (typeof p.force === "string" && op) {
        live.delete(op.id);
        const L = start(op, agent, target(op)!, p.force as SurpriseKind);
        return L ? { ok: true, data: L.view } : { ok: false, error: "non qui" };
      }
      if (typeof p.expire === "number" && op && live.get(op.id)) {
        const L = live.get(op.id)!;
        L.view.until = now() - 1;
        if (L.view.deadline) L.view.deadline = now() + p.expire;
      }
      return { ok: true };
    }
    if (!op) return { ok: false, error: "non sei collegato" };
    const L = live.get(op.id);
    if (!L || L.resolved) return { ok: false, error: "nessun imprevisto in corso" };
    const c = L.view.choices.find((x) => x.id === p.choice);
    if (!c) return { ok: false, error: "scelta non disponibile" };
    if (c.why) return { ok: false, error: c.why };
    resolve(L, c.id);
    return { ok: true, note: L.view.result?.text };
  };
}
