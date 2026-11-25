// L'orologio del mondo e la sua gente.
// 1. Le regole di giorno e di notte: orari d'ufficio, pausa pranzo, fine settimana (shared/clock.ts).
// 2. La popolazione: trenta persone con un fuso, un orario e dei bisogni. Quando sono sveglie agiscono davvero
//    (un colpo dove è notte, un ceppo messo in giro, una ronda, una quarantena), finiscono dentro, tornano,
//    e raccontano in chat, in bacheca e sui giornali quello che hanno fatto.
import type { Game, NodeDoc } from "./game.ts";
import { REGION_NAME, regionAt, type Region } from "../shared/rules.ts";
import { TRUST_DELTA } from "../shared/law.ts";
import { clockLabel, dayPart, hoursOf, isWeekend, localHour, opensIn, staffed, type DayPart } from "../shared/clock.ts";
import { CHAT_BY_PART, CHAT_VIRUS, CHAT_WEEKEND, MAIL_TIMES, NEWS_BY_PART, NEWS_VIRUS, PERSONAS, REPLIES, THREADS, WALL, type Persona } from "./life-text.ts";

type Status = "sveglio" | "dorme" | "custodia";
type Ambition = "élite" | "vendetta" | "crew" | "ritiro" | "fama";
type Soul = { heat: number; credits: number; jailUntil: number; deeds: number; busts: number; lastDeed: string; lastAt: number; said: number; ambition?: Ambition; progress?: number; favor?: Record<string, number>; tipAt?: Record<string, number>; feud?: Record<string, number>; awayUntil?: number };
export type GangView = { id: string; name: string; side: "red" | "blue"; motto: string; members: string[]; score: number; region: string | null; mine: boolean };
export type SoulRow = WhoRow & { ambition: string; progress: number; favor: number; gang: string | null; can: { act: "gift" | "alibi" | "loan"; label: string; why: string | null }[] };
const AMBITION_TEXT: Record<Ambition, string> = { "élite": "diventare élite su un BBS", vendetta: "farla pagare a chi l'ha fatto arrestare", crew: "portare la sua crew in cima", ritiro: "mettere da parte abbastanza per smettere", fama: "finire sui giornali" };
const GANGS: { id: string; name: string; side: "red" | "blue"; motto: string; members: string[] }[] = [
  { id: "corvi", name: "I Corvi", side: "red", motto: "quello che si dice qui non esce da qui", members: ["Corax", "Vex", "Grendel", "Oxide", "Tarlo"] },
  { id: "k2600", name: "Kollettivo 2600", side: "red", motto: "il mio crimine è la curiosità", members: ["Mantis", "Nyx_77", "Blackbird", "Zaira", "Brasa", "Tsuki"] },
  { id: "notte", name: "Guardia di Notte", side: "blue", motto: "qualcuno deve restare sveglio", members: ["Sentinel", "Halberd", "Wren", "Kowalski", "Lince", "Dorian"] },
  { id: "carrier", name: "Legione del Carrier", side: "red", motto: "NO CARRIER, no party", members: ["Ohm", "Kestrel", "Ratchet", "Ferro", "Quanta", "Baud"] },
];
type State = { souls: Record<string, Soul>; day: number };
type BbsApi = { ids: () => string[]; areasOf: (bbs: string) => string[]; npcCall: (bbs: string, handle: string, from: string) => void; npcLine: (bbs: string, handle: string, text: string) => void; npcPost: (bbs: string, area: string, by: string, title: string, body: string) => boolean; npcReply: (bbs: string, by: string, body: string) => boolean; playerBbs: () => { id: string; side: string; fame: number }[]; npcVisit: (bbs: string, handle: string) => void; npcUpload: (bbs: string, handle: string) => boolean; npcTip: (bbs: string, handle: string, city: string) => boolean };
export type WhoRow = { handle: string; city: string; clock: string; status: Status; side: Persona["side"]; about: string; last: string; lastAt: number };

const DAY = 86400_000;
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;
const hash = (s: string) => [...s].reduce((q, c) => (Math.imul(q, 33) ^ c.charCodeAt(0)) >>> 0, 5381);

