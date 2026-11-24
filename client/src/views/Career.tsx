// Carriera: le statistiche personali e i traguardi, serie per serie, con l'avanzamento verso il prossimo grado.
import { useMemo, useState } from "react";
import { ACH_CAT, ACH_TOTAL, STAT_LABEL, TIER_COLOR, TIER_FAME, TIER_NAME, TRACKS, achId, fmtGoal, trackValue, type AchCat, type Track } from "../../../shared/achievements.ts";
import { MISSION_LABEL, REGION_NAME, KIND_LABEL, fmtCr } from "../../../shared/rules.ts";
import type { MissionType, NodeKind } from "../../../shared/types.ts";
import type { Region } from "../../../shared/rules.ts";
import type { DeckCtx } from "./Deck.tsx";
import { SPEC_DEFS, SPEC_TITLES, specLevel, specNeed, specPoints } from "../../../shared/progress.ts";
import { levelOf, levelXp } from "../../../shared/rules.ts";

const fmt = (n: number) => Math.round(n).toLocaleString("it-IT");

export function Career({ ctx }: { ctx: DeckCtx }) {
  const me = ctx.state.me;
  const [tab, setTab] = useState<"traguardi" | "statistiche">("traguardi");
  const self = { xp: me.xp, fame: me.fame, credits: me.credits };
  const got = me.feats.filter((f) => f.includes("#"));
  const byTier = [0, 1, 2, 3].map((t) => got.filter((f) => f.endsWith(`#${t}`)).length);
  return (
    <div className="list" style={{ gap: 14 }}>
      <div className="view-title">
        <div>
          <div className="label">Carriera · {me.handle}</div>
          <h2>Traguardi e statistiche</h2>
        </div>
        <div className="tabs">
          <button className={tab === "traguardi" ? "on" : ""} onClick={() => setTab("traguardi")}>
            Traguardi
          </button>
          <button className={tab === "statistiche" ? "on" : ""} onClick={() => setTab("statistiche")}>
            Statistiche
          </button>
        </div>
      </div>
      <div className="ach-summary">
        <div>
          <div className="px t-amber" style={{ fontSize: 40, lineHeight: 1 }}>
            {got.length}
            <span className="faint" style={{ fontSize: 22 }}>
              {" "}
              / {ACH_TOTAL}
            </span>
          </div>
          <div className="faint" style={{ fontSize: 12 }}>
            traguardi ottenuti
          </div>
        </div>
        <div className="meter seg" style={{ flex: 1, minWidth: 140 }}>
          <i style={{ width: `${(got.length / ACH_TOTAL) * 100}%` }} />
        </div>
        <div className="row" style={{ gap: 10 }}>
          {TIER_NAME.map((n, i) => (
            <span key={n} className="ach-tiercount" style={{ color: TIER_COLOR[i] }}>
              <b className="px" style={{ fontSize: 24 }}>
                {byTier[i]}
              </b>{" "}
              {n}
            </span>
          ))}
        </div>
      </div>
      <Progress ctx={ctx} />
      {tab === "traguardi" ? <Achievements counters={me.counters} feats={me.feats} self={self} /> : <Stats ctx={ctx} />}
    </div>
  );
}

