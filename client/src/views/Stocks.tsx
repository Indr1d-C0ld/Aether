// La Borsa del Reticolo: quotazioni, andamento, portafoglio. Crediti finti, titoli finti.
import { useCallback, useEffect, useState } from "react";
import type { StocksView } from "../../../shared/stocks.ts";
import { STOCK_FEE } from "../../../shared/stocks.ts";
import { fmtCr } from "../../../shared/rules.ts";
import { net } from "../net.ts";
import type { DeckCtx } from "./Deck.tsx";

function Spark({ ys }: { ys: number[] }) {
  if (ys.length < 2) return <svg className="spark" viewBox="0 0 80 22" />;
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const d = ys.map((v, i) => `${i ? "L" : "M"}${((i / (ys.length - 1)) * 80).toFixed(1)},${(20 - ((v - lo) / (hi - lo || 1)) * 18).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" viewBox="0 0 80 22" role="img" aria-label="andamento">
      <path d={d} fill="none" stroke={ys.at(-1)! >= ys[0]! ? "var(--green)" : "var(--red)"} strokeWidth="1.5" />
    </svg>
  );
}

export function StocksPanel({ ctx }: { ctx: DeckCtx }) {
  const [v, setV] = useState<StocksView | null>(null);
  const [qty, setQty] = useState(10);
  const load = useCallback(async () => {
    const r = await net.do("stock", {}, true);
    if (r.ok) setV(r.data as StocksView);
  }, []);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(t);
  }, [load]);
  const order = async (cmd: "buy" | "sell", id: string) => {
    const r = await net.do("stock", { cmd, id, n: qty });
    if (r.ok) setV(r.data as StocksView);
  };
  if (!v) return <p className="dim">Apro il listino…</p>;
  return (
    <div className="list" style={{ gap: 14 }}>
      <div className="view-title">
        <div>
          <h1>Borsa</h1>
          <p className="dim" style={{ margin: 0 }}>
            Il prezzo di un titolo segue quello che succede davvero all'azienda: cassa, reputazione, paura, scioperi, guerre. Chi sa cosa sta per succedere, perché sta per farlo lui, parte avvantaggiato.
          </p>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <span className="label">Listino</span>
          <span className="row" style={{ gap: 6 }}>
            <span className="faint">portafoglio {fmtCr(v.value)} · {v.pnl >= 0 ? "+" : "−"}{fmtCr(Math.abs(v.pnl))}</span>
            <select value={qty} onChange={(e) => setQty(Number(e.target.value))} aria-label="Titoli per ordine">
              {[1, 10, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} per ordine
                </option>
              ))}
            </select>
          </span>
        </div>
        <div className="panel-body list" style={{ gap: 2 }}>
          {v.rows.map((r) => (
            <div key={r.id} className="stock-row">
              <b className="px" style={{ fontSize: 20 }}>{r.ticker}</b>
              <span className="stock-name">
                {r.name} {r.status !== "attiva" ? <span className="chip red">{r.status}</span> : null}
              </span>
              <Spark ys={r.history} />
              <span className="px" style={{ fontSize: 20 }}>{r.price.toFixed(2)}</span>
              <span className={r.change >= 0 ? "t-green" : "t-red"}>{r.change >= 0 ? "+" : ""}{r.change}%</span>
              <span className={r.have < 0 ? "t-amber" : "faint"}>{r.have ? `${r.have > 0 ? "hai" : "scoperto"} ${Math.abs(r.have)} a ${r.avg.toFixed(2)}` : ""}</span>
              <span className="row" style={{ gap: 4 }}>
                {r.open ? (
                  <>
                    <button className="btn small" disabled={ctx.state.me.credits < r.price * qty * (1 + STOCK_FEE) && r.have >= 0} onClick={() => void order("buy", r.id)}>
                      {r.have < 0 ? "Ricopri" : "Compra"}
                    </button>
                    <button className="btn small" onClick={() => void order("sell", r.id)}>
                      {r.have > 0 ? "Vendi" : "Scoperto"}
                    </button>
                  </>
                ) : (
                  <span className="faint" style={{ fontSize: 12 }}>chiuso · apre fra {Math.max(1, Math.round(r.opensIn))} h</span>
                )}
              </span>
            </div>
          ))}
          <p className="faint" style={{ margin: "8px 0 0", fontSize: 12 }}>
            Commissione {Math.round(v.fee * 100)}% a ordine. Al massimo {v.maxLong} titoli per società, {v.maxShort} allo scoperto (serve in conto metà del controvalore). Si tratta solo quando in quella sede è orario d'ufficio: le notizie della notte si scontano all'apertura.
          </p>
        </div>
      </div>
    </div>
  );
}
