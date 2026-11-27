// La Borsa del Reticolo: quotazioni, andamento, portafoglio. Crediti finti, titoli finti.
import { useCallback, useEffect, useState } from "react";
import type { StocksView } from "../../../shared/stocks.ts";
import { STOCK_FEE } from "../../../shared/stocks.ts";
import { fmtCr } from "../../../shared/rules.ts";
import { net } from "../net.ts";
import type { DeckCtx } from "./Deck.tsx";
import type { FrontView } from "../../../shared/fronts.ts";
import { FRONT_ALIBI_COST, FRONT_COST, FRONT_KINDS, FRONT_UP } from "../../../shared/fronts.ts";

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
  const [front, setFront] = useState<FrontView | null>(null);
  const [fname, setFname] = useState("");
  const [fkind, setFkind] = useState("");
  const fdo = useCallback(async (cmd: string, p: Record<string, unknown> = {}) => {
    const r = await net.do("front", { cmd, ...p }, cmd === "view");
    if (r.ok) setFront(r.data as FrontView);
  }, []);
  useEffect(() => {
    void fdo("view");
  }, [fdo]);
  const kinds = FRONT_KINDS.filter((k) => k.side === ctx.state.me.faction);
  if (!v) return <p className="dim">Apro il listino…</p>;
  return (
    <div className="list" style={{ gap: 14 }}>
      <div className="view-title">
        <div>
          <h1>Affari</h1>
          <p className="dim" style={{ margin: 0 }}>
            Il prezzo di un titolo segue quello che succede davvero all'azienda: cassa, reputazione, paura, scioperi, guerre. Chi sa cosa sta per succedere, perché sta per farlo lui, parte avvantaggiato.
          </p>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <span className="label">La tua copertura</span>
          {front?.has ? <span className={`chip ${front.frozenUntil > ctx.serverNow ? "red" : front.open ? "green" : ""}`}>{front.frozenUntil > ctx.serverNow ? "sotto sequestro" : front.open ? "aperta" : "chiusa a quest'ora"}</span> : null}
        </div>
        <div className="panel-body list">
          {front?.has ? (
            <>
              <div className="spread">
                <div>
                  <b className="px" style={{ fontSize: 22 }}>«{front.name}»</b> <span className="faint">{front.kind} · livello {front.level + 1}</span>
                  <div className="dim" style={{ fontSize: 12 }}>
                    In cassa {fmtCr(front.till)} su {fmtCr(front.cap)} · {front.rate} CR a battito in orario d'apertura · incassati finora {fmtCr(front.earned)}
                  </div>
                </div>
                <div className="row">
                  <button className="btn" disabled={front.till <= 0 || front.frozenUntil > ctx.serverNow} onClick={() => void fdo("collect")}>
                    Incassa
                  </button>
                  <button className="btn small" disabled={!front.alibiReady || front.till < FRONT_ALIBI_COST || ctx.state.me.heat <= 0} onClick={() => void fdo("alibi")} title="Una al giorno: calore −10">
                    Fattura di comodo · {fmtCr(FRONT_ALIBI_COST)}
                  </button>
                  {front.level + 1 < FRONT_UP.length ? (
                    <button className="btn small" disabled={ctx.state.me.credits < FRONT_UP[front.level + 1]!} onClick={() => void fdo("upgrade")}>
                      Amplia · {fmtCr(FRONT_UP[front.level + 1]!)}
                    </button>
                  ) : null}
                </div>
              </div>
              {front.staff.map((p) => (
                <div key={p.id} className="spread" style={{ fontSize: 13 }}>
                  <span>{p.name} lavora per te</span>
                  <button className="btn small" onClick={() => void fdo("fire", { id: p.id })}>
                    Lascia a casa
                  </button>
                </div>
              ))}
              {front.staff.length < 2 && front.hirable.length ? (
                <details>
                  <summary className="faint" style={{ cursor: "pointer", fontSize: 12 }}>Assumi qualcuno che conosci (+25% di incasso a testa)</summary>
                  <div className="list" style={{ gap: 4, marginTop: 6 }}>
                    {front.hirable.map((p) => (
                      <div key={p.id} className="spread" style={{ fontSize: 13 }}>
                        <span>{p.name} <span className="faint">{p.job}</span></span>
                        <button className="btn small" onClick={() => void fdo("hire", { id: p.id })}>
                          Assumi
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
              <p className="faint" style={{ margin: 0, fontSize: 12 }}>Se il tuo calore passa 75 può arrivare la finanza: cassa sequestrata e sei ore di sigilli.</p>
            </>
          ) : (
            <form
              className="list"
              style={{ gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                void fdo("found", { kind: fkind || kinds[0]?.id, name: fname });
              }}
            >
              <p className="dim" style={{ margin: 0 }}>
                Un'attività legale intestata a te: incassa da sola in orario d'ufficio (il tuo), dà lavoro a chi conosci, e una volta al giorno ti fa una fattura di comodo.
              </p>
              <div className="row">
                <select value={fkind || kinds[0]?.id} onChange={(e) => setFkind(e.target.value)} aria-label="Tipo di attività">
                  {kinds.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
                <input value={fname} onChange={(e) => setFname(e.target.value)} maxLength={28} placeholder="Il nome sull'insegna" style={{ flex: 1, minWidth: 160 }} aria-label="Nome dell'attività" />
                <button className="btn primary" disabled={fname.trim().length < 3 || ctx.state.me.credits < FRONT_COST}>
                  Apri · {fmtCr(FRONT_COST)}
                </button>
              </div>
              <span className="faint" style={{ fontSize: 12 }}>{kinds.find((k) => k.id === (fkind || kinds[0]?.id))?.blurb}</span>
            </form>
          )}
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
              <span className={r.have < 0 ? "t-amber" : "faint"}>{r.have ? r.have > 0 ? `hai ${r.have} a ${r.avg.toFixed(2)}` : `scoperto ${-r.have} a ${r.avg.toFixed(2)}` : ""}</span>
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
