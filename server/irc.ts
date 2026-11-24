// ReticoloNet: una rete IRC come quelle del 1996, dentro il gioco. Canali, query, operatori, bot,
// netsplit, DCC. I comandi di gioco (pagare, scambiare oggetti, sfidare, gestire la crew) passano
// dai gesti di server/social.ts: la chat non ha poteri suoi, è un altro modo di chiedere le stesse cose.
import type { Game, AgentDoc } from "./game.ts";
import type { Social } from "./social.ts";
import { fmtCr, levelOf, rankOf } from "../shared/rules.ts";
import { EXPLOITS, fameTier } from "../shared/depth.ts";
import type { IrcChan, IrcEvent, IrcLine, IrcUser } from "../shared/types.ts";
import { MOTD, CHATTER, RUMORS, QUOTES, EIGHTBALL, CLIENT_VERSIONS, QUIT_MSGS, GREETINGS, SNARK } from "./irc-text.ts";

type R = { ok: boolean; error?: string; note?: string; data?: unknown };
type Mode = "" | "+" | "@" | "~";
type Chan = { name: string; topic: string; topicBy: string; modes: string; users: Map<string, Mode>; only?: "red" | "blue"; crew?: string; secret?: boolean; bans: Set<string>; invites: Set<string>; log: IrcLine[]; lore?: string };
type Prefs = { chans: string[]; away: string; ignore: string[]; mutedUntil: number; lastSeenAt: number; lastSaid: string };

const SERVER = "irc.reticolo.net";
const SERVICE = "X";
const ORACLE = "Oracolo";
const XDCC = "XDCC-Kestrel";
const NEWS = "Lumen";
const now = () => Date.now();
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
const hash = (s: string) => [...s].reduce((q, c) => (Math.imul(q, 33) ^ c.charCodeAt(0)) >>> 0, 5381);

