// La Cronaca: quello che è successo davvero nel Reticolo, e lo stato delle organizzazioni che lo abitano.
import { useCallback, useEffect, useState } from "react";
import type { NewsKind, OrgView, WorldView } from "../../../shared/orgs.ts";
import { EMERGENCY_AT, NEWS_LABEL } from "../../../shared/orgs.ts";
import { KIND_LABEL, fmtCr } from "../../../shared/rules.ts";
import type { LawView } from "../../../shared/law.ts";
import { MOOD_LABEL, RALLY_RATIO, SCANDAL_AT, TRUST_HIGH, TRUST_LOW } from "../../../shared/law.ts";
import { net } from "../net.ts";
import type { DeckCtx } from "./Deck.tsx";

const TONE: Record<NewsKind, string> = { sabotaggio: "red", intrusione: "red", guerra: "amber", virus: "amber", economia: "", difesa: "green", legge: "fac", gente: "" };
const day = (at: number, now: number) => {
  const d = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86400_000);
  return d <= 0 ? "Oggi" : d === 1 ? "Ieri" : `${d} giorni fa`;
};
const hhmm = (at: number) => new Date(at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
const Bar = ({ v, tone }: { v: number; tone: string }) => (
  <span className="org-bar">
    <i style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: `var(--${tone})` }} />
  </span>
);

