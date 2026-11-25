// L'orologio del mondo e la sua gente.
// 1. Le regole di giorno e di notte: orari d'ufficio, pausa pranzo, fine settimana (shared/clock.ts).
// 2. La popolazione: trenta persone con un fuso, un orario e dei bisogni. Quando sono sveglie agiscono davvero
//    (un colpo dove è notte, un ceppo messo in giro, una ronda, una quarantena), finiscono dentro, tornano,
//    e raccontano in chat, in bacheca e sui giornali quello che hanno fatto.
import type { Game, NodeDoc } from "./game.ts";
import { REGION_NAME, regionAt, type Region } from "../shared/rules.ts";
import { clockLabel, dayPart, hoursOf, isWeekend, localHour, opensIn, staffed, type DayPart } from "../shared/clock.ts";
import { CHAT_BY_PART, CHAT_VIRUS, CHAT_WEEKEND, MAIL_TIMES, NEWS_BY_PART, NEWS_VIRUS, PERSONAS, REPLIES, THREADS, WALL, type Persona } from "./life-text.ts";

type Status = "sveglio" | "dorme" | "custodia";
type Soul = { heat: number; credits: number; jailUntil: number; deeds: number; busts: number; lastDeed: string; lastAt: number; said: number };
type State = { souls: Record<string, Soul>; day: number };
type BbsApi = { ids: () => string[]; areasOf: (bbs: string) => string[]; npcCall: (bbs: string, handle: string, from: string) => void; npcLine: (bbs: string, handle: string, text: string) => void; npcPost: (bbs: string, area: string, by: string, title: string, body: string) => boolean; npcReply: (bbs: string, by: string, body: string) => boolean };
export type WhoRow = { handle: string; city: string; clock: string; status: Status; side: Persona["side"]; about: string; last: string; lastAt: number };

const DAY = 86400_000;
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;
const hash = (s: string) => [...s].reduce((q, c) => (Math.imul(q, 33) ^ c.charCodeAt(0)) >>> 0, 5381);

