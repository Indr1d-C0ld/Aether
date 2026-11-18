import { useMemo, useState } from "react";
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
