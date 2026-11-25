// Server AETHER: HTTP statico (build del client) + WebSocket autoritativo.
import { createServer, type IncomingMessage } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { Store } from "./db.ts";
import { Game, type AgentDoc } from "./game.ts";
import { installAdmin } from "./admin.ts";
import { installSocial } from "./social.ts";
import { installIrc } from "./irc.ts";
import { installZones } from "./zones.ts";
import { installBio } from "./bio.ts";
import { installBbs } from "./bbs.ts";
import { installMalware } from "./malware.ts";
import { installLife } from "./life.ts";
import { installOrgs } from "./orgs.ts";
import { installCitizens } from "./citizens.ts";
import { installStocks } from "./stocks.ts";
import { installFence } from "./fence.ts";
import { installStartups } from "./startups.ts";
import { installFronts } from "./fronts.ts";
import type { AdminSession } from "../shared/admin.ts";
import type { ClientMsg, Faction, ServerMsg } from "../shared/types.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const PORT = Number(process.env.AETHER_PORT ?? 7077);
// Dietro un proxy (Apache su Balthasar) il server ascolta solo in locale: AETHER_HOST=127.0.0.1
const HOST = process.env.AETHER_HOST ?? "0.0.0.0";
// Ogni quanti secondi il mondo va su disco. In sviluppo 2 s; su una SSD da risparmiare qualche minuto
// (si salva comunque alla registrazione di un handle e all'arresto del servizio).
const FLUSH_TICKS = Math.max(1, Math.round(Number(process.env.AETHER_FLUSH_S ?? 2) * 4));
const DB_PATH = process.env.AETHER_DB ?? join(ROOT, "data", "aether.db");

const store = new Store(DB_PATH);
// Gli handle dell'amministrazione: non si registrano dal gioco, si creano con scripts/admin-account.ts.
const ADMIN_HANDLES = new Set(
  (process.env.AETHER_ADMINS ?? "admin")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);
const STARTED_AT = Date.now();
const sockets = new Map<string, Set<WebSocket>>();

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

const game = new Game(store, {
  toast(agentId, text, tone) {
    for (const ws of sockets.get(agentId) ?? []) send(ws, { t: "toast", text, tone });
  },
});

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
};

const http = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    // per la landing e il bot di Balthasar: numeri, mai nomi
    const humans = [...game.agents.values()].filter((a) => !a.npc && !a.staff);
    res.end(
      JSON.stringify({
        ok: true,
        online: game.online.size,
        players: humans.length,
        red: humans.filter((a) => a.faction === "red").length,
        blue: humans.filter((a) => a.faction === "blue").length,
        live: [...game.ops.keys()].filter((id) => !game.agents.get(id)?.npc).length,
        war: game.meta.war,
        uptime: Math.round(process.uptime()),
      }),
    );
    return;
  }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(DIST, path);
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(DIST, "index.html");
  }
  try {
    const body = await readFile(file);
    const ext = extname(file);
    res.writeHead(200, {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "cache-control": file.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Client non compilato: esegui npm run build, o usa npm run dev.");
  }
});

// Un messaggio del client è un comando di poche centinaia di byte: niente di più grande passa.
const wss = new WebSocketServer({ server: http, path: "/ws", maxPayload: 16 * 1024 });
const HANDLE_RE = /^[A-Za-z0-9_\-]{3,16}$/;

// ------------------------------------------------------------ difese per un server su internet
// L'indirizzo vero: se la connessione arriva dal proxy locale, l'ultima voce di X-Forwarded-For
// (quella scritta da Apache, che un client non può falsificare); altrimenti il socket.
function clientIp(req: IncomingMessage) {
  const sock = req.socket.remoteAddress ?? "?";
  const local = sock === "127.0.0.1" || sock === "::1" || sock === "::ffff:127.0.0.1";
  const fwd = String(req.headers["x-forwarded-for"] ?? "").split(",").map((s) => s.trim()).filter(Boolean).at(-1);
  return local && fwd ? fwd : sock;
}

