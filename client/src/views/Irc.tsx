// ReticoloNet: la finestra IRC. Tre colonne come nei client del 1996 (finestre, conversazione, nick),
// barra del titolo col topic, riga di comando con cronologia e completamento dei nick con Tab.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { IrcLine, IrcUser } from "../../../shared/types.ts";
import { ircStore, type Win } from "../irc.ts";
import { net } from "../net.ts";
import { sfx } from "../audio.ts";
import { NUM_LOCALE } from "../../../shared/rules.ts";

const NICK_COLORS = ["#ff5c7a", "#ffb000", "#f6e05e", "#39ff88", "#2ef2ff", "#6ea8ff", "#c18cff", "#ff2bd6", "#7ee8c7", "#ffa36c", "#9be564", "#8fd3ff"];
const colorOf = (nick: string) => NICK_COLORS[[...nick].reduce((q, c) => (q * 31 + c.charCodeAt(0)) >>> 0, 7) % NICK_COLORS.length]!;
const hhmm = (t: number) => new Date(t).toLocaleTimeString(NUM_LOCALE, { hour: "2-digit", minute: "2-digit" });

export function useIrc() {
  return useSyncExternalStore(ircStore.subscribe, ircStore.getSnapshot);
}

export function IrcView() {
  const s = useIrc();
  const [text, setText] = useState("");
  const hist = useRef<string[]>([]);
  const histAt = useRef(-1);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const input = useRef<HTMLInputElement>(null);
  const win = s.wins.find((w) => w.id === s.active) ?? s.wins[0] ?? null;

  useEffect(() => {
    ircStore.setVisible(true);
    return () => ircStore.setVisible(false);
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [s.v, s.active]);
  useEffect(() => {
    stick.current = true;
    input.current?.focus();
  }, [s.active]);

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    hist.current = [t, ...hist.current.filter((x) => x !== t)].slice(0, 50);
    histAt.current = -1;
    setText("");
    if (t === "/clear") return;
    if (/^\/(close|chiudi)$/i.test(t) && win && win.id.startsWith("@")) return ircStore.close(win.id);
    const r = await net.do("irc", { text: t, where: win?.id ?? "*" }, true);
    const focus = (r.data as { focus?: string } | undefined)?.focus;
    if (focus) ircStore.focus(focus);
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      histAt.current = Math.min(hist.current.length - 1, histAt.current + 1);
      setText(hist.current[histAt.current] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      histAt.current = Math.max(-1, histAt.current - 1);
      setText(histAt.current < 0 ? "" : (hist.current[histAt.current] ?? ""));
    } else if (e.key === "Tab") {
      e.preventDefault();
      const m = text.match(/(\S+)$/);
      const users = win?.chan?.users ?? [];
      if (!m || !users.length) return;
      const hit = users.find((u) => u.nick.toLowerCase().startsWith(m[1]!.toLowerCase()));
      if (hit) setText(text.slice(0, m.index) + hit.nick + (m.index === 0 ? ": " : " "));
    }
  };

  if (!s.ready)
    return (
      <div className="irc-shell">
        <div className="irc-title">ReticoloNet — collegamento in corso…</div>
        <pre className="irc-log" style={{ padding: 12 }}>*** Connecting to irc.reticolo.net (6667)…</pre>
      </div>
    );

  const title = !win || win.id === "*" ? `Status: ${s.nick} [+i] su ${s.server}` : win.chan ? `${win.chan.name} [${win.chan.users.length}] [${win.chan.modes}]: ${win.chan.topic}` : `Query con ${win.id.slice(1)}`;
  return (
    <div className="irc-shell">
      <div className="irc-title" title={title}>
        <span className="irc-title-icon">▣</span> ReticoloNet — [{title}]
      </div>
      <div className="irc-body">
        <WinList wins={s.wins} active={s.active} />
        <div className="irc-main">
          <div
            data-i18n-skip
            className="irc-log"
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
            onClick={() => window.getSelection()?.isCollapsed && input.current?.focus()}
          >
            {(win?.lines ?? []).map((l) => (
              <Line key={l.id} l={l} me={s.nick} />
            ))}
          </div>
          <form
            className="irc-input"
            onSubmit={(e) => {
              e.preventDefault();
              sfx.key();
              void submit();
            }}
          >
            <span className="irc-prompt">[{win?.id === "*" ? "status" : win?.id.replace("@", "")}]</span>
            <input ref={input} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} maxLength={320} autoComplete="off" spellCheck={false} aria-label="Riga di comando IRC" placeholder="scrivi, o /aiuto" />
          </form>
        </div>
        {win?.chan ? <NickList users={win.chan.users} me={s.nick} /> : null}
      </div>
      <div className="irc-status">
        <span>{s.nick}</span>
        <span>{s.host}</span>
        <span>{s.server}:6667</span>
        <span className="irc-status-right">
          {s.wins.filter((w) => w.id.startsWith("#")).length} canali · lag 0.{String(12 + (s.v % 60)).padStart(2, "0")}s
        </span>
      </div>
    </div>
  );
}

