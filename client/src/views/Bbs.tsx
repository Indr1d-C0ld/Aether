// I BBS: rubrica, chiamata col modem, e una schermata da terminale a menu. Ogni voce ha un tasto rapido.
import { useCallback, useEffect, useRef, useState } from "react";
import type { BbsFiles, BbsHome, BbsInfo, BbsThread, BbsThreadRow, BbsUserRow, GtwState, TradeState, TrisState } from "../../../shared/bbs.ts";
import { BBS_LEVEL, BBS_LINE_MAX, BBS_POST_MAX, BBS_TITLE_MAX } from "../../../shared/bbs.ts";
import { fmtCr } from "../../../shared/rules.ts";
import { net } from "../net.ts";
import { sfx } from "../audio.ts";
import type { DeckCtx } from "./Deck.tsx";
import type { WarezRow } from "../../../shared/malware.ts";
import { SysopPanel } from "./Sysop.tsx";

type WhoRow = { handle: string; city: string; clock: string; status: "sveglio" | "dorme" | "custodia"; about: string; last: string; lastAt: number };
type WarezData = { rows: WarezRow[]; kb: number; builds?: { id: string; name: string; up: boolean }[] };

type Screen =
  | { k: "home" }
  | { k: "area"; area: string; name: string; desc: string; rows: BbsThreadRow[] }
  | { k: "thread"; t: BbsThread; back: string }
  | { k: "compose"; area: string; name: string }
  | { k: "files"; f: BbsFiles; w: WarezData | null }
  | { k: "read"; name: string; body: string }
  | { k: "users"; rows: BbsUserRow[]; who: WhoRow[] }
  | { k: "bulletin"; n: number }
  | { k: "tris"; s: TrisState }
  | { k: "gtw"; s: GtwState }
  | { k: "trade"; s: TradeState };

