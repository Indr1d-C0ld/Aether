// Collegamento WebSocket al server autoritativo, con riconnessione e azioni a promessa.
import type { ClientMsg, Faction, GameState, ServerMsg } from "../../shared/types.ts";

export type Toast = { id: number; text: string; tone: "ok" | "warn" | "bad" | "info" };
export type NetStatus = "connecting" | "online" | "offline";
export type Snapshot = {
  status: NetStatus;
  authed: boolean;
  authError: string | null;
  state: GameState | null;
  receivedAt: number; // performance.now() alla ricezione dello stato
  toasts: Toast[];
};

const TOKEN_KEY = "aether.token";
type Res = Extract<ServerMsg, { t: "res" }>;

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* modalità privata: si rientra a ogni visita */
  }
}

class Net {
  private ws: WebSocket | null = null;
  private seq = 0;
  private pending = new Map<number, (r: Res) => void>();
  private listeners = new Set<() => void>();
  private toastSeq = 0;
  private retry = 0;
  snap: Snapshot = { status: "connecting", authed: false, authError: null, state: null, receivedAt: 0, toasts: [] };

  constructor() {
    this.open();
  }

  private set(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snap;

  private open() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}${import.meta.env.BASE_URL}ws`);
    this.ws = ws;
    this.set({ status: "connecting" });
    ws.onopen = () => {
      this.retry = 0;
      this.set({ status: "online" });
      const token = readToken();
      if (token) this.send({ t: "hello", token });
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as ServerMsg;
      switch (msg.t) {
        case "auth_ok":
          writeToken(msg.token);
          this.set({ authed: true, authError: null });
          break;
        case "auth_err":
          if (msg.error === "sessione scaduta") writeToken(null);
          this.set({ authed: false, authError: msg.error === "sessione scaduta" ? null : msg.error });
          break;
        case "state":
          // l'elenco dei nodi arriva a intervalli: quando manca si tiene l'ultimo ricevuto
          this.set({ state: { ...msg.s, nodes: msg.s.nodes ?? this.snap.state?.nodes ?? [] }, receivedAt: performance.now() });
          break;
        case "res":
          this.pending.get(msg.id)?.(msg);
          this.pending.delete(msg.id);
          break;
        case "toast":
          this.toast(msg.text, msg.tone);
          break;
      }
    };
    ws.onclose = () => {
      this.set({ status: "offline" });
      for (const [, r] of this.pending) r({ t: "res", id: 0, ok: false, error: "connessione persa" });
      this.pending.clear();
      const delay = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => this.open(), delay);
    };
  }

  private send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  toast(text: string, tone: Toast["tone"]) {
    const id = ++this.toastSeq;
    this.set({ toasts: [...this.snap.toasts, { id, text, tone }].slice(-5) });
    setTimeout(() => this.set({ toasts: this.snap.toasts.filter((t) => t.id !== id) }), tone === "bad" ? 6500 : 4200);
  }

  auth(mode: "login" | "register", handle: string, pass: string, faction?: Faction) {
    this.set({ authError: null });
    this.send({ t: "auth", mode, handle, pass, faction });
  }

  logout() {
    writeToken(null);
    this.set({ authed: false, state: null });
    this.ws?.close();
  }

  do(a: string, p: Record<string, unknown> = {}): Promise<Res> {
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.send({ t: "do", id, a, p });
    }).then((r) => {
      const res = r as Res;
      if (!res.ok && res.error) this.toast(res.error, "warn");
      else if (res.note) this.toast(res.note, "ok");
      return res;
    });
  }
}

export const net = new Net();