export function installLife(game: Game, bbs: BbsApi) {
  const state: State = game.store.get<State>("life", "state") ?? { souls: {}, day: 0 };
  let dirty = false;
  const soul = (p: Persona) => {
    const s = (state.souls[p.handle] ??= { heat: 0, credits: 800 + (hash(p.handle) % 2400), jailUntil: 0, deeds: 0, busts: 0, lastDeed: "", lastAt: 0, said: 0 });
    s.ambition ??= (["élite", "crew", "ritiro", "fama"] as Ambition[])[hash(p.handle + "a") % 4]!;
    s.progress ??= hash(p.handle + "p") % 40;
    s.favor ??= {};
    s.tipAt ??= {};
    s.feud ??= {};
    return s;
  };
  const gangOf = (handle: string) => GANGS.find((g) => g.members.includes(handle)) ?? null;
  const gangScore: Record<string, number> = (state as State & { gangs?: Record<string, number> }).gangs ??= {};
  const sideOf = (a: { id: string }) => ((game.agents.get(a.id) as unknown as { gang?: string } | undefined)?.gang ?? null);
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
    if ((s.awayUntil ?? 0) > now()) return "dorme";
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
    const g = gangOf(p.handle);
    if (g && !/BBS|libertà|arrestato/.test(what)) gangScore[g.id] = (gangScore[g.id] ?? 0) + 1;
    // ogni impresa avvicina all'ambizione; quando ci arriva, il mondo lo viene a sapere
    s.progress = (s.progress ?? 0) + (s.ambition === "ritiro" ? 2 : 4);
    if (s.progress >= 100) fulfilled(p);
  };

  function fulfilled(p: Persona) {
    const s = soul(p);
    s.progress = 0;
    const was = s.ambition!;
    if (was === "ritiro") {
      s.awayUntil = now() + 2 * DAY;
      game.feed(`${p.handle} si ritira. «Ho messo da parte abbastanza. Non cercatemi.» Tornerà: tornano tutti.`, "sys");
      s.ambition = "fama";
    } else if (was === "élite") {
      for (const b of p.bbs) bbs.npcLine(b, p.handle, "élite. ce l'ho fatta. offro io (virtualmente)");
      game.feed(`${p.handle} è stato promosso élite su un BBS. In bacheca non si parla d'altro.`, "sys");
      s.ambition = "crew";
    } else if (was === "vendetta") {
      game.feed(`${p.handle} ha saldato un conto vecchio. Non dice con chi, ma qualcuno stanotte ha perso il sonno.`, "sys");
      s.ambition = "ritiro";
    } else if (was === "crew") {
      const g = gangOf(p.handle);
      if (g) gangScore[g.id] = (gangScore[g.id] ?? 0) + 15;
      game.feed(`${p.handle} ha fatto un colpo che vale una stagione${g ? ` per ${g.name}` : ""}.`, "sys");
      s.ambition = "fama";
    } else {
      game.feed(`${p.handle}, da ${p.city}, è su tutti i giornali. La madre: «Stava sempre in camera sua».`, "sys");
      s.ambition = "élite";
    }
    say(p, `fatto. volevo ${AMBITION_TEXT[was]}, e ci sono arrivato. adesso voglio ${AMBITION_TEXT[s.ambition!]}.`);
  }
  /** Il rapporto fra un abitante e un giocatore, da -100 a 100. */
  const favorOf = (p: Persona, id: string) => soul(p).favor![id] ?? 0;
  function favor(p: Persona, id: string, delta: number) {
    const s = soul(p);
    s.favor![id] = Math.max(-100, Math.min(100, (s.favor![id] ?? 0) + delta));
    dirty = true;
  }
  game.lifeFavor = (a, handle, delta) => {
    const p = PERSONAS.find((x) => x.handle === handle);
    if (p) favor(p, a.id, delta * ((game.agents.get(a.id) as unknown as { gang?: string }).gang === gangOf(handle)?.id ? 1.5 : 1));
  };
  /** Chi ti è amico ogni tanto ti scrive: un indirizzo, mezza password, un avvertimento. Cose vere. */
  function tips(p: Persona) {
    const s = soul(p);
    for (const [id, f] of Object.entries(s.favor!)) {
      const a = game.agents.get(id);
      if (!a || a.npc || f < 30 || now() - (s.tipAt![id] ?? 0) < 3 * 3600_000 || !game.online.has(id) || Math.random() > 0.15) continue;
      s.tipAt![id] = now();
      const pool = orgs().filter((n) => game.tierOf(n) <= 2);
      const unknown = pool.filter((n) => !a.knownNodes.includes(n.id) && Math.abs(n.x - p.x) < 60);
      const n = unknown.length && Math.random() < 0.5 ? pick(unknown) : pick(pool);
      let body: string;
      if (!a.knownNodes.includes(n.id) && game.reveal(a, n.id)) body = `Ti passo un numero: ${n.ip}, ${n.org}. L'ho messo sulla tua mappa. Non dire che te l'ho dato io.`;
      else if (a.faction === "red") body = `Su ${n.org}: la password di root comincia per «${n.password.slice(0, Math.ceil(n.password.length / 2))}». Il resto lo sai fare.`;
      else body = `Tieni d'occhio ${n.org}: stanotte qualcuno dei nostri amici ci proverà. Io non ti ho detto niente.`;
      game.mail(a, p.handle, pick(["Per te", "Una cosa", "Fra noi", "Non per iscritto, di solito"]), `${body}\n\n${p.handle}, da ${p.city}`);
      game.bump(a, "life:tip");
    }
    // e chi ti detesta fa il tuo nome
    for (const [id, f] of Object.entries(s.favor!)) {
      const a = game.agents.get(id);
      if (!a || a.npc || f > -40 || now() - (s.tipAt![`x${id}`] ?? 0) < 6 * 3600_000 || Math.random() > 0.1) continue;
      s.tipAt![`x${id}`] = now();
      if (a.faction === "red") a.heat = Math.min(100, a.heat + 6);
      for (const b of p.bbs) if (b !== "falken") bbs.npcLine(b, p.handle, `occhio a ${a.handle}`);
      if (game.online.has(id)) game.out.toast(id, `${p.handle} ha fatto il tuo nome in bacheca${a.faction === "red" ? ". Calore +6." : "."}`, "warn");
      game.touch("agent", a.id);
    }
  }

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
      const stole = Math.random() < 0.5;
      game.orgEvent?.(n, stole ? "furto" : "intrusione", p.handle);
      // quello che ruba lo porta al ricettatore: il mercato di quella merce si satura un po'
      if (stole) game.fenceFlood?.(n, 0.5);
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
  /** Il mercato delle informazioni (server/intel.ts): chi è sveglio vende e compra. */
  game.lifeBuyers = () => PERSONAS.filter((p) => awake(p) === "sveglio").map((p) => ({ handle: p.handle, side: p.side, city: p.city, credits: soul(p).credits }));
  game.lifeBuy = (handle, price, nodeId) => {
    const p = PERSONAS.find((x) => x.handle === handle);
    if (!p || awake(p) !== "sveglio") return false;
    const s = soul(p);
    if (s.credits < price) return false;
    s.credits -= price;
    dirty = true;
    const n = nodeId ? game.nodes.get(nodeId) : null;
    if (!n) return true;
    // una password comprata: entra dritto, senza forzare niente. Lascia comunque righe vere nei log.
    const ip = `${10 + (hash(p.handle) % 200)}.${hash(p.handle + "b") % 255}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    game.log(n, "CONNECT from {FROM}", { fromIp: ip });
    game.log(n, "LOGIN admin from {FROM}", { fromIp: ip });
    n.activity = Math.min(1, (n.activity ?? 0) + 0.25);
    s.credits += 150 + game.tierOf(n) * 220;
    s.heat += 6 + game.tierOf(n) * 4;
    game.orgEvent?.(n, "intrusione", p.handle);
    did(p, `è entrato in ${n.org} con una password comprata`);
    say(p, pick([`comprata una password per ${n.org} alla bancarella. funziona. soldi ben spesi.`, `${n.org}: non ho dovuto forzare niente, la chiave l'avevo in tasca`, `la bancarella delle info è la cosa migliore successa al Reticolo. chiedete a ${n.org}`]));
    busted(p);
    return true;
  };
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
      game.lawTrust?.(TRUST_DELTA.bust, null);
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
        const foe = PERSONAS.filter((x) => x.side === "red" && soul(x).lastDeed.includes(c.name))[0];
        if (foe) {
          s.feud![foe.handle] = (s.feud![foe.handle] ?? 0) + 1;
          if (s.feud![foe.handle] === 3) {
            game.feed(`Faida aperta fra ${p.handle} e ${foe.handle}: è la terza volta che uno disfa il lavoro dell'altro.`, "sys");
            soul(foe).ambition = "vendetta";
            say(foe, `${p.handle}, lo so che sei tu. tre volte. non ci sarà una quarta.`);
          }
        }
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
    let id = pick(p.bbs);
    // ogni tanto prova uno dei BBS aperti dai giocatori della sua parte, e i più famosi li prova più volentieri
    const theirs = bbs.playerBbs().filter((x) => p.side === "any" || x.side === p.side);
    let player = false;
    if (theirs.length && Math.random() < 0.35) {
      let k = Math.random() * theirs.reduce((q, x) => q + x.fame + 3, 0);
      for (const x of theirs) if ((k -= x.fame + 3) <= 0) (id = x.id), (player = true);
      if (!player) (id = theirs.at(-1)!.id), (player = true);
    }
    if (!player && !bbs.ids().includes(id)) return;
    bbs.npcCall(id, p.handle, p.city);
    if (player) {
      bbs.npcVisit(id, p.handle);
      if (Math.random() < 0.2) bbs.npcUpload(id, p.handle);
      if (Math.random() < 0.12) bbs.npcTip(id, p.handle, p.city);
    }
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
        for (const k of Object.keys(s.favor ?? {})) s.favor![k] = Math.round(s.favor![k]! * 0.97);
      }
      const top = GANGS.map((g) => ({ g, v: gangScore[g.id] ?? 0 })).sort((x, y) => y.v - x.v)[0];
      if (top && top.v > 0) game.feed(`Classifica delle crew: in testa ${top.g.name} (${top.v} imprese). «${top.g.motto}»`, "sys");
      for (const g of GANGS) gangScore[g.id] = Math.round((gangScore[g.id] ?? 0) * 0.7);
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
      tips(p);
      // chi è al verde lavora il doppio
      const hunger = s.credits < 300 ? 2 : 1;
      const r = Math.random();
      const rally = game.lifeRally?.(p.side) ?? 1;
      if (r < 0.012 * hunger * rally) (p.side === "blue" ? blueAct : p.side === "red" ? redAct : Math.random() < 0.5 ? redAct : callBbs)(p);
      else if (r < 0.012 * hunger * rally + 0.02) callBbs(p);
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
    const gangId = (agent as unknown as { gang?: string }).gang ?? null;
    const sr = (x: Persona): SoulRow => {
      const s = soul(x);
      const f = Math.round(favorOf(x, agent.id));
      const cd = (k: string, h: number) => (now() - (s.tipAt![`${k}${agent.id}`] ?? 0) < h * 3600_000 ? "già chiesto da poco" : null);
      return { handle: x.handle, city: x.city, clock: clockLabel(x.x, now()), status: awake(x), side: x.side, about: x.about, last: s.lastDeed, lastAt: s.lastAt, ambition: AMBITION_TEXT[s.ambition!], progress: Math.round(s.progress ?? 0), favor: f, gang: gangOf(x.handle)?.name ?? null, can: [
        { act: "gift", label: "Offrigli qualcosa · 200 CR", why: agent.credits < 200 ? "non hai 200 CR" : null },
        { act: "alibi", label: "Chiedi un alibi", why: f < 60 ? "non siete abbastanza amici" : cd("al", 24) },
        { act: "loan", label: "Chiedi un prestito", why: f < 45 ? "non siete abbastanza amici" : s.credits < 800 ? "è al verde anche lui" : cd("lo", 48) },
      ] };
    };
    if (p.cmd === "souls") return { ok: true, data: { rows: PERSONAS.map(sr).sort((x, y) => y.favor - x.favor || Number(y.status === "sveglio") - Number(x.status === "sveglio")), gangs: GANGS.map((g): GangView => ({ ...g, score: gangScore[g.id] ?? 0, region: null, mine: gangId === g.id })).sort((x, y) => y.score - x.score) } };
    if (p.cmd === "join") {
      const g = GANGS.find((x) => x.id === p.gang);
      if (!g) return { ok: false, error: "crew sconosciuta" };
      if (g.side !== agent.faction) return { ok: false, error: `${g.name} non prende gente dell'altra cellula` };
      const tag = agent as unknown as { gang?: string; gangAt?: number };
      if (tag.gang === g.id) return { ok: false, error: "sei già dei loro" };
      if (now() - (tag.gangAt ?? 0) < DAY && process.env.AETHER_DEV !== "1") return { ok: false, error: "hai cambiato bandiera da meno di un giorno: aspetta" };
      if (tag.gang) for (const h of GANGS.find((x) => x.id === tag.gang)?.members ?? []) game.lifeFavor?.(agent, h, -10);
      tag.gang = g.id;
      tag.gangAt = now();
      for (const h of g.members) game.lifeFavor?.(agent, h, 10);
      game.touch("agent", agent.id);
      game.bump(agent, "life:gang");
      return { ok: true, note: `ora giri con ${g.name}: «${g.motto}»` };
    }
    if (p.cmd === "gift" || p.cmd === "alibi" || p.cmd === "loan") {
      const who = PERSONAS.find((x) => x.handle === p.handle);
      if (!who) return { ok: false, error: "chi?" };
      const opt = sr(who).can.find((c) => c.act === p.cmd)!;
      if (opt.why) return { ok: false, error: opt.why };
      const s = soul(who);
      if (p.cmd === "gift") {
        agent.credits -= 200;
        s.credits += 200;
        game.lifeFavor?.(agent, who.handle, 8);
        game.bump(agent, "life:gift");
        game.touch("agent", agent.id);
        game.dirty.add(agent.id);
        return { ok: true, note: `${who.handle} apprezza. ${pick(["«Mi ricorderò».", "«Era ora che qualcuno pensasse alla bolletta».", "«Non dovevi. Cioè, dovevi».", "«Grazie. Quando serve, chiedi»."])}`, data: { row: sr(who) } };
      }
      if (p.cmd === "alibi") {
        s.tipAt![`al${agent.id}`] = now();
        agent.heat = Math.max(0, agent.heat - 15);
        game.lifeFavor?.(agent, who.handle, -8);
        game.bump(agent, "life:alibi");
        game.touch("agent", agent.id);
        game.dirty.add(agent.id);
        return { ok: true, note: `${who.handle} giura che ieri sera eri con lui, a ${who.city}. Calore −15.`, data: { row: sr(who) } };
      }
      s.tipAt![`lo${agent.id}`] = now();
      s.credits -= 600;
      agent.credits += 600;
      game.lifeFavor?.(agent, who.handle, -12);
      game.bump(agent, "life:loan");
      game.touch("agent", agent.id);
      game.dirty.add(agent.id);
      return { ok: true, note: `${who.handle} ti presta 600 CR. Non li rivuole. Ma se lo ricorderà.`, data: { row: sr(who) } };
    }
    if (p.cmd === "favor" && process.env.AETHER_DEV === "1") {
      const who = PERSONAS.find((x) => x.handle === p.handle)!;
      soul(who).favor![agent.id] = Number(p.value);
      soul(who).tipAt = {};
      if (p.tips) tips(who);
      if (typeof p.progress === "number") (soul(who).progress = p.progress), did(who, "ha fatto una cosa per il test");
      return { ok: true, data: { row: sr(who) } };
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