const when = (at: number) => {
  const d = new Date(at);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function BbsView({ ctx }: { ctx: DeckCtx }) {
  const [list, setList] = useState<BbsInfo[] | null>(null);
  const [dialing, setDialing] = useState<BbsInfo | null>(null);
  const [gate, setGate] = useState<{ bbs: BbsInfo; hint: string; err: string } | null>(null);
  const [home, setHome] = useState<BbsHome | null>(null);
  const [screen, setScreen] = useState<Screen>({ k: "home" });
  const [msg, setMsg] = useState("");
  const id = home?.info.id ?? "";

  const refresh = useCallback(async () => {
    const r = await net.do("bbs", { cmd: "list" }, true);
    if (r.ok) setList((r.data as { list: BbsInfo[] }).list);
  }, []);
  useEffect(() => {
    void refresh();
    // chi cambia vista riattacca: la linea serve ad altri
    return () => void net.do("bbs", { cmd: "bye" }, true);
  }, [refresh]);

  /** Un comando al BBS in linea; se la linea è caduta si torna in rubrica. */
  const cmd = useCallback(
    async (c: string, p: Record<string, unknown> = {}) => {
      const r = await net.do("bbs", { cmd: c, bbs: id, ...p }, true);
      if (!r.ok) {
        setMsg(r.error ?? "errore");
        sfx.bad();
        if ((r.data as { dropped?: boolean } | undefined)?.dropped) {
          setHome(null);
          void refresh();
        }
        return null;
      }
      setMsg(r.note ?? "");
      return r.data ?? {};
    },
    [id, refresh],
  );

  const call = async (b: BbsInfo, pass?: string) => {
    if (b.gate && pass === undefined) return setGate({ bbs: b, hint: "", err: "" });
    setGate(null);
    setDialing(b);
    setMsg("");
    sfx.connect();
    const [r] = await Promise.all([net.do("bbs", { cmd: "call", bbs: b.id, pass }, true), new Promise((res) => setTimeout(res, 2400))]);
    setDialing(null);
    if (!r.ok) {
      const d = r.data as { gate?: boolean; hint?: string } | undefined;
      if (d?.gate) return setGate({ bbs: b, hint: d.hint ?? "", err: pass ? (r.error ?? "") : "" });
      sfx.bad();
      return setMsg(r.error ?? "il numero non risponde");
    }
    setHome(r.data as BbsHome);
    setScreen({ k: "home" });
  };
  const bye = async () => {
    await net.do("bbs", { cmd: "bye" }, true);
    setHome(null);
    setMsg("NO CARRIER");
    void refresh();
  };
  const goHome = async () => {
    const h = (await cmd("home")) as BbsHome | null;
    if (h) setHome(h), setScreen({ k: "home" });
  };
  const openArea = async (area: string) => {
    const d = (await cmd("threads", { area })) as { area: { id: string; name: string; desc: string }; rows: BbsThreadRow[] } | null;
    if (d) setScreen({ k: "area", area: d.area.id, name: d.area.name, desc: d.area.desc, rows: d.rows });
  };
  const openThread = async (thread: string, back: string) => {
    const t = (await cmd("thread", { thread })) as BbsThread | null;
    if (t) setScreen({ k: "thread", t, back });
  };
  const openFiles = async () => {
    const f = (await cmd("files")) as BbsFiles | null;
    if (!f) return;
    const w = await net.do("mw", { cmd: "warez" }, true);
    setScreen({ k: "files", f, w: w.ok ? (w.data as WarezData) : null });
  };
  const openDoor = async (door: string) => {
    const s = await cmd("door", { door });
    if (!s) return;
    if (door === "tris") setScreen({ k: "tris", s: s as TrisState });
    else if (door === "gtw") setScreen({ k: "gtw", s: s as GtwState });
    else setScreen({ k: "trade", s: s as TradeState });
  };

  // tasti rapidi del menu principale
  const keys = useRef<Record<string, () => void>>({});
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (!home || e.ctrlKey || e.metaKey || e.altKey || (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName))) return;
      const f = keys.current[e.key.toUpperCase()];
      if (f) e.preventDefault(), f();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [home]);

  // ---------------------------------------------------------------- rubrica
  if (!home) {
    return (
      <div className="list" style={{ gap: 14 }}>
        <div className="view-title">
          <div>
            <h1>BBS</h1>
            <p className="dim" style={{ margin: 0 }}>
              Sistemi che si chiamano col modem, uno alla volta e a tempo. I messaggi restano: scrivi oggi, ti rispondono domani.
            </p>
          </div>
        </div>
        {dialing ? (
          <div className="bbs-term">
            <pre className="bbs-pre bbs-amber">{`ATZ\nOK\nATDT ${dialing.number}\n`}</pre>
            <pre className="bbs-pre bbs-blink">CONNESSIONE IN CORSO …</pre>
          </div>
        ) : gate ? (
          <form
            className="bbs-term"
            onSubmit={(e) => {
              e.preventDefault();
              const v = new FormData(e.currentTarget).get("pass");
              void call(gate.bbs, String(v ?? ""));
            }}
          >
            <pre className="bbs-pre bbs-green">{`CONNECT 1200\n\n${gate.err ? `${gate.err}\n\n` : ""}LOGON:`}</pre>
            <div className="row">
              <input name="pass" autoFocus autoComplete="off" maxLength={30} className="bbs-input" aria-label="Parola d'ordine" />
              <button className="btn">Invio</button>
              <button type="button" className="btn" onClick={() => setGate(null)}>
                Riattacca
              </button>
            </div>
            {gate.hint ? <p className="fw-hint">{gate.hint}</p> : null}
          </form>
        ) : (
          <div className="panel">
            <div className="panel-head">
              <span className="label">Rubrica</span>
              {ctx.state.op ? <span className="chip red">modem occupato</span> : null}
            </div>
            <div className="panel-body list">
              {msg ? <div className="t-amber px" style={{ fontSize: 20 }}>{msg}</div> : null}
              {(list ?? []).map((b) => (
                <div key={b.id} className="bbs-entry">
                  <div>
                    <div>
                      <b className="px" style={{ fontSize: 22 }}>{b.name}</b> <span className="faint">{b.number} · {b.speed}</span>
                    </div>
                    <div className="dim" style={{ fontSize: 13 }}>{b.tagline}</div>
                    <div className="faint" style={{ fontSize: 12 }}>
                      {b.owner ? <span className="chip fac">{b.mine ? "il tuo" : `di ${b.owner}`} · fama {b.fame ?? 0}</span> : null} sysop {b.sysop} · {b.days ? `ci hai chiamato in ${b.days} giorn${b.days === 1 ? "o" : "i"} · sei «${BBS_LEVEL[b.level]}»` : "mai chiamato"}
                    </div>
                  </div>
                  <button className="btn" disabled={Boolean(b.locked) || Boolean(ctx.state.op)} onClick={() => void call(b)} title={b.locked ?? undefined}>
                    {b.locked ? "non risponde" : "Chiama"}
                  </button>
                </div>
              ))}
              {list && !list.length ? <p className="dim">Nessun numero in rubrica.</p> : null}
              <p className="faint" style={{ fontSize: 12, margin: 0 }}>
                Qualche numero non è su nessun elenco: lo trova solo chi compone a tappeto col War Dialer.
              </p>
            </div>
          </div>
        )}
        {!dialing && !gate ? (
          <SysopPanel
            ctx={ctx}
            onCall={(id) => {
              const b = (list ?? []).find((x) => x.id === id);
              if (b) void call(b);
            }}
          />
        ) : null}
      </div>
    );
  }

  // ---------------------------------------------------------------- in linea
  const k = keys.current = {} as Record<string, () => void>;
  const Key = ({ c, label, on, disabled }: { c: string; label: string; on: () => void; disabled?: boolean }) => {
    if (!disabled) k[c] = on;
    return (
      <button className="bbs-key" disabled={disabled} onClick={on}>
        <b>[{c}]</b> {label}
      </button>
    );
  };

  return (
    <div className="bbs-term" data-bbs={home.info.id}>
      <div className="bbs-status">
        <span>{home.info.name}</span>
        <span>{home.info.speed.split(" ")[0]} baud</span>
        <span>{BBS_LEVEL[home.level]}</span>
        <span className={home.minutesLeft <= 3 ? "bbs-red" : ""}>{home.minutesLeft} min</span>
      </div>
      {msg ? <div className="bbs-msg">{msg}</div> : null}

      {screen.k === "home" ? (
        <>
          <pre className="bbs-pre bbs-art">{home.banner}</pre>
          <pre className="bbs-pre bbs-green">{home.motd}</pre>
          <div className="bbs-cols">
            <div>
              <div className="bbs-h">Aree messaggi</div>
              {home.areas.map((a, i) => (
                <button key={a.id} className="bbs-row" disabled={!a.open} onClick={() => void openArea(a.id)} title={a.desc}>
                  <b>[{i + 1}]</b> {a.name}
                  <span>{a.open ? `${a.threads} disc.${a.fresh ? ` · ${a.fresh} nuove` : ""}` : `solo «${BBS_LEVEL[a.need]}»`}</span>
                </button>
              ))}
              {home.areas.map((a, i) => ((a.open ? (k[String(i + 1)] = () => void openArea(a.id)) : null), null))}
              {home.doors.length ? <div className="bbs-h">Porte</div> : null}
              {home.doors.map((d) => (
                <button key={d.id} className="bbs-row" disabled={!d.open} onClick={() => void openDoor(d.id)} title={d.desc}>
                  <b>▶</b> {d.name}
                  <span>{d.open ? "gioca" : `solo «${BBS_LEVEL[d.need]}»`}</span>
                </button>
              ))}
            </div>
            <div>
              <div className="bbs-h">Ultimi chiamanti</div>
              {home.callers.slice(0, 6).map((c) => (
                <div key={c.handle + c.at} className="bbs-line">
                  {c.handle} <span>{c.from} · {when(c.at)}</span>
                </div>
              ))}
              <div className="bbs-h">Il muro</div>
              {home.oneliners.slice(0, 6).map((o) => (
                <div key={o.handle} className="bbs-line">
                  <i>«{o.text}»</i> <span>{o.handle}</span>
                </div>
              ))}
              <form
                className="row"
                style={{ marginTop: 6 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = e.currentTarget;
                  const text = String(new FormData(f).get("line") ?? "");
                  void cmd("oneliner", { text }).then((h) => h && (setHome(h as BbsHome), f.reset()));
                }}
              >
                <input name="line" maxLength={BBS_LINE_MAX} placeholder="lascia una riga sul muro" className="bbs-input" style={{ flex: 1 }} aria-label="La tua riga sul muro" />
                <button className="bbs-key">scrivi</button>
              </form>
            </div>
          </div>
          <div className="bbs-h">
            Tu: {home.stats.days} giorni · {home.stats.posts} messaggi · {home.stats.uploads} file caricati · {home.stats.kb} KB di credito
          </div>
          {home.next ? <div className="bbs-line bbs-amber">{home.next}</div> : null}
          <div className="bbs-menu">
            {home.hasFiles ? <Key c="F" label="Area file" on={() => void openFiles()} /> : null}
            <Key c="U" label="Utenti" on={() =>
                void cmd("users").then(async (d) => {
                  if (!d) return;
                  const w = await net.do("life", {}, true);
                  setScreen({ k: "users", rows: (d as { rows: BbsUserRow[] }).rows, who: w.ok ? (w.data as { rows: WhoRow[] }).rows : [] });
                })
              } />
            <Key c="B" label="Bollettini" on={() => setScreen({ k: "bulletin", n: 0 })} />
            <Key c="S" label="Chiama il sysop" on={() => void cmd("page").then((d) => d && setMsg((d as { line: string }).line))} />
            {home.info.owner && !home.info.mine && ctx.state.me.faction === "blue" ? <Key c="D" label="Segnala alla Guardia" on={() => void cmd("report")} /> : null}
            <Key c="G" label="Riattacca" on={() => void bye()} />
          </div>
        </>
      ) : null}

      {screen.k === "area" ? (
        <>
          <div className="bbs-h">{screen.name} · {screen.desc}</div>
          {screen.rows.map((r, i) => (
            <button key={r.id} className="bbs-row" onClick={() => void openThread(r.id, screen.area)}>
              <b>{String(i + 1).padStart(2, "0")}</b> {r.pinned ? "★ " : ""}{r.title}{r.fresh ? <em> nuovo</em> : null}
              <span>{r.by} · {r.replies} risp. · {when(r.lastAt)}</span>
            </button>
          ))}
          {!screen.rows.length ? <div className="bbs-line">Nessuna discussione. Comincia tu.</div> : null}
          <div className="bbs-menu">
            <Key c="N" label="Nuova discussione" on={() => setScreen({ k: "compose", area: screen.area, name: screen.name })} />
            <Key c="Q" label="Menu" on={() => void goHome()} />
          </div>
        </>
      ) : null}

      {screen.k === "compose" ? (
        <form
          className="list"
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void cmd("post", { area: screen.area, title: f.get("title"), body: f.get("body") }).then((d) => d && void openThread((d as { thread: string }).thread, screen.area));
          }}
        >
          <div className="bbs-h">Nuova discussione in {screen.name}</div>
          <input name="title" maxLength={BBS_TITLE_MAX} placeholder="Titolo" className="bbs-input" autoFocus aria-label="Titolo" />
          <textarea name="body" maxLength={BBS_POST_MAX} rows={8} placeholder="Scrivi una volta, bene." className="bbs-input" aria-label="Messaggio" />
          <div className="bbs-menu">
            <button className="bbs-key">
              <b>[↵]</b> Invia
            </button>
            <button type="button" className="bbs-key" onClick={() => void openArea(screen.area)}>
              Annulla
            </button>
          </div>
        </form>
      ) : null}

      {screen.k === "thread" ? (
        <>
          <div className="bbs-h">{screen.t.title}</div>
          {screen.t.posts.map((p) => (
            <div key={p.n} className="bbs-post">
              <div className="bbs-post-head">
                <b>#{p.n} {p.by}</b>
                <span>{p.level} · {when(p.at)}</span>
              </div>
              <pre className="bbs-pre">{p.body}</pre>
              <div className="bbs-sig">-- {p.sig}</div>
              {screen.t.canDelete ? (
                <button className="bbs-key" onClick={() => void cmd("delete", { thread: screen.t.id, n: p.n }).then((d) => d && void openArea(screen.back))}>
                  rimuovi
                </button>
              ) : null}
            </div>
          ))}
          <form
            className="list"
            style={{ gap: 6 }}
            onSubmit={(e) => {
              e.preventDefault();
              const f = e.currentTarget;
              void cmd("reply", { thread: screen.t.id, body: new FormData(f).get("body") }).then((d) => d && (f.reset(), void openThread(screen.t.id, screen.back)));
            }}
          >
            <textarea name="body" maxLength={BBS_POST_MAX} rows={3} placeholder="Rispondi…" className="bbs-input" aria-label="Risposta" />
            <div className="bbs-menu">
              <button className="bbs-key">
                <b>[↵]</b> Rispondi
              </button>
              <Key c="Q" label="Torna all'area" on={() => void openArea(screen.back)} />
            </div>
          </form>
        </>
      ) : null}

      {screen.k === "files" ? (
        <>
          <div className="bbs-h">Area file · credito {screen.f.kb} KB</div>
          <div className="bbs-line bbs-amber">Chi scarica deve caricare: ogni file del tuo archivio che lasci qui vale credito.</div>
          <div className="bbs-h">Testi</div>
          {screen.f.philes.map((p) => (
            <button key={p.id} className="bbs-row" disabled={!p.open} onClick={() => void cmd("read", { id: p.id }).then((d) => d && setScreen({ k: "read", ...(d as { name: string; body: string }) }))}>
              <b>{p.name}</b> {p.desc}
              <span>{p.open ? p.size : `solo «${BBS_LEVEL[p.need]}»`}</span>
            </button>
          ))}
          {screen.f.stash ? (
            <>
              <div className="bbs-h">Caricati dagli utenti (si scarica una copia, che vale la metà)</div>
              {screen.f.stash.map((x) => (
                <button key={x.id} className="bbs-row" disabled={x.taken || screen.f.kb < x.cost} onClick={() => void cmd("take", { id: x.id }).then((d) => d && void openFiles())}>
                  <b>↓</b> {x.name} <i>da {x.by}</i>
                  <span>{x.taken ? "già tuo" : `${x.cost} KB`}</span>
                </button>
              ))}
              {!screen.f.stash.length ? <div className="bbs-line">Ancora niente: sii il primo a caricare.</div> : null}
            </>
          ) : null}
          {screen.f.packs.length ? <div className="bbs-h">Pacchetti di oggi (uno al giorno)</div> : null}
          {screen.f.packs.map((p) => (
            <button key={p.n} className="bbs-row" disabled={!p.open || p.taken || screen.f.kb < p.cost} onClick={() => void cmd("download", { n: p.n }).then((d) => d && void openFiles())} title={p.desc}>
              <b>#{p.n}</b> {p.name}
              <span>{!p.open ? `solo «${BBS_LEVEL[p.need]}»` : p.taken ? "già scaricato oggi" : `${p.cost} KB`}</span>
            </button>
          ))}
          {screen.w ? (
            <>
              <div className="bbs-h">Warez · programmi pirata, a tuo rischio</div>
              {screen.w.rows.map((r) => (
                <button
                  key={r.id}
                  className="bbs-row"
                  disabled={r.taken || r.mine || screen.f.kb < r.cost}
                  title={r.desc}
                  onClick={() => void net.do("mw", { cmd: "get", id: r.id }).then((x) => (x.ok ? void openFiles() : setMsg(x.error ?? "")))}
                >
                  <b>{r.name}</b>-{r.group} · {r.size} · da {r.by} · <i>«{r.votes}»</i>
                  <span>{r.mine ? "tuo" : r.taken ? "già preso" : `${r.cost} KB`}</span>
                </button>
              ))}
              <div className="bbs-line">Quello che scarichi lo installi dal Laboratorio. Un antivirus aggiornato costa meno di un deck infetto.</div>
              {(screen.w.builds ?? []).map((b) => (
                <button key={b.id} className="bbs-row" disabled={b.up} onClick={() => void net.do("mw", { cmd: "seed", build: b.id }).then((x) => (x.ok ? void openFiles() : setMsg(x.error ?? "")))}>
                  <b>↑</b> Carica «{b.name}» travestito da programma pirata
                  <span>{b.up ? "già in area" : "cavallo di Troia"}</span>
                </button>
              ))}
            </>
          ) : null}
          <div className="bbs-h">Carica dal tuo archivio</div>
          {screen.f.mine.map((m) => (
            <button key={m.key} className="bbs-row" onClick={() => void cmd("upload", { key: m.key }).then((d) => d && void openFiles())}>
              <b>↑</b> {m.name}
              <span>+{m.gain} KB</span>
            </button>
          ))}
          {!screen.f.mine.length ? <div className="bbs-line">Nel tuo archivio non c'è niente da caricare.</div> : null}
          {screen.f.recent.length ? <div className="bbs-h">Caricati di recente</div> : null}
          {screen.f.recent.map((r) => (
            <div key={r.name + r.at} className="bbs-line">
              {r.name} <span>{r.by} · {when(r.at)}</span>
            </div>
          ))}
          <div className="bbs-menu">
            <Key c="Q" label="Menu" on={() => void goHome()} />
          </div>
        </>
      ) : null}

      {screen.k === "read" ? (
        <>
          <div className="bbs-h">{screen.name}</div>
          <pre className="bbs-pre bbs-green">{screen.body}</pre>
          <div className="bbs-menu">
            <Key c="Q" label="Torna ai file" on={() => void openFiles()} />
          </div>
        </>
      ) : null}

      {screen.k === "users" ? (
        <>
          <div className="bbs-h">Utenti</div>
          {screen.rows.map((u) => (
            <div key={u.handle} className="bbs-line">
              <b>{u.handle}</b> · {u.level}
              <span>{u.days} giorni · {u.posts} msg · {u.uploads} file · {when(u.last)}</span>
            </div>
          ))}
          <div className="bbs-h">La gente del Reticolo · {screen.who.filter((w) => w.status === "sveglio").length} svegli adesso</div>
          {screen.who.map((w) => (
            <div key={w.handle} className="bbs-line" title={w.about}>
              <b className={w.status === "sveglio" ? "bbs-green" : w.status === "custodia" ? "bbs-red" : ""}>{w.handle}</b> · {w.city}, {w.clock} · {w.status === "custodia" ? "in custodia" : w.status}
              <span>{w.last ? `${w.last} · ${when(w.lastAt)}` : w.about}</span>
            </div>
          ))}
          <div className="bbs-menu">
            <Key c="Q" label="Menu" on={() => void goHome()} />
          </div>
        </>
      ) : null}

      {screen.k === "bulletin" ? (
        <>
          <div className="bbs-h">Bollettino {screen.n + 1}/{home.bulletins.length} · {home.bulletins[screen.n]?.title}</div>
          <pre className="bbs-pre">{home.bulletins[screen.n]?.body}</pre>
          <div className="bbs-menu">
            <Key c="N" label="Successivo" disabled={screen.n + 1 >= home.bulletins.length} on={() => setScreen({ k: "bulletin", n: screen.n + 1 })} />
            <Key c="Q" label="Menu" on={() => void goHome()} />
          </div>
        </>
      ) : null}

      {screen.k === "tris" ? (
        <>
          <div className="bbs-h">Tris · partite giocate: {screen.s.games}</div>
          <div className="tris">
            {screen.s.board.map((c, i) => (
              <button key={i} className={`tris-cell ${c}`} disabled={Boolean(c) || Boolean(screen.s.over)} onClick={() => void cmd("door", { door: "tris", act: "move", cell: i }).then((d) => d && (sfx.key(), setScreen({ k: "tris", s: d as TrisState })))} aria-label={c || `casella ${i + 1}`}>
                {c}
              </button>
            ))}
          </div>
          <pre className="bbs-pre bbs-green bbs-big">{screen.s.line}</pre>
          <div className="bbs-menu">
            <Key c="R" label="Altra partita" disabled={!screen.s.over} on={() => void cmd("door", { door: "tris", act: "again" }).then((d) => d && setScreen({ k: "tris", s: d as TrisState }))} />
            <Key c="Q" label="Menu" on={() => void goHome()} />
          </div>
        </>
      ) : null}

      {screen.k === "gtw" ? (
        <>
          <div className="bbs-h">Guerra Termonucleare Globale</div>
          <div className={`defcon d${screen.s.defcon}`}>
            {[5, 4, 3, 2, 1].map((n) => (
              <span key={n} className={n === screen.s.defcon ? "on" : ""}>
                DEFCON {n}
              </span>
            ))}
          </div>
          <pre className="bbs-pre bbs-green bbs-big">{screen.s.log.join("\n")}</pre>
          {screen.s.stage === "side" ? (
            <div className="bbs-menu">
              <Key c="1" label="Stati Uniti" on={() => void cmd("door", { door: "gtw", act: "side", side: "usa" }).then((d) => d && setScreen({ k: "gtw", s: d as GtwState }))} />
              <Key c="2" label="Unione Sovietica" on={() => void cmd("door", { door: "gtw", act: "side", side: "urss" }).then((d) => d && setScreen({ k: "gtw", s: d as GtwState }))} />
            </div>
          ) : null}
          {screen.s.stage === "targets" ? (
            <div className="bbs-menu">
              {screen.s.pool.map((t) => (
                <button key={t} className={`bbs-key ${screen.s.targets.includes(t) ? "sel" : ""}`} onClick={() => void cmd("door", { door: "gtw", act: "target", target: t }).then((d) => d && setScreen({ k: "gtw", s: d as GtwState }))}>
                  {t}
                </button>
              ))}
              <Key c="L" label="Lancia" disabled={!screen.s.targets.length} on={() => void cmd("door", { door: "gtw", act: "launch" }).then((d) => d && (sfx.alarm(), setScreen({ k: "gtw", s: d as GtwState })))} />
            </div>
          ) : null}
          <div className="bbs-menu">
            {screen.s.stage === "run" ? <Key c="R" label="Ricomincia" on={() => void cmd("door", { door: "gtw", act: "reset" }).then((d) => d && setScreen({ k: "gtw", s: d as GtwState }))} /> : null}
            <Key c="Q" label="Menu" on={() => void goHome()} />
          </div>
        </>
      ) : null}

      {screen.k === "trade" ? <Trade s={screen.s} set={(s) => setScreen({ k: "trade", s })} cmd={cmd} home={() => void goHome()} Key={Key} /> : null}
    </div>
  );
}

