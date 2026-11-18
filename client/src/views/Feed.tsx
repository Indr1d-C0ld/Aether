import { clockShort } from "../../../shared/rules.ts";
import { net } from "../net.ts";
import type { DeckCtx } from "./Deck.tsx";

export function Feed({ ctx }: { ctx: DeckCtx }) {
  const { state } = ctx;
  return (
    <div className="list" style={{ gap: 14 }}>
      <div className="view-title">
        <h2>Feed del Reticolo</h2>
        <span className="dim">Quello che si sa in giro.</span>
      </div>
      {state.intrusions.length ? (
        <div className="panel">
          <div className="panel-head">
            <span className="label t-red">Intrusioni sul nodo che presidi</span>
          </div>
          <div className="panel-body list">
            {state.intrusions.map((i) => (
              <div key={i.opId} className="spread">
                <span>
                  {i.own ? "Il tuo gateway" : state.nodes.find((n) => n.id === i.nodeId)?.org} · dalle {clockShort(i.since)}
                </span>
                <button className="btn danger small" disabled={i.boosted} onClick={() => void net.do("counter", { opId: i.opId })}>
                  {i.boosted ? "contro-trace attivo" : "Contro-trace"}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="panel">
        <div className="panel-body list" style={{ gap: 4 }}>
          {state.feed.map((f) => (
            <div key={f.id} className="row" style={{ gap: 10, fontSize: 14 }}>
              <time className="faint">{clockShort(f.at)}</time>
              <span className={f.tone === "red" ? "t-mag" : f.tone === "blue" ? "t-cyan" : "dim"}>■</span>
              <span>{f.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
