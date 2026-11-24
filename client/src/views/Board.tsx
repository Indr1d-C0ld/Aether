import { useState } from "react";
import type { MissionView } from "../../../shared/types.ts";
import { MISSION_LABEL, fmtCr, toolDef } from "../../../shared/rules.ts";
import { net } from "../net.ts";
import type { DeckCtx } from "./Deck.tsx";
import { MOD_INFO, TIER_NAME, rarityColor } from "../../../shared/depth.ts";

export function Board({ ctx }: { ctx: DeckCtx }) {
  const { state } = ctx;
  const mine = state.missions.filter((m) => m.mine);
  const open = state.missions.filter((m) => !m.mine && m.status === "open");
  return (
    <div className="list" style={{ gap: 14 }}>
      <div className="view-title">
        <h2>Bacheca</h2>
        <span className="dim">{state.me.faction === "red" ? "Lavori dal sottobosco del Reticolo." : "Incarichi da clienti, CERT e assicurazioni."}</span>
      </div>
      <section className="list">
        <span className="label">I tuoi contratti ({mine.length}/3)</span>
        {mine.length ? mine.map((m) => <MissionCard key={m.id} m={m} ctx={ctx} />) : <p className="dim">Nessun contratto aperto.</p>}
      </section>
      <section className="list">
        <span className="label">Disponibili</span>
        <div className="grid2">
          {open.map((m) => (
            <MissionCard key={m.id} m={m} ctx={ctx} />
          ))}
        </div>
      </section>
    </div>
  );
}

function MissionCard({ m, ctx }: { m: MissionView; ctx: DeckCtx }) {
  const { state } = ctx;
  const me = state.me;
  const [ip, setIp] = useState("");
  const locked = me.xp < m.minXp;
  const missing = m.requires.filter((t) => !me.tools[t]);
  const mins = Math.max(0, Math.round((m.expiresAt - ctx.serverNow) / 60000));
  return (
    <div className="panel" style={m.mine ? { borderColor: "var(--faction)" } : undefined}>
      <div className="panel-head">
        <span className="label t-fac">
          {MISSION_LABEL[m.type]}
          {m.tier ? (
            <span className="chip" style={{ marginLeft: 8, color: rarityColor(m.tier), borderColor: rarityColor(m.tier) }}>
              {TIER_NAME[m.tier]}
            </span>
          ) : null}
        </span>
        <span className="t-amber px" style={{ fontSize: 20 }}>
          {fmtCr(m.reward)} · {m.xp} XP
        </span>
      </div>
      <div className="panel-body list">
        <div className="px" style={{ fontSize: 26, lineHeight: 1 }}>
          {m.title}
        </div>
        <p style={{ margin: 0, fontSize: 14 }}>{m.brief}</p>
        {m.objectives.length ? (
          <ul className="objectives">
            {m.objectives.map((o, i) => (
              <li key={i} className={m.mine && o.have >= o.n ? "done" : ""}>
                <span className="box">{m.mine && o.have >= o.n ? "■" : "□"}</span> {o.label}
                {m.mine && o.n > 1 ? (
                  <span className="faint">
                    {" "}
                    {o.have}/{o.n}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {m.mods.length ? (
          <p className="t-amber" style={{ margin: 0, fontSize: 12 }}>
            {m.mods.map((mod) => MOD_INFO[mod].desc).join(" ")}
          </p>
        ) : null}
        <div className="row" style={{ fontSize: 12 }}>
          <span className="chip">
            {m.where}
          </span>
          {m.requires.map((t) => (
            <span key={t} className={`chip ${me.tools[t] ? "green" : "red"}`}>
              {toolDef(t).name}
            </span>
          ))}
          {m.clientAccess ? <span className="chip fac">credenziali cliente</span> : null}
          {m.postedBy ? <span className="chip amber">taglia di {m.postedByMe ? "te" : m.postedBy}</span> : null}
          {m.minXp ? <span className={`chip ${locked ? "red" : ""}`}>min {m.minXp} XP</span> : null}
          {m.limitMin ? <span className="chip red">{m.limitMin} minuti da quando accetti</span> : null}
          {mins < 600 ? <span className={`chip ${mins < 15 ? "red" : ""}`}>scade in {mins}′</span> : null}
          {m.mods.map((mod) => (
            <span key={mod} className="chip amber" title={MOD_INFO[mod].desc}>
              {MOD_INFO[mod].name}
            </span>
          ))}
        </div>
        {m.postedByMe && !m.mine ? (
          <div className="row">
            <span className="dim" style={{ fontSize: 13 }}>
              {m.status === "taken" ? "Qualcuno ci sta lavorando." : "La tua taglia è in bacheca."}
            </span>
            <button className="btn small" disabled={m.status !== "open"} onClick={() => void net.do("cancelBounty", { id: m.id })}>
              Ritira
            </button>
          </div>
        ) : m.mine ? (
          <div className="list" style={{ gap: 8 }}>
            {m.needsAnswer ? (
              <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder={m.answerHint ?? "risposta"} />
            ) : null}
            <div className="row">
              <button className="btn primary" onClick={() => void net.do("deliver", { missionId: m.id, answer: ip })} disabled={m.needsAnswer && !ip}>
                Consegna
              </button>
              <button
                className="btn"
                onClick={() => {
                  ctx.setSelected(m.nodeId);
                  ctx.go("map");
                }}
              >
                Mostra sulla mappa
              </button>
              <button className="btn small danger" onClick={() => void net.do("abandon", { missionId: m.id })}>
                Abbandona
              </button>
            </div>
          </div>
        ) : (
          <div className="row">
            <button className="btn primary" disabled={locked} onClick={() => void net.do("take", { missionId: m.id })}>
              {locked ? "Rango insufficiente" : "Accetta"}
            </button>
            {missing.length ? <span className="t-amber" style={{ fontSize: 12 }}>ti manca: {missing.map((t) => toolDef(t).name).join(", ")}</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}
