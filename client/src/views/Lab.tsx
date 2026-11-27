// Il Laboratorio: salute del deck e antivirus per tutti; officina e creature per i rossi; campioni e firme per i blu.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LabView, ModSlot } from "../../../shared/malware.ts";
import { AV_NAME, AV_PRICE, AV_UPDATE_PRICE, KIT_NAME, KIT_PRICE, KIT_SLOTS, MODULES, SLOT_DESC, SLOT_NAME, buildStats, modDef } from "../../../shared/malware.ts";
import { fmtCr } from "../../../shared/rules.ts";
import { rarityColor, rarityName } from "../../../shared/depth.ts";
import { net } from "../net.ts";
import { sfx } from "../audio.ts";
import type { DeckCtx } from "./Deck.tsx";

const SLOTS: ModSlot[] = ["vettore", "carico", "involucro", "innesco"];
const FREE = { vettore: "", carico: "", involucro: "i-nudo", innesco: "t-subito" } as Record<ModSlot, string>;
const left = (until: number, now: number) => {
  const m = Math.max(0, Math.round((until - now) / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

export function LabPanel({ ctx }: { ctx: DeckCtx }) {
  const me = ctx.state.me;
  const [lab, setLab] = useState<LabView | null>(null);
  const [pick, setPick] = useState<Record<ModSlot, string>>(FREE);
  const [name, setName] = useState("");

  const run = useCallback(async (cmd: string, p: Record<string, unknown> = {}) => {
    const r = await net.do("mw", { cmd, ...p }, cmd === "lab");
    if (r.ok && r.data && "av" in (r.data as object)) setLab(r.data as LabView);
    if (r.ok) sfx.click();
    return r;
  }, []);
  useEffect(() => {
    void run("lab");
    const t = window.setInterval(() => void run("lab"), 20_000);
    return () => window.clearInterval(t);
  }, [run]);

  const have = useMemo(() => new Map((lab?.modules ?? []).map((m) => [m.code, m.n])), [lab]);
  const ready = SLOTS.every((s) => pick[s]);
  const stats = ready ? buildStats(pick) : null;
  if (!lab) return <p className="dim">Accendo il banco…</p>;
  const red = lab.faction === "red";
  const exploits = me.storage.filter((s) => s.item?.kind === "exploit");

  return (
    <div className="list" style={{ gap: 14 }}>
      <div className="view-title">
        <div>
          <h1>Laboratorio</h1>
          <p className="dim" style={{ margin: 0 }}>
            {red ? "Antivirus, programmi scaricati, e il banco dove si assemblano virus, trojan e RAT." : "Antivirus, programmi scaricati, campioni in quarantena e firme da pubblicare."}
          </p>
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="panel-head">
            <span className="label">Salute del deck</span>
            <span className={`chip ${lab.bugs.length ? "red" : "green"}`}>{lab.bugs.length === 1 ? "1 infezione" : lab.bugs.length ? `${lab.bugs.length} infezioni` : "nessun sintomo"}</span>
          </div>
          <div className="panel-body list">
            <div className="spread">
              <div>
                <div className="px" style={{ fontSize: 22 }}>{AV_NAME[lab.av.level]}</div>
                <div className="faint" style={{ fontSize: 12 }}>
                  {lab.av.level ? `firme di ${lab.av.sigAge === 0 ? "oggi" : lab.av.sigAge === 1 ? "ieri" : `${lab.av.sigAge} giorni fa`} · vede fino a furtività ${lab.av.sees}` : "Senza antivirus installi alla cieca, e non ti accorgi di un RAT."}
                </div>
              </div>
              {lab.av.level < 3 ? (
                <button className="btn small" disabled={me.credits < AV_PRICE[lab.av.level + 1]!} onClick={() => void run("avBuy")}>
                  {AV_NAME[lab.av.level + 1]} · {fmtCr(AV_PRICE[lab.av.level + 1]!)}
                </button>
              ) : null}
            </div>
            {lab.av.level ? (
              <div className="row">
                <button className="btn small" onClick={() => void run("avScan")}>
                  Scansiona il deck
                </button>
                <button className="btn small" disabled={lab.av.sigAge === 0} onClick={() => void run("avUpdate")} title="Gratis mentre sei collegato a un BBS">
                  {lab.av.sigAge === 0 ? "Firme aggiornate" : `Aggiorna le firme · ${fmtCr(AV_UPDATE_PRICE)}`}
                </button>
              </div>
            ) : null}
            {lab.bugs.map((b) => (
              <div key={b.kind + b.since} className="spread" style={{ borderTop: "1px solid var(--line)", paddingTop: 6 }}>
                <div>
                  <div className="t-red">{b.name}</div>
                  <div className="dim" style={{ fontSize: 12 }}>{b.desc}</div>
                </div>
                <button className="btn small" onClick={() => void run("avClean", { kind: b.kind })}>
                  Rimuovi
                </button>
              </div>
            ))}
            {lab.perks.map((p) => (
              <div key={p.name + p.until} className="spread faint" style={{ fontSize: 12 }}>
                <span>{p.name} in esecuzione</span>
                <span>ancora {left(p.until, ctx.serverNow)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="label">Programmi scaricati</span>
            <span className="faint">{lab.pending.length}/6</span>
          </div>
          <div className="panel-body list">
            {lab.pending.map((p) => (
              <div key={p.id} className="spread">
                <div>
                  <span>{p.name}</span> <span className="faint">-{p.group}</span>{" "}
                  <span className={`chip ${p.scanned === "infetto" ? "red" : p.scanned === "pulito" ? "green" : ""}`}>{p.scanned ?? "non controllato"}</span>
                </div>
                <div className="row">
                  <button className="btn small" onClick={() => void run("install", { id: p.id })}>
                    Installa
                  </button>
                  <button className="btn small" onClick={() => void run("trash", { id: p.id })}>
                    Butta
                  </button>
                </div>
              </div>
            ))}
            {!lab.pending.length ? <p className="dim" style={{ margin: 0 }}>Niente da installare. I programmi pirata si scaricano dall'area file dei BBS.</p> : null}
            <p className="faint" style={{ margin: 0, fontSize: 12 }}>
              «Pulito» vuol dire che il tuo antivirus non ha visto niente: con firme vecchie o uno scudo modesto, non è la stessa cosa.
            </p>
          </div>
        </div>
      </div>

      {red ? (
        <>
          <div className="panel">
            <div className="panel-head">
              <span className="label">Banco di assemblaggio · {KIT_NAME[lab.kit]}</span>
              {lab.kit + 1 < KIT_SLOTS.length ? (
                <button className="btn small" disabled={me.credits < KIT_PRICE[lab.kit + 1]!} onClick={() => void run("kit")}>
                  {KIT_NAME[lab.kit + 1]} ({KIT_SLOTS[lab.kit + 1]} creature) · {fmtCr(KIT_PRICE[lab.kit + 1]!)}
                </button>
              ) : null}
            </div>
            <div className="panel-body list">
              <div className="lab-slots">
                {SLOTS.map((s) => (
                  <div key={s} className="lab-slot">
                    <span className="label">{SLOT_NAME[s]}</span>
                    <span className="faint" style={{ fontSize: 11 }}>{SLOT_DESC[s]}</span>
                    {MODULES.filter((d) => d.slot === s).map((d) => {
                      const n = have.get(d.code) ?? 0;
                      const free = d.price === 0;
                      const usable = free || n > 0;
                      return (
                        <div key={d.code} className={`lab-mod ${pick[s] === d.code ? "sel" : ""} ${usable ? "" : "off"}`}>
                          <button className="lab-mod-pick" disabled={!usable} onClick={() => setPick((q) => ({ ...q, [s]: d.code }))} title={d.desc}>
                            <span style={{ color: d.rarity ? rarityColor(d.rarity) : undefined }}>{d.name}</span>
                            <span className="faint">{free ? "sempre" : n ? `×${n}` : d.rarity ? rarityName(d.rarity) : "—"}</span>
                          </button>
                          {d.price ? (
                            <button className="btn small" disabled={me.credits < Math.round(d.price * (lab.priceMult ?? 1))} onClick={() => void run("buyMod", { code: d.code })} title={(lab.priceMult ?? 1) > 1 ? "Compra un pezzo: c'è una retata, i prezzi sono saliti" : "Compra un pezzo"}>
                              +{fmtCr(Math.round(d.price * (lab.priceMult ?? 1)))}
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              {SLOTS.map((s) => (pick[s] ? <p key={s} className="dim" style={{ margin: 0, fontSize: 12 }}><b>{modDef(pick[s])!.name}:</b> {modDef(pick[s])!.desc}</p> : null))}
              <div className="lab-stats">
                <span>Resa <b>{stats ? stats.power : "—"}</b></span>
                <span>Furtività <b>{stats ? stats.stealth : "—"}</b>/10</span>
                <span>Vita <b>{stats ? `${stats.lifeH} h` : "—"}</b></span>
                <span>Replica <b>{stats ? `${stats.spread}%` : "—"}</b></span>
                <span>Parte <b>{stats ? (stats.night ? "solo di notte" : stats.delayMin ? `dopo ${stats.delayMin} min` : "subito") : "—"}</b></span>
              </div>
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("build", { name, mods: pick }).then((r) => r.ok && (setName(""), setPick(FREE)));
                }}
              >
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="Dagli un nome: finirà sui giornali" style={{ flex: 1, minWidth: 160 }} aria-label="Nome della creatura" />
                <button className="btn primary" disabled={!ready || name.trim().length < 3 || lab.builds.length >= KIT_SLOTS[lab.kit]!}>
                  {lab.builds.length >= KIT_SLOTS[lab.kit]! ? "Kit pieno" : "Assembla"}
                </button>
              </form>
              {exploits.length ? (
                <details>
                  <summary className="faint" style={{ cursor: "pointer", fontSize: 12 }}>Smonta un exploit per ricavarne un modulo ({exploits.length})</summary>
                  <div className="list" style={{ gap: 4, marginTop: 6 }}>
                    {exploits.map((s) => (
                      <div key={s.key} className="spread">
                        <span style={{ color: rarityColor(s.item!.rarity) }}>{s.item!.name}</span>
                        <button className="btn small" onClick={() => void run("strip", { key: s.key })}>
                          Smonta
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="label">Le tue creature</span>
              <span className="faint">{lab.builds.length}/{KIT_SLOTS[lab.kit]}</span>
            </div>
            <div className="panel-body list">
              {lab.builds.map((b) => (
                <div key={b.id} className="lab-build">
                  <div>
                    <b className="px" style={{ fontSize: 22 }}>«{b.name}»</b> {b.gen ? <span className="chip">variante {String.fromCharCode(65 + Math.min(25, b.gen))}</span> : null}{" "}
                    {b.signed ? <span className="chip red">firma pubblicata</span> : null}
                    <div className="dim" style={{ fontSize: 12 }}>
                      {SLOTS.map((s) => modDef(b.mods[s])?.name).join(" · ")}
                    </div>
                    <div className="faint" style={{ fontSize: 12 }}>
                      furtività {b.stats.stealth} · resa {b.stats.power} · vita {b.stats.lifeH} h · replica {b.stats.spread}% — in {b.planted === 1 ? "1 sistema" : `${b.planted} sistemi`}, {b.victims === 1 ? "1 vittima" : `${b.victims} vittime`}, {fmtCr(b.earned)} incassati
                    </div>
                  </div>
                  <div className="row">
                    <button className="btn small" disabled={me.credits < 300 * (b.gen + 1)} onClick={() => void run("repack", { build: b.id })} title="Cambia impronta: le firme pubblicate non la riconoscono più">
                      Reimpacchetta · {fmtCr(300 * (b.gen + 1))}
                    </button>
                    <button className="btn small danger" onClick={() => void run("drop", { build: b.id })}>
                      Cancella
                    </button>
                  </div>
                </div>
              ))}
              {!lab.builds.length ? <p className="dim" style={{ margin: 0 }}>Nessuna creatura. Scegli quattro moduli qui sopra e assembla la prima.</p> : null}
              <p className="faint" style={{ margin: 0, fontSize: 12 }}>
                Si impiantano dalla Console, da admin. I cavalli di Troia si caricano anche nell'area file di un BBS, travestiti da programma pirata.
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="grid2">
          <div className="panel">
            <div className="panel-head">
              <span className="label">Campioni in quarantena</span>
            </div>
            <div className="panel-body list">
              {lab.samples.map((s) => (
                <div key={s.id} className="spread">
                  <div>
                    <span>{s.name}</span> <span className="faint">furtività {s.stealth}{s.analysed ? ` · di ${s.author}` : ""}</span>
                  </div>
                  <button className="btn small" disabled={s.analysed || lab.av.level < 2} onClick={() => void run("analyse", { id: s.id })} title={lab.av.level < 2 ? "Serve lo Scudo euristico" : undefined}>
                    {s.analysed ? "Analizzato" : "Analizza e pubblica la firma"}
                  </button>
                </div>
              ))}
              {!lab.samples.length ? <p className="dim" style={{ margin: 0 }}>Nessun campione. Entra in un sistema infetto, scansiona dalla Console e metti in quarantena.</p> : null}
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <span className="label">Segnalazioni</span>
            </div>
            <div className="panel-body list">
              {lab.epidemics.map((e, i) => (
                <div key={i}>
                  <div className="spread">
                    <span className={e.name === "ceppo sconosciuto" ? "t-amber" : ""}>{e.name}</span>
                    <span className="faint">{e.nodes === 1 ? "1 sistema" : `${e.nodes} sistemi`}</span>
                  </div>
                  <div className="faint" style={{ fontSize: 12 }}>{e.where.length ? `segnalato da: ${e.where.join(", ")}` : "nessuno se n'è accorto: troppo silenzioso"}</div>
                </div>
              ))}
              {!lab.epidemics.length ? <p className="dim" style={{ margin: 0 }}>Nessun focolaio in questo momento.</p> : null}
            </div>
          </div>
        </div>
      )}

      {lab.signatures.length ? (
        <div className="panel">
          <div className="panel-head">
            <span className="label">Firme pubblicate</span>
          </div>
          <div className="panel-body list" style={{ gap: 2 }}>
            {lab.signatures.map((s, i) => (
              <div key={i} className="spread" style={{ fontSize: 13 }}>
                <span>«{s.name}» di {s.author}</span>
                <span className="faint">analizzato da {s.by}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Nella Console: i rossi impiantano una creatura, i blu scansionano e mettono in quarantena. */
export function NodeMalware({ op, faction, inside }: { op: import("../../../shared/types.ts").OpView; faction: "red" | "blue"; inside: boolean }) {
  const [lab, setLab] = useState<LabView | null>(null);
  useEffect(() => {
    if (inside) void net.do("mw", { cmd: "lab" }, true).then((r) => r.ok && setLab(r.data as LabView));
  }, [inside, op.infections.length]);
  if (!inside || ["relay", "gateway", "home"].includes(op.target.kind)) return null;
  const mine = op.infections.filter((i) => i.mine);
  const found = op.infections.filter((i) => !i.mine);
  const canPlant = faction === "red" && op.access === "admin" && !mine.length;
  if (faction === "red" && !lab?.builds.length && !mine.length) return null;
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">{faction === "red" ? "Malware" : "Antivirus"}</span>
        {found.length ? <span className="chip red">{found.length === 1 ? "1 infezione" : `${found.length} infezioni`}</span> : null}
      </div>
      <div className="panel-body list">
        {mine.map((i) => (
          <div key={i.id} className="spread">
            <span>
              «{i.name}» <span className="faint">{i.carrier} · furtività {i.stealth}</span>
            </span>
            <span className="chip green">al lavoro</span>
          </div>
        ))}
        {canPlant
          ? lab?.builds.map((b) => (
              <div key={b.id} className="spread">
                <span>
                  «{b.name}» <span className="faint">furtività {b.stats.stealth} · resa {b.stats.power}{b.signed ? " · firma pubblicata" : ""}</span>
                </span>
                <button className="btn small" onClick={() => void net.do("mw", { cmd: "plant", build: b.id })}>
                  Impianta
                </button>
              </div>
            ))
          : null}
        {faction === "blue" ? (
          <button className="btn" disabled={!lab?.av.level} onClick={() => void net.do("mw", { cmd: "scan" })}>
            {lab?.av.level ? "Scansione antivirus" : "Serve un antivirus (Laboratorio)"}
          </button>
        ) : null}
        {found.map((i) => (
          <div key={i.id} className="spread">
            <span>
              <span className="t-red">{i.name}</span> <span className="faint">{i.carrier} · furtività {i.stealth}</span>
            </span>
            <button className="btn small" onClick={() => void net.do("mw", { cmd: "quarantine", id: i.id })}>
              Quarantena
            </button>
          </div>
        ))}
        {faction === "blue" ? <p className="faint" style={{ margin: 0, fontSize: 12 }}>Sul posto il tuo antivirus vede due gradi di furtività in più. La quarantena ti lascia un campione da analizzare.</p> : null}
      </div>
    </div>
  );
}

/** Nella Console: sei admin sul gateway di chi ha un BBS, e puoi riscriverne l'insegna. */
export function DefacePanel({ op }: { op: import("../../../shared/types.ts").OpView }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  if (!op.bbsDeface) return null;
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">BBS di {op.bbsDeface.owner}</span>
        <span className="chip red">gira su questo gateway</span>
      </div>
      <form
        className="panel-body list"
        onSubmit={(e) => {
          e.preventDefault();
          void net.do("bbs", { cmd: "own:deface", text }).then((r) => setMsg(r.ok ? (r.note ?? "") : (r.error ?? "")));
        }}
      >
        <p className="dim" style={{ margin: 0 }}>
          Da qui arrivi ai file di «{op.bbsDeface.name}». Puoi riscriverne l'insegna: chi chiama nelle prossime dodici ore vedrà la tua firma, finché il sysop non la ripristina.
        </p>
        <div className="row">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={60} placeholder="Cosa lasci scritto" style={{ flex: 1, minWidth: 180 }} aria-label="Testo dello sfregio" />
          <button className="btn danger" disabled={text.trim().length < 3}>
            Sfregia l'insegna
          </button>
        </div>
        {msg ? <span className="t-amber">{msg}</span> : null}
      </form>
    </div>
  );
}