export function installLife(game: Game, bbs: BbsApi) {
  const state: State = game.store.get<State>("life", "state") ?? { souls: {}, day: 0 };
  let dirty = false;
  const soul = (p: Persona) => (state.souls[p.handle] ??= { heat: 0, credits: 800 + (hash(p.handle) % 2400), jailUntil: 0, deeds: 0, busts: 0, lastDeed: "", lastAt: 0, said: 0 });
  /** Le frasi che gli habitué hanno da dire su quello che hanno appena fatto: la chat le pesca per prime. */
  const gossip: { by: string; text: string; at: number }[] = [];

  // ---------------------------------------------------------------- il tempo
  const now = () => Date.now();
  const forced = () => game.clockForce;
  const partAt = (x: number): DayPart => (forced() === "giorno" ? "mattina" : forced() === "notte" ? "notte" : dayPart(x, now()));
  const open = (n: NodeDoc) => !game.orgStrike?.(n) && (forced() === "giorno" ? hoursOf(n.kind) !== "nessuno" : forced() === "notte" ? hoursOf(n.kind) === "sempre" : staffed(n.kind, n.x, now()));
  const weekend = (x: number) => !forced() && isWeekend(x, now());
  const dark = (x: number) => partAt(x) === "notte";

  game.lifeWatch = (n) => {
    const hrs = hoursOf(n.kind);
    if (hrs === "nessuno") return 1;
    let f = 1;
    // in pausa pranzo chi guarda i monitor è a mangiare; nel fine settimana gli uffici sono vuoti anche di giorno
    if (partAt(n.x) === "pranzo" && open(n)) f *= 1.15;
    if (hrs === "ufficio" && weekend(n.x) && !dark(n.x)) f *= 1.2;
    return f;
  };
  game.lifeQuietLogin = (n) => open(n) && hoursOf(n.kind) !== "sempre";
  game.lifeCash = (n) => {
    const p = partAt(n.x);
    return p === "sera" ? 1.5 : p === "mattina" || p === "alba" ? 0.6 : 1;
  };
  game.lifeSweep = (n) => (hoursOf(n.kind) !== "sempre" && hoursOf(n.kind) !== "nessuno" && !open(n) ? 1.5 : 1);
  const regionX = new Map<string, number>();
  for (const r of Object.keys(REGION_NAME)) {
    const xs = [...game.nodes.values()].filter((n) => regionAt(n.x, n.y) === r).map((n) => n.x);
    regionX.set(r, xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 160);
  }
  // di notte restano accesi i modem che di giorno qualcuno spegne
  game.lifeScan = (region) => (dark(regionX.get(region) ?? 160) ? 1 : 0);
  game.lifeStaffed = (n) => {
    const hrs = hoursOf(n.kind);
    if (hrs === "sempre" || hrs === "nessuno") return null;
    if (!open(n)) {
      const h = forced() ? 8 : opensIn(n.kind, n.x, now());
      return `a quest'ora risponde la segreteria: l'amministratore c'è in orario d'ufficio (${h < 1 ? "fra meno di un'ora" : `fra ${Math.round(h)} h`})`;
    }
    if (partAt(n.x) === "pranzo") return "è in pausa pranzo: richiama dopo le 14, ora loro";
    return null;
  };
  game.lifeAdmin = (a, n) => {
    const p = partAt(n.x);
    if (hoursOf(n.kind) === "nessuno") return;
    if (p === "alba") game.bump(a, "dawn");
    if (p === "pranzo" && open(n)) game.bump(a, "lunch");
    if (weekend(n.x)) game.bump(a, "weekend");
    if (open(n) && hoursOf(n.kind) !== "sempre" && p !== "notte") game.bump(a, "daylight");
    if (p === "notte") {
      const key = `nr:${regionAt(n.x, n.y)}`;
      if (!a.counters[key]) game.bump(a, key);
      // seguire la notte: regioni diverse violate al buio nello stesso giorno
      const d = Math.floor(now() / DAY);
      const tag = a as unknown as { nightDay?: number; nightRegs?: string[] };
      if (tag.nightDay !== d) (tag.nightDay = d), (tag.nightRegs = []);
      if (!tag.nightRegs!.includes(key)) {
        tag.nightRegs!.push(key);
        if (tag.nightRegs!.length === 3) game.bump(a, "followsun");
      }
    }
  };

  // ---------------------------------------------------------------- la gente
  const awake = (p: Persona): Status => {
    const s = soul(p);
    if (s.jailUntil > now()) return "custodia";
    const h = forced() ? 22 : localHour(p.x, now());
    const up = p.wake < p.sleep ? h >= p.wake && h < p.sleep : h >= p.wake || h < p.sleep;
    return up ? "sveglio" : "dorme";
  };
  const orgs = () => [...game.nodes.values()].filter((n) => !n.hidden && !n.inner && hoursOf(n.kind) !== "nessuno");
  const fill = (text: string, p: Persona, n?: NodeDoc) => {
    const node = n ?? pick(orgs());
    const other = pick(PERSONAS.filter((q) => q !== p));
    const strain = currentStrain;
    return text
      .replaceAll("{org}", node.org)
      .replaceAll("{city}", n ? (node.city ?? p.city) : p.city)
      .replaceAll("{ora}", clockLabel(n ? node.x : p.x, now()))
      .replaceAll("{chi}", other.handle)
      .replaceAll("{virus}", strain || "Cascata")
      .replaceAll("{relay}", "Tortuga");
  };
  let currentStrain = "";
  const say = (p: Persona, text: string) => {
    gossip.push({ by: p.handle, text, at: now() });
    if (gossip.length > 12) gossip.shift();
  };
  const did = (p: Persona, what: string) => {
    const s = soul(p);
    s.lastDeed = what;
    s.lastAt = now();
    s.deeds += 1;
    dirty = true;
  };

  /** Un rosso sveglio cerca un sistema dove è notte e ci prova. Lascia righe vere nei log. */
  function redAct(p: Persona) {
    const s = soul(p);
    const targets = orgs().filter((n) => dark(n.x) && game.tierOf(n) <= 2 && (n.offlineUntil ?? 0) < now());
    const n = targets.length ? pick(targets) : null;
    if (!n) return;
    const ip = `${10 + (hash(p.handle) % 200)}.${hash(p.handle + "b") % 255}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const skill = 0.55 + (hash(p.handle) % 30) / 100 + (open(n) ? -0.15 : 0.1);
    game.log(n, "CONNECT from {FROM}", { fromIp: ip });
    n.activity = Math.min(1, (n.activity ?? 0) + 0.25);
    if (Math.random() < skill) {
      const roll = Math.random();
      if (roll < 0.25) {
        const w = game.mwWild?.(n.x);
        if (w) {
          currentStrain = w.name;
          s.heat += 12;
          did(p, `ha lasciato «${w.name}» in ${w.org}`);
          say(p, pick([`ho lasciato un regalino a ${w.org}. si chiama «${w.name}».`, `«${w.name}» è in giro da stanotte. non dico altro.`]));
          return busted(p);
        }
      }
      const gain = 150 + game.tierOf(n) * 220 + Math.floor(Math.random() * 300);
      s.credits += gain;
      s.heat += 8 + game.tierOf(n) * 6;
      game.log(n, "LOGIN admin from {FROM}", { fromIp: ip });
      if (Math.random() < 0.6) game.log(n, "LOG entries removed by admin", {});
      game.orgEvent?.(n, Math.random() < 0.5 ? "furto" : "intrusione", p.handle);
      did(p, `è entrato in ${n.org} (${clockLabel(n.x, now())} ora loro)`);
      say(p, pick([`${n.org}, alle ${clockLabel(n.x, now())} ora loro. dormivano tutti.`, `fatto ${n.org}. pulito, quattro relay, zero righe.`, `stanotte ${n.org}. il turno di notte guardava la tv.`, `sono dentro ${n.org} da dieci minuti e nessuno ha alzato la testa`]));
    } else {
      s.heat += 22;
      game.log(n, "AUTH fail admin from {FROM}", { fromIp: ip });
      did(p, `ha sbagliato un colpo a ${n.org}`);
      say(p, pick([`${n.org} mi ha visto. ho staccato al novanta per cento.`, `giornata storta: trace addosso a ${n.org}, salvo per un pelo`, `non andate su ${n.org} stanotte, sono svegli`]));
    }
    busted(p);
  }
  /** Chi tira troppo la corda finisce dentro per qualche ora, e gli altri lo scrivono sul muro. */
  function busted(p: Persona) {
    const s = soul(p);
    if (s.heat >= 100) {
      const hours = 2 + Math.floor(Math.random() * 5);
      s.jailUntil = now() + hours * 3600_000;
      s.heat = 20;
      s.busts += 1;
      s.credits = Math.max(0, s.credits - 600);
      did(p, "è stato arrestato");
      game.feed(`La Guardia del Reticolo ha fermato ${p.handle}, a ${p.city}. «Risaliamo sempre all'origine.»`, "blue");
      for (const b of p.bbs) if (b !== "falken") bbs.npcLine(b, pick(PERSONAS.filter((q) => q !== p && q.bbs.includes(b)) ?? [p]).handle, `free ${p.handle}`);
    }
  }
  /** Un blu sveglio fa la ronda: rinforza, ripulisce, firma. */
  function blueAct(p: Persona) {
    const s = soul(p);
    if (Math.random() < 0.45) {
      const c = game.mwCure?.();
      if (c) {
        s.credits += 250;
        did(p, `ha tolto «${c.name}» da ${c.org}`);
        say(p, pick([`tolto «${c.name}» da ${c.org}. chi l'ha scritto ha fatto un lavoro pigro.`, `${c.org} è pulita. era «${c.name}». aggiornate le firme.`]));
        if (Math.random() < 0.4) game.feed(`${c.org}: rimosso il virus «${c.name}». I tecnici ringraziano «un consulente esterno».`, "blue");
        return;
      }
    }
    const pool = orgs().filter((n) => dark(n.x) && !(n.patch && n.patch.until > now()) && game.tierOf(n) >= 1);
    const n = pool.length ? pick(pool) : null;
    if (!n) return;
    n.alertUntil = Math.max(n.alertUntil ?? 0, now() + 10 * 60_000);
    game.touch("node", n.id);
    s.credits += 120;
    game.orgEvent?.(n, "difesa", p.handle);
    did(p, `ha fatto la ronda a ${n.org}`);
    say(p, pick([`ronda a ${n.org}: per dieci minuti lì sono tutti all'erta.`, `sto guardando ${n.org}. chi ci prova stanotte mi trova sveglio.`, `turno a ${n.org}. log pulito, troppo pulito.`]));
  }
  /** Una chiamata a un BBS: resta fra gli ultimi chiamanti, e ogni tanto scrive. */
  function callBbs(p: Persona) {
    const id = pick(p.bbs);
    if (!bbs.ids().includes(id)) return;
    bbs.npcCall(id, p.handle, p.city);
    const r = Math.random();
    const s = soul(p);
    if (r < 0.2) bbs.npcLine(id, p.handle, fill(pick(WALL), p));
    else if (r < 0.5) {
      // metà delle volte risponde con quello che gli è appena successo
      const fresh = s.lastDeed && now() - s.lastAt < 3 * 3600_000 && Math.random() < 0.5;
      bbs.npcReply(id, p.handle, fresh ? `A proposito: stanotte uno di noi ${s.lastDeed}. (Ero io.)` : fill(pick(REPLIES), p));
    } else if (r < 0.62) {
      const areas = bbs.areasOf(id);
      const mine = THREADS.filter(([a]) => areas.includes(a));
      if (mine.length) {
        const [area, title, body] = pick(mine);
        bbs.npcPost(id, area, p.handle, fill(title, p), fill(body, p));
      }
    }
    did(p, `ha chiamato un BBS da ${p.city}`);
  }

  function pulse() {
    const t = now();
    const d = Math.floor(t / DAY);
    if (state.day !== d) {
      // a mezzanotte arriva la bolletta: chi resta senza soldi si dà da fare di più
      state.day = d;
      for (const p of PERSONAS) {
        const s = soul(p);
        s.credits -= 120 + (hash(p.handle + d) % 200);
        s.heat = Math.max(0, s.heat - 30);
      }
      dirty = true;
    }
    if (!game.on("npcActive")) return;
    for (const p of PERSONAS) {
      const s = soul(p);
      if (s.jailUntil && s.jailUntil < t) {
        s.jailUntil = 0;
        did(p, "è tornato in libertà");
        say(p, pick(["sono fuori. sei ore in una stanza con un poster della Guardia del Reticolo.", "rieccomi. mi hanno preso il modem, ne ho un altro.", "non chiedetemi niente. non ho detto niente. ciao a tutti."]));
        game.feed(`${p.handle} è di nuovo a piede libero.`, "sys");
      }
      if (awake(p) !== "sveglio") continue;
      // chi è al verde lavora il doppio
      const hunger = s.credits < 300 ? 2 : 1;
      const r = Math.random();
      if (r < 0.012 * hunger) (p.side === "blue" ? blueAct : p.side === "red" ? redAct : Math.random() < 0.5 ? redAct : callBbs)(p);
      else if (r < 0.012 * hunger + 0.02) callBbs(p);
      s.heat = Math.max(0, s.heat - 0.4);
    }
    // le notizie d'agenzia seguono l'ora del posto di cui parlano
    if (Math.random() < 0.045) {
      const n = pick(orgs());
      const pool = currentStrain && Math.random() < 0.2 ? NEWS_VIRUS : NEWS_BY_PART[partAt(n.x)];
      game.feed(fill(pick(pool), PERSONAS[0]!, n), "sys");
    }
  }
  game.onPulse.push(pulse);

  // la chat: prima quello che è successo davvero, poi le chiacchiere dell'ora
  game.lifeChat = (lore) => {
    const g = gossip.shift();
    if (g && now() - g.at < 20 * 60_000) return g.text;
    const up = PERSONAS.filter((p) => awake(p) === "sveglio");
    if (!up.length || Math.random() < 0.35) return null;
    const p = pick(up);
    const pool = currentStrain && Math.random() < 0.12 ? CHAT_VIRUS : weekend(p.x) && Math.random() < 0.2 ? CHAT_WEEKEND : CHAT_BY_PART[partAt(p.x)];
    void lore;
    return fill(pick(pool), p);
  };

  const prev = game.socialAct;
  game.socialAct = (agent, a, p) => {
    if (a !== "life") return prev?.(agent, a, p) ?? null;
    if (p.cmd === "force" && process.env.AETHER_DEV === "1") {
      const who = PERSONAS.find((x) => x.handle === p.handle);
      if (!who) return { ok: false, error: "chi?" };
      if (p.free) soul(who).jailUntil = 0;
      if (typeof p.heat === "number") soul(who).heat = p.heat;
      (p.what === "red" ? redAct : p.what === "blue" ? blueAct : callBbs)(who);
      return { ok: true, data: { said: gossip.at(-1)?.text ?? null, soul: soul(who), chat: game.lifeChat?.("main") } };
    }
    const rows: WhoRow[] = PERSONAS.map((x) => ({ handle: x.handle, city: x.city, clock: clockLabel(x.x, now()), status: awake(x), side: x.side, about: x.about, last: soul(x).lastDeed, lastAt: soul(x).lastAt })).sort((x, y) => Number(y.status === "sveglio") - Number(x.status === "sveglio") || y.lastAt - x.lastAt);
    return { ok: true, data: { rows, awake: rows.filter((r) => r.status === "sveglio").length } };
  };

  return {
    mailTimes: MAIL_TIMES,
    pulse,
    /** Solo per i test: fa agire subito un personaggio. */
    force: (handle: string, what: "red" | "blue" | "bbs") => {
      const p = PERSONAS.find((x) => x.handle === handle);
      if (p) (what === "red" ? redAct : what === "blue" ? blueAct : callBbs)(p);
      return gossip.at(-1)?.text ?? null;
    },
    save() {
      if (!dirty) return;
      dirty = false;
      game.store.put("life", "state", state);
    },
    regions: () => Object.keys(REGION_NAME) as Region[],
  };
}