function Trade({ s, set, cmd, home, Key }: { s: TradeState; set: (s: TradeState) => void; cmd: (c: string, p?: Record<string, unknown>) => Promise<unknown>; home: () => void; Key: (p: { c: string; label: string; on: () => void; disabled?: boolean }) => React.ReactElement }) {
  const go = (p: Record<string, unknown>) => void cmd("door", { door: "mercante", ...p }).then((d) => d && set(d as TradeState));
  const load = s.goods.reduce((q, g) => q + g.have, 0);
  return (
    <>
      <div className="bbs-h">
        Mercante di Chip · {s.cities[s.city]} · mossa {s.turn}/{s.turns} · {s.cash} crediti finti · zaino {load}/{s.cap}
      </div>
      <div className="bbs-line bbs-amber">{s.news}</div>
      {s.goods.map((g, i) => (
        <div key={g.name} className="bbs-line">
          <b>{g.name}</b> · {g.price} l'uno{g.have ? ` · ne hai ${g.have}` : ""}
          <span>
            <button className="bbs-key" disabled={s.over || g.price > s.cash || load >= s.cap} onClick={() => go({ act: "buy", good: i })}>
              compra
            </button>{" "}
            <button className="bbs-key" disabled={s.over || !g.have} onClick={() => go({ act: "sell", good: i })}>
              vendi
            </button>
          </span>
        </div>
      ))}
      <div className="bbs-h">Viaggia (costa una mossa; alla dodicesima contano solo i contanti)</div>
      <div className="bbs-menu">
        {s.cities.map((c, i) => (
          <button key={c} className="bbs-key" disabled={s.over || i === s.city} onClick={() => go({ act: "go", city: i })}>
            {c}
          </button>
        ))}
      </div>
      {s.over ? <div className="bbs-line bbs-green">Per oggi hai finito. Premio: {fmtCr(s.payout)}.</div> : null}
      <div className="bbs-cols">
        <div>
          <div className="bbs-h">Oggi</div>
          {s.today.map((r, i) => (
            <div key={i} className="bbs-line">
              {i + 1}. {r.handle} <span>{r.score}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="bbs-h">Di sempre</div>
          {s.best.map((r, i) => (
            <div key={i} className="bbs-line">
              {i + 1}. {r.handle} <span>{r.score}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bbs-menu">
        <Key c="Q" label="Menu" on={home} />
      </div>
    </>
  );
}