export function WorldPanel({ ctx }: { ctx: DeckCtx }) {
  const [w, setW] = useState<WorldView | null>(null);
  const [org, setOrg] = useState<OrgView | null>(null);
  const [filter, setFilter] = useState<NewsKind | "tutte">("tutte");
  const load = useCallback(async () => {
    const r = await net.do("world", {}, true);
    if (r.ok) setW(r.data as WorldView);
  }, []);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);
  const open = async (id: string | null) => {
    if (!id) return;
    const r = await net.do("world", { cmd: "org", id }, true);
    if (r.ok) setOrg(r.data as OrgView);
  };
  if (!w) return <p className="dim">Sfoglio i giornali…</p>;
  const rows = w.news.filter((n) => filter === "tutte" || n.kind === filter);
  let last = "";

  return (
    <div className="list" style={{ gap: 14 }}>
      <div className="view-title">
        <div>
          <h1>Cronaca</h1>
          <p className="dim" style={{ margin: 0 }}>
            Niente di inventato: ogni riga è una cosa che qualcuno, giocatore o abitante, ha fatto davvero. Le organizzazioni se la ricordano.
          </p>
        </div>
      </div>
      {w.emergencyUntil > ctx.serverNow ? (
        <div className="chip red" style={{ alignSelf: "flex-start" }}>
          Stato d'emergenza: indagini più rapide e custodie più lunghe ancora per {Math.ceil((w.emergencyUntil - ctx.serverNow) / 3600_000)} h
        </div>
      ) : null}
      {w.law ? <LawPanel law={w.law} now={ctx.serverNow} /> : null}
      <div className="grid2">
        <div className="panel">
          <div className="panel-head">
            <span className="label">Notizie</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value as NewsKind | "tutte")} aria-label="Filtra le notizie">
              <option value="tutte">tutte</option>
              {(Object.keys(NEWS_LABEL) as NewsKind[]).map((k) => (
                <option key={k} value={k}>
                  {NEWS_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="panel-body list" style={{ gap: 6, maxHeight: 560, overflowY: "auto" }}>
            {rows.map((n) => {
              const d = day(n.at, ctx.serverNow);
              const head = d !== last;
              last = d;
              return (
                <div key={n.id}>
                  {head ? <div className="label" style={{ margin: "6px 0 4px" }}>{d}</div> : null}
                  <div className="news-row">
                    <span className="faint">{hhmm(n.at)}</span>
                    <span className={`chip ${TONE[n.kind]}`}>{NEWS_LABEL[n.kind]}</span>
                    <span>
                      {n.text}{" "}
                      {n.org ? (
                        <button className="linklike" onClick={() => void open(n.org)}>
                          scheda
                        </button>
                      ) : null}
                    </span>
                  </div>
                </div>
              );
            })}
            {!rows.length ? <p className="dim" style={{ margin: 0 }}>Ancora nessuna notizia. Il mondo si è appena acceso: qualcuno sta per fare qualcosa.</p> : null}
          </div>
        </div>

        <div className="list" style={{ gap: 14 }}>
          {org ? (
            <div className="panel">
              <div className="panel-head">
                <span className="label">{org.name}</span>
                <span className={`chip ${org.status === "attiva" ? "green" : "red"}`}>{org.status}</span>
              </div>
              <div className="panel-body list" style={{ gap: 6 }}>
                <div className="faint" style={{ fontSize: 12 }}>
                  {KIND_LABEL[org.kind as keyof typeof KIND_LABEL] ?? org.kind} · {org.city}
                  {org.group ? ` · gruppo ${org.group}` : ""}
                  {org.cuts ? " · turno di notte tagliato" : ""}
                </div>
                <div className="org-stat">
                  <span>Cassa</span>
                  <b className={org.cash < 0 ? "t-red" : ""}>{fmtCr(org.cash)}</b>
                </div>
                <div className="org-stat">
                  <span>Reputazione</span>
                  <Bar v={org.rep} tone="cyan" />
                </div>
                <div className="org-stat">
                  <span>Morale</span>
                  <Bar v={org.morale} tone="green" />
                </div>
                <div className="org-stat">
                  <span>Paura</span>
                  <Bar v={org.fear} tone="red" />
                </div>
                <div className="org-stat">
                  <span>Difese</span>
                  <b>
                    proxy {org.sec.proxy} · firewall {org.sec.firewall} · monitor {org.sec.monitor}
                    {org.sec.proxy + org.sec.firewall + org.sec.monitor > org.base.proxy + org.base.firewall + org.base.monitor ? " (rafforzate)" : ""}
                  </b>
                </div>
                <div className="label" style={{ marginTop: 6 }}>Concorrenti</div>
                {org.rivals.map((r) => (
                  <div key={r.id} className="spread" style={{ fontSize: 13 }}>
                    <button className="linklike" onClick={() => void open(r.id)}>
                      {r.name}
                    </button>
                    <span className={r.war ? "t-red" : "faint"}>{r.war ? "in guerra" : r.heat >= 3 ? "accuse pubbliche" : r.heat ? "sospetti" : "rapporti freddi"}</span>
                  </div>
                ))}
                {org.history.length ? <div className="label" style={{ marginTop: 6 }}>Ultimi fatti</div> : null}
                {org.history.map((h, i) => (
                  <div key={i} className="dim" style={{ fontSize: 12 }}>
                    <span className="faint">{day(h.at, ctx.serverNow).toLowerCase()} {hhmm(h.at)}</span> · {h.text}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="panel">
            <div className="panel-head">
              <span className="label">In evidenza</span>
              <span className="faint">{w.intrusions24h}/{EMERGENCY_AT} intrusioni in 24 h</span>
            </div>
            <div className="panel-body list" style={{ gap: 4 }}>
              {w.wars.map((x) => (
                <div key={x.a + x.b} className="spread" style={{ fontSize: 13 }}>
                  <span>
                    <button className="linklike" onClick={() => void open(x.a)}>{x.aName}</button> contro <button className="linklike" onClick={() => void open(x.b)}>{x.bName}</button>
                  </span>
                  <span className="t-amber">guerra · {Math.ceil((x.until - ctx.serverNow) / 3600_000)} h</span>
                </div>
              ))}
              {w.alerts.map((a) => (
                <div key={a.region} className="spread" style={{ fontSize: 13 }}>
                  <span>Allerta virus: {a.region}</span>
                  <span className="t-amber">{Math.ceil((a.until - ctx.serverNow) / 3600_000)} h</span>
                </div>
              ))}
              {w.crisis.map((x) => (
                <div key={x.id} className="spread" style={{ fontSize: 13 }}>
                  <button className="linklike" onClick={() => void open(x.id)}>{x.name}</button>
                  <span className="t-red">{fmtCr(x.cash)}</span>
                </div>
              ))}
              {w.hit.map((x) => (
                <div key={x.id} className="spread" style={{ fontSize: 13 }}>
                  <button className="linklike" onClick={() => void open(x.id)}>{x.name}</button>
                  <span className="faint">paura {x.fear}</span>
                </div>
              ))}
              {!w.wars.length && !w.crisis.length && !w.hit.length && !w.alerts.length ? <p className="dim" style={{ margin: 0 }}>Tutto tranquillo. Per ora.</p> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Leggi e contrappesi: la fiducia nella Guardia e l'aiuto da fuori. */
function LawPanel({ law, now }: { law: LawView; now: number }) {
  const tone = law.mood === "scandalo" ? "red" : law.mood === "bassa" ? "amber" : law.mood === "alta" ? "green" : "cyan";
  const tot = law.war24.red + law.war24.blue;
  const ys = law.hist;
  const lo = Math.max(0, Math.min(...ys) - 5);
  const hi = Math.min(100, Math.max(...ys) + 5);
  const path = ys.length > 1 ? ys.map((v, i) => `${i ? "L" : "M"}${((i / (ys.length - 1)) * 300).toFixed(1)},${(34 - ((v - lo) / (hi - lo || 1)) * 32).toFixed(1)}`).join(" ") : "";
  const hours = (t: number) => Math.max(1, Math.ceil((t - now) / 3600_000));
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">Legge e contrappesi</span>
        <span className="row" style={{ gap: 6 }}>
          <span className={`chip ${tone}`}>{MOOD_LABEL[law.mood]}</span>
          {law.rally ? <span className={`chip ${law.rally.side === "red" ? "red" : "cyan"}`}>aiuto da fuori ai {law.rally.side === "red" ? "rossi" : "blu"} · {hours(law.rally.until)} h</span> : null}
        </span>
      </div>
      <div className="panel-body law-grid">
        <div className="list" style={{ gap: 6 }}>
          <div className="spread">
            <span>Fiducia nella Guardia del Reticolo</span>
            <b className="px" style={{ fontSize: 26, color: `var(--${tone})` }}>
              {law.trust}
            </b>
          </div>
          <div className="law-meter" role="img" aria-label={`fiducia ${law.trust} su 100`}>
            <i style={{ width: `${law.trust}%`, background: `var(--${tone})` }} />
            <b style={{ left: `${SCANDAL_AT}%` }} title="scandalo" />
            <b style={{ left: `${TRUST_LOW}%` }} title="fiducia bassa" />
            <b style={{ left: `${TRUST_HIGH}%` }} title="fiducia alta" />
          </div>
          {path ? (
            <svg className="law-spark" viewBox="0 0 300 36" preserveAspectRatio="none" role="img" aria-label="andamento della fiducia nelle ultime ore">
              <path d={path} fill="none" stroke={`var(--${tone})`} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
          ) : null}
          {law.mood === "scandalo" ? <span className="t-red">Scandalo: poteri speciali sospesi ancora per {hours(law.scandalUntil)} h.</span> : null}
          <span className="faint" style={{ fontSize: 12 }}>
            {law.effects.length ? law.effects.join(" · ") : "nessun effetto: la Guardia lavora come sempre"}
          </span>
        </div>
        <div className="list" style={{ gap: 6 }}>
          <div className="spread">
            <span>Guerra nelle ultime 24 ore</span>
            <span>
              <b style={{ color: "var(--red)" }}>{law.war24.red}</b> · <b style={{ color: "var(--cyan)" }}>{law.war24.blue}</b>
            </span>
          </div>
          <div className="law-meter split">
            <i style={{ width: `${tot ? (law.war24.red / tot) * 100 : 50}%`, background: "var(--red)" }} />
            <i style={{ width: `${tot ? (law.war24.blue / tot) * 100 : 50}%`, background: "var(--cyan)" }} />
          </div>
          <span className="faint" style={{ fontSize: 12 }}>
            {law.rally ? law.rally.text : `Se una parte resta sotto il ${Math.round(RALLY_RATIO * 100)}% dei punti dell'altra, riceve aiuto da fuori.`}
          </span>
        </div>
      </div>
    </div>
  );
}