/** Finestre scorrevoli per indirizzo: login sbagliati, registrazioni. Solo in memoria. */
class Limiter {
  hits = new Map<string, number[]>();
  maxFn: () => number;
  windowMs: number;
  constructor(max: () => number, windowMs: number) {
    this.maxFn = max;
    this.windowMs = windowMs;
  }
  get max() {
    return this.maxFn();
  }
  recent(key: string) {
    const t = Date.now();
    const list = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }
  blocked(key: string) {
    return this.recent(key).length >= this.max;
  }
  add(key: string) {
    this.hits.set(key, [...this.recent(key), Date.now()]);
  }
  wait(key: string) {
    const list = this.recent(key);
    return list.length ? Math.ceil((list[0]! + this.windowMs - Date.now()) / 60_000) : 0;
  }
}
// In sviluppo e nei test (AETHER_DEV=1) i limiti sono larghissimi: i test registrano decine di handle da 127.0.0.1.
const DEV = process.env.AETHER_DEV === "1";
// i limiti si regolano dal pannello dell'amministratore
const badLogins = new Limiter(() => (DEV ? 1e6 : game.num("loginFails")), 15 * 60_000);
const signups = new Limiter(() => (DEV ? 1e6 : game.num("signupsPerHour")), 60 * 60_000);

// ------------------------------------------------------------ connessioni aperte (per il pannello)
type Conn = { ws: WebSocket; ip: string; since: number; msgs: number; agentId: string | null };
const conns = new Set<Conn>();

function ipBanned(ip: string) {
  const t = Date.now();
  return (game.meta.ipBans ?? []).some((b) => b.ip === ip && (!b.until || b.until > t));
}

function closeConn(c: Conn, reason: string) {
  send(c.ws, { t: "toast", text: reason, tone: "bad" });
  send(c.ws, { t: "auth_err", error: reason });
  setTimeout(() => c.ws.close(4001, "chiuso"), 150);
}

/** Primo accesso, ultimo accesso, indirizzi, giorni di gioco: per il pannello e per i traguardi. */
function onLogin(a: AgentDoc, ip: string) {
  const day = new Date().toISOString().slice(0, 10);
  a.lastSeen = Date.now();
  a.lastIp = ip;
  a.ips = [ip, ...(a.ips ?? []).filter((x) => x !== ip)].slice(0, 8);
  a.logins = (a.logins ?? 0) + 1;
  game.bump(a, "login");
  if (a.lastDay !== day) {
    a.lastDay = day;
    game.bump(a, "days");
  }
  game.touch("agent", a.id);
}

/** Chi non può entrare, e perché (null = entra). */
function gate(a: AgentDoc): string | null {
  if (game.banned(a)) return `account sospeso${a.ban?.reason ? `: ${a.ban.reason}` : ""}${a.ban?.until ? ` (fino al ${new Date(a.ban.until).toLocaleString("it-IT")})` : ""}`;
  if (a.awaiting) return "iscrizione in attesa di approvazione dell'amministratore";
  if (game.on("maintenance") && !a.staff) return String(game.cfg("maintenanceMsg"));
  return null;
}

const social = installSocial(game);
const irc = installIrc(game, social, (agentId, ev) => {
  for (const ws of sockets.get(agentId) ?? []) send(ws, { t: "irc", ev });
});
// la chat passa da Game.act come le altre azioni: «irc» (una riga scritta) e «ircSync» (ricollega le finestre)
const socialAct = game.socialAct;
game.socialAct = (agent, a, p) => {
  if (a === "irc") return irc.input(agent, String(p.text ?? ""), String(p.where ?? "*"));
  if (a === "ircSync") return irc.connected(agent), { ok: true };
  return socialAct?.(agent, a, p) ?? null;
};

const zones = installZones(game);
installBio(game, zones);
const bbs = installBbs(game);
const malware = installMalware(game, bbs);
const orgs = installOrgs(game);
const life = installLife(game, bbs);
const citizens = installCitizens(game, zones, orgs);
const stocks = installStocks(game, orgs);
const fence = installFence(game);
const startups = installStartups(game, orgs, citizens);
installFronts(game, orgs);

const bbsAdminAct = bbs.adminAct;
installAdmin(game, {
  dbPath: DB_PATH,
  startedAt: STARTED_AT,
  adminHandles: ADMIN_HANDLES,
  sessions(): AdminSession[] {
    return [...conns].map((c) => {
      const a = c.agentId ? game.agents.get(c.agentId) : null;
      const op = c.agentId ? game.ops.get(c.agentId) : null;
      return { agentId: c.agentId, handle: a?.handle ?? null, ip: c.ip, since: c.since, msgs: c.msgs, op: op ? (game.nodes.get(op.chain.at(-1)!)?.org ?? null) : null };
    });
  },
  kick(agentId, reason) {
    let n = 0;
    for (const c of conns) if (c.agentId === agentId) (closeConn(c, reason), (n += 1));
    return n;
  },
  kickIp(ip, reason) {
    let n = 0;
    for (const c of conns) if (c.ip === ip) (closeConn(c, reason), (n += 1));
    return n;
  },
  kickAll(reason) {
    let n = 0;
    for (const c of conns) {
      if (c.agentId && game.agents.get(c.agentId)?.staff) continue;
      closeConn(c, reason);
      n += 1;
    }
    return n;
  },
});
// la moderazione dei BBS dei giocatori passa dal pannello dell'amministratore
{
  const base = game.adminAct!;
  game.adminAct = (admin, a, p) => {
    if (!a.startsWith("bbs")) return base(admin, a, p);
    const r = bbsAdminAct(a, p);
    if (r.ok && a !== "bbsList") game.meta.audit = [{ at: Date.now(), by: admin.handle, action: a, detail: r.note ?? "" }, ...(game.meta.audit ?? [])].slice(0, 500);
    return r;
  };
}
setInterval(() => {
  for (const l of [badLogins, signups]) for (const k of [...l.hits.keys()]) l.recent(k);
}, 10 * 60_000).unref();

