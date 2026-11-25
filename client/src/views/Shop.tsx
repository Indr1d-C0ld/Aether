import { CROSS_CHANNEL, gatewaySec, socBoost, socCooldown, socPresidia, socSensors, HARDWARE, MAX_HW, MAX_TOOL_VERSION, TOOLS, cpuPower, fmtCr, hwCost, maxHops, maxTasks, modemSpeed, storageCap, toolCost } from "../../../shared/rules.ts";
import { net } from "../net.ts";
import { Art, art } from "../art.tsx";
import type { DeckCtx } from "./Deck.tsx";
import { useState } from "react";
import { BlackMarket, Bounties } from "./Market.tsx";
import { IntelMarket } from "./Intel.tsx";

type Tab = "gear" | "black" | "intel" | "bounty";

export function Shop({ ctx }: { ctx: DeckCtx }) {
  const [tab, setTab] = useState<Tab>("gear");
  return (
    <div className="list" style={{ gap: 14 }}>
      <div className="view-title">
        <h2>Mercato</h2>
        <span className="t-amber px" style={{ fontSize: 24 }}>
          {fmtCr(ctx.state.me.credits)}
        </span>
      </div>
      <div className="tabs">
        <button className={tab === "gear" ? "on" : ""} onClick={() => setTab("gear")}>
          Attrezzatura
        </button>
        <button className={tab === "black" ? "on" : ""} onClick={() => setTab("black")}>
          Mercato nero {ctx.state.market.length ? `· ${ctx.state.market.length}` : ""}
        </button>
        <button className={tab === "intel" ? "on" : ""} onClick={() => setTab("intel")}>
          Informazioni
        </button>
        <button className={tab === "bounty" ? "on" : ""} onClick={() => setTab("bounty")}>
          Taglie
        </button>
      </div>
      {tab === "gear" ? <Gear ctx={ctx} /> : tab === "black" ? <BlackMarket ctx={ctx} /> : tab === "intel" ? <IntelMarket ctx={ctx} /> : <Bounties ctx={ctx} />}
    </div>
  );
}

function Gear({ ctx }: { ctx: DeckCtx }) {
  const me = ctx.state.me;
  // stesso catalogo per tutti; prima gli strumenti del proprio canale, poi quelli dell'altro (con sovrapprezzo)
  const cross = (t: (typeof TOOLS)[number]) => t.faction !== "any" && t.faction !== me.faction;
  const tools = [...TOOLS].sort((a, b) => Number(cross(a)) - Number(cross(b)));
  const hwNote = (id: string, l: number) => {
    if (id === "cpu") return `potenza ×${cpuPower(l).toFixed(1)}`;
    if (id === "modem") return `${modemSpeed(l)} GQ/s · ${maxHops(l)} hop`;
    if (id === "memory") return `${maxTasks(l)} task · ${storageCap(l)} GQ`;
    if (id === "soc") return `${socPresidia(l)} presidi · ${socSensors(l)} sensori · contro-trace ×${socBoost(l).toFixed(1)} ogni ${socCooldown(l)}s`;
    const g = gatewaySec(l);
    return `proxy ${g.proxy} · firewall ${g.firewall} · monitor ${g.monitor}`;
  };
  return (
    <div className="list" style={{ gap: 14 }}>
      <section className="list">
        <span className="label">Hardware del gateway</span>
        <div className="grid2">
          {HARDWARE.filter((h) => !h.faction || h.faction === me.faction).map((h) => {
            const l = me.hw[h.id];
            const max = l >= MAX_HW;
            return (
              <div key={h.id} className="panel">
                <div className="panel-head">
                  <span className="label">{h.name}</span>
                  <span className="px" style={{ fontSize: 22 }}>
                    {"▮".repeat(l)}
                    <span className="faint">{"▯".repeat(MAX_HW - l)}</span>
                  </span>
                </div>
                <div className="panel-body list">
                  <span className="dim" style={{ fontSize: 13 }}>{h.blurb}</span>
                  <span style={{ fontSize: 13 }}>
                    ora: {hwNote(h.id, l)}
                    {!max ? <span className="t-fac"> → {hwNote(h.id, l + 1)}</span> : null}
                  </span>
                  <button className="btn" disabled={max || me.credits < hwCost(l)} onClick={() => void net.do("buyHw", { hw: h.id })}>
                    {max ? "Al massimo" : `Potenzia · ${fmtCr(hwCost(l))}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="list">
        <span className="label">Software · {me.faction === "red" ? "mercato nero di Pale Market" : "forniture del CERT"}</span>
        <div className="grid2">
          {tools.map((t) => {
            const v = me.tools[t.id] ?? 0;
            const next = v + 1;
            const max = v >= MAX_TOOL_VERSION;
            return (
              <div key={t.id} className="panel">
                <div className="panel-head">
                  <span className="label row" style={{ gap: 8 }}>
                    <Art src={art.tool(t.id)} size={32} />
                    {t.name}
                  </span>
                  <span className={`chip ${v ? "green" : ""}`}>{v ? `v${v}` : "non installato"}</span>
                </div>
                <div className="panel-body list">
                  {cross(t) ? (
                    <span className="chip amber" style={{ justifySelf: "start" }}>
                      fuori canale · {me.faction === "red" ? "forniture CERT" : "mercato nero"} · prezzo ×{CROSS_CHANNEL}
                    </span>
                  ) : null}
                  <span style={{ fontSize: 13 }}>{t.blurb}</span>
                  <span className="dim" style={{ fontSize: 12 }}>{t.versions.join(" · ")}</span>
                  <button className="btn" disabled={max || me.credits < toolCost(t.id, next, me.faction)} onClick={() => void net.do("buyTool", { tool: t.id })}>
                    {max ? "Versione massima" : `${v ? "Aggiorna a" : "Compra"} v${next} · ${fmtCr(toolCost(t.id, next, me.faction))}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