export function installIrc(game: Game, social: Social, send: (agentId: string, ev: IrcEvent) => void) {
  let lineId = 0;
  const chans = new Map<string, Chan>();
  const bots = new Map<string, { host: string; version: string }>();
  const flood = new Map<string, number[]>();
  const voiceCd = new Map<string, number>();
  const prefsOf = (a: AgentDoc): Prefs => ((a as unknown as { irc?: Prefs }).irc ??= { chans: [], away: "", ignore: [], mutedUntil: 0, lastSeenAt: 0, lastSaid: "" });
  const online = (a: AgentDoc) => game.online.has(a.id);
  const humans = () => [...game.agents.values()].filter((a) => !a.npc && online(a));
  const human = (nick: string) => humans().find((a) => a.handle.toLowerCase() === nick.toLowerCase()) ?? null;
  const anyHuman = (nick: string) => [...game.agents.values()].find((a) => !a.npc && a.handle.toLowerCase() === nick.toLowerCase()) ?? null;
  const hostOf = (a: AgentDoc) => `~${a.handle.toLowerCase().slice(0, 9)}@gw-${hash(a.id).toString(16).slice(0, 6)}.${a.faction === "red" ? "dialup" : "soc"}.reticolo.net`;
  const modeOf = (a: AgentDoc, c: Chan): Mode => (a.staff ? "~" : c.crew && social.crews()[c.crew]?.leader === a.id ? "@" : (c.users.get(a.handle) ?? ""));

  function mk(name: string, topic: string, o: Partial<Chan> = {}) {
    const c: Chan = { name, topic, topicBy: SERVICE, modes: "+nt", users: new Map(), bans: new Set(), invites: new Set(), log: [], ...o };
    chans.set(name.toLowerCase(), c);
    return c;
  }
  mk("#reticolo", "Benvenuti su ReticoloNet · niente flood, niente IP in chiaro · !aiuto per i comandi dei bot");
  mk("#aiuto", "Domande da niubbi? Qui. RTFM prima, però: /aiuto");
  mk("#mercato", "Compro/vendo/scambio · si tratta in query, si consegna in DCC · chi bidona finisce in /ignore");
  mk("#rossi", "Cellula rossa · quello che si dice qui non esce da qui", { only: "red", modes: "+nst" });
  mk("#blu", "Cellula blu · turni, cacce, soffiate", { only: "blue", modes: "+nst" });
  mk("#2600", "Phreaking, centrali, fischietti · «il mio crimine è la curiosità»", { lore: "phreak" });
  mk("#warez", `XDCC attivo · /msg ${XDCC} xdcc list · non chiedete, leggete il topic`, { lore: "warez" });
  mk("#cyberia", "Chiacchiere, cinema, modem a 14.4 · off-topic benvenuto", { lore: "chat" });
  mk("#gibson", "«Le quattro password più usate…» · se sei qui, sai già perché", { secret: true, modes: "+nst", lore: "elite" });
  mk("#wopr", "STRANO GIOCO. L'UNICA MOSSA VINCENTE È NON GIOCARE.", { secret: true, modes: "+nst", lore: "elite" });
  const chan = (name: string) => chans.get(name.toLowerCase()) ?? null;

  // i bot: i servizi e gli handle NPC del mondo
  const addBot = (nick: string, host: string) => bots.set(nick, { host, version: pick(CLIENT_VERSIONS) });
  addBot(SERVICE, "cservice@reticolo.net");
  addBot(ORACLE, "oracolo@delfi.reticolo.net");
  addBot(XDCC, "kestrel@t3.warez.reticolo.net");
  addBot(NEWS, "lumen@newsroom.reticolo.net");
  const npcs = [...game.agents.values()].filter((a) => a.npc).map((a) => a.handle);
  for (const n of npcs) addBot(n, `~${n.toLowerCase().slice(0, 8)}@${pick(["ppp", "dialup", "slip", "cable"])}-${hash(n) % 250}.${pick(["kaos.org", "undernet.it", "freenode.tin", "galactica.it", "mclink.net"])}`);
  const publicChans = () => [...chans.values()].filter((c) => !c.only && !c.crew && !c.secret);
  for (const c of chans.values()) {
    c.users.set(SERVICE, "@");
    if (c.name === "#reticolo") (c.users.set(ORACLE, "+"), c.users.set(NEWS, "+"));
    if (c.name === "#warez") c.users.set(XDCC, "+");
    if (c.name === "#aiuto") c.users.set(ORACLE, "+");
  }
  for (const n of npcs) {
    const a = [...game.agents.values()].find((x) => x.handle === n)!;
    chan("#reticolo")!.users.set(n, "");
    chan(a.faction === "red" ? "#rossi" : "#blu")!.users.set(n, a.xp > 3000 ? "@" : "");
    for (const c of publicChans()) if (c.name !== "#reticolo" && Math.random() < 0.45) c.users.set(n, "");
    if (a.xp > 2000) chan(pick(["#gibson", "#wopr"]))!.users.set(n, "");
  }

  // ---------------------------------------------------------------- consegna
  const members = (c: Chan) => humans().filter((a) => c.users.has(a.handle));
  const chanView = (c: Chan): IrcChan => ({
    name: c.name,
    topic: c.topic,
    modes: c.modes,
    users: [...c.users.entries()]
      .map(([nick, m]): IrcUser => {
        const a = anyHuman(nick);
        return { nick, mode: a ? modeOf(a, c) : m, away: Boolean(a && prefsOf(a).away), bot: bots.has(nick) };
      })
      .sort((x, y) => "~@+ ".indexOf(x.mode || " ") - "~@+ ".indexOf(y.mode || " ") || x.nick.localeCompare(y.nick)),
  });
  const pushChan = (c: Chan) => members(c).forEach((a) => send(a.id, { e: "chan", chan: chanView(c) }));
  function line(c: Chan, nick: string, kind: IrcLine["kind"], text: string) {
    const l: IrcLine = { id: ++lineId, at: now(), chan: c.name, nick, kind, text };
    c.log.push(l);
    if (c.log.length > 150) c.log.shift();
    for (const a of members(c)) {
      if (kind === "msg" || kind === "act") if (prefsOf(a).ignore.includes(nick.toLowerCase())) continue;
      send(a.id, { e: "line", line: l });
    }
    return l;
  }
  /** Una riga solo per te: risposte del server, nella finestra indicata («*» = stato). */
  const tell = (a: AgentDoc, text: string, where = "*", nick = SERVER, kind: IrcLine["kind"] = "sys") => send(a.id, { e: "line", line: { id: ++lineId, at: now(), chan: where, nick, kind, text } });
  const pm = (from: string, to: AgentDoc, text: string, kind: IrcLine["kind"] = "msg") => {
    if (prefsOf(to).ignore.includes(from.toLowerCase())) return;
    send(to.id, { e: "line", line: { id: ++lineId, at: now(), chan: `@${from}`, nick: from, kind, text } });
  };
  const botSay = (c: Chan, nick: string, text: string, delay = 600 + Math.random() * 1800) => setTimeout(() => (text.startsWith("/me ") ? line(c, nick, "act", text.slice(4)) : line(c, nick, "msg", text)), delay).unref();

  // ---------------------------------------------------------------- entrare e uscire
  function join(a: AgentDoc, name: string, quiet = false): string | null {
    if (!/^#[A-Za-z0-9_\-]{1,20}$/.test(name)) return "nome di canale non valido";
    let c = chan(name);
    if (!c) {
      if (prefsOf(a).chans.length >= 12) return "sei già in troppi canali";
      c = mk(name.toLowerCase(), "", { modes: "+nt" });
      c.users.set(a.handle, "@");
    }
    if (c.users.has(a.handle) && online(a) && !quiet) return "sei già lì";
    if (c.only && c.only !== a.faction && !a.staff) return `${c.name}: Cannot join channel (+i) — è il canale dell'altra cellula`;
    if (c.crew && social.crewOfAgent(a)?.tag !== c.crew && !a.staff) return `${c.name}: Cannot join channel (+k) — canale di crew`;
    if (c.bans.has(a.handle.toLowerCase()) && !a.staff) return `${c.name}: Cannot join channel (+b) — sei bannato`;
    if (!c.users.has(a.handle)) c.users.set(a.handle, c.users.size === 0 ? "@" : "");
    const p = prefsOf(a);
    if (!p.chans.includes(c.name)) (p.chans.push(c.name), game.touch("agent", a.id));
    line(c, a.handle, "join", hostOf(a));
    send(a.id, { e: "chan", chan: chanView(c) });
    pushChan(c);
    if (!quiet && c.topic) tell(a, `Topic: ${c.topic}`, c.name);
    if (!quiet && !c.crew && Math.random() < 0.35) {
      const greeter = [...c.users.keys()].filter((n) => bots.has(n) && ![SERVICE, XDCC, NEWS].includes(n));
      if (greeter.length) botSay(c, pick(greeter), pick(GREETINGS).replace("{n}", a.handle), 1500 + Math.random() * 3000);
    }
    return null;
  }
  function part(a: AgentDoc, name: string, msg = "", silent = false) {
    const c = chan(name);
    if (!c || !c.users.has(a.handle)) return "non sei in quel canale";
    if (!silent) line(c, a.handle, "part", msg);
    c.users.delete(a.handle);
    const p = prefsOf(a);
    p.chans = p.chans.filter((x) => x !== c.name);
    game.touch("agent", a.id);
    send(a.id, { e: "gone", chan: c.name });
    pushChan(c);
    if (![...c.users.keys()].some((n) => !bots.has(n)) && !c.only && !c.secret && !c.crew && !["#reticolo", "#aiuto", "#mercato", "#2600", "#warez", "#cyberia"].includes(c.name)) chans.delete(c.name.toLowerCase());
    return null;
  }

  /** Il giocatore si è collegato al gioco: entra nei suoi canali e riceve MOTD e arretrati. */
  function connected(a: AgentDoc) {
    if (a.awaiting) return;
    const p = prefsOf(a);
    const crew = social.crewOfAgent(a);
    const wanted = new Set(p.chans.length ? p.chans : ["#reticolo", a.faction === "red" ? "#rossi" : "#blu"]);
    if (crew) {
      const cn = `#${crew.tag.toLowerCase()}`;
      if (!chan(cn)) mk(cn, `Crew [${crew.tag}] ${crew.name}${crew.motto ? ` · ${crew.motto}` : ""}`, { crew: crew.tag, modes: "+nstk" });
      wanted.add(cn);
    }
    const ok: Chan[] = [];
    for (const name of wanted) {
      const c = chan(name);
      if (!c) continue;
      if ((c.only && c.only !== a.faction && !a.staff) || (c.crew && crew?.tag !== c.crew && !a.staff) || c.bans.has(a.handle.toLowerCase())) continue;
      const had = c.users.has(a.handle);
      if (!had) c.users.set(a.handle, "");
      if (!p.chans.includes(c.name)) p.chans.push(c.name);
      ok.push(c);
    }
    p.chans = p.chans.filter((n) => ok.some((c) => c.name === n));
    send(a.id, { e: "sync", server: SERVER, nick: a.handle, host: hostOf(a), motd: MOTD(a.handle, humans().length + bots.size, chans.size), chans: ok.map(chanView), backlog: ok.flatMap((c) => c.log.slice(-60)) });
    for (const c of ok) {
      const l: IrcLine = { id: ++lineId, at: now(), chan: c.name, nick: a.handle, kind: "join", text: hostOf(a) };
      c.log.push(l);
      for (const m of members(c)) if (m.id !== a.id) (send(m.id, { e: "line", line: l }), send(m.id, { e: "chan", chan: chanView(c) }));
    }
  }
  function disconnected(a: AgentDoc) {
    const p = prefsOf(a);
    p.lastSeenAt = now();
    const why = pick(QUIT_MSGS);
    for (const c of chans.values()) {
      if (!c.users.has(a.handle)) continue;
      const l: IrcLine = { id: ++lineId, at: now(), chan: c.name, nick: a.handle, kind: "quit", text: why };
      c.log.push(l);
      for (const m of members(c)) if (m.id !== a.id) send(m.id, { e: "line", line: l });
    }
    // resta nelle liste dei canali solo chi è collegato
    setTimeout(() => {
      if (online(a)) return;
      for (const c of chans.values()) if (c.users.has(a.handle) && !isOpSeat(c, a)) (c.users.delete(a.handle), pushChan(c));
    }, 50).unref();
  }
  const isOpSeat = (_c: Chan, _a: AgentDoc) => false;

  // ---------------------------------------------------------------- comandi
  const HELP: [string, string][] = [
    ["/join #canale", "entra in un canale (lo crea se non esiste)"],
    ["/part [#canale] [saluto]", "esce dal canale"],
    ["/msg nick testo · /query nick", "messaggio privato"],
    ["/me azione", "* tu fai qualcosa"],
    ["/topic [testo]", "legge o cambia il topic (solo operatori)"],
    ["/names · /who · /list", "chi c'è, e quali canali esistono"],
    ["/whois nick · /seen nick", "chi è, e quando è passato l'ultima volta"],
    ["/away [motivo] · /back", "ti segna assente"],
    ["/ignore nick · /unignore nick", "non leggi più quello che scrive"],
    ["/ping nick · /version nick · /time", "CTCP"],
    ["/slap nick", "una trota. Grossa."],
    ["/kick nick [motivo] · /ban nick · /unban nick · /op nick · /deop nick · /voice nick", "operatori di canale"],
    ["/paga nick importo", "mandi crediti (5% di commissione, 20.000 CR al giorno)"],
    ["/dcc list", "il tuo archivio, numerato"],
    ["/dcc send nick n [prezzo]", "offri il file o l'oggetto n. n (gratis, o al prezzo indicato)"],
    ["/dcc get nick · /dcc rifiuta nick", "accetti o rifiuti quello che ti offre"],
    ["/sfida nick posta · /accetta · /rifiuta", "duello: stesso bersaglio, vince chi lo buca per primo"],
    ["/crew crea SIGLA nome · invita nick · entra SIGLA · lascia · espelli nick · cassa importo · dai nick importo · motto testo", "la tua crew"],
    ["/stats [nick]", "numeri di carriera"],
    ["!aiuto in canale", "i comandi dei bot (voci, classifica, dadi, XDCC…)"],
  ];

  function command(a: AgentDoc, raw: string, where: string): R {
    const [cmd0, ...rest] = raw.slice(1).split(" ");
    const cmd = (cmd0 ?? "").toLowerCase();
    const arg = rest.join(" ").trim();
    const args = arg.split(/\s+/).filter(Boolean);
    const cur = where.startsWith("#") ? chan(where) : null;
    const err = (t: string): R => (tell(a, t, where === "*" ? "*" : where), { ok: false, error: t });
    const fine = (t = ""): R => (t && tell(a, t, where), { ok: true });
    const game2 = (r: R): R => (r.ok ? fine(`*** ${r.note ?? "fatto"}`) : err(`*** ${r.error}`));
    const isOp = (c: Chan) => a.staff || modeOf(a, c) === "@" || modeOf(a, c) === "~";
    const target = (nick: string, c: Chan) => [...c.users.keys()].find((n) => n.toLowerCase() === nick.toLowerCase()) ?? null;
    switch (cmd) {
      case "aiuto":
      case "help":
        tell(a, "— Comandi di ReticoloNet —", where);
        for (const [c, d] of HELP) tell(a, `${c.padEnd(34)} ${d}`, where);
        return { ok: true };
      case "motd":
        for (const l of MOTD(a.handle, humans().length + bots.size, chans.size)) tell(a, l, "*");
        return { ok: true };
      case "join":
      case "j": {
        if (!args[0]) return err("uso: /join #canale");
        const e = join(a, args[0].startsWith("#") ? args[0] : `#${args[0]}`);
        return e ? err(`*** ${e}`) : { ok: true, data: { focus: (args[0].startsWith("#") ? args[0] : `#${args[0]}`).toLowerCase() } };
      }
      case "part":
      case "leave": {
        const name = args[0]?.startsWith("#") ? args[0] : where;
        const e = part(a, name, args[0]?.startsWith("#") ? args.slice(1).join(" ") : arg);
        return e ? err(`*** ${e}`) : { ok: true };
      }
      case "msg":
      case "query":
      case "notice": {
        if (!args[0]) return err("uso: /msg nick testo");
        const text = args.slice(1).join(" ");
        if (cmd === "query" && !text) return { ok: true, data: { focus: `@${args[0]}` } };
        if (!text) return err("uso: /msg nick testo");
        return privmsg(a, args[0], text);
      }
      case "me":
        if (!cur) return where.startsWith("@") ? privmsg(a, where.slice(1), arg, "act") : err("non sei in un canale");
        return say(a, cur, arg, "act");
      case "topic":
        if (!cur) return err("non sei in un canale");
        if (!arg) return fine(`Topic di ${cur.name}: ${cur.topic || "(nessuno)"} — impostato da ${cur.topicBy}`);
        if (!isOp(cur)) return err(`${cur.name}: You're not channel operator`);
        cur.topic = arg.slice(0, 200);
        cur.topicBy = a.handle;
        line(cur, a.handle, "topic", cur.topic);
        pushChan(cur);
        return { ok: true };
      case "names":
      case "who": {
        if (!cur) return err("non sei in un canale");
        const v = chanView(cur);
        return fine(`[${cur.name}] ${v.users.map((u) => `${u.mode}${u.nick}`).join(" ")} — ${v.users.length} utenti`);
      }
      case "list":
        tell(a, "Canale               Utenti  Topic", where);
        for (const c of chans.values()) {
          if ((c.secret || c.crew || (c.only && c.only !== a.faction)) && !c.users.has(a.handle) && !a.staff) continue;
          tell(a, `${c.name.padEnd(20)} ${String(c.users.size).padStart(5)}  ${c.topic.slice(0, 70)}`, where);
        }
        return fine("Fine di /LIST");
      case "whois": {
        const n = args[0] ?? a.handle;
        const b = [...bots.keys()].find((x) => x.toLowerCase() === n.toLowerCase());
        const t = anyHuman(n) ?? [...game.agents.values()].find((x) => x.npc && x.handle.toLowerCase() === n.toLowerCase()) ?? null;
        if (!t && !b) return err(`${n}: No such nick/channel`);
        if (!t) {
          tell(a, `${b} è ${bots.get(b!)!.host} * servizio di ReticoloNet`, where);
          return fine(`${b} usa ${SERVER} · Fine di /WHOIS`);
        }
        const crew = t.npc ? null : social.crewOfAgent(t);
        tell(a, `${t.handle} è ${t.npc ? bots.get(t.handle)?.host : hostOf(t)} * ${rankOf(t.xp, t.faction).name}, livello ${levelOf(t.xp)}`, where);
        tell(a, `${t.handle} · cellula ${t.faction === "red" ? "rossa" : "blu"} · ${fameTier(t.fame).name}${crew ? ` · crew [${crew.tag}] ${crew.name}` : ""}`, where);
        const common = [...chans.values()].filter((c) => c.users.has(t.handle) && (c.users.has(a.handle) || (!c.secret && !c.crew && !c.only))).map((c) => `${t.npc ? (c.users.get(t.handle) ?? "") : modeOf(t, c)}${c.name}`);
        if (common.length) tell(a, `${t.handle} è su: ${common.join(" ")}`, where);
        if (t.staff) tell(a, `${t.handle} è un IRC Operator — amministrazione del Reticolo`, where);
        if (!t.npc && prefsOf(t).away) tell(a, `${t.handle} è assente: ${prefsOf(t).away}`, where);
        if (!t.npc && !online(t)) tell(a, `${t.handle} non è collegato (visto ${prefsOf(t).lastSeenAt ? new Date(prefsOf(t).lastSeenAt).toLocaleString("it-IT") : "mai"})`, where);
        return fine(`${t.handle} usa ${SERVER} · Fine di /WHOIS`);
      }
      case "seen": {
        const t = anyHuman(args[0] ?? "");
        if (!t) return err(`${args[0] ?? "?"}: mai visto da queste parti`);
        return fine(online(t) ? `${t.handle} è qui adesso.` : `${t.handle} è stato visto l'ultima volta ${prefsOf(t).lastSeenAt ? `il ${new Date(prefsOf(t).lastSeenAt).toLocaleString("it-IT")}` : "tanto tempo fa"}${prefsOf(t).lastSaid ? `, e diceva: «${prefsOf(t).lastSaid}»` : ""}`);
      }
      case "away":
        prefsOf(a).away = arg.slice(0, 80) || "sono via";
        for (const c of chans.values()) if (c.users.has(a.handle)) pushChan(c);
        return fine(`Sei segnato come assente: ${prefsOf(a).away}`);
      case "back":
        prefsOf(a).away = "";
        for (const c of chans.values()) if (c.users.has(a.handle)) pushChan(c);
        return fine("Bentornato: non sei più assente");
      case "ignore":
      case "unignore": {
        const n = (args[0] ?? "").toLowerCase();
        const p = prefsOf(a);
        if (!n) return fine(`Ignorati: ${p.ignore.join(", ") || "nessuno"}`);
        p.ignore = p.ignore.filter((x) => x !== n);
        if (cmd === "ignore") p.ignore.push(n);
        game.touch("agent", a.id);
        return fine(cmd === "ignore" ? `Da ora ignori ${n}` : `Non ignori più ${n}`);
      }
      case "nick":
        return err(`*** ${args[0] ?? "?"}: Nickname is registered — su ReticoloNet il nick è il tuo handle`);
      case "quit":
      case "exit":
        return err("*** Non si lascia il Reticolo. Al massimo si stacca il modem.");
      case "time":
        return fine(`${SERVER} :${new Date().toLocaleString("it-IT")} — ora del Reticolo: 2039`);
      case "ping": {
        if (!args[0]) return err("uso: /ping nick");
        return fine(`[${args[0]} PING reply]: ${(0.08 + Math.random() * 0.9).toFixed(2)} secs`);
      }
      case "version":
      case "ctcp": {
        const n = cmd === "ctcp" ? args[0] : (args[0] ?? "");
        const b = [...bots.keys()].find((x) => x.toLowerCase() === (n ?? "").toLowerCase());
        if (!n) return err("uso: /version nick");
        return fine(`[${b ?? n} VERSION reply]: ${b ? bots.get(b)!.version : "AETHER deck v2039 — ReticoloNet client"}`);
      }
      case "slap": {
        if (!cur || !args[0]) return err("uso: /slap nick (in un canale)");
        return say(a, cur, `slaps ${args[0]} around a bit with a large trout`, "act");
      }
      case "kick":
      case "ban":
      case "unban":
      case "op":
      case "deop":
      case "voice":
      case "devoice": {
        if (!cur) return err("non sei in un canale");
        if (!isOp(cur)) return err(`${cur.name}: You're not channel operator`);
        if (!args[0]) return err(`uso: /${cmd} nick`);
        const n = target(args[0], cur);
        if (cmd === "unban") {
          cur.bans.delete(args[0].toLowerCase());
          line(cur, a.handle, "mode", `-b ${args[0]}!*@*`);
          return { ok: true };
        }
        if (!n) return err(`${args[0]}: They aren't on that channel`);
        const victim = anyHuman(n);
        if ((victim?.staff || n === SERVICE) && !a.staff) return err(`${n}: non si tocca`);
        if (cmd === "kick" || cmd === "ban") {
          if (cmd === "ban") (cur.bans.add(n.toLowerCase()), line(cur, a.handle, "mode", `+b ${n}!*@*`));
          line(cur, a.handle, "kick", `${n} (${args.slice(1).join(" ") || a.handle})`);
          cur.users.delete(n);
          if (victim) {
            prefsOf(victim).chans = prefsOf(victim).chans.filter((x) => x !== cur.name);
            send(victim.id, { e: "gone", chan: cur.name });
            tell(victim, `Sei stato espulso da ${cur.name} da ${a.handle} (${args.slice(1).join(" ") || "nessun motivo"})`);
          } else if (bots.has(n)) setTimeout(() => (cur.users.set(n, ""), line(cur, n, "join", bots.get(n)!.host), pushChan(cur), botSay(cur, n, pick(["ma che ho fatto?", "lamer", "rejoin automatico, tie'", "ok ok, calma"]))), 4000).unref();
          pushChan(cur);
          return { ok: true };
        }
        const m: Mode = cmd === "op" ? "@" : cmd === "voice" ? "+" : "";
        cur.users.set(n, m);
        line(cur, a.handle, "mode", `${cmd === "op" ? "+o" : cmd === "deop" ? "-o" : cmd === "voice" ? "+v" : "-v"} ${n}`);
        pushChan(cur);
        return { ok: true };
      }
      case "mode":
        return fine(cur ? `${cur.name} ${cur.modes}` : `${a.handle} +i${a.staff ? "o" : ""}`);
      // ---- amministrazione (IRC operator)
      case "wallops":
      case "kill":
      case "silence": {
        if (!a.staff) return err("Permission Denied- You're not an IRC operator");
        if (cmd === "wallops") {
          for (const h of humans()) tell(h, `!${a.handle}! ${arg}`, "*", a.handle, "notice");
          return { ok: true };
        }
        const t = anyHuman(args[0] ?? "");
        if (!t) return err("nick sconosciuto");
        if (cmd === "silence") {
          const min = Math.max(0, Number(args[1]) || 10);
          prefsOf(t).mutedUntil = min ? now() + min * 60_000 : 0;
          game.touch("agent", t.id);
          tell(t, min ? `*** Sei stato zittito per ${min} minuti dall'amministrazione` : "*** Puoi di nuovo parlare");
          return fine(`${t.handle} ${min ? `zittito per ${min} minuti` : "può di nuovo parlare"}`);
        }
        for (const c of chans.values()) {
          if (!c.users.has(t.handle)) continue;
          line(c, t.handle, "quit", `Killed (${a.handle} (${args.slice(1).join(" ") || "nessun motivo"}))`);
          c.users.delete(t.handle);
          pushChan(c);
          send(t.id, { e: "gone", chan: c.name });
        }
        prefsOf(t).chans = [];
        tell(t, `*** Sei stato espulso da ReticoloNet da ${a.handle}: ${args.slice(1).join(" ") || "nessun motivo"}`);
        return { ok: true };
      }
      // ---- il gioco, dalla chat
      case "paga":
      case "pay":
        if (args.length < 2) return err("uso: /paga nick importo");
        return game2(social.pay(a, args[0]!, Number(args[1])));
      case "stats": {
        const t = args[0] ? anyHuman(args[0]) : a;
        if (!t) return err("nick sconosciuto");
        const c = t.counters;
        return fine(`${t.handle} · ${rankOf(t.xp, t.faction).name} liv. ${levelOf(t.xp)} · contratti ${c["a:deliver"] ?? 0} · nodi ${c.nodes ?? 0} · fantasma ${c.ghost ?? 0} · tracciato ${c.traced ?? 0} · duelli ${c.duelwin ?? 0}V/${c.duellose ?? 0}S · traguardi ${t.feats.filter((f) => f.includes("#")).length}`);
      }
      case "sfida":
        if (args.length < 2) return err("uso: /sfida nick posta");
        return game2(social.duel.offer(a, args[0]!, Number(args[1])));
      case "accetta":
        return game2(social.duel.accept(a));
      case "rifiuta":
        return game2(social.duel.decline(a));
      case "dcc": {
        const sub = (args[0] ?? "").toLowerCase();
        const items = a.storage.filter((s) => !s.cargo);
        if (sub === "list" || !sub) {
          tell(a, `DCC · il tuo archivio (${items.length}):`, where);
          items.forEach((s, i) => tell(a, `  #${i + 1}  ${s.name}  [${s.size} GQ]${s.item ? ` · ${s.item.kind}` : ""}`, where));
          return fine(items.length ? "Uso: /dcc send nick n [prezzo]" : "  (vuoto)");
        }
        if (sub === "send") {
          const st = items[Number((args[2] ?? "").replace("#", "")) - 1];
          if (!args[1] || !st) return err("uso: /dcc send nick n [prezzo] — n è il numero di /dcc list");
          const r = social.trade.offer(a, args[1], st.key, Number(args[3]) || 0);
          const to = human(args[1]);
          if (r.ok && to) pm(a.handle, to, `DCC SEND ${st.name} (${st.size} GQ)${Number(args[3]) ? ` · prezzo ${fmtCr(Number(args[3]))}` : " · gratis"} — /dcc get ${a.handle} per accettare, /dcc rifiuta ${a.handle} per rifiutare`, "notice");
          return r.ok ? fine(`*** DCC SEND a ${args[1]}: ${st.name} — in attesa che accetti`) : err(`*** ${r.error}`);
        }
        if (sub === "get" || sub === "rifiuta" || sub === "reject") {
          const tr = social.trade.incomingFrom(a, args[1] ?? "");
          if (!tr) return err("*** nessun DCC in arrivo da quel nick");
          return game2(sub === "get" ? social.trade.accept(a, tr.id) : social.trade.decline(a, tr.id));
        }
        return err("uso: /dcc list · /dcc send nick n [prezzo] · /dcc get nick · /dcc rifiuta nick");
      }
      case "crew": {
        const sub = (args[0] ?? "").toLowerCase();
        const c = social.crew;
        if (sub === "crea") return game2(c.create(a, args[1] ?? "", args.slice(2).join(" ")));
        if (sub === "invita") return game2(c.invite(a, args[1] ?? ""));
        if (sub === "entra") return game2(c.join(a, args[1] ?? ""));
        if (sub === "lascia") return game2(c.leave(a));
        if (sub === "espelli") return game2(c.kick(a, args[1] ?? ""));
        if (sub === "cassa") return game2(c.donate(a, Number(args[1])));
        if (sub === "dai") return game2(c.grant(a, args[1] ?? "", Number(args[2])));
        if (sub === "motto") return game2(c.motto(a, args.slice(1).join(" ")));
        const mine = social.crewOfAgent(a);
        return fine(mine ? `Crew [${mine.tag}] ${mine.name} · ${mine.members.length} membri · cassa ${fmtCr(mine.bank)} · canale #${mine.tag.toLowerCase()}` : "Non sei in una crew. /crew crea SIGLA nome (5.000 CR, 550 XP)");
      }
      default:
        return err(`${cmd.toUpperCase()}: Unknown command — /aiuto`);
    }
  }

  // ---------------------------------------------------------------- parlare
  function allowed(a: AgentDoc): string | null {
    if (!game.on("chatEnabled")) return "*** La rete è in sola lettura: l'amministrazione ha sospeso la chat";
    if (prefsOf(a).mutedUntil > now()) return `*** Sei zittito ancora per ${Math.ceil((prefsOf(a).mutedUntil - now()) / 60_000)} min`;
    const t = now();
    const f = (flood.get(a.id) ?? []).filter((x) => t - x < 8000);
    if (f.length >= 6) return "*** Excess Flood — rallenta";
    f.push(t);
    flood.set(a.id, f);
    return null;
  }
  function say(a: AgentDoc, c: Chan, text: string, kind: "msg" | "act" = "msg"): R {
    const t = text.trim().slice(0, 320);
    if (!t) return { ok: false, error: "vuoto" };
    if (!c.users.has(a.handle)) return { ok: false, error: "non sei in quel canale" };
    const no = allowed(a);
    if (no) return tell(a, no, c.name), { ok: false, error: no };
    line(c, a.handle, kind, t);
    prefsOf(a).lastSaid = t.slice(0, 80);
    game.bump(a, "ircmsg");
    if (t.startsWith("!")) trigger(a, c, t);
    else react(a, c, t);
    return { ok: true };
  }
  function privmsg(a: AgentDoc, nick: string, text: string, kind: "msg" | "act" = "msg"): R {
    const no = allowed(a);
    if (no) return tell(a, no), { ok: false, error: no };
    const t = text.trim().slice(0, 320);
    const bot = [...bots.keys()].find((x) => x.toLowerCase() === nick.toLowerCase());
    const to = human(nick);
    if (!to && !bot) return tell(a, `${nick}: No such nick/channel`, `@${nick}`), { ok: false, error: "nick assente" };
    send(a.id, { e: "line", line: { id: ++lineId, at: now(), chan: `@${bot ?? to!.handle}`, nick: a.handle, kind, text: t } });
    if (to) {
      pm(a.handle, to, t, kind);
      if (prefsOf(to).away) tell(a, `${to.handle} è assente: ${prefsOf(to).away}`, `@${to.handle}`);
    } else botQuery(a, bot!, t);
    return { ok: true, data: { focus: `@${bot ?? to!.handle}` } };
  }

  // ---------------------------------------------------------------- i bot
  const packs = () => {
    const day = Math.floor(now() / 86400_000);
    const commons = EXPLOITS.filter((e) => e.rarity <= 1);
    return [0, 1, 2].map((i) => commons[(day * 7 + i * 5) % commons.length]!);
  };
  function botQuery(a: AgentDoc, bot: string, text: string) {
    const reply = (t: string, d = 700) => setTimeout(() => pm(bot, a, t), d + Math.random() * 600).unref();
    const low = text.toLowerCase();
    if (bot === XDCC) {
      const ps = packs();
      if (/xdcc\s+list|^list/.test(low)) {
        reply(`** ${ps.length} pacchetti ** slot liberi 3/3 ** banda 14.4 kb/s ** un pacchetto al giorno a testa`);
        ps.forEach((p, i) => reply(`#${i + 1}  1x [ 1 GQ] ${p.name.replace(/ /g, ".")}.zip`, 900 + i * 250));
        reply(`Per scaricare: /msg ${XDCC} xdcc send #n`, 1900);
        return;
      }
      const m = low.match(/xdcc\s+(?:send|get)\s+#?(\d)/);
      if (m) {
        const p = ps[Number(m[1]) - 1];
        const key = `xdcc:${Math.floor(now() / 86400_000)}`;
        if (!p) return reply("** pacchetto inesistente — xdcc list");
        if (a.counters[key]) return reply("** hai già scaricato oggi. La banda è di tutti: torna domani.");
        if (a.storage.reduce((s, x) => s + x.size, 0) + 1 > game.storageMax(a)) return reply("** DCC fallito: il tuo archivio è pieno");
        for (const k of Object.keys(a.counters)) if (k.startsWith("xdcc:")) delete a.counters[k];
        a.counters[key] = 1;
        reply(`** Invio ${p.name.replace(/ /g, ".")}.zip … DCC SEND completato (1 GQ in 4 s, 14.4 kb/s)`, 1500);
        setTimeout(() => (game.giveItem(a, { kind: "exploit", code: p.code, rarity: p.rarity, name: p.name, desc: p.desc }), game.bump(a, "xdcc")), 2200).unref();
        return;
      }
      return reply(`Sono un bot. /msg ${XDCC} xdcc list`);
    }
    if (bot === ORACLE) return reply(rumor(a));
    if (bot === SERVICE) return reply("Servizio canali di ReticoloNet. I canali si aprono con /join, gli operatori li gestiscono con /op /kick /ban /topic.");
    if (bot === NEWS) return reply("Rilancio le notizie del feed in #reticolo. Non rispondo alle query.");
    reply(pick(SNARK));
  }
  function rumor(a: AgentDoc) {
    const cd = voiceCd.get(a.id) ?? 0;
    if (cd > now()) return `L'oracolo tace. Riprova fra ${Math.ceil((cd - now()) / 60_000)} min.`;
    voiceCd.set(a.id, now() + 4 * 60_000);
    const secret = [...game.nodes.values()].filter((n) => n.hidden && !a.discovered.includes(n.id));
    if (secret.length && Math.random() < 0.3) {
      const n = pick(secret);
      const full = Math.random() < 0.4;
      game.bump(a, "rumor");
      return full ? `Scrivitelo sulla mano: ${n.ip}. Componilo dalla mappa. Io non ti ho detto niente.` : `Gira voce di una portante che risponde al ${n.ip.split(".").slice(0, 3).join(".")}.x — «${n.blurb.slice(0, 70)}…»`;
    }
    return pick(RUMORS);
  }
  function trigger(a: AgentDoc, c: Chan, t: string) {
    const [cmd, ...rest] = t.slice(1).toLowerCase().split(/\s+/);
    const bot = c.users.has(ORACLE) ? ORACLE : SERVICE;
    const out = (s: string) => botSay(c, bot, s, 500 + Math.random() * 700);
    switch (cmd) {
      case "aiuto":
      case "help":
        return out("Comandi: !voce !top !crew !guerra !stats [nick] !seen nick !dado [n] !8ball domanda !quote !xdcc !ora");
      case "voce":
      case "rumor":
        return out(`${a.handle}: ${rumor(a)}`);
      case "top": {
        const top = [...game.agents.values()].filter((x) => !x.staff && !x.awaiting).sort((x, y) => y.xp - x.xp).slice(0, 5);
        return out(`Top 5: ${top.map((x, i) => `${i + 1}. ${x.handle} (${rankOf(x.xp, x.faction).name})`).join(" · ")}`);
      }
      case "crew": {
        const cs = Object.values(social.crews()).map((x) => ({ x, s: x.members.reduce((q, id) => q + (game.agents.get(id)?.xp ?? 0), 0) })).sort((p, q) => q.s - p.s).slice(0, 5);
        return out(cs.length ? `Crew: ${cs.map((q, i) => `${i + 1}. [${q.x.tag}] ${q.x.name} (${q.x.members.length})`).join(" · ")}` : "Nessuna crew, per ora. /crew crea SIGLA nome");
      }
      case "guerra":
        return out(`Guerra fra le cellule — rossi ${game.meta.war.red} · blu ${game.meta.war.blue}`);
      case "stats": {
        const tg = rest[0] ? anyHuman(rest[0]) : a;
        return out(tg ? `${tg.handle}: ${rankOf(tg.xp, tg.faction).name} liv. ${levelOf(tg.xp)}, ${tg.counters["a:deliver"] ?? 0} contratti, ${tg.counters.nodes ?? 0} nodi violati, ${tg.feats.filter((f) => f.includes("#")).length} traguardi` : "mai sentito");
      }
      case "seen": {
        const tg = anyHuman(rest[0] ?? "");
        return out(!tg ? "mai visto" : online(tg) ? `${tg.handle} è qui, apri gli occhi` : `${tg.handle}: visto ${prefsOf(tg).lastSeenAt ? new Date(prefsOf(tg).lastSeenAt).toLocaleString("it-IT") : "tanto tempo fa"}`);
      }
      case "dado":
      case "roll": {
        const n = Math.min(1000, Math.max(2, Number(rest[0]) || 6));
        return out(`${a.handle} tira un d${n}: ${1 + Math.floor(Math.random() * n)}`);
      }
      case "8ball":
        return out(`${a.handle}: ${pick(EIGHTBALL)}`);
      case "quote":
        return out(pick(QUOTES));
      case "xdcc":
      case "list":
        return out(`I pacchetti stanno in #warez: /msg ${XDCC} xdcc list`);
      case "ora":
      case "time":
        return out(`Sono le ${new Date().toLocaleTimeString("it-IT")} del 2039. È sempre il 2039.`);
      default:
        return;
    }
  }
  /** Qualche volta un NPC risponde a quello che dici. */
  function react(a: AgentDoc, c: Chan, t: string) {
    const here = [...c.users.keys()].filter((n) => bots.has(n) && ![SERVICE, XDCC, NEWS, ORACLE].includes(n));
    if (!here.length) return;
    const named = here.find((n) => t.toLowerCase().includes(n.toLowerCase()));
    if (named) return void botSay(c, named, `${a.handle}: ${pick(SNARK)}`, 1500 + Math.random() * 2500);
    if (/\b(ciao|salve|hola|hi|hello|buonasera|buongiorno|re)\b/i.test(t) && Math.random() < 0.6) return void botSay(c, pick(here), pick(GREETINGS).replace("{n}", a.handle), 1200 + Math.random() * 2500);
    if (/\?$/.test(t) && Math.random() < 0.3) return void botSay(c, pick(here), pick(SNARK), 2000 + Math.random() * 3000);
    if (Math.random() < 0.08) botSay(c, pick(here), pick(CHATTER[c.lore ?? "chat"] ?? CHATTER.chat!), 2500 + Math.random() * 4000);
  }

  // chiacchiere di fondo, notizie e netsplit: solo se c'è qualcuno ad ascoltare
  setInterval(() => {
    if (!humans().length || !game.on("chatEnabled")) return;
    const cs = [...chans.values()].filter((c) => members(c).length && !c.crew);
    if (!cs.length || Math.random() < 0.35) return;
    const c = pick(cs);
    const here = [...c.users.keys()].filter((n) => bots.has(n) && ![SERVICE, XDCC, NEWS, ORACLE].includes(n));
    if (!here.length) return;
    const pool = c.only ? CHATTER[c.only]! : (CHATTER[c.lore ?? "main"] ?? CHATTER.main!);
    botSay(c, pick(here), pick(pool), 0);
  }, 38_000).unref();
  setInterval(() => {
    if (!humans().length || Math.random() < 0.5) return;
    const victims = npcs.filter(() => Math.random() < 0.5).slice(0, 4);
    if (victims.length < 2) return;
    const split = `${pick(["hub", "leaf", "irc2", "eu"])}.reticolo.net ${pick(["kaos.org", "undernet.it", "galactica.it"])}`;
    const where = new Map<string, Chan[]>();
    for (const n of victims) {
      const cs = [...chans.values()].filter((c) => c.users.has(n));
      where.set(n, cs);
      for (const c of cs) (line(c, n, "quit", split), c.users.delete(n));
    }
    for (const c of chans.values()) pushChan(c);
    setTimeout(() => {
      for (const [n, cs] of where) for (const c of cs) (c.users.set(n, ""), line(c, n, "join", bots.get(n)!.host));
      for (const c of chans.values()) pushChan(c);
      const main = chan("#reticolo")!;
      botSay(main, pick(victims), pick(["netsplit del cavolo", "rieccomi", "ke lag…", "ma chi gestisce 'sti server", "back"]), 2000);
    }, 25_000 + Math.random() * 20_000).unref();
  }, 17 * 60_000).unref();

  const origFeed = game.feed.bind(game);
  game.feed = (text, tone) => {
    origFeed(text, tone);
    const main = chan("#reticolo");
    if (main && members(main).length) line(main, NEWS, "msg", `[feed] ${text}`);
  };
  social.on((ev) => {
    if (!ev.crew) return;
    const cn = `#${ev.crew.tag.toLowerCase()}`;
    if (ev.type === "crew-new" || ev.type === "crew-join") {
      if (!chan(cn)) mk(cn, `Crew [${ev.crew.tag}] ${ev.crew.name}`, { crew: ev.crew.tag, modes: "+nstk" });
      if (ev.agent && online(ev.agent)) join(ev.agent, cn, true);
    }
    if (ev.type === "crew-leave" && ev.agent) part(ev.agent, cn, "ha lasciato la crew");
    if (ev.type === "crew-motto") {
      const c = chan(cn);
      if (c) (c.topic = `Crew [${ev.crew.tag}] ${ev.crew.name} · ${ev.crew.motto}`), pushChan(c);
    }
  });

  /** Dal client: una riga scritta nella finestra `where` («*» stato, «#canale», «@nick»). */
  function input(a: AgentDoc, text: string, where: string): R {
    const t = String(text ?? "").replace(/[\r\n]+/g, " ").trim();
    if (!t) return { ok: false, error: "vuoto" };
    if (a.awaiting) return { ok: false, error: "iscrizione in attesa" };
    if (t.startsWith("/") && !t.startsWith("//")) return command(a, t, where);
    const body = t.startsWith("//") ? t.slice(1) : t;
    if (where.startsWith("#")) {
      const c = chan(where);
      if (!c) return { ok: false, error: "canale inesistente" };
      return say(a, c, body);
    }
    if (where.startsWith("@")) return privmsg(a, where.slice(1), body);
    return tell(a, "Questa è la finestra di stato: scrivi /join #reticolo, o /aiuto"), { ok: false, error: "finestra di stato" };
  }

  // arretrati dei canali: si salvano col mondo
  const saved = game.store.get<Record<string, { topic: string; topicBy: string; log: IrcLine[] }>>("irc", "log");
  if (saved)
    for (const [name, v] of Object.entries(saved)) {
      const c = chan(name) ?? (name.startsWith("#") && Object.values(social.crews()).some((x) => `#${x.tag.toLowerCase()}` === name) ? mk(name, v.topic, { crew: name.slice(1).toUpperCase(), modes: "+nstk" }) : null);
      if (!c) continue;
      c.log = v.log.slice(-150);
      if (v.topicBy !== SERVICE) (c.topic = v.topic), (c.topicBy = v.topicBy);
      lineId = Math.max(lineId, ...c.log.map((l) => l.id), 0);
    }
  let savedAt = lineId;
  function save() {
    if (savedAt === lineId) return;
    savedAt = lineId;
    game.store.put("irc", "log", Object.fromEntries([...chans.values()].filter((c) => c.log.length).map((c) => [c.name, { topic: c.topic, topicBy: c.topicBy, log: c.log.slice(-150) }])));
  }

  return { connected, disconnected, input, save, stats: () => ({ chans: chans.size, lines: lineId }) };
}