wss.on("connection", (ws, req) => {
  let agentId: string | null = null;
  const ip = clientIp(req);
  const conn: Conn = { ws, ip, since: Date.now(), msgs: 0, agentId: null };
  if (ipBanned(ip)) {
    send(ws, { t: "auth_err", error: "indirizzo bloccato dall'amministrazione" });
    ws.close(4003, "bloccato");
    return;
  }
  conns.add(conn);
  // raffiche: oltre 30 messaggi al secondo da una connessione, si chiude
  let burst = 0;
  let burstAt = Date.now();

  const bind = (id: string) => {
    agentId = id;
    conn.agentId = id;
    onLogin(game.agents.get(id)!, ip);
    // la rete IRC parte quando il client la chiede (ircSync), per non mandare arretrati a chi non la apre
    if (!sockets.has(id)) sockets.set(id, new Set());
    sockets.get(id)!.add(ws);
    game.online.add(id);
    game.dirty.add(id);
  };

  ws.on("message", (raw) => {
    const now = Date.now();
    if (now - burstAt > 1000) {
      burst = 0;
      burstAt = now;
    }
    if (++burst > 30) return ws.close(1008, "troppi messaggi");
    conn.msgs += 1;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw)) as ClientMsg;
    } catch {
      return;
    }
    if (msg.t === "hello") {
      const id = store.agentForToken(msg.token);
      if (!id || !game.agents.has(id)) return send(ws, { t: "auth_err", error: "sessione scaduta" });
      const why = gate(game.agents.get(id)!);
      if (why) return send(ws, { t: "auth_err", error: why });
      bind(id);
      send(ws, { t: "auth_ok", token: msg.token });
      return pushState(id, true);
    }
    if (msg.t === "auth") {
      const handle = String(msg.handle ?? "").trim();
      const pass = String(msg.pass ?? "");
      if (msg.mode === "register") {
        const reg = String(game.cfg("registrations"));
        if (reg === "closed") return send(ws, { t: "auth_err", error: "iscrizioni chiuse: riprova più avanti" });
        if (game.on("maintenance")) return send(ws, { t: "auth_err", error: String(game.cfg("maintenanceMsg")) });
        if (ADMIN_HANDLES.has(handle.toLowerCase())) return send(ws, { t: "auth_err", error: "handle riservato" });
        if (signups.blocked(ip)) return send(ws, { t: "auth_err", error: `troppi handle nuovi da questo indirizzo: riprova fra ${signups.wait(ip)} min` });
        if (!HANDLE_RE.test(handle)) return send(ws, { t: "auth_err", error: "handle: 3-16 caratteri, lettere, numeri, - e _" });
        if (pass.length < 6) return send(ws, { t: "auth_err", error: "chiave: almeno 6 caratteri" });
        const faction: Faction = msg.faction === "blue" ? "blue" : "red";
        const clash = store.handleTaken(handle) || [...game.agents.values()].some((a) => a.handle.toLowerCase() === handle.toLowerCase());
        if (clash) return send(ws, { t: "auth_err", error: "handle già in uso" });
        signups.add(ip);
        const awaiting = reg === "approval";
        const agent = game.createAgent(handle, faction, undefined, awaiting);
        store.createAccount(handle, pass, agent.id);
        if (awaiting) {
          agent.awaiting = true;
          agent.lastIp = ip;
          agent.ips = [ip];
          game.touch("agent", agent.id);
          game.gstat("signup");
          for (const id of game.online) if (game.agents.get(id)?.staff) game.out.toast(id, `Iscrizione da approvare: ${handle}`, "info");
          game.flush();
          return send(ws, { t: "auth_err", error: "iscrizione ricevuta: l'amministratore deve approvarla prima che tu possa entrare" });
        }
        game.flush();
        const token = store.issueToken(agent.id);
        bind(agent.id);
        send(ws, { t: "auth_ok", token });
        return pushState(agent.id, true);
      }
      if (badLogins.blocked(ip)) return send(ws, { t: "auth_err", error: `troppi tentativi sbagliati: riprova fra ${badLogins.wait(ip)} min` });
      const id = store.verify(handle, pass);
      // il primo accesso dell'amministratore crea il suo agente
      if (id && !game.agents.has(id) && ADMIN_HANDLES.has(handle.toLowerCase())) game.createStaff(store.accountByHandle(handle)!.handle, id);
      if (id && game.agents.has(id) && ADMIN_HANDLES.has(handle.toLowerCase()) && !game.agents.get(id)!.staff) {
        game.agents.get(id)!.staff = true;
        game.touch("agent", id);
      }
      if (!id || !game.agents.has(id)) {
        badLogins.add(ip);
        console.warn(`AETHER · accesso rifiutato per «${handle.slice(0, 16)}» da ${ip}`);
        return send(ws, { t: "auth_err", error: "handle o chiave errati" });
      }
      const why = gate(game.agents.get(id)!);
      if (why) return send(ws, { t: "auth_err", error: why });
      const token = store.issueToken(id);
      bind(id);
      send(ws, { t: "auth_ok", token });
      return pushState(id, true);
    }
    if (msg.t === "do") {
      if (!agentId) return send(ws, { t: "res", id: msg.id, ok: false, error: "non autenticato" });
      const r = game.act(agentId, msg.a, msg.p ?? {});
      send(ws, { t: "res", id: msg.id, ...r });
      pushState(agentId, true);
    }
  });

  ws.on("close", () => {
    conns.delete(conn);
    if (!agentId) return;
    const me = game.agents.get(agentId);
    if (me) me.lastSeen = Date.now();
    const set = sockets.get(agentId);
    set?.delete(ws);
    if (!set?.size) {
      sockets.delete(agentId);
      game.online.delete(agentId);
      if (me) irc.disconnected(me), bbs.hangup(me);
    }
  });
});

