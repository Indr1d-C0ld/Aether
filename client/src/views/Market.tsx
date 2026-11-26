import { useEffect, useMemo, useState } from "react";
import type { FenceMarket } from "../../../shared/fence.ts";
import type { BlackView } from "../../../shared/blackmarket.ts";
import { freshLabel } from "../../../shared/blackmarket.ts";
import { LEAK_NAME } from "../../../shared/leaks.ts";
import { JOB_CONDS, JOB_GOALS, jobMin } from "../../../shared/jobs.ts";
import type { MissionType } from "../../../shared/types.ts";
import { BOUNTY_FEE, BOUNTY_MAX, BOUNTY_MIN, MARKET_FEE, MISSION_LABEL, clockShort, fmtCr } from "../../../shared/rules.ts";
import { net } from "../net.ts";
import type { DeckCtx } from "./Deck.tsx";
import { rarityColor, rarityName } from "../../../shared/depth.ts";

/** Mercato nero: annunci fra giocatori e ricettatore NPC. */
export function BlackMarket({ ctx }: { ctx: DeckCtx }) {
  const me = ctx.state.me;
  const market = ctx.state.market;
  const [prices, setPrices] = useState<Record<string, string>>({});
  const used = me.storage.reduce((s, f) => s + f.size, 0);
  const [fm, setFm] = useState<FenceMarket>([]);
  const stored = me.storage.length;
  useEffect(() => {
    void net.do("fenceMarket", {}, true).then((r) => r.ok && setFm(r.data as FenceMarket));
  }, [stored]);
  const [bv, setBv] = useState<BlackView | null>(null);
  useEffect(() => {
    void net.do("black", {}, true).then((r) => r.ok && setBv(r.data as BlackView));
  }, [stored]);
  const wanted = fm.find((x) => x.wanted);
  return (
    <div className="list" style={{ gap: 14 }}>
      <p className="dim" style={{ margin: 0 }}>
        File rubati in vendita fra handle. Un file comprato vale come quello originale per consegnare un contratto. Il mercato trattiene il{" "}
        {Math.round(MARKET_FEE * 100)}% su ogni vendita; il ricettatore compra subito, ma paga poco.
      </p>
      <div className="panel">
        <div className="panel-head">
          <span className="label">In vendita</span>
          <span className="faint">{market.length} annunci</span>
        </div>
        <div className="panel-body list" style={{ gap: 6 }}>
          {market.length ? (
            market.map((l) => (
              <div key={l.id} className="file-row">
                <div>
                  <div>
                    {l.name} <span className="faint">{l.size} GQ · da {l.origin}</span>{" "}
                    {l.wanted ? <span className="chip amber">richiesto da {l.wanted} contratt{l.wanted > 1 ? "i" : "o"}</span> : null}
                  </div>
                  <div className="faint" style={{ fontSize: 12 }}>
                    venduto da <span className="t-fac">{l.seller}</span> · scade alle {clockShort(l.expiresAt)}
                  </div>
                </div>
                <div className="list" style={{ gap: 4, alignContent: "start", justifyItems: "end" }}>
                  <span className="px t-amber" style={{ fontSize: 22 }}>
                    {fmtCr(l.price)}
                  </span>
                  {l.mine ? (
                    <button className="btn small" onClick={() => void net.do("unlist", { id: l.id })}>
                      Ritira
                    </button>
                  ) : (
                    <button className="btn small primary" disabled={me.credits < l.price || used + l.size > me.storageCap} onClick={() => void net.do("buyListing", { id: l.id })}>
                      Compra
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="dim" style={{ margin: 0 }}>
              Nessun annuncio. Sii il primo a vendere.
            </p>
          )}
        </div>
      </div>
      {fm.length ? (
        <div className="panel">
          <div className="panel-head">
            <span className="label">Il ricettatore</span>
            {wanted ? <span className="chip green">oggi cerca {wanted.name}</span> : null}
          </div>
          <div className="panel-body">
            <div className="fence-grid">
              {fm.map((x) => (
                <div key={x.cat} className="spread" style={{ fontSize: 13 }}>
                  <span>{x.name}</span>
                  <span className={x.mult >= 1.2 ? "t-green" : x.mult < 0.8 ? "t-red" : "faint"}>
                    {x.mult >= 1.2 ? "paga bene" : x.mult < 0.8 ? "ne ha troppi" : "normale"} · ×{x.mult.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <p className="faint" style={{ margin: "8px 0 0", fontSize: 12 }}>
              Quello che tutti gli portano lo paga meno, quello che non vede da un po' lo paga di più. Contano anche i colpi degli abitanti. Il mercato si riprende in mezza giornata.
            </p>
          </div>
        </div>
      ) : null}
      {bv ? <ZeroDays bv={bv} now={ctx.serverNow} /> : null}
      <div className="panel">
        <div className="panel-head">
          <span className="label">Il tuo archivio</span>
          <span className="faint">
            {used}/{me.storageCap} GQ
          </span>
        </div>
        <div className="panel-body list" style={{ gap: 6 }}>
          {me.storage.length ? (
            me.storage.map((f) => {
              const fence = f.fence ?? 0;
              const price = prices[f.key] ?? String(fence * 2);
              return (
                <div key={f.key} className="file-row">
                  <div>
                    <span style={{ color: f.item || f.rarity ? rarityColor(f.item?.rarity ?? f.rarity ?? 0) : undefined }}>{f.name}</span>{" "}
                    <span className="faint">
                      {f.item ? `${f.item.kind === "chip" ? "chip" : "exploit"} · ${rarityName(f.item.rarity)}` : `${f.size} GQ · da ${ctx.state.nodes.find((n) => n.id === f.nodeId)?.org ?? "?"}`}
                    </span>
                    {f.fresh !== undefined ? <span className={f.fresh >= 0.55 ? "t-green" : f.fresh >= 0.3 ? "t-amber" : "t-red"}> · {freshLabel(f.fresh)}</span> : null}
                    {f.content ? <span className="chip amber" style={{ marginLeft: 6 }}>{LEAK_NAME[f.content.kind]} · {f.content.org}</span> : null}
                  </div>
                  <div className="row" style={{ justifyContent: "flex-end" }}>
                    <input
                      value={price}
                      onChange={(e) => setPrices({ ...prices, [f.key]: e.target.value.replace(/[^0-9]/g, "") })}
                      style={{ width: 90 }}
                      aria-label="Prezzo"
                    />
                    <button className="btn small" disabled={Number(price) < 100} onClick={() => void net.do("listFile", { key: f.key, price: Number(price) })}>
                      Metti in vendita
                    </button>
                    <button className="btn small" onClick={() => void net.do("fence", { key: f.key })}>
                      Ricettatore · {fmtCr(fence)}
                    </button>
                    {f.content?.kind === "research" ? (
                      <button className="btn small primary" onClick={() => void net.do("leak", { key: f.key, use: "rival" })} title="Lo compra il concorrente diretto: la vittima perde, e comincia a sospettare di lui">
                        Alla concorrenza
                      </button>
                    ) : null}
                    {f.content?.kind === "scandal" ? (
                      <>
                        <button className="btn small primary" onClick={() => void net.do("leak", { key: f.key, use: "press" })} title="Un giornale lo pubblica: poco denaro, molta fama, e la vittima perde reputazione">
                          A un giornale
                        </button>
                        <button className="btn small danger" onClick={() => void net.do("leak", { key: f.key, use: "blackmail" })} title="L'azienda paga perché resti nel cassetto. A volte va alla polizia">
                          Ricatta
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="dim" style={{ margin: 0 }}>
              Archivio vuoto: i file si copiano dai nodi, o si comprano qui.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const BOUNTY_TYPES: { id: MissionType; hint: string }[] = [
  { id: "copy", hint: "Un file di un nodo: arriva nel tuo archivio." },
  { id: "wipe", hint: "Un file di un nodo deve sparire." },
  { id: "raid", hint: "Qualcuno entra nel gateway di un handle e lo prosciuga o gli sabota la CPU." },
  { id: "frame", hint: "Un handle finisce sotto inchiesta per un'intrusione che non ha fatto (solo rossi)." },
  { id: "locate", hint: "Qualcuno ti porta l'indirizzo del gateway di un handle." },
];

/** Taglie: contratti pubblicati dai giocatori, con la ricompensa in deposito. */
export function Bounties({ ctx }: { ctx: DeckCtx }) {
  const { state } = ctx;
  const me = state.me;
  const targets = useMemo(() => state.nodes.filter((n) => n.kind !== "relay" && n.kind !== "registry"), [state.nodes]);
  const [type, setType] = useState<MissionType>("copy");
  const [audience, setAudience] = useState<"red" | "blue">("red");
  const [nodeId, setNodeId] = useState(targets[0]?.id ?? "");
  const [fileId, setFileId] = useState("");
  const [target, setTarget] = useState("");
  const [reward, setReward] = useState("1500");
  const [hours, setHours] = useState("6");
  const node = targets.find((n) => n.id === nodeId);
  const needsNode = type === "copy" || type === "wipe" || type === "frame";
  const needsFile = type === "copy" || type === "wipe";
  const needsTarget = type === "raid" || type === "frame" || type === "locate";
  const r = Number(reward) || 0;
  const fee = Math.ceil(r * BOUNTY_FEE);
  const mine = state.missions.filter((m) => m.postedByMe);
  const handles = state.board.filter((b) => !b.you).map((b) => b.handle);

  return (
    <div className="list" style={{ gap: 14 }}>
      <p className="dim" style={{ margin: 0 }}>
        Metti tu il lavoro in bacheca. La ricompensa resta in deposito finché qualcuno la incassa; se scade o la ritiri ti torna indietro, la
        commissione del {Math.round(BOUNTY_FEE * 100)}% no.
      </p>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          void net.do("postBounty", { type, audience: type === "frame" ? "red" : audience, nodeId, fileId, target, reward: r, hours: Number(hours) });
        }}
      >
        <div className="panel-head">
          <span className="label">Nuova taglia</span>
          <span className="t-amber">{r ? `${fmtCr(r)} + ${fmtCr(fee)} di commissione` : ""}</span>
        </div>
        <div className="panel-body list">
          <div className="tabs">
            {BOUNTY_TYPES.map((b) => (
              <button type="button" key={b.id} className={type === b.id ? "on" : ""} onClick={() => setType(b.id)}>
                {MISSION_LABEL[b.id]}
              </button>
            ))}
          </div>
          <span className="dim" style={{ fontSize: 13 }}>
            {BOUNTY_TYPES.find((b) => b.id === type)?.hint}
          </span>
          {needsNode ? (
            <label className="spread">
              <span className="dim">Nodo</span>
              <select
                value={nodeId}
                onChange={(e) => {
                  setNodeId(e.target.value);
                  setFileId("");
                }}
              >
                {targets.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.org}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {needsFile ? (
            <label className="spread">
              <span className="dim">File</span>
              <select value={fileId} onChange={(e) => setFileId(e.target.value)}>
                <option value="">— scegli —</option>
                {(node?.catalog ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {needsTarget ? (
            <label className="spread">
              <span className="dim">Handle</span>
              <input value={target} onChange={(e) => setTarget(e.target.value)} list="bounty-handles" placeholder="handle bersaglio" />
              <datalist id="bounty-handles">
                {handles.map((h) => (
                  <option key={h} value={h} />
                ))}
              </datalist>
            </label>
          ) : null}
          <label className="spread">
            <span className="dim">Bacheca</span>
            <select value={type === "frame" ? "red" : audience} disabled={type === "frame"} onChange={(e) => setAudience(e.target.value as "red" | "blue")}>
              <option value="red">cellule rosse</option>
              <option value="blue">cellule blu</option>
            </select>
          </label>
          <label className="spread">
            <span className="dim">Ricompensa (CR)</span>
            <input value={reward} onChange={(e) => setReward(e.target.value.replace(/[^0-9]/g, ""))} style={{ width: 120 }} />
          </label>
          <label className="spread">
            <span className="dim">Durata</span>
            <select value={hours} onChange={(e) => setHours(e.target.value)}>
              {[1, 3, 6, 12, 24].map((h) => (
                <option key={h} value={h}>
                  {h} ore
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn primary"
            disabled={r < BOUNTY_MIN || r > BOUNTY_MAX || me.credits < r + fee || (needsFile && !fileId) || (needsTarget && !target.trim())}
          >
            Pubblica la taglia
          </button>
        </div>
      </form>
      <Commission ctx={ctx} />
      <div className="panel">
        <div className="panel-head">
          <span className="label">Le tue taglie</span>
          <span className="faint">{mine.length}/3</span>
        </div>
        <div className="panel-body list" style={{ gap: 6 }}>
          {mine.length ? (
            mine.map((m) => (
              <div key={m.id} className="spread" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 6 }}>
                <span>
                  <span className="label t-fac">{MISSION_LABEL[m.type]}</span> {m.title}
                  <div className="faint" style={{ fontSize: 12 }}>
                    {m.status === "taken" ? "qualcuno ci sta lavorando" : "in bacheca"} · {m.faction === "red" ? "rossi" : "blu"} · scade alle {clockShort(m.expiresAt)}
                  </div>
                </span>
                <span className="row">
                  <span className="t-amber">{fmtCr(m.reward)}</span>
                  <button className="btn small" disabled={m.status !== "open"} onClick={() => void net.do("cancelBounty", { id: m.id })}>
                    Ritira
                  </button>
                </span>
              </div>
            ))
          ) : (
            <p className="dim" style={{ margin: 0 }}>
              Nessuna taglia aperta.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Commissioni: un lavoro su un sistema a scelta, con obiettivo e condizioni. */
function Commission({ ctx }: { ctx: DeckCtx }) {
  const me = ctx.state.me;
  const known = useMemo(() => ctx.state.nodes.filter((n) => !["relay", "registry", "gateway", "home"].includes(n.kind)), [ctx.state.nodes]);
  const [side, setSide] = useState<"red" | "blue">("red");
  const goals = JOB_GOALS.filter((g) => g.side === side);
  const [goal, setGoal] = useState(goals[0]!.id);
  const [nodeId, setNodeId] = useState(known[0]?.id ?? "");
  const [conds, setConds] = useState<string[]>([]);
  const [hours, setHours] = useState("6");
  const min = jobMin(conds);
  const [reward, setReward] = useState(String(min));
  const r = Number(reward) || 0;
  const fee = Math.ceil(r * BOUNTY_FEE);
  const toggle = (c: string) => {
    const next = conds.includes(c) ? conds.filter((x) => x !== c) : [...conds.filter((x) => !(c === "notte" && x === "giorno") && !(c === "giorno" && x === "notte")), c];
    setConds(next);
    // ogni condizione alza il minimo: la ricompensa lo segue, così il pulsante non si spegne senza motivo apparente
    if ((Number(reward) || 0) < jobMin(next)) setReward(String(jobMin(next)));
  };
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        void net.do("postJob", { goal, nodeId, conds, reward: r, hours: Number(hours) });
      }}
    >
      <div className="panel-head">
        <span className="label">Nuova commissione</span>
        <span className="t-amber">{r ? `${fmtCr(r)} + ${fmtCr(fee)} di commissione` : ""}</span>
      </div>
      <div className="panel-body list">
        <span className="dim" style={{ fontSize: 13 }}>
          Un lavoro su misura: scegli il sistema, cosa va fatto e come. Più condizioni metti, più deve pagare. Lo vede in bacheca la cellula che scegli.
        </span>
        <div className="tabs">
          {(["red", "blue"] as const).map((s) => (
            <button
              type="button"
              key={s}
              className={side === s ? "on" : ""}
              onClick={() => {
                setSide(s);
                setGoal(JOB_GOALS.find((g) => g.side === s)!.id);
                setConds([]);
              }}
            >
              {s === "red" ? "per i rossi" : "per i blu"}
            </button>
          ))}
        </div>
        <label className="spread">
          <span className="dim">Sistema</span>
          <select value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
            {known.map((n) => (
              <option key={n.id} value={n.id}>
                {n.org}
              </option>
            ))}
          </select>
        </label>
        <label className="spread">
          <span className="dim">Obiettivo</span>
          <select value={goal} onChange={(e) => setGoal(e.target.value)}>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        {JOB_CONDS.filter((c) => !c.side || c.side === side).map((c) => (
          <label key={c.id} className="row" style={{ gap: 8, fontSize: 13 }} title={c.hint}>
            <input type="checkbox" checked={conds.includes(c.id)} onChange={() => toggle(c.id)} />
            <span>{c.name}</span>
            <span className="faint" style={{ fontSize: 12 }}>{c.hint}</span>
          </label>
        ))}
        <label className="spread">
          <span className="dim">Ricompensa (minimo {fmtCr(min)})</span>
          <input value={reward} onChange={(e) => setReward(e.target.value.replace(/[^0-9]/g, ""))} style={{ width: 120 }} />
        </label>
        <label className="spread">
          <span className="dim">Durata</span>
          <select value={hours} onChange={(e) => setHours(e.target.value)}>
            {[1, 3, 6, 12, 24].map((h) => (
              <option key={h} value={h}>
                {h} ore
              </option>
            ))}
          </select>
        </label>
        <button className="btn primary" disabled={!nodeId || r < min || r > BOUNTY_MAX || me.credits < r + fee}>
          Pubblica la commissione
        </button>
      </div>
    </form>
  );
}

/** Il mercato nero ha una memoria: retate in corso e quanto sono ancora freschi gli 0-day. */
function ZeroDays({ bv, now }: { bv: BlackView; now: number }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">Il giro degli 0-day</span>
        {bv.raid ? <span className="chip red">retata · ancora {Math.max(1, Math.ceil((bv.raid.until - now) / 3600_000))} h</span> : <span className="faint">arresti nelle ultime 24 ore: {bv.arrests24}</span>}
      </div>
      <div className="panel-body list" style={{ gap: 8 }}>
        {bv.raid ? (
          <p className="t-amber" style={{ margin: 0 }}>
            Retata {bv.raid.why}: moduli del Laboratorio ×{bv.modMult.toFixed(2)}, il ricettatore paga exploit, chip e gadget ×{bv.fenceMult.toFixed(2)}. Cala da sola fino a sparire.
          </p>
        ) : null}
        <div className="fence-grid">
          {bv.zerodays.map((z) => (
            <div key={z.code} className="spread" style={{ fontSize: 13 }}>
              <span>{z.name}</span>
              <span className={z.fresh >= 0.55 ? "t-green" : z.fresh >= 0.3 ? "t-amber" : "t-red"}>
                {freshLabel(z.fresh)} · {Math.round(z.fresh * 100)}%
              </span>
            </div>
          ))}
        </div>
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          Ogni 0-day usato, da te o da chiunque, insegna qualcosa alle aziende: più è noto, più è facile che sui sistemi grossi la falla sia già chiusa, e allora l'exploit si brucia. Il ricettatore lo paga di
          conseguenza. Se nessuno lo usa per qualche giorno torna buono.
        </p>
      </div>
    </div>
  );
}
