// Nemesi e favori (regole in shared/nemesis.ts). Le tracce nei log vengono da Game.registerIncident (ogni indagine aperta
// su una sessione che ha toccato qualcosa); le mosse e i favori girano sul battito del mondo, solo se l'abitante è sveglio.
import type { Game, AgentDoc, NodeDoc } from "./game.ts";
import { fmtCr } from "../shared/rules.ts";
import {
  BAIT_HEAT,
  BAIT_PAY,
  BRIBE_CHANCE,
  BRIBE_COST,
  DECOY_CHANCE,
  DECOY_COST,
  DECOY_DELAY_H,
  FAVOR_EVERY_H,
  FAVOR_GAIN,
  FAVOR_H,
  FAVOR_LOSS,
  FAVOR_MIN,
  NEMESIS_AT,
  NEMESIS_CALM,
  NEMESIS_CALM_H,
  NEMESIS_MOVE_H,
  type NemesisMove,
  type NemesisView,
} from "../shared/nemesis.ts";

type R = { ok: boolean; error?: string; note?: string; data?: unknown };
type Nem = { handle: string; since: number; level: number; nextAt: number; moves: NemesisMove[]; calmSince: number | null; bait?: { missionId: string; nodeId: string } | null };
type Favor = { handle: string; missionId: string; until: number; title: string };
type State = { att: Record<string, Record<string, number>>; nem: Record<string, Nem>; favors: Record<string, Favor>; favorAt: Record<string, number> };
type Orgs = { isOrg: (n: NodeDoc) => boolean; news: (kind: "gente", text: string, n: NodeDoc | null, feed?: boolean) => void };

const H = 3600_000;
const now = () => Date.now();
const dev = () => process.env.AETHER_DEV === "1";
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;

