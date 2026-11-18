// Server AETHER: HTTP statico (build del client) + WebSocket autoritativo.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { Store } from "./db.ts";
import { Game } from "./game.ts";
import type { ClientMsg, Faction, ServerMsg } from "../shared/types.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const PORT = Number(process.env.AETHER_PORT ?? 7077);
const DB_PATH = process.env.AETHER_DB ?? join(ROOT, "data", "aether.db");

const store = new Store(DB_PATH);
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
    res.end(JSON.stringify({ ok: true, online: game.online.size }));
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

const wss = new WebSocketServer({ server: http, path: "/ws" });
const HANDLE_RE = /^[A-Za-z0-9_\-]{3,16}$/;

wss.on("connection", (ws) => {
  let agentId: string | null = null;

  const bind = (id: string) => {
    agentId = id;
    if (!sockets.has(id)) sockets.set(id, new Set());
    sockets.get(id)!.add(ws);
    game.online.add(id);
    game.dirty.add(id);
  };

  ws.on("message", (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw)) as ClientMsg;
    } catch {
      return;
    }
    if (msg.t === "hello") {
      const id = store.agentForToken(msg.token);
      if (!id || !game.agents.has(id)) return send(ws, { t: "auth_err", error: "sessione scaduta" });
      bind(id);
      send(ws, { t: "auth_ok", token: msg.token });
      return pushState(id, true);
    }
    if (msg.t === "auth") {
      const handle = String(msg.handle ?? "").trim();
      const pass = String(msg.pass ?? "");
      if (msg.mode === "register") {
        if (!HANDLE_RE.test(handle)) return send(ws, { t: "auth_err", error: "handle: 3-16 caratteri, lettere, numeri, - e _" });
        if (pass.length < 6) return send(ws, { t: "auth_err", error: "chiave: almeno 6 caratteri" });
        const faction: Faction = msg.faction === "blue" ? "blue" : "red";
        const clash = store.handleTaken(handle) || [...game.agents.values()].some((a) => a.handle.toLowerCase() === handle.toLowerCase());
        if (clash) return send(ws, { t: "auth_err", error: "handle già in uso" });
        const agent = game.createAgent(handle, faction);
        store.createAccount(handle, pass, agent.id);
        game.flush();
        const token = store.issueToken(agent.id);
        bind(agent.id);
        send(ws, { t: "auth_ok", token });
        return pushState(agent.id, true);
      }
      const id = store.verify(handle, pass);
      if (!id || !game.agents.has(id)) return send(ws, { t: "auth_err", error: "handle o chiave errati" });
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
    if (!agentId) return;
    const set = sockets.get(agentId);
    set?.delete(ws);
    if (!set?.size) {
      sockets.delete(agentId);
      game.online.delete(agentId);
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
  if (tickN % 8 === 0) game.flush();
}, 250);

process.on("SIGINT", () => {
  game.flush();
  process.exit(0);
});
process.on("SIGTERM", () => {
  game.flush();
  process.exit(0);
});

http.listen(PORT, "0.0.0.0", () => {
  console.log(`AETHER · server su http://0.0.0.0:${PORT} · db ${DB_PATH}`);
});
