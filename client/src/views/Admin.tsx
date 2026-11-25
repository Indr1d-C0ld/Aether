// Pannello dell'amministratore: panoramica e statistiche globali, regolazioni del mondo, account e iscrizioni,
// connessioni e indirizzi bloccati, messaggi, manutenzione, registro delle azioni.
// Ogni dato arriva da «admin.<azione>»: il server rifiuta chi non è staff.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { SETTING_GROUPS, type AdminAccount, type AdminSession, type AuditRow, type IpBan, type SettingDef, type Settings } from "../../../shared/admin.ts";
import { ACH_TOTAL, STAT_LABEL, TRACKS, TIER_COLOR, achId } from "../../../shared/achievements.ts";
import { HARDWARE, MISSION_LABEL, TOOLS, fmtCr } from "../../../shared/rules.ts";
import type { MissionType } from "../../../shared/types.ts";
import { net } from "../net.ts";
import type { DeckCtx } from "./Deck.tsx";

type Tab = "panoramica" | "regolazioni" | "account" | "connessioni" | "messaggi" | "bbs" | "manutenzione" | "registro";
const TABS: Tab[] = ["panoramica", "regolazioni", "account", "connessioni", "messaggi", "bbs", "manutenzione", "registro"];

const fmt = (n: number) => Math.round(n).toLocaleString("it-IT");
const when = (t: number) => (t ? new Date(t).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—");
const ago = (t: number, now: number) => {
  if (!t) return "mai";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s} s fa`;
  if (s < 3600) return `${Math.round(s / 60)} min fa`;
  if (s < 86400) return `${Math.round(s / 3600)} h fa`;
  return `${Math.round(s / 86400)} g fa`;
};
const bytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} kB`);

async function call<T = unknown>(a: string, p: Record<string, unknown> = {}) {
  const r = await net.do(`admin.${a}`, p);
  return r.ok ? (r.data as T) : null;
}

/** Ricarica un dato del pannello a intervalli. */
function usePoll<T>(a: string, p: Record<string, unknown>, ms: number) {
  const [data, setData] = useState<T | null>(null);
  const key = JSON.stringify(p);
  const load = useCallback(async () => {
    const d = await call<T>(a, JSON.parse(key) as Record<string, unknown>);
    if (d !== null) setData(d);
  }, [a, key]);
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), ms);
    return () => clearInterval(id);
  }, [load, ms]);
  return [data, load] as const;
}

export function AdminView({ ctx }: { ctx: DeckCtx }) {
  const [tab, setTab] = useState<Tab>("panoramica");
  const [focus, setFocus] = useState<string | null>(null);
  const open = (id: string) => {
    setFocus(id);
    setTab("account");
  };
  return (
    <div className="list admin" style={{ gap: 14 }}>
      <div className="view-title">
        <div>
          <div className="label t-red">Amministrazione del Reticolo</div>
          <h2>Sala di controllo</h2>
        </div>
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {tab === "panoramica" && <Overview ctx={ctx} open={open} />}
      {tab === "regolazioni" && <SettingsTab />}
      {tab === "account" && <Accounts ctx={ctx} focus={focus} setFocus={setFocus} />}
      {tab === "connessioni" && <Sessions ctx={ctx} open={open} />}
      {tab === "messaggi" && <Messages ctx={ctx} />}
      {tab === "bbs" && <PlayerBbs />}
      {tab === "manutenzione" && <Maintenance />}
      {tab === "registro" && <Audit />}
    </div>
  );
}

// ------------------------------------------------------------ panoramica

type Ov = {
  players: number;
  red: number;
  blue: number;
  online: number;
  live: number;
  awaiting: number;
  banned: number;
  jailed: number;
  newToday: number;
  activeToday: number;
  active7: number;
  war: { red: number; blue: number };
  economy: { supply: number; median: number; richest: number; earned: number; stolen: number; spent: number };
  totals: Record<string, number>;
  series: Record<string, { day: string; n: number }[]>;
  missionTypes: { type: string; n: number }[];
  actions: { key: string; n: number }[];
  top: Record<string, { id: string; handle: string; faction: string; value: number }[]>;
  world: { nodes: number; offline: number; alert: number; blackouts: string[]; missionsOpen: number; missionsTaken: number; incidents: number; listings: number; npcs: number };
  server: { uptime: number; rss: number; heap: number; dbBytes: number; node: string; pid: number };
  audit: AuditRow[];
};