/** Livello numerico e specializzazioni: quello che fai ti rende più bravo a farlo. */
function Progress({ ctx }: { ctx: DeckCtx }) {
  const me = ctx.state.me;
  const lv = levelOf(me.xp);
  const a = levelXp(lv);
  const b = levelXp(lv + 1);
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">Livello e specializzazioni</span>
        <span className="px t-fac" style={{ fontSize: 22 }}>
          Livello {lv} · {me.rank}
        </span>
      </div>
      <div className="panel-body list">
        <div className="meter" style={{ height: 8 }}>
          <i style={{ width: `${lv >= 99 ? 100 : ((me.xp - a) / (b - a)) * 100}%` }} />
        </div>
        <span className="faint" style={{ fontSize: 12 }}>
          {lv >= 99 ? "Livello massimo." : `${me.xp.toLocaleString("it-IT")} XP · al livello ${lv + 1} ne mancano ${(b - me.xp).toLocaleString("it-IT")}`}
          {me.nextXp ? ` · prossimo rango a ${me.nextXp.toLocaleString("it-IT")} XP` : " · hai il rango più alto"}
        </span>
        <div className="spec-grid">
          {SPEC_DEFS.map((d) => {
            const l = specLevel(me.counters, d.id);
            const p = specPoints(me.counters, d.id);
            const from = specNeed(l);
            const to = specNeed(l + 1);
            return (
              <div key={d.id} className={`spec ${l ? "on" : ""}`}>
                <div className="spread">
                  <span className="px" style={{ fontSize: 20 }}>
                    {d.name}
                  </span>
                  <span className="t-amber">
                    {l}/10 · {SPEC_TITLES[l]}
                  </span>
                </div>
                <div className="meter" style={{ height: 6 }}>
                  <i style={{ width: `${l >= 10 ? 100 : Math.max(0, ((p - from) / (to - from)) * 100)}%` }} />
                </div>
                <div className={l ? "t-green" : "faint"} style={{ fontSize: 12 }}>
                  {l ? `+${(l * d.per).toFixed(d.per % 1 ? 1 : 0)}${d.unit} ${d.perk}` : `${d.perk}: +${d.per}${d.unit} per livello`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Achievements({ counters, feats, self }: { counters: Record<string, number>; feats: string[]; self: { xp: number; fame: number; credits: number } }) {
  const [cat, setCat] = useState<AchCat | "tutte">("tutte");
  const [show, setShow] = useState<"tutti" | "in corso" | "completati">("tutti");
  const rows = useMemo(
    () =>
      TRACKS.map((t) => {
        const v = trackValue(t, counters, self);
        const tiers = t.goals.map((_, i) => feats.includes(achId(t.key, i)) || v >= t.goals[i]!);
        const next = tiers.indexOf(false);
        return { t, v, tiers, next };
      }),
    [counters, feats, self],
  );
  const list = rows
    .filter((r) => cat === "tutte" || r.t.cat === cat)
    .filter((r) => show === "tutti" || (show === "completati" ? r.next === -1 : r.next !== -1))
    .sort((a, b) => {
      // prima quelle più vicine al prossimo grado
      const pa = a.next === -1 ? -1 : a.v / a.t.goals[a.next]!;
      const pb = b.next === -1 ? -1 : b.v / b.t.goals[b.next]!;
      return pb - pa;
    });
  return (
    <div className="panel">
      <div className="panel-head" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="tabs">
          <button className={cat === "tutte" ? "on" : ""} onClick={() => setCat("tutte")}>
            Tutte
          </button>
          {(Object.keys(ACH_CAT) as AchCat[]).map((c) => (
            <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>
              {ACH_CAT[c]}
            </button>
          ))}
        </div>
        <select value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="Quali traguardi mostrare">
          <option>tutti</option>
          <option>in corso</option>
          <option>completati</option>
        </select>
      </div>
      <div className="panel-body">
        <div className="ach-grid">
          {list.map((r) => (
            <AchCard key={r.t.key} {...r} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AchCard({ t, v, tiers, next }: { t: Track; v: number; tiers: boolean[]; next: number }) {
  const done = next === -1;
  const tier = done ? 3 : next;
  const goal = t.goals[tier]!;
  const from = tier > 0 ? t.goals[tier - 1]! : 0;
  const frac = done ? 1 : Math.max(0, Math.min(1, (v - from) / (goal - from)));
  return (
    <div className={`ach ${done ? "done" : ""}`} style={{ borderColor: tiers[0] ? TIER_COLOR[done ? 3 : Math.max(0, tier - 1)] : undefined }}>
      <div className="spread" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div className="px" style={{ fontSize: 20, lineHeight: 1.1, color: done ? TIER_COLOR[3] : undefined }}>
            {t.names[tier]}
          </div>
          <div className="faint" style={{ fontSize: 11 }}>
            {ACH_CAT[t.cat]} · {done ? "completata" : `grado ${TIER_NAME[tier]} · +${TIER_FAME[tier]} fama`}
          </div>
        </div>
        <div className="ach-pips" aria-label={`${tiers.filter(Boolean).length} gradi su 4`}>
          {tiers.map((g, i) => (
            <i key={i} title={`${TIER_NAME[i]}: ${t.names[i]} (${fmtGoal(t, t.goals[i]!)})`} style={g ? { background: TIER_COLOR[i], borderColor: TIER_COLOR[i] } : undefined} />
          ))}
        </div>
      </div>
      <div style={{ fontSize: 13 }}>{t.desc.replace("{n}", fmtGoal(t, goal))}</div>
      <div className="meter" style={{ height: 6 }}>
        <i style={{ width: `${frac * 100}%`, background: done ? TIER_COLOR[3] : TIER_COLOR[tier] }} />
      </div>
      <div className="spread faint" style={{ fontSize: 11 }}>
        <span>{t.money ? fmtCr(v) : fmt(v)}</span>
        <span>{done ? "tutti i gradi" : `obiettivo ${fmtGoal(t, goal)}`}</span>
      </div>
    </div>
  );
}

function Stats({ ctx }: { ctx: DeckCtx }) {
  const me = ctx.state.me;
  const c = me.counters;
  const self = { xp: me.xp, fame: me.fame, credits: me.credits };
  const days = Math.max(1, Math.ceil((ctx.serverNow - me.createdAt) / 86400_000));
  const groups = (Object.keys(ACH_CAT) as AchCat[]).map((cat) => ({
    cat,
    rows: TRACKS.filter((t) => t.cat === cat).map((t) => ({ label: STAT_LABEL[t.key] ?? t.key, v: trackValue(t, c, self), money: t.money })),
  }));
  const prefixed = (p: string) =>
    Object.entries(c)
      .filter(([k, v]) => k.startsWith(p) && v > 0)
      .sort((a, b) => b[1] - a[1]);
  const missions = prefixed("m:");
  const kinds = prefixed("k:");
  const regions = prefixed("r:");
  const sys = prefixed("sys:");
  return (
    <>
      <div className="grid3 stat-tiles">
        <Tile label="Sul Reticolo da" value={`${days} ${days === 1 ? "giorno" : "giorni"}`} sub={`${fmt(c.days ?? 0)} giorni di gioco · ${fmt(c.login ?? 0) || "—"} accessi`} />
        <Tile label="Operazioni" value={fmt(me.stats.ops)} sub={`${fmt(me.stats.clean)} senza nome · ${fmt(me.stats.caught)} tracciato`} />
        <Tile label="Tasso di pulizia" value={me.stats.ops ? `${Math.round((me.stats.clean / Math.max(1, me.stats.ops)) * 100)}%` : "—"} sub="operazioni chiuse senza attribuzione" />
        <Tile label="Crediti guadagnati" value={fmtCr(c.earned ?? 0)} sub={`${fmtCr(c.spent ?? 0)} spesi in dotazione`} />
        <Tile label="Contratti" value={fmt(c["a:deliver"] ?? 0)} sub={`${missions.length} tipi diversi · ${fmt(c.elite ?? 0)} di grado alto`} />
        <Tile label="Nodi" value={fmt(c.nodes ?? 0)} sub={`da admin · ${fmt(me.knownNodes)} sulla mappa`} />
      </div>
      <div className="grid2">
        {groups.map((g) => (
          <div key={g.cat} className="panel">
            <div className="panel-head">
              <span className="label">{ACH_CAT[g.cat]}</span>
            </div>
            <div className="panel-body list" style={{ gap: 3 }}>
              {g.rows.map((r) => (
                <div key={r.label} className="spread stat-row">
                  <span className="dim">{r.label}</span>
                  <span className={r.v ? "" : "faint"}>{r.money ? fmtCr(r.v) : fmt(r.v)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <Breakdown title="Contratti per tipo" rows={missions.map(([k, v]) => [MISSION_LABEL[k.slice(2) as MissionType] ?? k.slice(2), v])} />
        <Breakdown title="Sistemi violati per tipo" rows={kinds.map(([k, v]) => [KIND_LABEL[k.slice(2) as NodeKind] ?? k.slice(2), v])} />
        <Breakdown title="Regioni" rows={regions.map(([k, v]) => [REGION_NAME[k.slice(2) as Region] ?? k.slice(2), v])} />
        <Breakdown title="Comandi di sistema" rows={sys.map(([k, v]) => [STAT_LABEL[k] ?? k.slice(4), v])} />
      </div>
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="panel stat-tile">
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

function Breakdown({ title, rows }: { title: string; rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">{title}</span>
      </div>
      <div className="panel-body list" style={{ gap: 4 }}>
        {rows.length ? (
          rows.map(([k, v]) => (
            <div key={k} className="bar-row">
              <span className="dim">{k}</span>
              <span className="bar">
                <i style={{ width: `${(v / max) * 100}%` }} />
              </span>
              <span>{fmt(v)}</span>
            </div>
          ))
        ) : (
          <p className="faint" style={{ margin: 0 }}>
            Ancora niente.
          </p>
        )}
      </div>
    </div>
  );
}
