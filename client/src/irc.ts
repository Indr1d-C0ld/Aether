// Stato della rete IRC lato client: finestre (stato, canali, query), righe, non letti.
// Vive fuori dallo stato di gioco: arriva a eventi e non deve ridisegnare il resto del deck.
import type { IrcChan, IrcEvent, IrcLine } from "../../shared/types.ts";
import { blip } from "./audio.ts";

export type Win = { id: string; lines: IrcLine[]; unread: number; hl: boolean; chan: IrcChan | null };
export type IrcSnap = { v: number; wins: Win[]; active: string; nick: string; host: string; server: string; ready: boolean; unread: number; hl: boolean };

const MAX = 400;

class IrcStore {
  private wins = new Map<string, Win>();
  private listeners = new Set<() => void>();
  private snap: IrcSnap = { v: 0, wins: [], active: "*", nick: "", host: "", server: "irc.reticolo.net", ready: false, unread: 0, hl: false };
  visible = false; // la scheda IRC è aperta

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  private win(id: string) {
    const key = id.startsWith("#") ? id.toLowerCase() : id;
    let w = this.wins.get(key);
    if (!w) {
      w = { id: key, lines: [], unread: 0, hl: false, chan: null };
      this.wins.set(key, w);
    }
    return w;
  }
  private emit(patch: Partial<IrcSnap> = {}) {
    const order = (w: Win) => (w.id === "*" ? 0 : w.id.startsWith("#") ? 1 : 2);
    const wins = [...this.wins.values()].sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id));
    this.snap = { ...this.snap, ...patch, v: this.snap.v + 1, wins, unread: wins.reduce((s, w) => s + (w.id === "*" ? 0 : w.unread), 0), hl: wins.some((w) => w.hl) };
    for (const l of this.listeners) l();
  }
  private add(l: IrcLine) {
    const w = this.win(l.chan);
    w.lines.push(l);
    if (w.lines.length > MAX) w.lines.splice(0, w.lines.length - MAX);
    const seen = this.visible && this.snap.active === w.id;
    const talk = l.kind === "msg" || l.kind === "act" || l.kind === "notice";
    if (!seen && talk && l.nick !== this.snap.nick) {
      w.unread += 1;
      const mine = this.snap.nick && l.text.toLowerCase().includes(this.snap.nick.toLowerCase());
      if (mine || w.id.startsWith("@")) {
        if (!w.hl) blip(1320, 0.07, "square", 0.05);
        w.hl = true;
      }
    }
  }

  on(ev: IrcEvent) {
    if (ev.e === "sync") {
      this.wins.clear();
      const st = this.win("*");
      const at = Date.now();
      ev.motd.forEach((text, i) => st.lines.push({ id: -1000 + i, at, chan: "*", nick: ev.server, kind: "sys", text }));
      for (const c of ev.chans) this.win(c.name).chan = c;
      for (const l of ev.backlog) this.win(l.chan).lines.push(l);
      // al primo ingresso si apre sul primo canale; ai ricollegamenti si resta dov'eri
      const first = ev.chans.find((c) => c.name === "#reticolo")?.name ?? ev.chans[0]?.name ?? "*";
      const keep = this.snap.ready && this.wins.has(this.snap.active) ? this.snap.active : first;
      return this.emit({ nick: ev.nick, host: ev.host, server: ev.server, ready: true, active: keep });
    }
    if (ev.e === "chan") this.win(ev.chan.name).chan = ev.chan;
    if (ev.e === "gone") {
      this.wins.delete(ev.chan.toLowerCase());
      return this.emit({ active: this.snap.active === ev.chan.toLowerCase() ? "*" : this.snap.active });
    }
    if (ev.e === "line") this.add(ev.line);
    this.emit();
  }
  focus(id: string) {
    const w = this.win(id);
    w.unread = 0;
    w.hl = false;
    this.emit({ active: w.id });
  }
  close(id: string) {
    if (id === "*" || id.startsWith("#")) return;
    this.wins.delete(id);
    this.emit({ active: "*" });
  }
  setVisible(v: boolean) {
    this.visible = v;
    if (v) this.focus(this.snap.active);
  }
  reset() {
    this.wins.clear();
    this.emit({ ready: false, active: "*", nick: "" });
  }
}

export const ircStore = new IrcStore();
