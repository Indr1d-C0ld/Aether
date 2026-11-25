import { useEffect, useRef, useState } from "react";
import type { GameState, OpView } from "../../../shared/types.ts";
import { fmtCr, latticeClock } from "../../../shared/rules.ts";
import { net, type Snapshot } from "../net.ts";
import { useFrame } from "../hooks.ts";
import { sfx } from "../audio.ts";
import { music } from "../music.ts";
import { AudioToggles } from "./AudioToggles.tsx";
import { CinemaLayer, Rolling } from "../cinema.tsx";
import { JailScreen } from "./Dossier.tsx";
import { MapView } from "./MapView.tsx";
import { Connection } from "./Connection.tsx";
import { Board } from "./Board.tsx";
import { Mail } from "./Mail.tsx";
import { Shop } from "./Shop.tsx";
import { Gateway } from "./Gateway.tsx";
import { Ranks } from "./Ranks.tsx";
import { Feed } from "./Feed.tsx";
import { Career } from "./Career.tsx";
import { AdminView } from "./Admin.tsx";
import { IrcView, useIrc } from "./Irc.tsx";
import { BbsView } from "./Bbs.tsx";
import { LabPanel } from "./Lab.tsx";
import { WorldPanel } from "./World.tsx";
import { PeoplePanel } from "./People.tsx";
import { StocksPanel } from "./Stocks.tsx";
import { SocialView } from "./Social.tsx";

export type ViewId = "map" | "conn" | "board" | "mail" | "shop" | "gateway" | "ranks" | "feed" | "career" | "admin" | "irc" | "crew" | "bbs" | "lab" | "world" | "people" | "stocks";

export type DeckCtx = {
  state: GameState;
  /** stima del tempo server attuale, interpolata tra due stati */
  serverNow: number;
  route: string[];
  setRoute: (r: string[]) => void;
  go: (v: ViewId) => void;
  selected: string | null;
  setSelected: (id: string | null) => void;
};

/** Avanzamento del trace interpolato localmente fra un aggiornamento e l'altro. */
export function traceNow(op: OpView, elapsedMs: number) {
  const tr = op.trace;
  if (tr.progressMs === null || tr.totalMs === null) return null;
  const p = tr.active ? tr.progressMs + (tr.rate ?? 1) * elapsedMs : tr.progressMs;
  return { progress: Math.min(p, tr.totalMs), total: tr.totalMs, frac: Math.min(1, p / tr.totalMs) };
}