// L'elenco dei nodi è la parte pesante dello stato (centinaia di voci): parte intero dopo ogni azione
// del giocatore e poi al massimo ogni 3 secondi; negli altri aggiornamenti il client tiene quello che ha.
const nodesSentAt = new Map<string, number>();

function pushState(agentId: string, full = false) {
  const conns = sockets.get(agentId);
  if (!conns?.size) return;
  const withNodes = full || Date.now() - (nodesSentAt.get(agentId) ?? 0) > 3000;
  const s = game.stateFor(agentId, withNodes);
  if (!s) return;
  if (withNodes) nodesSentAt.set(agentId, Date.now());
  const payload = JSON.stringify({ t: "state", s } satisfies ServerMsg);
  for (const ws of conns) if (ws.readyState === ws.OPEN) ws.send(payload);
  game.dirty.delete(agentId);
}

let last = Date.now();
let tickN = 0;
setInterval(() => {
  const t = Date.now();
  game.tick(t - last);
  last = t;
  tickN += 1;
  // stato ai client: chi ha un'operazione aperta a ogni tick, gli altri al massimo una volta al secondo
  for (const id of [...game.dirty]) {
    if (!sockets.has(id)) {
      game.dirty.delete(id);
      continue;
    }
    if (game.ops.has(id) || tickN % 4 === 0) pushState(id);
  }
  if (tickN % FLUSH_TICKS === 0) {
    irc.save();
  bbs.save();
  malware.save();
  life.save();
  orgs.save();
  citizens.save();
  stocks.save();
  fence.save();
  startups.save();
    game.flush();
  }
}, 250);

process.on("SIGINT", () => {
  irc.save();
  bbs.save();
  malware.save();
  life.save();
  orgs.save();
  citizens.save();
  stocks.save();
  fence.save();
  startups.save();
  game.flush();
  process.exit(0);
});
process.on("SIGTERM", () => {
  irc.save();
  bbs.save();
  malware.save();
  life.save();
  orgs.save();
  citizens.save();
  stocks.save();
  fence.save();
  startups.save();
  game.flush();
  process.exit(0);
});

http.listen(PORT, HOST, () => {
  console.log(`AETHER · server su http://${HOST}:${PORT} · db ${DB_PATH} · salvataggio ogni ${FLUSH_TICKS / 4} s`);
});
