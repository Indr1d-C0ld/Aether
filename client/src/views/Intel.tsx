// Informazioni come merce: quello che sai, la bancarella, il Mediatore, le segnalazioni.
import { useCallback, useEffect, useState } from "react";
import type { IntelKind, IntelPiece, IntelView } from "../../../shared/intel.ts";
import { BROKER_DAILY, INTEL_DESC, INTEL_FEE, INTEL_LISTING_H, INTEL_MAX_PRICE, INTEL_MIN_PRICE, INTEL_NAME } from "../../../shared/intel.ts";
import { clockShort, fmtCr } from "../../../shared/rules.ts";
import { net } from "../net.ts";
import type { DeckCtx } from "./Deck.tsx";

const KIND_CHIP: Record<IntelKind, string> = { cred: "red", addr: "amber", dial: "green", inner: "cyan", dossier: "violet" };

export function IntelMarket({ ctx }: { ctx: DeckCtx }) {
  const me = ctx.state.me;
  const [v, setV] = useState<IntelView | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<IntelKind | "">("");
  const load = useCallback(async () => {
    const r = await net.do("intel", {}, true);
    if (r.ok) setV(r.data as IntelView);
  }, []);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(t);
  }, [load]);
  const run = async (cmd: string, p: Record<string, unknown>) => {
    const r = await net.do("intel", { cmd, ...p });
    setMsg({ text: r.ok ? (r.note ?? "fatto") : (r.error ?? "errore"), ok: r.ok });
    if (r.ok) setV(r.data as IntelView);
    else void load();
  };
  if (!v) return <p className="dim">Apro la bancarella…</p>;
  // nella vista «tutto» al più tre voci per tipo: chi usa il War Dialer ha decine di numeri
  const PER_KIND = 3;
  const seen: Partial<Record<IntelKind, number>> = {};
  const pieces = v.pieces.filter((p) => (filter ? p.kind === filter : (seen[p.kind] = (seen[p.kind] ?? 0) + 1) <= PER_KIND));
  const hidden = filter ? [] : (Object.keys(seen) as IntelKind[]).filter((k) => (seen[k] ?? 0) > PER_KIND).map((k) => ({ k, n: seen[k]! - PER_KIND }));
  const board = v.board.filter((l) => !filter || l.kind === filter);
  return (
    <div className="list" style={{ gap: 14 }}>
      <p className="dim" style={{ margin: 0 }}>
        Quello che scopri si vende, e più di una volta: al Mediatore, che paga subito e non fa domande, oppure in bancarella, dove comprano giocatori e abitanti. Ogni copia in giro toglie valore alle altre. Una
        password cambiata o un gateway spostato non valgono più niente.
      </p>
      <div className="row" style={{ gap: 6 }}>
        <button className={`btn small ${filter === "" ? "primary" : ""}`} onClick={() => setFilter("")}>
          tutto
        </button>
        {(Object.keys(INTEL_NAME) as IntelKind[]).map((k) => (
          <button key={k} className={`btn small ${filter === k ? "primary" : ""}`} onClick={() => setFilter(k)} title={INTEL_DESC[k]}>
            {INTEL_NAME[k]}
          </button>
        ))}
      </div>
      {msg ? <div className={msg.ok ? "t-green" : "t-red"}>{msg.text}</div> : null}

      <div className="intel-grid">
      <div className="panel">
        <div className="panel-head">
          <span className="label">Quello che sai</span>
          <span className={`chip ${v.brokerLeft ? "green" : "red"}`}>
            Mediatore: ancora {v.brokerLeft}/{BROKER_DAILY} oggi
          </span>
        </div>
        <div className="panel-body list" style={{ gap: 8 }}>
          {pieces.length ? (
            pieces.map((p) => <PieceRow key={p.key} p={p} price={prices[p.key] ?? String(Math.max(INTEL_MIN_PRICE, Math.round(p.fair * 1.2)))} setPrice={(s) => setPrices({ ...prices, [p.key]: s })} run={run} />)
          ) : null}
          {hidden.map((h) => (
            <button key={h.k} className="btn small" style={{ justifySelf: "start" }} onClick={() => setFilter(h.k)}>
              {INTEL_NAME[h.k]}: altr{h.n === 1 ? "a" : "e"} {h.n}
            </button>
          ))}
          {pieces.length ? null : (
            <p className="dim" style={{ margin: 0 }}>
              Non sai ancora niente che valga qualcosa. Le password vengono dagli accessi admin, gli indirizzi dalla rubrica, i numeri dal War Dialer, le mappe dalle reti interne, i fascicoli
              dalle indagini sulle persone.
            </p>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="label">La bancarella</span>
          <span className="faint">
            {board.length} annunci · commissione {Math.round(INTEL_FEE * 100)}% · {INTEL_LISTING_H} h
          </span>
        </div>
        <div className="panel-body list" style={{ gap: 6 }}>
          {board.length ? (
            board.map((l) => (
              <div key={l.id} className="file-row">
                <div>
                  <div>
                    <span className={`chip ${KIND_CHIP[l.kind]}`}>{INTEL_NAME[l.kind]}</span> {l.title}
                  </div>
                  <div className="faint" style={{ fontSize: 12 }}>
                    da <span className={l.npc ? "" : "t-fac"}>{l.seller}</span>
                    {l.npc ? " (abitante)" : ""} · {l.sold ? `${l.sold} copi${l.sold === 1 ? "a venduta" : "e vendute"} · ` : ""}ancora {Math.max(1, Math.ceil((l.until - ctx.serverNow) / 3600_000))} h
                  </div>
                </div>
                <div className="list" style={{ gap: 4, alignContent: "start", justifyItems: "end" }}>
                  <span className="px t-amber" style={{ fontSize: 22 }}>
                    {fmtCr(l.price)}
                  </span>
                  {l.mine ? (
                    <button className="btn small" onClick={() => void run("unlist", { id: l.id })}>
                      Ritira
                    </button>
                  ) : l.owned ? (
                    <span className="faint" style={{ fontSize: 12 }}>
                      la sai già
                    </span>
                  ) : (
                    <button className="btn small primary" disabled={me.credits < l.price} onClick={() => void run("buy", { id: l.id })}>
                      Compra
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="dim" style={{ margin: 0 }}>
              Nessun annuncio, per ora. Gli abitanti ne mettono di nuovi ogni poche ore.
            </p>
          )}
        </div>
      </div>

      </div>

      {v.log.length ? (
        <div className="panel">
          <div className="panel-head">
            <span className="label">Movimenti</span>
          </div>
          <div className="panel-body list" style={{ gap: 4, fontSize: 13 }}>
            {v.log.map((x, i) => (
              <div key={i} className="spread">
                <span>{x.text}</span>
                <span className="faint">{clockShort(x.at)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PieceRow({ p, price, setPrice, run }: { p: IntelPiece; price: string; setPrice: (s: string) => void; run: (cmd: string, q: Record<string, unknown>) => Promise<void> }) {
  return (
    <div className="file-row" style={{ opacity: p.fresh ? 1 : 0.55 }}>
      <div>
        <div>
          <span className={`chip ${KIND_CHIP[p.kind]}`}>{INTEL_NAME[p.kind]}</span> {p.title}
          {p.bought ? <span className="faint"> · comprata</span> : null}
        </div>
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{p.detail}</div>
        <div className={p.fresh ? "faint" : "t-red"} style={{ fontSize: 12 }}>
          {p.note}
          {p.fresh ? ` · vale circa ${fmtCr(p.fair)}` : ""}
        </div>
      </div>
      {p.fresh ? (
        <div className="list" style={{ gap: 4, alignContent: "start", justifyItems: "end" }}>
          <button className="btn small" disabled={!p.quote} title={p.quoteWhy ?? "paga subito"} onClick={() => void run("broker", { key: p.key })}>
            Al Mediatore{p.quote ? ` · ${fmtCr(p.quote)}` : ""}
          </button>
          {p.listing ? (
            <button className="btn small" onClick={() => void run("unlist", { id: p.listing })}>
              Ritira dalla bancarella
            </button>
          ) : !(p.kind === "inner" && p.bought) ? (
            <span className="row" style={{ gap: 4 }}>
              <input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} style={{ width: 80 }} aria-label="Prezzo" />
              <button className="btn small primary" disabled={Number(price) < INTEL_MIN_PRICE || Number(price) > INTEL_MAX_PRICE} onClick={() => void run("list", { key: p.key, price: Number(price) })}>
                In bancarella
              </button>
            </span>
          ) : null}
          {p.kind === "cred" ? (
            <button className="btn small" disabled={!p.disclose} title={p.discloseWhy ?? "l'azienda cambia le password: non varrà più niente, per nessuno"} onClick={() => void run("disclose", { key: p.key })}>
              Avvisa l'azienda{p.disclose ? ` · ${fmtCr(p.disclose)}` : ""}
            </button>
          ) : null}
          {p.kind === "addr" ? (
            <button
              className="btn small danger"
              disabled={!p.snitch}
              title={p.snitchWhy ?? "tutti i blu sapranno dove trovarlo"}
              onClick={() => {
                if (confirm(`Vendere alla Guardia l'indirizzo di ${p.title}? Tutti i blu sapranno dove trovarlo.`)) void run("snitch", { key: p.key });
              }}
            >
              Alla Guardia{p.snitch ? ` · ${fmtCr(p.snitch)}` : ""}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
