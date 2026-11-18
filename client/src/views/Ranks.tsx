import { useState } from "react";
import type { BoardRow } from "../../../shared/types.ts";
import { fmtCr } from "../../../shared/rules.ts";
import type { DeckCtx } from "./Deck.tsx";
import { Art, art } from "../art.tsx";

const TABS: { id: string; label: string; key: keyof BoardRow; hint: string; filter?: "red" | "blue" }[] = [
  { id: "xp", label: "Reputazione", key: "xp", hint: "Esperienza accumulata con i contratti." },
  { id: "fame", label: "Fama", key: "fame", hint: "Quanto si parla di te: imprese, colpi grossi, arresti. Sbiadisce se sparisci." },
  { id: "feats", label: "Imprese", key: "feats", hint: "Imprese compiute." },
  { id: "credits", label: "Patrimonio", key: "credits", hint: "Crediti in cassa." },
  { id: "ghost", label: "Fantasmi", key: "ghostScore", hint: "Indagini chiuse senza un nome, meno le volte in cui sei stato tracciato.", filter: "red" },
  { id: "sab", label: "Sabotaggio", key: "sabotage", hint: "Rimbalzi avvelenati e incastri riusciti.", filter: "red" },
  { id: "def", label: "Difesa", key: "defense", hint: "Attribuzioni, contro-trace, trappole e bonifiche.", filter: "blue" },
];

export function Ranks({ ctx }: { ctx: DeckCtx }) {
  const [tab, setTab] = useState("xp");
  const t = TABS.find((x) => x.id === tab)!;
  const rows = ctx.state.board.filter((r) => !t.filter || r.faction === t.filter).sort((a, b) => Number(b[t.key]) - Number(a[t.key]));
  return (
    <div className="list" style={{ gap: 14 }}>
      <div className="view-title">
        <h2>Classifiche</h2>
        <div className="tabs">
          {TABS.map((x) => (
            <button key={x.id} className={x.id === tab ? "on" : ""} onClick={() => setTab(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <p className="dim" style={{ margin: 0 }}>{t.hint}</p>
      <div className="panel">
        <div className="panel-body" style={{ overflowX: "auto" }}>
          <table className="board">
            <thead>
              <tr>
                <th>#</th>
                <th>Handle</th>
                <th>Rango</th>
                <th>{t.label}</th>
                <th>Calore</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.handle} className={r.you ? "you" : ""}>
                  <td className="px" style={{ fontSize: 20 }}>{i + 1}</td>
                  <td>
                    {r.npc ? <Art src={art.npc(r.handle)} size={24} className="npc-face" /> : null}
                    <span className={r.faction === "red" ? "t-mag" : "t-cyan"}>{r.handle}</span>{" "}
                    {r.npc ? <span className="faint" style={{ fontSize: 11 }}>npc</span> : r.online ? <span className="t-green" style={{ fontSize: 11 }}>● online</span> : null}
                    <div className="faint" style={{ fontSize: 11 }}>
                      {r.fameTitle}
                      {r.warrant >= 2 ? <span className="t-red"> · ricercato</span> : null}
                    </div>
                  </td>
                  <td className="dim">{r.rank}</td>
                  <td className="px" style={{ fontSize: 20 }}>{t.key === "credits" ? fmtCr(r.credits) : String(r[t.key])}</td>
                  <td className={r.heat > 70 ? "t-red" : "dim"}>{r.heat}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
