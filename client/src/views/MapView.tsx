import { useEffect, useMemo, useRef, useState } from "react";
import type { NodeView } from "../../../shared/types.ts";
import { KIND_LABEL, KIND_PROFILE, MISSION_LABEL, SCAN_COST, SENSOR_COST, scanFinds, socPresidia, socSensors, REGION_NAME, RELAY_CLASS, WARDIAL_COST, fmtCr, heatTraceFactor, regionAt, routeTrace, type HopInput } from "../../../shared/rules.ts";
import { DialLog } from "../cinema.tsx";
import { Tones } from "./Tones.tsx";
import { net } from "../net.ts";
import { MAP_H, MAP_STYLES, MAP_VIEWS, MAP_W, RELAY_COLOR, drawMap, loadBaseMap, KIND_COLOR } from "../pixel.ts";
import { sfx } from "../audio.ts";
import { Art, art } from "../art.tsx";
import type { DeckCtx } from "./Deck.tsx";

export function MapView({ ctx, trace }: { ctx: DeckCtx; trace: number | null }) {
  const { state, route, setRoute, selected, setSelected } = ctx;
  const me = state.me;
  const op = state.op;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [style, setStyle] = useState(() => {
    try {
      return localStorage.getItem("aether.map") ?? "vector";
    } catch {
      return "vector";
    }
  });
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let live = true;
    void loadBaseMap(style).then((c) => live && setBase(c));
    try {
      localStorage.setItem("aether.map", style);
    } catch {
      /* ignora */
    }
    return () => {
      live = false;
    };
  }, [style]);
  const gw = useMemo(() => ({ x: me.home.x, y: me.home.y }), [me.home.x, me.home.y]);
  const [viewId, setViewId] = useState("world");
  const view = (MAP_VIEWS.find((v) => v.id === viewId) ?? MAP_VIEWS[0]!).rect;
  const [find, setFind] = useState("");
  const missionNodes = useMemo(() => new Set(state.missions.filter((m) => m.mine).flatMap((m) => [m.nodeId, ...m.clientNodes])), [state.missions]);
  const activeRoute = op ? op.chain : route;
  const drawNodes = op && op.target.kind === "gateway" ? [...state.nodes, op.target] : state.nodes;
  const sceneRef = useRef({ nodes: drawNodes, route: activeRoute, live: Boolean(op), trace, selected, presiding: me.presiding.map((x) => x.nodeId), view });
  sceneRef.current = { nodes: drawNodes, route: activeRoute, live: Boolean(op), trace, selected, presiding: me.presiding.map((x) => x.nodeId), view };

  useEffect(() => {
    const c = canvas.current;
    if (!c || !base) return;
    const g = c.getContext("2d")!;
    let raf = 0;
    const loop = (t: number) => {
      const s = sceneRef.current;
      drawMap(g, base, { nodes: s.nodes, gateway: gw, route: s.route, live: s.live, traceFrac: s.trace, selected: s.selected, presiding: s.presiding, view: s.view, t });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [base, gw]);

  const sel = state.nodes.find((n) => n.id === selected) ?? null;
  const relaysInRoute = route.filter((id) => state.nodes.find((n) => n.id === id)?.kind === "relay");

  return (
    <div className="list" style={{ gap: 14 }}>
      <div className="view-title">
        <h2>Mappa del Reticolo</h2>
        <span className="dim" style={{ fontSize: 13 }}>
          Il tuo gateway <span className="t-fac">{me.gatewayIp}</span> lampeggia sulla mappa. Doppio clic sui relay per il rimbalzo, poi scegli il bersaglio.
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 340px)", gap: 14 }} className="map-layout">
        <div>
          <div className="map-wrap">
          <canvas ref={canvas} width={MAP_W} height={MAP_H} />
          {state.nodes.map((n) => {
            // fuori dall'inquadratura non c'è niente da cliccare
            if (n.x < view.x || n.x > view.x + view.w || n.y < view.y || n.y > view.y + view.h) return null;
            const hop = route.indexOf(n.id);
            const inChain = activeRoute.includes(n.id);
            const isTarget = activeRoute.at(-1) === n.id && (op || n.kind !== "relay");
            const pos = { left: `${((n.x - view.x) / view.w) * 100}%`, top: `${((n.y - view.y) / view.h) * 100}%` };
            // i nodi sono centinaia: il nome compare per quelli che contano adesso, per gli altri al passaggio
            const loud = selected === n.id || inChain || missionNodes.has(n.id) || (n.landmark && n.kind !== "relay" && viewId !== "world");
            return (
              <div key={n.id}>
                <button
                  className="map-node"
                  style={pos}
                  title={`${n.name} · ${n.org}`}
                  aria-label={`${n.name}, ${n.org}`}
                  onClick={() => {
                    sfx.click();
                    setSelected(n.id);
                  }}
                  onDoubleClick={() => {
                    // doppio clic su un relay: mettilo o toglilo dal rimbalzo
                    if (op || n.kind !== "relay") return;
                    if (route.includes(n.id)) setRoute(route.filter((id) => id !== n.id));
                    else if (route.length < me.maxHops) setRoute([...route, n.id]);
                  }}
                />
                <span className={`map-label ${selected === n.id ? "on" : ""} ${isTarget ? "target" : inChain ? "hop" : ""} ${loud ? "" : "quiet"}`} style={pos}>
                  {hop >= 0 && !op && n.kind === "relay" ? `${hop + 1}·` : ""}
                  {n.name}
                </span>
              </div>
            );
          })}
          </div>
          <div className="spread" style={{ marginTop: 6 }}>
            <div className="tabs">
              {MAP_VIEWS.map((v) => (
                <button key={v.id} className={viewId === v.id ? "on" : ""} onClick={() => setViewId(v.id)} style={{ fontSize: 15, padding: "2px 8px" }}>
                  {v.name}
                </button>
              ))}
            </div>
            <span className="faint" style={{ fontSize: 12 }}>
              Conosci {me.knownNodes} nodi su {me.worldNodes}
            </span>
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="cerca fra i nodi che conosci: nome, organizzazione, città, tipo, IP" style={{ flex: 1, minWidth: 200, minHeight: 32 }} />
          </div>
          {find.trim().length >= 2 ? (
            <div className="logs" style={{ maxHeight: 150, marginTop: 4 }}>
              {state.nodes
                .filter((n) => `${n.name} ${n.org} ${n.city} ${n.sub} ${n.ip} ${KIND_LABEL[n.kind]}`.toLowerCase().includes(find.trim().toLowerCase()))
                .slice(0, 30)
                .map((n) => (
                  <div key={n.id} className={`logrow ${selected === n.id ? "sel" : ""}`} role="button" onClick={() => setSelected(n.id)}>
                    <span style={{ color: KIND_COLOR[n.kind] }}>■</span>
                    <span>
                      {n.org} <span className="faint">· {n.sub} · {n.city} · {n.ip}</span>
                    </span>
                  </div>
                ))}
            </div>
          ) : null}
          <div className="spread" style={{ marginTop: 6 }}>
            <div className="tabs">
              {MAP_STYLES.map((st) => (
                <button key={st.id} className={style === st.id ? "on" : ""} onClick={() => setStyle(st.id)} title={st.hint} style={{ fontSize: 15, padding: "2px 8px" }}>
                  {st.name}
                </button>
              ))}
            </div>
            <span className="faint" style={{ fontSize: 12 }}>
              Chiami da <span className="t-fac">{me.home.city}</span> · {REGION_NAME[me.home.region]}
            </span>
          </div>
          <div className="map-legend">
            {(Object.keys(RELAY_CLASS) as (keyof typeof RELAY_CLASS)[]).map((k) => (
              <span key={k} style={{ marginRight: 10 }} title={RELAY_CLASS[k].blurb}>
                <span style={{ color: RELAY_COLOR[k] }}>✚</span> {RELAY_CLASS[k].name}
              </span>
            ))}
            <br />
            {(["bank", "corp", "shop", "gov", "law", "edu", "lab", "med", "news", "util", "telco", "home", "mil"] as const).map((k) => (
              <span key={k} style={{ marginRight: 10 }}>
                <span style={{ color: KIND_COLOR[k] }}>■</span> {KIND_LABEL[k]}
              </span>
            ))}
          </div>
        </div>
        <div className="list" style={{ gap: 14, alignContent: "start" }}>
          <RoutePanel ctx={ctx} relays={relaysInRoute} />
          {sel ? <NodePanel ctx={ctx} node={sel} /> : <div className="panel"><div className="panel-body dim">Seleziona un nodo sulla mappa.</div></div>}
        </div>
      </div>
      <style>{`@media (max-width: 1100px){ .map-layout{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

function RoutePanel({ ctx, relays }: { ctx: DeckCtx; relays: string[] }) {
  const { state, route, setRoute } = ctx;
  const op = state.op;
  const max = state.me.maxHops;
  if (op) {
    const target = op.target;
    return (
      <div className="panel">
        <div className="panel-head">
          <span className="label">Connessione attiva</span>
          <span className="chip amber">LIVE</span>
        </div>
        <div className="panel-body list">
          <div>
            {op.chain.length - 1} hop → <span className="t-fac">{target?.name}</span>
          </div>
          <button className="btn primary" onClick={() => ctx.go("conn")}>
            Torna alla console
          </button>
        </div>
      </div>
    );
  }
  const hops = route.map((id) => state.nodes.find((x) => x.id === id)).filter((n): n is NodeView => Boolean(n) && n!.kind === "relay");
  // stima con monitor 3 come riferimento: serve a confrontare i percorsi, il tempo vero dipende dal bersaglio
  const est = routeTrace(3, state.me.home, hops.map(toHop));
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">Rimbalzo</span>
        <span className="chip">
          {relays.length}/{max} hop
        </span>
      </div>
      <div className="panel-body list">
        {hops.length ? (
          <div className="list" style={{ gap: 3 }}>
            <div className="dim" style={{ fontSize: 13 }}>
              ◉ {state.me.home.city} <span className="faint">· il tuo gateway</span>
            </div>
            {hops.map((n, i) => {
              const prev = i === 0 ? state.me.home : hops[i - 1]!;
              const border = regionAt(n.x, n.y) !== regionAt(prev.x, prev.y);
              const f = est.factors[i]!;
              return (
                <div key={n.id} className="spread" style={{ fontSize: 13 }}>
                  <span>
                    <span style={{ color: RELAY_COLOR[n.cls ?? "public"] }}>✚</span> {i + 1}. {n.name}{" "}
                    <span className="faint">
                      {RELAY_CLASS[n.cls ?? "public"].name}
                      {border ? " · confine" : ""}
                      {n.myKey ? " · chiavi" : ""}
                      {n.myWear ? ` · usato ${n.myWear}×` : ""}
                    </span>
                  </span>
                  <span className={f >= 1.3 ? "t-green" : f < 0.9 ? "t-red" : "dim"}>×{f.toFixed(2)}</span>
                </div>
              );
            })}
            <div className="spread" style={{ fontSize: 13, borderTop: "1px solid var(--line)", paddingTop: 4 }}>
              <span className="dim">Tariffe dei relay</span>
              <span className={est.fee ? "t-amber" : "dim"}>{est.fee ? fmtCr(est.fee) : "gratis"}</span>
            </div>
          </div>
        ) : (
          <p className="dim" style={{ margin: 0 }}>
            Nessun relay: collegarsi diretti lascia il tuo IP nel log del bersaglio e dà al monitor un solo hop da risalire.
          </p>
        )}
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          Il moltiplicatore dice quanto ogni relay rallenta chi ti risale: contano il tipo, i confini attraversati, la distanza, le chiavi che hai e
          quanto l'hai usato negli ultimi dieci minuti.
        </p>
        <div className="row">
          {route.length ? (
            <button className="btn small" onClick={() => setRoute([])}>
              Azzera
            </button>
          ) : null}
          <SavedRoutes ctx={ctx} />
        </div>
        <DialBox ctx={ctx} />
        <WarDialer ctx={ctx} />
      </div>
    </div>
  );
}

const toHop = (n: NodeView): HopInput => ({
  cls: n.cls ?? "public",
  x: n.x,
  y: n.y,
  hasKey: n.myKey,
  recentUses: n.myWear,
  poisoned: Boolean(n.backdoors && n.backdoors > 0 && !n.mineBackdoor),
});

/** Tre percorsi salvati nel browser, come i rimbalzi preferiti di Uplink. */
function SavedRoutes({ ctx }: { ctx: DeckCtx }) {
  const key = `aether.routes.${ctx.state.me.id}`;
  const read = (): (string[] | null)[] => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "[null,null,null]") as (string[] | null)[];
    } catch {
      return [null, null, null];
    }
  };
  const [slots, setSlots] = useState(read);
  const save = (i: number, r: string[] | null) => {
    const next = slots.map((x, k) => (k === i ? r : x));
    setSlots(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* ignora */
    }
  };
  const known = new Set(ctx.state.nodes.map((n) => n.id));
  return (
    <>
      {slots.map((r, i) =>
        r ? (
          <span key={i} className="row" style={{ gap: 2 }}>
            <button className="btn small" onClick={() => ctx.setRoute(r.filter((id) => known.has(id)).slice(0, ctx.state.me.maxHops))} title={r.join(" → ")}>
              Percorso {i + 1} ({r.length})
            </button>
            <button className="btn small" onClick={() => save(i, null)} title="Dimentica" aria-label={`Dimentica il percorso ${i + 1}`}>
              ×
            </button>
          </span>
        ) : ctx.route.length ? (
          <button key={i} className="btn small" onClick={() => save(i, ctx.route)}>
            Salva in {i + 1}
          </button>
        ) : null,
      )}
    </>
  );
}

/** WarGames: scegli una regione e componi numeri a tappeto finché qualcosa risponde. */
function WarDialer({ ctx }: { ctx: DeckCtx }) {
  const me = ctx.state.me;
  const v = me.tools.wardialer ?? 0;
  const [region, setRegion] = useState<string>(me.home.region);
  if (!v) return null;
  const left = Math.max(0, Math.ceil((me.scanUntil - ctx.serverNow) / 1000));
  const holding = me.tone?.state === "open";
  return (
    <div className="list" style={{ gap: 6, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
      <div className="spread">
        <span className="label">War Dialer v{v}</span>
        <span className="faint">
          {me.knownNodes}/{me.worldNodes} nodi · {me.hiddenFound}/{me.hiddenTotal} segreti
        </span>
      </div>
      <div className="row">
        <select value={region} onChange={(e) => setRegion(e.target.value)} style={{ flex: 1, minWidth: 130 }} aria-label="Regione da scandagliare">
          {(Object.keys(REGION_NAME) as (keyof typeof REGION_NAME)[]).map((r) => (
            <option key={r} value={r}>
              {REGION_NAME[r]}
            </option>
          ))}
        </select>
        <button className="btn" disabled={left > 0 || holding || Boolean(ctx.state.op) || me.credits < SCAN_COST} onClick={() => void net.do("wardial", { region })}>
          {holding ? "Linea aperta…" : left > 0 ? `In corso… ${left}s` : `Scandaglia · ${fmtCr(SCAN_COST)}`}
        </button>
      </div>
      {me.tone ? (
        <Tones tone={me.tone} />
      ) : left > 0 ? (
        <>
          <DialLog serverNow={ctx.serverNow} />
          <button
            className="btn small"
            onClick={() => {
              sfx.whistle();
              void net.do("tone", { act: "open" });
            }}
            title="Fischia nella cornetta e ripeti i toni del centralino: se li azzecchi ti passa le linee riservate"
          >
            Blue Box · fischia nella cornetta
          </button>
        </>
      ) : (
        <span className="faint" style={{ fontSize: 12 }}>
          Ogni scansione mette sulla mappa fino a {scanFinds(v)} nodi della regione che non conosci: negozi, uffici, banche, PC di casa. Ogni tanto risponde
          qualcosa che non è in nessun elenco.
        </span>
      )}
    </div>
  );
}

/** Componi un indirizzo a mano: serve per i gateway privati, che non compaiono sulla mappa. */
export function DialBox({ ctx, preset }: { ctx: DeckCtx; preset?: string }) {
  const [ip, setIp] = useState(preset ?? "");
  const relays = ctx.route.length;
  return (
    <form
      className="list"
      style={{ gap: 6, borderTop: "1px solid var(--line)", paddingTop: 10 }}
      onSubmit={(e) => {
        e.preventDefault();
        void net.do("connect", { chain: ctx.route, targetIp: ip.trim() });
      }}
    >
      <span className="label">Componi un indirizzo</span>
      <div className="row">
        <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="IP di un gateway" style={{ flex: 1, minWidth: 140 }} />
        <button className="btn" disabled={!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip.trim()) || Boolean(ctx.state.op)}>
          {relays ? `Collega via ${relays} hop` : "Collega diretto"}
        </button>
      </div>
      <span className="faint" style={{ fontSize: 12 }}>
        I gateway dei giocatori non sono sulla mappa: li conosci dal Registro, dai tuoi backdoor, dagli honeypot o dalle cacce.
      </span>
    </form>
  );
}

function NodePanel({ ctx, node }: { ctx: DeckCtx; node: NodeView }) {
  const { state, route, setRoute } = ctx;
  const me = state.me;
  const op = state.op;
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<string[] | null>(null);
  const inRoute = route.includes(node.id);
  const relays = route.length;
  const max = me.maxHops;
  const missions = state.missions.filter((m) => m.nodeId === node.id);
  const routeNodes = route
    .filter((id) => id !== node.id)
    .map((id) => state.nodes.find((x) => x.id === id))
    .filter((n): n is NodeView => Boolean(n) && n!.kind === "relay");
  const plan = routeTrace(node.sec.monitor, me.home, routeNodes.map(toHop));
  const est = (plan.total * node.watch) / heatTraceFactor(me.heat) / 1000;
  const poisoned = routeNodes.some((n) => n.backdoors && n.backdoors > 0 && !n.mineBackdoor);
  const cls = node.cls ? RELAY_CLASS[node.cls] : null;

  const connect = () => {
    void net.do("connect", { chain: [...route.filter((id) => id !== node.id), node.id] });
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label" style={{ color: KIND_COLOR[node.kind] }}>
          {KIND_LABEL[node.kind]}
        </span>
        <span className="faint">{node.ip}</span>
      </div>
      <div className="panel-body list">
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <Art src={art.kind(node.kind)} size={48} />
          <div>
            <div className="px" style={{ fontSize: 28, lineHeight: 1 }}>
              {node.name}
            </div>
            <div className="dim">{node.org}</div>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 13 }} className="dim">
          {node.blurb}
        </p>
        {cls ? (
          <div className="list" style={{ gap: 2, fontSize: 13 }}>
            <div>
              <span style={{ color: RELAY_COLOR[node.cls ?? "public"] }}>✚ {cls.name}</span> <span className="faint">· {REGION_NAME[node.region]}</span>
            </div>
            <div className="dim">{cls.blurb}</div>
            <div className="faint">
              Risalita ×{cls.hop} · {cls.fee ? `${fmtCr(cls.fee)} a passaggio` : "gratis"} · log {cls.logMin} min
              {node.myKey ? <span className="t-amber"> · hai le chiavi (×1,4)</span> : null}
              {node.myWear ? <span className="t-red"> · usato {node.myWear}× di recente (−{Math.min(50, node.myWear * 12)}%)</span> : null}
            </div>
          </div>
        ) : (
          <div className="list" style={{ gap: 2, fontSize: 13 }}>
            <div className="faint">
              {node.sub} · {node.city ? `${node.city}, ` : ""}
              {REGION_NAME[node.region]}
            </div>
            <div className="dim">
              {KIND_PROFILE[node.kind].trace === "none"
                ? "Nessuno lo sorveglia."
                : KIND_PROFILE[node.kind].trace === "action"
                  ? "Il monitor parte solo quando tocchi qualcosa."
                  : "Il monitor parte appena ti colleghi."}
              {KIND_PROFILE[node.kind].lockout ? ` Blocca il login dopo ${KIND_PROFILE[node.kind].lockout} password sbagliate.` : ""}
            </div>
            <div className="row">
              {node.night ? <span className="chip fac">è notte: trace più lento del 30%</span> : null}
              {node.blackout ? <span className="chip fac">blackout: trace più lento del 50%</span> : null}
              {node.alert ? <span className="chip red">in allerta: trace più rapido del 25%</span> : null}
              {node.offline ? <span className="chip red">spento</span> : null}
            </div>
          </div>
        )}
        {node.kind !== "registry" ? (
          <div className="row">
            <span className={`chip ${node.sec.proxy ? "red" : ""}`}>proxy {node.sec.proxy}</span>
            <span className={`chip ${node.sec.firewall ? "red" : ""}`}>firewall {node.sec.firewall}</span>
            <span className={`chip ${node.sec.monitor > 2 ? "red" : node.sec.monitor ? "amber" : ""}`}>monitor {node.sec.monitor}</span>
            {node.bio ? <span className="chip amber" title="L'accesso admin vuole anche un campione biometrico dell'amministratore">biometria: {node.bio}</span> : null}
            {node.patched ? <span className="chip fac">rinforzato</span> : null}
            {node.backdoors ? <span className="chip red">backdoor {node.backdoors}</span> : null}
            {node.mineBackdoor ? <span className="chip green">tuo backdoor</span> : null}
            {node.wardens.length ? <span className="chip fac">presidio: {node.wardens.join(", ")}</span> : null}
          </div>
        ) : null}

        {node.kind === "registry" ? (
          <form
            className="list"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await net.do("registry", { query });
              if (r.ok) setAnswer((r.data as { lines: string[] }).lines);
            }}
          >
            <span className="dim" style={{ fontSize: 13 }}>
              Interroga il Registro con un IP o un handle. 200 CR a richiesta.
            </span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="IP o handle" />
            <button className="btn">Interroga</button>
            {answer ? (
              <pre className="t-green" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                {answer.join("\n")}
              </pre>
            ) : null}
          </form>
        ) : op ? (
          <p className="faint" style={{ margin: 0 }}>
            Stacca la connessione attuale per collegarti altrove.
          </p>
        ) : (
          <div className="list">
            {node.kind === "relay" ? (
              <button
                className="btn"
                disabled={!inRoute && relays >= max}
                onClick={() => setRoute(inRoute ? route.filter((id) => id !== node.id) : [...route, node.id])}
              >
                {inRoute ? "Togli dal rimbalzo" : relays >= max ? `Massimo ${max} hop (modem)` : `Aggiungi come hop ${relays + 1}`}
              </button>
            ) : null}
            <div className="spread" style={{ fontSize: 13 }}>
              <span className="dim">Trace stimato</span>
              <span className={est < 20 ? "t-red" : est < 35 ? "t-amber" : "t-green"}>
                {node.sec.monitor ? `~${Math.round(est)}s${poisoned ? " · relay avvelenato!" : ""}${plan.fee ? ` · ${fmtCr(plan.fee)}` : ""}` : "nessun monitor"}
              </span>
            </div>
            <button className="btn primary" onClick={connect}>
              {node.kind === "relay" && !inRoute ? `Collega a ${node.name}` : `Collega${relays ? ` via ${relays - (inRoute ? 1 : 0)} hop` : " diretto"}`}
            </button>
            {me.faction === "blue" && node.kind !== "relay" ? (
              <button className="btn" onClick={() => void net.do("preside", { nodeId: node.id })}>
                {me.presiding.some((x) => x.nodeId === node.id) ? "Togli presidio" : `Presidia questo nodo (${me.presiding.length}/${socPresidia(me.hw.soc)})`}
              </button>
            ) : null}
            {me.faction === "blue" && !node.hidden ? (
              <button className="btn" disabled={node.mySensor || me.credits < SENSOR_COST || me.sensors.length >= socSensors(me.hw.soc)} onClick={() => void net.do("deploySensor", { nodeId: node.id })}>
                {node.mySensor ? "Sensore attivo" : `Installa un sensore · ${fmtCr(SENSOR_COST)} (${me.sensors.length}/${socSensors(me.hw.soc)})`}
              </button>
            ) : null}
            {node.sensors ? <span className="t-red" style={{ fontSize: 13 }}>Il tuo Monitor Bypass rileva {node.sensors} sensor{node.sensors === 1 ? "e" : "i"} su questo nodo.</span> : null}
          </div>
        )}

        {missions.length ? (
          <div className="list" style={{ gap: 4 }}>
            <span className="label">Contratti qui</span>
            {missions.map((m) => (
              <div key={m.id} className="spread" style={{ fontSize: 13 }}>
                <span>
                  {MISSION_LABEL[m.type]} · {m.title}
                </span>
                <span className={m.mine ? "t-green" : "t-amber"}>{m.mine ? "tuo" : fmtCr(m.reward)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