export function Deck({ snap }: { snap: Snapshot }) {
  const state = snap.state!;
  const me = state.me;
  const [view, setView] = useState<ViewId>("map");
  const [route, setRoute] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const op = state.op;
  const t = useFrame(true, op ? 20 : 2);
  const elapsed = t - snap.receivedAt;
  const serverNow = state.serverNow + elapsed;

  // al collegamento si passa alla console; allo stacco si torna alla mappa
  const hadOp = useRef(Boolean(op));
  useEffect(() => {
    if (op && !hadOp.current) {
      setView("conn");
      sfx.connect();
    }
    if (!op && hadOp.current) {
      sfx.hangup();
      setView((v) => (v === "conn" ? "map" : v));
      setRoute([]);
    }
    hadOp.current = Boolean(op);
  }, [op]);

  const trace = op ? traceNow(op, elapsed) : null;

  // colonna sonora: deck calmo, inseguimento quando un monitor ti sta risalendo
  const traced = Boolean(op?.trace.active);
  useEffect(() => {
    music.setMood(traced ? "trace" : "deck");
  }, [traced]);
  useEffect(() => {
    music.setIntensity(trace ? trace.frac : op?.trace.active ? 0.5 : 0);
  }, [trace, op?.trace.active]);

  // fine dei task: un trillo, o lo scroscio di dati per le copie
  const seenTasks = useRef(new Map<string, string>());
  useEffect(() => {
    for (const k of op?.tasks ?? []) {
      const before = seenTasks.current.get(k.id);
      if (before === "run" && k.state === "done") (k.tool === "copy" ? sfx.copy : sfx.taskDone)();
      if (before === "run" && k.state === "fail") sfx.bad();
      seenTasks.current.set(k.id, k.state);
    }
  }, [op?.tasks]);

  const lastAlarm = useRef(0);
  useEffect(() => {
    if (!trace || trace.frac < 0.8) return;
    const gap = trace.frac > 0.92 ? 400 : 900;
    if (t - lastAlarm.current > gap) {
      lastAlarm.current = t;
      sfx.alarm();
    }
  }, [t, trace]);

  const irc = useIrc();
  const ctx: DeckCtx = { state, serverNow, route, setRoute, go: setView, selected, setSelected };
  const unread = state.mail.filter((m) => m.unread).length;
  const mine = state.missions.filter((m) => m.mine).length;

  const nav: { id: ViewId; label: string; badge?: string | number; alert?: boolean }[] = [
    { id: "map", label: "Mappa" },
    { id: "conn", label: "Console", badge: op ? "LIVE" : undefined, alert: Boolean(trace && trace.frac > 0.75) },
    { id: "board", label: "Bacheca", badge: mine || undefined },
    { id: "mail", label: "Posta", badge: unread || undefined },
    { id: "shop", label: "Mercato" },
    { id: "gateway", label: "Gateway" },
    { id: "ranks", label: "Classifiche" },
    { id: "irc", label: "IRC", badge: irc.unread ? (irc.unread > 99 ? "99+" : irc.unread) : undefined, alert: irc.hl },
    { id: "bbs", label: "BBS" },
    { id: "lab", label: "Laboratorio" },
    { id: "world", label: "Cronaca" },
    { id: "people", label: "Persone" },
    { id: "stocks", label: "Borsa" },
    { id: "crew", label: "Crew", badge: state.duels.length + state.trades.filter((x) => x.incoming).length || undefined, alert: state.duels.some((d) => d.incoming || d.state === "live") },
    { id: "career", label: "Carriera" },
    { id: "feed", label: "Feed", badge: state.intrusions.length ? "!" : undefined, alert: state.intrusions.length > 0 },
    ...(me.admin ? [{ id: "admin" as ViewId, label: "Admin", badge: "★" }] : []),
  ];

  return (
    <div className={`deck faction-${me.faction}`}>
      <header className="topbar">
        <div className="brand t-fac">AETHER</div>
        <div className="stat">
          <span>{me.faction === "red" ? "Cellula rossa" : "Cellula blu"}</span>
          <b className="t-fac">{me.handle}</b>
        </div>
        <div className="stat">
          <span title={`Fama: ${me.fameTitle}`}>Rango</span>
          <b>
            <span className="faint" title="Livello">{me.level}</span> {me.rank}
            {me.crew ? <span className="t-fac"> [{me.crew}]</span> : null}
            {me.warrant ? <span className={me.warrant >= 2 ? "t-red" : "t-amber"} title={`Fedina: ${["", "attenzionato", "ricercato", "mandato federale"][me.warrant]}`}> {"!".repeat(me.warrant)}</span> : null}
          </b>
        </div>
        <div className="stat">
          <span>Crediti</span>
          <b className="t-amber">
            <Rolling value={me.credits} format={fmtCr} />
          </b>
        </div>
        <div className="stat" style={{ minWidth: 120 }}>
          <span>Calore {me.heat}</span>
          <div className="meter seg" style={{ marginTop: 6, color: me.heat > 70 ? "var(--red)" : me.heat > 40 ? "var(--amber)" : "var(--green)" }}>
            <i style={{ width: `${me.heat}%` }} />
          </div>
        </div>
        <div className="stat" style={{ marginLeft: "auto" }}>
          <span>{snap.status === "online" ? "carrier ok" : "carrier perso"}</span>
          <b className="dim">{latticeClock(serverNow)}</b>
        </div>
        <AudioToggles />
        <button className="btn small" onClick={() => net.logout()}>
          Esci
        </button>
      </header>

      <nav className="nav">
        {nav.map((n) => (
          <button
            key={n.id}
            className={view === n.id ? "on" : ""}
            onClick={() => {
              sfx.click();
              setView(n.id);
            }}
          >
            {n.label}
            {n.badge !== undefined ? <span className={`badge ${n.alert ? "alert" : ""}`}>{n.badge}</span> : null}
          </button>
        ))}
      </nav>

      <main className="main">
        {state.notice ? <div className={`notice ${state.notice.tone}`}>{state.notice.text}</div> : null}
        {me.jailUntil > serverNow ? <JailScreen ctx={ctx} /> : null}
        {state.intrusions.length && view !== "feed" ? <IntrusionAlert ctx={ctx} /> : null}
        {view === "map" && <MapView ctx={ctx} trace={trace?.frac ?? null} />}
        {view === "conn" && <Connection ctx={ctx} elapsed={elapsed} />}
        {view === "board" && <Board ctx={ctx} />}
        {view === "mail" && <Mail ctx={ctx} />}
        {view === "shop" && <Shop ctx={ctx} />}
        {view === "gateway" && <Gateway ctx={ctx} />}
        {view === "ranks" && <Ranks ctx={ctx} />}
        {view === "feed" && <Feed ctx={ctx} />}
        {view === "career" && <Career ctx={ctx} />}
        {view === "irc" && <IrcView />}
        {view === "bbs" && <BbsView ctx={ctx} />}
        {view === "lab" && <LabPanel ctx={ctx} />}
        {view === "world" && <WorldPanel ctx={ctx} />}
        {view === "people" && <PeoplePanel ctx={ctx} />}
        {view === "stocks" && <StocksPanel ctx={ctx} />}
        {view === "crew" && <SocialView ctx={ctx} />}
        {view === "admin" && me.admin && <AdminView ctx={ctx} />}
      </main>

      <CinemaLayer state={state} traceFrac={trace?.frac ?? null} serverNow={serverNow} />

      <footer className="bottombar">
        {op ? <TraceBar op={op} trace={trace} /> : <IdleBar state={state} />}
        {op && op.tasks.length ? (
          <div className="tasks">
            {op.tasks.map((k) => {
              const p = k.state === "run" ? Math.min(1, k.progress + k.rate * (elapsed / 1000)) : k.progress;
              return (
                <div key={k.id} className={`task ${k.state}`}>
                  <div className="spread">
                    <span>{k.label}</span>
                    <span className={k.state === "fail" ? "t-red" : k.state === "done" ? "t-green" : "dim"}>
                      {k.state === "run" ? `${Math.round(p * 100)}%` : k.state === "done" ? "ok" : "errore"}
                    </span>
                  </div>
                  <div className="meter">
                    <i style={{ width: `${p * 100}%`, background: k.state === "fail" ? "var(--red)" : undefined }} />
                  </div>
                  {k.note ? <div className="faint">{k.note}</div> : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </footer>
    </div>
  );
}

function TraceBar({ op, trace }: { op: OpView; trace: ReturnType<typeof traceNow> }) {
  if (!op.trace.active) {
    return (
      <div className="tracebar">
        <span className="label">Trace</span>
        <span className="dim">{op.access === "client" ? "credenziali cliente: nessun trace" : "nessun monitor attivo su questo nodo"}</span>
        <span />
      </div>
    );
  }
  if (!trace) {
    return (
      <div className="tracebar hot">
        <span className="label t-red">Trace</span>
        <span className="t-red blink">TRACE IN CORSO · installa un Trace Tracker per vederne l'avanzamento</span>
        <span />
      </div>
    );
  }
  const left = Math.max(0, (trace.total - trace.progress) / ((op.trace.rate ?? 1) * 1000));
  return (
    <div className={`tracebar ${trace.frac > 0.75 ? "hot" : ""}`}>
      <span className="label t-red">Trace</span>
      <div className="meter">
        <i style={{ width: `${trace.frac * 100}%` }} />
      </div>
      <span className="px" style={{ fontSize: 22, minWidth: 140, textAlign: "right" }}>
        {Math.round(trace.frac * 100)}%{op.trace.hopTimes ? ` · ${left.toFixed(1)}s` : ""}
      </span>
    </div>
  );
}

function IdleBar({ state }: { state: GameState }) {
  const total = state.war.red + state.war.blue || 1;
  return (
    <div className="tracebar">
      <span className="label">Guerra</span>
      <div className="meter" style={{ height: 10 }}>
        <i style={{ width: `${(state.war.red / total) * 100}%`, background: "var(--magenta)", boxShadow: "none" }} />
        <i style={{ left: `${(state.war.red / total) * 100}%`, right: 0, width: "auto", background: "var(--cyan)", boxShadow: "none" }} />
      </div>
      <span className="dim" style={{ fontSize: 13 }}>
        <span className="t-mag">{state.war.red}</span> · <span className="t-cyan">{state.war.blue}</span>
      </span>
    </div>
  );
}

function IntrusionAlert({ ctx }: { ctx: DeckCtx }) {
  const intr = ctx.state.intrusions[0]!;
  const node = ctx.state.nodes.find((n) => n.id === intr.nodeId);
  return (
    <div className="alarm spread">
      <div>
        <div className="px t-red" style={{ fontSize: 24 }}>
          {intr.own ? "INTRUSIONE NEL TUO GATEWAY" : `INTRUSIONE IN CORSO · ${node?.org}`}
        </div>
        <div className="dim">
          {intr.own
            ? "Qualcuno è dentro il tuo terminale. Il contro-trace accelera il tuo monitor per 20 secondi: se lo prende, ti restituiscono il maltolto."
            : "Un rosso è dentro il nodo che presidi. Il contro-trace accelera il monitor per 20 secondi."}
        </div>
      </div>
      <button className="btn danger" disabled={intr.boosted} onClick={() => void net.do("counter", { opId: intr.opId })}>
        {intr.boosted ? "Contro-trace attivo" : "Lancia contro-trace"}
      </button>
    </div>
  );
}