export function installNemesis(game: Game, orgs: Orgs) {
  const state: State = game.store.get<State>("nemesis", "state") ?? { att: {}, nem: {}, favors: {}, favorAt: {} };
  let dirty = false;
  let roll: number | null = null;
  const rnd = () => roll ?? Math.random();
  const people = () => game.lifePeople?.() ?? [];
  const person = (h: string) => people().find((p) => p.handle === h) ?? null;
  const nextMove = () => now() + (NEMESIS_MOVE_H[0] + Math.random() * (NEMESIS_MOVE_H[1] - NEMESIS_MOVE_H[0])) * H;
  const targets = (maxTier: number) => [...game.nodes.values()].filter((n) => n.gen && !n.hidden && !n.inner && orgs.isOrg(n) && n.kind !== "home" && game.tierOf(n) >= 1 && game.tierOf(n) <= maxTier);
  const note = (a: AgentDoc, n: Nem, text: string) => {
    n.moves.unshift({ at: now(), text });
    n.moves.splice(6);
    dirty = true;
    game.dirty.add(a.id);
  };

  // ---------------------------------------------------------------- la nemesi nasce dalle tracce nei log
  function start(a: AgentDoc, handle: string) {
    const p = person(handle);
    state.nem[a.id] = { handle, since: now(), level: 0, nextAt: nextMove(), moves: [], calmSince: null };
    game.mail(a, handle, "Il tuo caso", `Mi chiamo ${handle}${p ? `, da ${p.city}` : ""}. Ho trovato le tue righe in troppi log per far finta di niente.\n\nD'ora in poi il tuo caso è mio. Ci sentiremo spesso.`);
    orgs.news("gente", `${handle} della Guardia di Notte prende un caso tutto suo: «${a.handle} ha lasciato troppe tracce. Lo seguo io».`, null, false);
    dirty = true;
    game.dirty.add(a.id);
  }
  function end(a: AgentDoc, why: string, won: boolean) {
    const n = state.nem[a.id];
    if (!n) return;
    delete state.nem[a.id];
    if (state.att[a.id]) state.att[a.id]![n.handle] = 0;
    game.mail(a, n.handle, "Caso chiuso", why);
    if (won) game.bump(a, "nem:won");
    dirty = true;
    game.dirty.add(a.id);
  }
  const prevIncident = game.registerIncident.bind(game);
  game.registerIncident = (op) => {
    prevIncident(op);
    const a = game.agents.get(op.agentId);
    if (!a || a.npc || a.faction !== "red" || !op.touched) return;
    const blues = people().filter((p) => p.side === "blue");
    if (!blues.length) return;
    const att = (state.att[a.id] ??= {});
    const current = state.nem[a.id]?.handle ?? Object.entries(att).sort((x, y) => y[1] - x[1])[0]?.[0];
    const who = current && blues.some((b) => b.handle === current) ? current : pick(blues).handle;
    att[who] = (att[who] ?? 0) + (op.grave ? 2 : 1);
    dirty = true;
    if (!state.nem[a.id] && att[who]! >= NEMESIS_AT) start(a, who);
  };
  const prevArrest = game.arrest.bind(game);
  game.arrest = (agent, reason) => {
    prevArrest(agent, reason);
    if (state.nem[agent.id]) end(agent, "Ti hanno preso. Il mio lavoro finisce qui: il fascicolo lo chiude qualcun altro.", false);
  };

  // ---------------------------------------------------------------- le mosse
  function move(a: AgentDoc, n: Nem) {
    n.level = Math.min(3, n.level + 1);
    const kind = n.level < 3 ? n.level : 1 + Math.floor(Math.random() * 3);
    n.nextAt = nextMove();
    if (kind === 1) {
      // sorveglia l'organizzazione che colpisci di più
      const org = Object.entries(a.grudges).sort((x, y) => y[1] - x[1])[0]?.[0];
      const nodes = org ? [...game.nodes.values()].filter((x) => x.org === org) : [];
      if (nodes.length) {
        for (const x of nodes) (x.alertUntil = Math.max(x.alertUntil ?? 0, now() + 3 * H)), game.touch("node", x.id);
        note(a, n, `sorveglia ${org}: per tre ore è in allerta`);
        game.mail(a, n.handle, `${org}`, `So che ti piace ${org}. Per un po' ci sto io, davanti allo schermo. Fatti vedere.`);
        return;
      }
    }
    if (kind <= 2) {
      // un'esca in bacheca: un lavoro troppo facile
      const t = pick(targets(2));
      if (t) {
        const m = game.baseMission("red", "chain", t);
        m.title = `Lavoro facile: ${t.org}`;
        m.brief = `Un cliente che non vuole dire il suo nome ti offre un buon prezzo per un file qualunque di ${t.org}. Difese da ridere, dice. Forse troppo da ridere.`;
        m.objectives = [{ deed: "admin", n: 1, nodeId: t.id, label: `Diventa admin su ${t.org}` }, { deed: "t:copy", n: 1, nodeId: t.id, label: "Copia un file" }];
        game.priced(m);
        m.reward = Math.round(m.reward * BAIT_PAY) + 600;
        m.expiresAt = now() + 6 * H;
        m.requires = game.secRequires(t);
        m.ownerId = a.id; // un'offerta solo per te: la vedi a prescindere dalla fama
        game.missions.set(m.id, m);
        game.touch("mission", m.id);
        n.bait = { missionId: m.id, nodeId: t.id };
        note(a, n, `ha preparato qualcosa in bacheca`);
        return;
      }
    }
    // la soffiata alla Guardia
    game.charge(a, `segnalazione di ${n.handle}`, 1, "Guardia del Reticolo");
    a.heat = Math.min(100, a.heat + 10);
    game.touch("agent", a.id);
    note(a, n, "ti ha segnalato alla Guardia: un capo d'accusa e calore +10");
    game.mail(a, n.handle, "Una parola buona", "Ho messo una parola buona per te in procura. Una delle mie.");
  }
  // l'esca scatta quando entri da admin nel sistema scelto
  const prevDeed = game.deed.bind(game);
  game.deed = (agent, d, node) => {
    prevDeed(agent, d, node);
    const n = state.nem[agent.id];
    if (d !== "admin" || !node || !n?.bait || n.bait.nodeId !== node.id) return;
    n.bait = null;
    agent.heat = Math.min(100, agent.heat + BAIT_HEAT);
    for (const b of game.agents.values()) if (!b.npc && b.faction === "blue") game.learn(b, agent.gatewayIp, agent.handle, `esca di ${n.handle}`), game.dirty.add(b.id);
    note(agent, n, `ci sei cascato: era la sua esca. Calore +${BAIT_HEAT}, e i blu sanno dove sei`);
    game.mail(agent, n.handle, "Ciao", `${node.org} era mia. Ti aspettavo. Il tuo indirizzo ora ce l'hanno tutti.`);
  };

  // ---------------------------------------------------------------- favori
  function offer(a: AgentDoc, handle: string) {
    const t = pick(targets(2));
    if (!t) return;
    const red = a.faction === "red";
    const m = game.baseMission(a.faction, red ? "chain" : "audit", t);
    m.title = `Favore per ${handle}`;
    m.brief = red ? `${handle} ti chiede un file qualunque da ${t.org}, entro ${FAVOR_H} ore. «Non chiedere a cosa serve. Ti ripago.»` : `${handle} ti chiede di presidiare e rinforzare ${t.org} entro ${FAVOR_H} ore. «Stanotte non posso. Ti ripago.»`;
    m.objectives = red ? [{ deed: "admin", n: 1, nodeId: t.id, label: `Diventa admin su ${t.org}` }, { deed: "t:copy", n: 1, nodeId: t.id, label: "Copia un file" }] : [{ deed: "preside", n: 1, nodeId: t.id, label: `Presidia ${t.org}` }, { deed: "t:patch", n: 1, nodeId: t.id, label: "Rinforza il sistema" }];
    if (red) m.requires = game.secRequires(t);
    else {
      m.requires = ["patch"];
      m.clientAccess = true;
      (m as unknown as { clientNodes: string[] }).clientNodes = [t.id];
    }
    m.reward = 400 + game.tierOf(t) * 300;
    m.expiresAt = now() + FAVOR_H * H;
    m.ownerId = a.id;
    m.status = "taken";
    m.takenBy = a.id;
    m.takenAt = now();
    game.missions.set(m.id, m);
    game.touch("mission", m.id);
    game.reveal(a, t.id);
    state.favors[a.id] = { handle, missionId: m.id, until: m.expiresAt, title: m.title };
    state.favorAt[a.id] = now();
    game.mail(a, handle, "Un favore", `${m.brief}\n\nÈ già nella tua bacheca.`);
    dirty = true;
    game.dirty.add(a.id);
  }
  function checkFavor(a: AgentDoc) {
    const f = state.favors[a.id];
    if (!f) return;
    const m = game.missions.get(f.missionId);
    if (m?.status === "done") {
      delete state.favors[a.id];
      game.lifeFavor?.(a, f.handle, FAVOR_GAIN);
      game.bump(a, "fav:done");
      // ti ripaga con un numero che non è su nessun elenco, o con dei soldi
      const secret = [...game.nodes.values()].filter((n) => n.hidden && !a.discovered.includes(n.id));
      if (secret.length) game.discover(a, pick(secret));
      else a.credits += 800;
      game.mail(a, f.handle, "Grazie", `Te lo dovevo. ${secret.length ? "Guarda la tua mappa: c'è un numero che non trovi su nessun elenco." : `Ti ho girato ${fmtCr(800)}.`}`);
      dirty = true;
      game.dirty.add(a.id);
    } else if (!m || f.until < now() || m.status === "failed" || m.status === "expired") {
      delete state.favors[a.id];
      game.lifeFavor?.(a, f.handle, -FAVOR_LOSS);
      game.mail(a, f.handle, "Lascia stare", "Pensavo di poter contare su di te. Me lo ricorderò.");
      dirty = true;
      game.dirty.add(a.id);
    }
  }

  // ---------------------------------------------------------------- il battito
  game.onPulse.push(() => {
    const t = now();
    for (const a of game.agents.values()) {
      if (a.npc) continue;
      const n = state.nem[a.id];
      if (n) {
        if (a.heat <= NEMESIS_CALM) {
          n.calmSince ??= t;
          if (t - n.calmSince >= NEMESIS_CALM_H * H) {
            end(a, "Ti sei fatto furbo, o ti sei fatto da parte. In ogni caso, ho altro da fare. Per ora.", true);
            continue;
          }
        } else n.calmSince = null;
        if (t >= n.nextAt && person(n.handle)?.awake) move(a, n);
      }
      checkFavor(a);
      if (!state.favors[a.id] && t - (state.favorAt[a.id] ?? 0) >= FAVOR_EVERY_H * H && Math.random() < 0.03) {
        const friends = people().filter((p) => p.awake && (p.side === a.faction || p.side === "any") && (game.lifeFavorOf?.(a, p.handle) ?? 0) >= FAVOR_MIN);
        if (friends.length) offer(a, pick(friends).handle);
      }
    }
  });

  // ---------------------------------------------------------------- vista e azioni
  function view(a: AgentDoc): NemesisView {
    const n = state.nem[a.id];
    const f = state.favors[a.id];
    return {
      nemesis: n ? { handle: n.handle, city: person(n.handle)?.city ?? "?", level: n.level, since: n.since, nextAt: n.nextAt, moves: n.moves, calmFor: n.calmSince ? now() - n.calmSince : 0 } : null,
      watchers: Object.entries(state.att[a.id] ?? {}).filter(([, v]) => v > 0).map(([handle, att]) => ({ handle, att })).sort((x, y) => y.att - x.att),
      favor: f ? { handle: f.handle, title: f.title, until: f.until, missionId: f.missionId } : null,
      decoyCost: DECOY_COST,
      bribeCost: BRIBE_COST,
    };
  }
  function act(a: AgentDoc, p: Record<string, unknown>): R {
    const cmd = String(p.cmd ?? "view");
    const n = state.nem[a.id];
    const ok = (note: string): R => (game.touch("agent", a.id), game.dirty.add(a.id), (dirty = true), { ok: true, note, data: view(a) });
    if (cmd === "dev" && dev()) {
      if (p.roll !== undefined) roll = p.roll === null ? null : Number(p.roll);
      if (typeof p.start === "string") start(a, p.start);
      if (p.move && state.nem[a.id]) move(a, state.nem[a.id]!);
      if (typeof p.calm === "number" && state.nem[a.id]) state.nem[a.id]!.calmSince = now() - p.calm * H;
      if (typeof p.favor === "string") offer(a, p.favor);
      if (p.pulse) for (const f of game.onPulse) f();
      dirty = true;
      return { ok: true, data: view(a) };
    }
    if (cmd === "view") return { ok: true, data: view(a) };
    if (!n) return { ok: false, error: "nessuno ti sta dando la caccia" };
    if (cmd === "decoy") {
      if (a.credits < DECOY_COST) return { ok: false, error: `ti servono ${fmtCr(DECOY_COST)}` };
      a.credits -= DECOY_COST;
      if (rnd() < DECOY_CHANCE) {
        n.nextAt = Math.max(n.nextAt, now()) + DECOY_DELAY_H * H;
        n.level = Math.max(0, n.level - 1);
        state.att[a.id]![n.handle] = Math.max(0, (state.att[a.id]![n.handle] ?? 0) - 2);
        note(a, n, "l'hai depistato: per dodici ore cerca da un'altra parte");
        return ok(`${n.handle} segue una pista falsa: per ${DECOY_DELAY_H} ore non ti cerca`);
      }
      a.heat = Math.min(100, a.heat + 10);
      note(a, n, "non è cascato nel depistaggio");
      return ok(`${n.handle} non ci casca. Calore +10.`);
    }
    if (cmd === "bribe") {
      if (a.credits < BRIBE_COST) return { ok: false, error: `ti servono ${fmtCr(BRIBE_COST)}` };
      a.credits -= BRIBE_COST;
      if (rnd() < BRIBE_CHANCE) {
        a.ethics = Math.max(-100, a.ethics - 5);
        const h = n.handle;
        end(a, "Facciamo che non ci siamo mai conosciuti.", true);
        return ok(`${h} accetta. Il caso si chiude, e nessuno ne parlerà.`);
      }
      a.heat = Math.min(100, a.heat + 20);
      game.charge(a, `tentata corruzione di ${n.handle}`, 1, "Guardia del Reticolo");
      note(a, n, "ha rifiutato i tuoi soldi, e l'ha messo a verbale");
      return ok(`${n.handle} rifiuta, e lo mette a verbale. I soldi non li rivedi. Calore +20.`);
    }
    return { ok: false, error: "comando sconosciuto" };
  }
  const prev = game.socialAct;
  game.socialAct = (agent, a, p) => (a === "nemesis" ? act(agent, p) : (prev?.(agent, a, p) ?? null));

  return {
    save() {
      if (!dirty) return;
      dirty = false;
      game.store.put("nemesis", "state", state);
    },
  };
}
