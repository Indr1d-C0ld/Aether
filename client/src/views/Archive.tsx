// Console: archivi delle persone (anagrafe, casellario, atenei), conti bancari e bonifici, arsenale di exploit.
import { useCallback, useEffect, useRef, useState } from "react";
import type { OpView, RecordView } from "../../../shared/types.ts";
import { clockShort, fmtCr } from "../../../shared/rules.ts";
import { WARRANT, rarityColor, rarityName } from "../../../shared/depth.ts";
import { net } from "../net.ts";
import { Art, art } from "../art.tsx";
import type { DeckCtx } from "./Deck.tsx";
import { Decode, PhotoShuffle, cine, preloadPhotos, shoot } from "../cinema.tsx";

const TITLES: Record<string, string> = {
  gov: "Anagrafe",
  law: "Casellario giudiziario",
  edu: "Archivio studenti",
  bank: "Conti correnti",
};

export function RecordsPanel({ op, ctx }: { op: OpView; ctx: DeckCtx }) {
  const me = ctx.state.me;
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<RecordView[]>([]);
  const [total, setTotal] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const canEdit = op.access === "admin" || op.access === "client";
  // lo schedario sfogliato a raffica: scena pura, la ricerca intanto è già tornata
  const [scanning, setScanning] = useState(false);
  const scanTimer = useRef(0);
  const people = op.records!.kind === "people";
  const flip = (then?: () => void) => {
    if (!cine.get() || !people) return then?.();
    setScanning(true);
    clearTimeout(scanTimer.current);
    scanTimer.current = window.setTimeout(() => {
      setScanning(false);
      then?.();
    }, 1100);
  };
  useEffect(() => {
    preloadPhotos();
    return () => clearTimeout(scanTimer.current);
  }, []);

  const search = useCallback(async (query: string) => {
    const r = await net.do("searchRecords", { q: query });
    if (!r.ok) return;
    const d = r.data as { records: RecordView[]; total: number };
    setHits(d.records);
    setTotal(d.total);
    return d.records;
  }, []);

  // prima ricerca all'apertura; poi a ogni modifica si rilegge
  useEffect(() => {
    void search("");
  }, [search, op.targetId]);

  const rec = hits.find((r) => r.id === sel) ?? null;
  const act = async (a: string, p: Record<string, unknown>) => {
    await net.do(a, p);
    await search(q);
  };

  return (
    <div className="panel" style={{ gridColumn: "1 / -1" }}>
      <div className="panel-head">
        <span className="label">{TITLES[op.target.kind] ?? "Archivio"}</span>
        <span className="faint">{op.records!.count} fascicoli</span>
      </div>
      <div className="panel-body list">
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            setSel(null);
            const found = search(q);
            // una sola scheda: lo schedario si ferma lì
            flip(() => void found.then((rs) => rs?.length === 1 && setSel(rs[0]!.id)));
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="nome, anno di nascita, mestiere, città, ID, numero di conto…" style={{ flex: 1, minWidth: 180 }} />
          <button className="btn">Cerca</button>
        </form>
        <span className="faint" style={{ fontSize: 12 }}>
          {total > hits.length ? `${total} risultati: ne vedi ${hits.length}. Restringi la ricerca.` : `${total} risultati`}
          {op.target.kind === "law" ? " · cerca «alias» per i fascicoli degli handle" : ""}
        </span>
        <div className="archive">
          <div className="archive-list">
            {hits.map((r) => (
              <button key={r.id} className={`archive-row ${r.id === sel ? "on" : ""}`} onClick={() => (r.id === sel ? null : (setSel(null), flip(() => setSel(r.id))))}>
                {r.photo ? <Art src={art.person(r.photo)} size={32} className="mugshot" /> : <span className="mugshot none">?</span>}
                <span style={{ minWidth: 0 }}>
                  <div>{r.name}</div>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {r.sub}
                  </div>
                </span>
              </button>
            ))}
            {!hits.length ? <p className="dim" style={{ margin: 8 }}>Nessun fascicolo.</p> : null}
          </div>
          <div className="archive-card">
            {scanning ? (
              <PhotoShuffle total={op.records!.count} />
            ) : rec ? (
              <>
                <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                  {rec.photo ? (
                    <span className="cine-develop" key={rec.id}>
                      <Art src={art.person(rec.photo)} size={128} className="mugshot big" />
                      <b>MATCH</b>
                    </span>
                  ) : null}
                  <div style={{ minWidth: 0 }}>
                    <div className="px" style={{ fontSize: 28, lineHeight: 1 }}>
                      <Decode key={rec.id} text={rec.name} />
                    </div>
                    <div className="dim" style={{ fontSize: 13 }}>
                      {rec.sub}
                    </div>
                  </div>
                </div>
                {rec.fields.map((f) => (
                  <label key={f.key} className="spread">
                    <span className="dim">{f.label}</span>
                    {f.options.length > 1 && canEdit ? (
                      <select value={f.value} onChange={(e) => void act("alter", { recordId: rec.id, field: f.key, value: e.target.value })}>
                        {f.options.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <span>
                        <Decode key={rec.id} text={f.value} ms={500} />
                      </span>
                    )}
                  </label>
                ))}
                {rec.account ? <AccountBox rec={rec} op={op} myAccount={me.account} after={() => search(q)} /> : null}
                {rec.alias ? (
                  <div className="list" style={{ gap: 6 }}>
                    <span className="chip red">{WARRANT[rec.alias.warrant]!.name}</span>
                    {rec.alias.charges.map((c, i) => (
                      <div key={i} className="t-amber" style={{ fontSize: 13 }}>
                        · {c}
                      </div>
                    ))}
                    <button className="btn danger" disabled={op.access !== "admin"} onClick={() => void act("clearCharges", { recordId: rec.id })}>
                      Svuota il fascicolo
                    </button>
                    <span className="faint" style={{ fontSize: 12 }}>
                      Le accuse spariscono dal casellario. La cancellazione resta nel log.
                    </span>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="dim" style={{ margin: 0 }}>
                Scegli un fascicolo dall'elenco.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountBox({ rec, op, myAccount, after }: { rec: RecordView; op: OpView; myAccount: string; after: () => void }) {
  const acct = rec.account!;
  const max = acct.cap;
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <div className="list" style={{ gap: 8 }}>
      <div className="spread">
        <span className="dim">Conto</span>
        <span>{acct.number}</span>
      </div>
      <div className="spread">
        <span className="dim">Saldo</span>
        <span className="px t-amber" style={{ fontSize: 24 }}>
          {fmtCr(acct.balance)}
        </span>
      </div>
      {op.access === "admin" ? (
        <form
          className="list"
          style={{ gap: 6, borderTop: "1px solid var(--line)", paddingTop: 8 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await net.do("transfer", { from: acct.number, to, amount: Number(amount) });
            if (r.ok) shoot("money", "BONIFICO IN USCITA", { amount: Number(amount), sub: `${acct.number} ▸ ${to}` });
            else shoot("denied", "TRANSAZIONE RESPINTA", { sub: r.error ?? undefined });
            after();
          }}
        >
          <span className="label">Bonifico</span>
          <div className="row">
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="conto di destinazione" style={{ flex: 1, minWidth: 140 }} />
            <button type="button" className="btn small" onClick={() => setTo(myAccount)} title="Il tuo conto">
              il mio
            </button>
          </div>
          <div className="row">
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder={`importo (max ${max})`} style={{ flex: 1, minWidth: 120 }} />
            <button className="btn" disabled={!to || !Number(amount) || !op.bypass.firewall}>
              Trasferisci
            </button>
          </div>
          <span className="faint" style={{ fontSize: 12 }}>
            L'antifrode ferma i movimenti oltre {fmtCr(max)} da questo conto, e dopo un colpo il tuo conto resta segnalato per dieci minuti. Il denaro
            mandato a un handle resta in transito finché la banca indaga: se dal log risalgono a qualcuno, torna indietro.
          </span>
        </form>
      ) : null}
    </div>
  );
}

export function LedgerPanel({ op, ctx }: { op: OpView; ctx: DeckCtx }) {
  const blue = ctx.state.me.faction === "blue";
  const rows = [...(op.ledger ?? [])].reverse();
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">Registro dei movimenti</span>
        <span className="faint">{rows.length}</span>
      </div>
      <div className="panel-body list" style={{ gap: 4 }}>
        {rows.length ? (
          rows.map((l) => (
            <div key={l.id} className="spread" style={{ fontSize: 13, opacity: l.reversed ? 0.5 : 1 }}>
              <span>
                <span className="faint">{clockShort(l.at)}</span> {l.from} → {l.to}
              </span>
              <span className="row">
                <span className="t-amber">{fmtCr(l.amount)}</span>
                {l.reversed ? <span className="chip">stornato</span> : blue ? <button className="btn small" onClick={() => void net.do("reverseTransfer", { id: l.id })}>Storna</button> : null}
              </span>
            </div>
          ))
        ) : (
          <p className="dim" style={{ margin: 0 }}>
            Nessun movimento recente.
          </p>
        )}
      </div>
    </div>
  );
}

/** Exploit monouso e carichi da consegnare: quello che hai in archivio e puoi usare qui. */
export function Arsenal({ op, ctx }: { op: OpView; ctx: DeckCtx }) {
  const me = ctx.state.me;
  const exploits = me.storage.filter((s) => s.item?.kind === "exploit" || s.item?.kind === "gadget");
  const cargo = me.storage.filter((s) => s.cargo);
  if (!exploits.length && !cargo.length) return null;
  const frozen = op.frozenUntil > ctx.serverNow;
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">Arsenale</span>
        {frozen ? <span className="chip green">trace congelato {Math.ceil((op.frozenUntil - ctx.serverNow) / 1000)}s</span> : null}
      </div>
      <div className="panel-body list" style={{ gap: 6 }}>
        {exploits.map((s) => (
          <div key={s.key} className="spread">
            <span style={{ minWidth: 0 }}>
              <span style={{ color: rarityColor(s.item!.rarity) }}>{s.item!.name}</span> <span className="faint" style={{ fontSize: 11 }}>{rarityName(s.item!.rarity)}</span>
              <div className="faint" style={{ fontSize: 12 }}>
                {s.item!.desc}
              </div>
            </span>
            <button className="btn small" disabled={s.item!.kind === "gadget" && (me.cooldowns[s.item!.code] ?? 0) > ctx.serverNow} onClick={() => void net.do("useItem", { key: s.key })}>
              {s.item!.kind === "gadget" ? ((me.cooldowns[s.item!.code] ?? 0) > ctx.serverNow ? `${Math.ceil(((me.cooldowns[s.item!.code] ?? 0) - ctx.serverNow) / 60_000)}′` : "Attiva") : "Usa"}
            </button>
          </div>
        ))}
        {cargo.map((s) => {
          const left = Math.max(0, Math.round(((s.expiresAt ?? 0) - ctx.serverNow) / 1000));
          return (
            <div key={s.key} className="spread">
              <span>
                {s.name} <span className="faint">{s.size} GQ</span>
                <div className={left < 120 ? "t-red" : "t-amber"} style={{ fontSize: 12 }}>
                  {left ? `si corrompe fra ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "corrotto"}
                </div>
              </span>
              <button className="btn small" disabled={!left || op.access !== "admin" || !op.bypass.firewall} onClick={() => void net.do("upload", { key: s.key })}>
                Carica qui
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