function Overview({ ctx, open }: { ctx: DeckCtx; open: (id: string) => void }) {
  const [d] = usePoll<Ov>("overview", {}, 5000);
  if (!d) return <p className="dim">Carico la panoramica…</p>;
  const up = d.server.uptime;
  return (
    <>
      <div className="stat-grid">
        <Kpi label="Handle" value={fmt(d.players)} sub={`rossi ${d.red} · blu ${d.blue}`} />
        <Kpi label="Connessi ora" value={fmt(d.online)} sub={`${d.live} operazioni in corso`} hot={d.online > 0} />
        <Kpi label="Attivi" value={fmt(d.activeToday)} sub={`oggi · ${d.active7} negli ultimi 7 giorni`} />
        <Kpi label="Nuovi oggi" value={fmt(d.newToday)} sub={`${d.awaiting} in attesa · ${d.banned} sospesi`} hot={d.awaiting > 0} />
        <Kpi label="Guerra" value={`${d.war.red} · ${d.war.blue}`} sub="punti rossi · blu" />
        <Kpi label="In custodia" value={fmt(d.jailed)} sub={`${fmt(d.totals.arrests ?? 0)} arresti in tutto`} />
        <Kpi label="Massa monetaria" value={fmtCr(d.economy.supply)} sub={`mediana ${fmtCr(d.economy.median)} · max ${fmtCr(d.economy.richest)}`} />
        <Kpi label="Crediti generati" value={fmtCr(d.economy.earned)} sub={`${fmtCr(d.economy.stolen)} rubati · ${fmtCr(d.economy.spent)} spesi`} />
        <Kpi label="Traguardi" value={fmt(d.totals.achievements ?? 0)} sub={`${((100 * (d.totals.achievements ?? 0)) / Math.max(1, d.totals.achievementsPossible ?? 1)).toFixed(1)}% del possibile (${ACH_TOTAL} a testa)`} />
      </div>
      <div className="grid2">
        <Panel title="Attività degli ultimi 30 giorni">
          <Spark label="Iscrizioni" s={d.series.signup} />
          <Spark label="Accessi" s={d.series.login} />
          <Spark label="Connessioni" s={d.series.connect} />
          <Spark label="Contratti consegnati" s={d.series.deliver} />
          <Spark label="Tracciati" s={d.series.traced} color="var(--red)" />
          <Spark label="Crediti guadagnati" s={d.series.earned} color="var(--amber)" money />
        </Panel>
        <Panel title="Totali del Reticolo">
          {(
            [
              ["Connessioni", d.totals.connections],
              ["Contratti consegnati", d.totals.missions],
              ["File copiati", d.totals.files],
              ["Bonifici rubati", d.totals.heists],
              ["Blackout", d.totals.blackouts],
              ["Tracciati", d.totals.traced],
              ["Indagini senza nome", d.totals.ghosts],
              ["Intrusioni attribuite", d.totals.attributions],
              ["Iscrizioni", d.totals.signups],
              ["Accessi", d.totals.logins],
            ] as [string, number][]
          ).map(([k, v]) => (
            <div key={k} className="spread stat-row">
              <span className="dim">{k}</span>
              <span>{fmt(v ?? 0)}</span>
            </div>
          ))}
        </Panel>
        <Panel title="Classifiche">
          <div className="grid2" style={{ gap: 10 }}>
            {(
              [
                ["xp", "Esperienza"],
                ["credits", "Crediti"],
                ["fame", "Fama"],
                ["achievements", "Traguardi"],
                ["ghosts", "Fantasmi"],
                ["traced", "Più tracciati"],
              ] as [string, string][]
            ).map(([k, label]) => (
              <div key={k}>
                <div className="label" style={{ marginBottom: 4 }}>
                  {label}
                </div>
                {(d.top[k] ?? []).map((r, i) => (
                  <button key={r.id} className="linkrow" onClick={() => open(r.id)}>
                    <span className="faint">{i + 1}.</span> <span className={r.faction === "red" ? "t-mag" : "t-cyan"}>{r.handle}</span>
                    <span style={{ marginLeft: "auto" }}>{k === "credits" ? fmtCr(r.value) : fmt(r.value)}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Contratti consegnati per tipo">
          <Bars rows={d.missionTypes.map((m) => [MISSION_LABEL[m.type as MissionType] ?? m.type, m.n])} />
        </Panel>
        <Panel title="Azioni più usate">
          <Bars rows={d.actions.slice(0, 18).map((a) => [STAT_LABEL[a.key] ?? a.key, a.n])} />
        </Panel>
        <Panel title="Mondo e server">
          {(
            [
              ["Nodi", `${d.world.nodes} · ${d.world.offline} spenti · ${d.world.alert} in allerta`],
              ["Blackout attivi", d.world.blackouts.join(", ") || "nessuno"],
              ["Contratti", `${d.world.missionsOpen} aperti · ${d.world.missionsTaken} accettati`],
              ["Indagini aperte", String(d.world.incidents)],
              ["Annunci al mercato", String(d.world.listings)],
              ["Handle NPC", String(d.world.npcs)],
              ["Server acceso da", `${Math.floor(up / 86400)} g ${Math.floor((up % 86400) / 3600)} h ${Math.floor((up % 3600) / 60)} min`],
              ["Memoria", `${bytes(d.server.rss)} (heap ${bytes(d.server.heap)})`],
              ["Database", bytes(d.server.dbBytes)],
              ["Node", `${d.server.node} · pid ${d.server.pid}`],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="spread stat-row">
              <span className="dim">{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </Panel>
        <Panel title="Ultime azioni dell'amministrazione">
          <AuditRows rows={d.audit} now={ctx.serverNow} />
        </Panel>
      </div>
    </>
  );
}

function Kpi({ label, value, sub, hot }: { label: string; value: string; sub: string; hot?: boolean }) {
  return (
    <div className={`panel stat-tile ${hot ? "hot" : ""}`}>
      <div className="label">{label}</div>
      <div className="px t-fac" style={{ fontSize: 30, lineHeight: 1.1 }}>
        {value}
      </div>
      <div className="faint" style={{ fontSize: 12 }}>
        {sub}
      </div>
    </div>
  );
}

function Panel({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="panel" style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <div className="panel-head">
        <span className="label">{title}</span>
      </div>
      <div className="panel-body list" style={{ gap: 4 }}>
        {children}
      </div>
    </div>
  );
}

function Spark({ label, s, color = "var(--faction)", money }: { label: string; s: { day: string; n: number }[]; color?: string; money?: boolean }) {
  const max = Math.max(1, ...s.map((x) => x.n));
  const total = s.reduce((q, x) => q + x.n, 0);
  return (
    <div className="spark-row">
      <span className="dim">{label}</span>
      <span className="spark" aria-label={`${label}: ${total} in 30 giorni`}>
        {s.map((x) => (
          <i key={x.day} title={`${x.day}: ${money ? fmtCr(x.n) : fmt(x.n)}`} style={{ height: `${Math.max(4, (x.n / max) * 100)}%`, background: x.n ? color : undefined }} />
        ))}
      </span>
      <span>{money ? fmtCr(total) : fmt(total)}</span>
    </div>
  );
}

function Bars({ rows }: { rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (!rows.length)
    return (
      <p className="faint" style={{ margin: 0 }}>
        Ancora niente.
      </p>
    );
  return (
    <>
      {rows.map(([k, v]) => (
        <div key={k} className="bar-row">
          <span className="dim">{k}</span>
          <span className="bar">
            <i style={{ width: `${(v / max) * 100}%` }} />
          </span>
          <span>{fmt(v)}</span>
        </div>
      ))}
    </>
  );
}

// ------------------------------------------------------------ regolazioni

function SettingsTab() {
  const [d, reload] = usePoll<{ defs: SettingDef[]; values: Settings }>("settings", {}, 30000);
  const [draft, setDraft] = useState<Settings>({});
  const [msg, setMsg] = useState("");
  if (!d) return <p className="dim">Carico le regolazioni…</p>;
  const val = (k: string) => (k in draft ? draft[k] : d.values[k]);
  const dirty = Object.keys(draft).length > 0;
  const save = async () => {
    const r = await net.do("admin.setSettings", { values: draft });
    setMsg(r.ok ? (r.note ?? "salvato") : (r.error ?? "errore"));
    setDraft({});
    await reload();
  };
  const reset = async (keys?: string[]) => {
    if (!keys && !confirm("Riportare tutte le regolazioni ai valori di serie?")) return;
    const r = await net.do("admin.resetSettings", keys ? { keys } : {});
    setMsg(r.ok ? (r.note ?? "") : (r.error ?? ""));
    setDraft({});
    await reload();
  };
  return (
    <>
      <div className="row" style={{ position: "sticky", top: 0, zIndex: 5, background: "var(--deep)", padding: "6px 0" }}>
        <button className="btn primary" disabled={!dirty} onClick={() => void save()}>
          Applica {dirty ? `(${Object.keys(draft).length})` : ""}
        </button>
        <button className="btn" disabled={!dirty} onClick={() => setDraft({})}>
          Annulla
        </button>
        <button className="btn danger" onClick={() => void reset()}>
          Tutto di serie
        </button>
        <span className="faint" style={{ fontSize: 13 }}>
          {msg || "Le modifiche valgono subito, per tutti. I moltiplicatori a 1 lasciano il gioco com'è."}
        </span>
      </div>
      <div className="grid2">
        {SETTING_GROUPS.map((g) => (
          <Panel key={g} title={g}>
            {d.defs
              .filter((s) => s.group === g)
              .map((s) => {
                const v = val(s.key);
                const changed = v !== s.def;
                return (
                  <div key={s.key} className="setting">
                    <div className="spread">
                      <label htmlFor={`set-${s.key}`} className={changed ? "t-amber" : ""}>
                        {s.label}
                      </label>
                      {changed ? (
                        <button className="btn small" title="Valore di serie" onClick={() => void reset([s.key])}>
                          di serie
                        </button>
                      ) : null}
                    </div>
                    <SettingInput def={s} value={v} onChange={(x) => setDraft({ ...draft, [s.key]: x })} />
                    <div className="faint" style={{ fontSize: 12 }}>
                      {s.desc}
                    </div>
                  </div>
                );
              })}
          </Panel>
        ))}
      </div>
    </>
  );
}

function SettingInput({ def, value, onChange }: { def: SettingDef; value: Settings[string] | undefined; onChange: (v: Settings[string]) => void }) {
  const id = `set-${def.key}`;
  if (def.kind === "bool")
    return (
      <label className="row" style={{ gap: 6 }}>
        <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        {value ? "attivo" : "spento"}
      </label>
    );
  if (def.kind === "choice")
    return (
      <select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {def.options!.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  if (def.kind === "text") return <input id={id} value={String(value ?? "")} maxLength={300} onChange={(e) => onChange(e.target.value)} />;
  return (
    <div className="row" style={{ flexWrap: "nowrap" }}>
      <input id={id} type="range" min={def.min} max={def.max} step={def.step} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }} />
      <input type="number" min={def.min} max={def.max} step={def.step} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} style={{ width: 90 }} aria-label={def.label} />
    </div>
  );
}

// ------------------------------------------------------------ account

type Detail = AdminAccount & {
  counters: Record<string, number>;
  feats: string[];
  stats: Record<string, number>;
  tools: Record<string, number>;
  hw: Record<string, number>;
  gatewayIp: string;
  ethics: number;
  arrests: number;
  jailUntil: number;
  chargesList: string[];
  warrant: number;
  storage: { name: string; size: number; rarity: number }[];
  mail: number;
  knownNodes: number;
  adminNodes: number;
  op: string | null;
};

function Accounts({ ctx, focus, setFocus }: { ctx: DeckCtx; focus: string | null; setFocus: (id: string | null) => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("tutti");
  const [d, reload] = usePoll<{ list: AdminAccount[]; total: number }>("accounts", { q, filter }, 5000);
  return (
    <div className="admin-split">
      <div className="panel">
        <div className="panel-head" style={{ flexWrap: "wrap", gap: 6 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="handle o indirizzo" style={{ flex: 1, minWidth: 120 }} aria-label="Cerca account" />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtro">
            {["tutti", "online", "attesa", "bannati", "rossi", "blu", "staff"].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="panel-body list" style={{ gap: 2, maxHeight: "70vh", overflow: "auto" }}>
          <span className="faint" style={{ fontSize: 12 }}>
            {d ? `${d.total} account` : "…"}
          </span>
          {d?.list.map((a) => (
            <button key={a.id} className={`acct-row ${focus === a.id ? "on" : ""}`} onClick={() => setFocus(a.id)}>
              <span className={`dot ${a.online ? "on" : ""}`} />
              <span className={a.faction === "red" ? "t-mag" : "t-cyan"}>{a.handle}</span>
              {a.staff ? <span className="chip red">admin</span> : null}
              {a.status !== "attivo" ? <span className={`chip ${a.status === "bannato" ? "red" : "amber"}`}>{a.status}</span> : null}
              <span className="faint" style={{ marginLeft: "auto", fontSize: 11 }}>
                {a.online ? "online" : ago(a.lastSeen, ctx.serverNow)}
              </span>
            </button>
          ))}
        </div>
      </div>
      {focus ? <AccountDetail key={focus} id={focus} ctx={ctx} after={() => void reload()} close={() => setFocus(null)} /> : <p className="dim">Scegli un account dall'elenco.</p>}
    </div>
  );
}

function AccountDetail({ id, ctx, after, close }: { id: string; ctx: DeckCtx; after: () => void; close: () => void }) {
  const [d, reload] = usePoll<Detail>("account", { id }, 5000);
  const [msg, setMsg] = useState("");
  const [banMin, setBanMin] = useState("0");
  const [reason, setReason] = useState("");
  const [pw, setPw] = useState("");
  const [newHandle, setNewHandle] = useState("");
  const [field, setField] = useState("credits");
  const [value, setValue] = useState("");
  const [tool, setTool] = useState("breaker");
  const [lvl, setLvl] = useState("1");
  const [mailS, setMailS] = useState("");
  const [mailB, setMailB] = useState("");
  const [jailMin, setJailMin] = useState("10");
  if (!d) return <p className="dim">Carico…</p>;
  const act = async (a: string, p: Record<string, unknown> = {}) => {
    const r = await net.do(`admin.${a}`, { id, ...p });
    setMsg(r.ok ? (r.note ?? "fatto") : (r.error ?? "errore"));
    await reload();
    after();
    return r.ok;
  };
  const achGot = d.feats.filter((f) => f.includes("#"));
  return (
    <div className="list" style={{ gap: 12 }}>
      <div className="panel">
        <div className="panel-head">
          <span>
            <span className={`px ${d.faction === "red" ? "t-mag" : "t-cyan"}`} style={{ fontSize: 26 }}>
              {d.handle}
            </span>{" "}
            <span className="faint">
              {d.rank} · {d.faction === "red" ? "cellula rossa" : "cellula blu"}
            </span>
          </span>
          <button className="btn small" onClick={close}>
            chiudi
          </button>
        </div>
        <div className="panel-body list" style={{ gap: 4 }}>
          {msg ? <div className="t-amber">{msg}</div> : null}
          <div className="stat-grid compact">
            <Kpi label="Stato" value={d.online ? "online" : d.status} sub={d.ban ? `${d.ban.reason} · ${d.ban.until ? `fino al ${when(d.ban.until)}` : "per sempre"}` : d.op ? `collegato a ${d.op}` : `visto ${ago(d.lastSeen, ctx.serverNow)}`} hot={d.online} />
            <Kpi label="Crediti" value={fmtCr(d.credits)} sub={`XP ${fmt(d.xp)} · fama ${fmt(d.fame)}`} />
            <Kpi label="Rischio" value={`calore ${d.heat}`} sub={`${d.charges} capi · mandato ${d.warrant} · ${d.arrests} arresti${d.jailed ? " · IN CUSTODIA" : ""}`} hot={d.jailed} />
            <Kpi label="Traguardi" value={`${achGot.length}/${ACH_TOTAL}`} sub={`${d.feats.length - achGot.length} imprese speciali`} />
          </div>
          {(
            [
              ["Registrato", when(d.createdAt)],
              ["Ultimo accesso", `${when(d.lastSeen)} da ${d.lastIp || "—"}`],
              ["Accessi", `${d.logins} · giorni di gioco ${d.counters.days ?? 0}`],
              ["Indirizzi usati", d.ips.join(", ") || "—"],
              ["Gateway", d.gatewayIp],
              ["Operazioni", `${d.stats.ops ?? 0} · pulite ${d.stats.clean ?? 0} · tracciato ${d.stats.caught ?? 0}`],
              ["Nodi", `${d.adminNodes} da admin · ${d.knownNodes} sulla mappa`],
              ["Etica", String(d.ethics)],
              ["Software", Object.entries(d.tools).map(([k, v]) => `${k} v${v}`).join(", ") || "—"],
              ["Hardware", Object.entries(d.hw).map(([k, v]) => `${k} ${v}`).join(", ")],
              ["Archivio", d.storage.length ? d.storage.map((s) => s.name).join(", ") : "vuoto"],
              ["Capi d'accusa", d.chargesList.join("; ") || "nessuno"],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="spread stat-row">
              <span className="dim">{k}</span>
              <span style={{ textAlign: "right", overflowWrap: "anywhere" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid2">
        <Panel title="Accesso">
          {d.status === "in attesa" ? (
            <div className="row">
              <button className="btn primary" onClick={() => void act("approve")}>
                Approva l'iscrizione
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  if (confirm(`Respingere e cancellare ${d.handle}?`)) void act("remove", { confirm: d.handle, reject: true }).then((ok) => ok && close());
                }}
              >
                Respingi
              </button>
            </div>
          ) : null}
          {d.status === "bannato" ? (
            <button className="btn" onClick={() => void act("unban")}>
              Togli la sospensione
            </button>
          ) : (
            <div className="list" style={{ gap: 6 }}>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="motivo" />
              <div className="row">
                <select value={banMin} onChange={(e) => setBanMin(e.target.value)} aria-label="Durata della sospensione">
                  <option value="60">1 ora</option>
                  <option value="1440">1 giorno</option>
                  <option value="10080">7 giorni</option>
                  <option value="43200">30 giorni</option>
                  <option value="0">per sempre</option>
                </select>
                <button className="btn danger" disabled={d.staff} onClick={() => void act("ban", { minutes: Number(banMin), reason })}>
                  Sospendi
                </button>
                <button className="btn" onClick={() => void act("kick", { reason })}>
                  Scollega
                </button>
              </div>
            </div>
          )}
          <div className="row">
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="nuova chiave (min 6)" autoComplete="new-password" style={{ flex: 1, minWidth: 120 }} />
            <button className="btn" disabled={pw.length < 6} onClick={() => void act("password", { password: pw }).then(() => setPw(""))}>
              Cambia chiave
            </button>
          </div>
          <div className="row">
            <input value={newHandle} onChange={(e) => setNewHandle(e.target.value)} placeholder="nuovo handle" style={{ flex: 1, minWidth: 120 }} />
            <button className="btn" disabled={!newHandle} onClick={() => void act("rename", { handle: newHandle })}>
              Rinomina
            </button>
          </div>
          <div className="row">
            <button className="btn" onClick={() => void act("faction", { faction: d.faction === "red" ? "blue" : "red" })}>
              Sposta ai {d.faction === "red" ? "blu" : "rossi"}
            </button>
            <button
              className="btn danger"
              disabled={d.staff}
              onClick={() => {
                const c = prompt(`Cancellare per sempre ${d.handle}? Scrivi l'handle per confermare.`);
                if (c) void act("remove", { confirm: c }).then((ok) => ok && close());
              }}
            >
              Cancella account
            </button>
          </div>
        </Panel>

        <Panel title="Valori e dotazione">
          <div className="row">
            <select value={field} onChange={(e) => setField(e.target.value)} aria-label="Campo">
              <option value="credits">crediti</option>
              <option value="xp">XP</option>
              <option value="heat">calore</option>
              <option value="fame">fama</option>
              <option value="ethics">etica</option>
            </select>
            <input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="valore" style={{ width: 110 }} />
            <button className="btn" disabled={value === ""} onClick={() => void act("edit", { field, value: Number(value) })}>
              Imposta
            </button>
          </div>
          <div className="row">
            <select value={tool} onChange={(e) => setTool(e.target.value)} aria-label="Software o hardware">
              <optgroup label="Software">
                {TOOLS.map((t) => (
                  <option key={t.id} value={`t:${t.id}`}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Hardware">
                {HARDWARE.map((h) => (
                  <option key={h.id} value={`h:${h.id}`}>
                    {h.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <input type="number" min={0} max={5} value={lvl} onChange={(e) => setLvl(e.target.value)} style={{ width: 60 }} aria-label="Livello" />
            <button className="btn" onClick={() => void act("grant", tool.startsWith("t:") ? { tool: tool.slice(2), level: Number(lvl) } : { hw: tool.slice(2), level: Number(lvl) })}>
              Assegna
            </button>
          </div>
          <span className="faint" style={{ fontSize: 12 }}>
            Software: versione 1–3, 0 lo toglie. Hardware: livello 1–5.
          </span>
          <div className="row">
            <button className="btn" onClick={() => void act("clearCharges")}>
              Ripulisci la fedina
            </button>
            {d.jailed ? (
              <button className="btn" onClick={() => void act("release")}>
                Scarcera
              </button>
            ) : (
              <>
                <input type="number" min={1} value={jailMin} onChange={(e) => setJailMin(e.target.value)} style={{ width: 70 }} aria-label="Minuti di custodia" />
                <button className="btn danger" disabled={d.staff} onClick={() => void act("jail", { minutes: Number(jailMin), reason })}>
                  Custodia
                </button>
              </>
            )}
            <button className="btn" onClick={() => confirm("Azzerare i traguardi di questo handle?") && void act("resetAchievements")}>
              Azzera traguardi
            </button>
          </div>
        </Panel>

        <Panel title={`Messaggio a ${d.handle}`}>
          <input value={mailS} onChange={(e) => setMailS(e.target.value)} placeholder="oggetto" />
          <textarea value={mailB} onChange={(e) => setMailB(e.target.value)} placeholder="testo" rows={4} />
          <button
            className="btn primary"
            disabled={!mailS || !mailB}
            onClick={() =>
              void net.do("admin.mail", { to: id, subject: mailS, body: mailB }).then((r) => {
                setMsg(r.ok ? (r.note ?? "") : (r.error ?? ""));
                if (r.ok) (setMailS(""), setMailB(""));
              })
            }
          >
            Invia
          </button>
        </Panel>

        <Panel title="Statistiche dell'handle">
          {Object.entries(d.counters)
            .filter(([k]) => STAT_LABEL[k] || k.startsWith("m:") || k.startsWith("sys:"))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 40)
            .map(([k, v]) => (
              <div key={k} className="spread stat-row">
                <span className="dim">{STAT_LABEL[k] ?? (k.startsWith("m:") ? `Contratti: ${MISSION_LABEL[k.slice(2) as MissionType] ?? k.slice(2)}` : k)}</span>
                <span>{fmt(v)}</span>
              </div>
            ))}
        </Panel>

        <Panel title="Traguardi ottenuti" wide>
          <div className="row" style={{ gap: 4 }}>
            {TRACKS.flatMap((t) =>
              t.goals.map((_, i) =>
                d.feats.includes(achId(t.key, i)) ? (
                  <span key={achId(t.key, i)} className="chip" style={{ color: TIER_COLOR[i], borderColor: TIER_COLOR[i] }}>
                    {t.names[i]}
                  </span>
                ) : null,
              ),
            )}
            {!achGot.length ? <span className="faint">Nessuno.</span> : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ connessioni

function Sessions({ ctx, open }: { ctx: DeckCtx; open: (id: string) => void }) {
  const [d, reload] = usePoll<{ sessions: AdminSession[]; ipBans: IpBan[] }>("sessions", {}, 3000);
  const [ip, setIp] = useState("");
  const [minutes, setMinutes] = useState("1440");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  const act = async (a: string, p: Record<string, unknown>) => {
    const r = await net.do(`admin.${a}`, p);
    setMsg(r.ok ? (r.note ?? "") : (r.error ?? ""));
    await reload();
  };
  return (
    <div className="grid2">
      <Panel title={`Connessioni aperte · ${d?.sessions.length ?? "…"}`} wide>
        {msg ? <div className="t-amber">{msg}</div> : null}
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Handle</th>
                <th>Indirizzo</th>
                <th>Da</th>
                <th>Messaggi</th>
                <th>Operazione</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d?.sessions.map((s, i) => (
                <tr key={`${s.ip}-${s.since}-${i}`}>
                  <td>{s.agentId ? <button className="linkrow" onClick={() => open(s.agentId!)}>{s.handle}</button> : <span className="faint">non autenticato</span>}</td>
                  <td>{s.ip}</td>
                  <td>{ago(s.since, ctx.serverNow)}</td>
                  <td>{s.msgs}</td>
                  <td>{s.op ?? "—"}</td>
                  <td className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                    {s.agentId ? (
                      <button className="btn small" onClick={() => void act("kick", { id: s.agentId })}>
                        scollega
                      </button>
                    ) : null}
                    <button className="btn small danger" onClick={() => setIp(s.ip)}>
                      blocca IP
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Blocca un indirizzo">
        <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="indirizzo IP" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="motivo" />
        <div className="row">
          <select value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="Durata">
            <option value="60">1 ora</option>
            <option value="1440">1 giorno</option>
            <option value="10080">7 giorni</option>
            <option value="0">per sempre</option>
          </select>
          <button className="btn danger" disabled={!ip} onClick={() => void act("ipBan", { ip, minutes: Number(minutes), reason })}>
            Blocca
          </button>
          <button className="btn" disabled={!ip} onClick={() => void act("kickIp", { ip })}>
            Solo scollega
          </button>
        </div>
      </Panel>
      <Panel title={`Indirizzi bloccati · ${d?.ipBans.length ?? 0}`}>
        {d?.ipBans.length ? (
          d.ipBans.map((b) => (
            <div key={b.ip} className="spread stat-row">
              <span>
                {b.ip} <span className="faint">· {b.reason || "senza motivo"} · {b.until ? `fino al ${when(b.until)}` : "per sempre"}</span>
              </span>
              <button className="btn small" onClick={() => void act("ipUnban", { ip: b.ip })}>
                sblocca
              </button>
            </div>
          ))
        ) : (
          <span className="faint">Nessuno.</span>
        )}
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------ messaggi

function Messages({ ctx }: { ctx: DeckCtx }) {
  const [to, setTo] = useState("all");
  const [from, setFrom] = useState("AMMINISTRAZIONE");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [toast, setToast] = useState("");
  const [tone, setTone] = useState("info");
  const [feed, setFeed] = useState("");
  const [msg, setMsg] = useState("");
  const run = async (a: string, p: Record<string, unknown>, clear: () => void) => {
    const r = await net.do(`admin.${a}`, p);
    setMsg(r.ok ? (r.note ?? "") : (r.error ?? ""));
    if (r.ok) clear();
  };
  return (
    <div className="grid2">
      {msg ? <div className="t-amber" style={{ gridColumn: "1 / -1" }}>{msg}</div> : null}
      <Panel title="Posta">
        <div className="row">
          <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Destinatari">
            <option value="all">tutti gli handle</option>
            <option value="online">solo chi è collegato</option>
            <option value="red">cellula rossa</option>
            <option value="blue">cellula blu</option>
          </select>
          <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="mittente" style={{ flex: 1, minWidth: 120 }} />
        </div>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="oggetto" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="testo del messaggio" rows={7} />
        <button className="btn primary" disabled={!subject || !body} onClick={() => void run("mail", { to, from, subject, body }, () => (setSubject(""), setBody("")))}>
          Invia
        </button>
        <span className="faint" style={{ fontSize: 12 }}>
          Arriva nella posta di ogni destinatario; chi è collegato vede anche un avviso. A un singolo handle si scrive dalla sua scheda.
        </span>
      </Panel>
      <Panel title="Avviso istantaneo">
        <input value={toast} onChange={(e) => setToast(e.target.value)} placeholder="una riga, a schermo per pochi secondi" />
        <div className="row">
          <select value={tone} onChange={(e) => setTone(e.target.value)} aria-label="Tono">
            <option value="info">informazione</option>
            <option value="ok">buona notizia</option>
            <option value="warn">attenzione</option>
            <option value="bad">allarme</option>
          </select>
          <button className="btn" disabled={!toast} onClick={() => void run("toast", { text: toast, tone, to: "online" }, () => setToast(""))}>
            Mostra a tutti i collegati
          </button>
        </div>
      </Panel>
      <Panel title="Notizia nel feed">
        <input value={feed} onChange={(e) => setFeed(e.target.value)} placeholder="LUMEN NEWS · …" />
        <button className="btn" disabled={!feed} onClick={() => void run("feed", { text: feed }, () => setFeed(""))}>
          Pubblica nel feed del mondo
        </button>
      </Panel>
      <Panel title="Avviso fisso in alto">
        <span className="dim" style={{ fontSize: 13 }}>
          {ctx.state.notice ? `Attivo: «${ctx.state.notice.text}»` : "Nessun avviso fisso."} Si cambia nelle regolazioni, gruppo «Comunicazione».
        </span>
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------ manutenzione

function Maintenance() {
  const [msg, setMsg] = useState("");
  const [reason, setReason] = useState("");
  const run = async (a: string, ask?: string, p: Record<string, unknown> = {}) => {
    if (ask && !confirm(ask)) return;
    const r = await net.do(`admin.${a}`, p);
    setMsg(r.ok ? (r.note ?? "fatto") : (r.error ?? "errore"));
  };
  const items: [string, string, string, string | undefined][] = [
    ["save", "Salva il mondo adesso", "Scrive su disco tutto quello che è cambiato (di solito ogni pochi minuti).", undefined],
    ["snapshot", "Copia del database", "Una copia coerente accanto al database, da conservare o scaricare dal server.", undefined],
    ["refillBoard", "Rigenera la bacheca", "Ritira i contratti aperti e ne genera di nuovi con le regolazioni attuali.", "Ritirare tutti i contratti aperti?"],
    ["calmWorld", "Calma il mondo", "Riaccende i sistemi spenti, toglie allerte e blackout.", undefined],
    ["coolAll", "Raffredda tutti", "Calore a zero per ogni handle.", "Azzerare il calore di tutti?"],
    ["amnesty", "Amnistia", "Svuota i capi d'accusa e libera chi è in custodia.", "Concedere l'amnistia a tutti?"],
    ["disconnectAll", "Chiudi tutte le operazioni", "Interrompe le connessioni ai nodi in corso (i giocatori restano collegati al deck).", "Interrompere tutte le operazioni in corso?"],
  ];
  return (
    <div className="grid2">
      {msg ? <div className="t-amber" style={{ gridColumn: "1 / -1" }}>{msg}</div> : null}
      {items.map(([a, label, desc, ask]) => (
        <div key={a} className="panel">
          <div className="panel-body spread">
            <span>
              <b>{label}</b>
              <div className="faint" style={{ fontSize: 12 }}>
                {desc}
              </div>
            </span>
            <button className={`btn ${ask ? "danger" : ""}`} onClick={() => void run(a, ask)}>
              Esegui
            </button>
          </div>
        </div>
      ))}
      <Panel title="Scollega tutti">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="messaggio (es. riavvio fra 5 minuti)" />
        <button className="btn danger" onClick={() => void run("kickAll", "Scollegare tutti i giocatori (tranne l'amministrazione)?", { reason })}>
          Scollega tutti
        </button>
        <span className="faint" style={{ fontSize: 12 }}>
          Per tenere fuori tutti mentre lavori, accendi «Manutenzione» nelle regolazioni: chi prova a entrare legge il messaggio di manutenzione.
        </span>
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------ registro

function Audit() {
  const [d] = usePoll<AuditRow[]>("auditLog", { limit: 300 }, 10000);
  return (
    <Panel title="Registro delle azioni dell'amministrazione" wide>
      {d ? <AuditRows rows={d} now={Date.now()} /> : <span className="dim">Carico…</span>}
    </Panel>
  );
}

function AuditRows({ rows, now }: { rows: AuditRow[]; now: number }) {
  if (!rows.length) return <span className="faint">Nessuna azione registrata.</span>;
  return (
    <>
      {rows.map((r, i) => (
        <div key={`${r.at}-${i}`} className="audit-row">
          <span className="faint" title={when(r.at)}>
            {ago(r.at, now)}
          </span>
          <span className="t-red">{r.by}</span>
          <span>
            <b>{r.action}</b> <span className="dim">{r.detail}</span>
          </span>
        </div>
      ))}
    </>
  );
}

/** I BBS aperti dai giocatori: testi liberi letti da altri, quindi da tenere d'occhio. */
function PlayerBbs() {
  type Row = import("../../../shared/bbs.ts").OwnedView & { owner: string };
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const r = await net.do("admin.bbsList", {}, true);
    if (r.ok) setRows(r.data as Row[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const run = async (a: string, id: string, ask: string, p: Record<string, unknown> = {}) => {
    if (!confirm(ask)) return;
    const r = await net.do(`admin.${a}`, { id, ...p });
    setMsg(r.ok ? (r.note ?? "fatto") : (r.error ?? "errore"));
    void load();
  };
  return (
    <div className="list" style={{ gap: 14 }}>
      {msg ? <div className="t-amber">{msg}</div> : null}
      {rows.map((b) => (
        <div key={b.id} className="panel">
          <div className="panel-head">
            <span className="label">{b.name}</span>
            <span className="faint">sysop {b.owner} · {b.access} · fama {b.fame} · {b.users} utenti · {b.posts} messaggi</span>
          </div>
          <div className="panel-body list">
            {b.tagline ? <div className="dim">{b.tagline}</div> : null}
            <pre className="bbs-pre" style={{ background: "#020403", padding: 8, overflowX: "auto" }}>{b.banner}</pre>
            {b.motd ? <div style={{ fontSize: 13 }}>{b.motd}</div> : null}
            {b.deface ? <div className="t-red">Insegna sfregiata da {b.deface.by}: «{b.deface.text}»</div> : null}
            <div className="row">
              <button className="btn small" onClick={() => void run("bbsReset", b.id, `Azzerare insegna, sottotitolo e regole di «${b.name}»?`)}>
                Azzera i testi
              </button>
              <button className="btn small danger" onClick={() => void run("bbsClose", b.id, `Chiudere «${b.name}»? Bacheche e utenti spariscono.`, { reason: `Il tuo BBS «${b.name}» è stato chiuso dall'amministrazione per i contenuti.` })}>
                Chiudi
              </button>
            </div>
            <p className="faint" style={{ margin: 0, fontSize: 12 }}>I singoli messaggi si rimuovono chiamando il BBS: sulla bacheca l'admin ha il tasto «rimuovi».</p>
          </div>
        </div>
      ))}
      {!rows.length ? <p className="dim">Nessun BBS aperto dai giocatori.</p> : null}
    </div>
  );
}