function WinList({ wins, active }: { wins: Win[]; active: string }) {
  return (
    <div className="irc-wins" role="tablist" aria-label="Finestre">
      {wins.map((w) => (
        <button key={w.id} role="tab" aria-selected={w.id === active} className={`${w.id === active ? "on" : ""} ${w.hl ? "hl" : w.unread ? "unread" : ""}`} onClick={() => ircStore.focus(w.id)}>
          <span className="irc-win-name">{w.id === "*" ? "Status" : w.id.replace("@", "")}</span>
          {w.unread ? <span className="irc-win-n">{w.unread > 99 ? "99+" : w.unread}</span> : null}
        </button>
      ))}
    </div>
  );
}

function NickList({ users, me }: { users: IrcUser[]; me: string }) {
  const ops = users.filter((u) => u.mode === "@" || u.mode === "~").length;
  return (
    <div className="irc-nicks" aria-label="Utenti nel canale">
      <div className="irc-nicks-head">
        {users.length} utenti · {ops} op
      </div>
      {users.map((u) => (
        <button key={u.nick} className={`${u.away ? "away" : ""} ${u.nick === me ? "me" : ""}`} title={`${u.nick}${u.bot ? " (bot)" : ""} — clic: query`} onClick={() => u.nick !== me && ircStore.focus(`@${u.nick}`)}>
          <span className={`irc-mode m${u.mode === "~" ? "o" : u.mode === "@" ? "o" : u.mode === "+" ? "v" : ""}`}>{u.mode === "~" ? "@" : u.mode || " "}</span>
          {u.nick}
        </button>
      ))}
    </div>
  );
}

function Line({ l, me }: { l: IrcLine; me: string }) {
  const ts = <span className="irc-ts">[{hhmm(l.at)}]</span>;
  const nick = (
    <button className="irc-nick" style={{ color: colorOf(l.nick) }} onClick={() => l.nick !== me && !l.nick.includes(".") && ircStore.focus(`@${l.nick}`)}>
      {l.nick}
    </button>
  );
  const body = useMemo(() => linkify(l.text), [l.text]);
  switch (l.kind) {
    case "msg": {
      const hl = me && l.nick !== me && l.text.toLowerCase().includes(me.toLowerCase());
      return (
        <div className={`irc-line ${hl ? "hl" : ""} ${l.nick === me ? "own" : ""}`}>
          {ts} <span className="irc-angle">&lt;</span>
          {nick}
          <span className="irc-angle">&gt;</span> {body}
        </div>
      );
    }
    case "act":
      return (
        <div className="irc-line act">
          {ts} * {nick} {body}
        </div>
      );
    case "notice":
      return (
        <div className="irc-line notice">
          {ts} -{l.nick}- {body}
        </div>
      );
    case "join":
      return (
        <div className="irc-line join">
          {ts} *** Joins: {l.nick} ({l.text})
        </div>
      );
    case "part":
      return (
        <div className="irc-line part">
          {ts} *** Parts: {l.nick}
          {l.text ? ` (${l.text})` : ""}
        </div>
      );
    case "quit":
      return (
        <div className="irc-line quit">
          {ts} *** Quits: {l.nick} ({l.text})
        </div>
      );
    case "kick":
      return (
        <div className="irc-line kick">
          {ts} *** {l.text.split(" ")[0]} was kicked by {l.nick} {l.text.slice(l.text.indexOf(" ") + 1)}
        </div>
      );
    case "mode":
      return (
        <div className="irc-line mode">
          {ts} *** {l.nick} sets mode: {l.text}
        </div>
      );
    case "topic":
      return (
        <div className="irc-line topic">
          {ts} *** {l.nick} changes topic to '{l.text}'
        </div>
      );
    default:
      return (
        <div className="irc-line sys">
          {ts} <span className="irc-pre">{l.text}</span>
        </div>
      );
  }
}

/** Evidenzia canali e indirizzi IP: un clic entra nel canale. */
function linkify(text: string) {
  const parts = text.split(/(#[A-Za-z0-9_\-]{2,20}|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.(?:\d{1,3}|x)\b)/g);
  return parts.map((p, i) =>
    /^#[A-Za-z0-9_\-]{2,20}$/.test(p) ? (
      <button key={i} className="irc-link" onClick={() => void net.do("irc", { text: `/join ${p}`, where: "*" }, true).then(() => ircStore.focus(p))}>
        {p}
      </button>
    ) : /^\d{1,3}\./.test(p) ? (
      <span key={i} className="irc-ip">
        {p}
      </span>
    ) : (
      p
    ),
  );
}
