// Persone: chi conosci, dov'è adesso, cosa sai di lei e cosa puoi farle.
import { useCallback, useEffect, useState } from "react";
import type { NemesisView } from "../../../shared/nemesis.ts";
import type { LongOpsView } from "../../../shared/longops.ts";
import { COVER_COST, COVER_DAYS, MOLE_COST, MOLE_DAYS } from "../../../shared/longops.ts";
import type { CitizenRow } from "../../../shared/citizens.ts";
import { fmtCr, NUM_LOCALE } from "../../../shared/rules.ts";
import { net } from "../net.ts";
import type { DeckCtx } from "./Deck.tsx";

type SoulRow = { handle: string; city: string; clock: string; status: "sveglio" | "dorme" | "custodia"; about: string; last: string; ambition: string; progress: number; favor: number; gang: string | null; can: { act: string; label: string; why: string | null }[] };
type GangRow = { id: string; name: string; side: "red" | "blue"; motto: string; members: string[]; score: number; mine: boolean };

export function PeoplePanel({ ctx }: { ctx: DeckCtx }) {
  const [rows, setRows] = useState<CitizenRow[] | null>(null);
  const load = useCallback(async () => {
    const r = await net.do("cit", { cmd: "list" }, true);
    if (r.ok) setRows((r.data as { rows: CitizenRow[] }).rows);
  }, []);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);
  const go = async (id: string, cmd: string) => {
    await net.do("cit", { cmd, id });
    void load();
  };
  const [souls, setSouls] = useState<{ rows: SoulRow[]; gangs: GangRow[] } | null>(null);
  const loadSouls = useCallback(async () => {
    const r = await net.do("life", { cmd: "souls" }, true);
    if (r.ok) setSouls(r.data as { rows: SoulRow[]; gangs: GangRow[] });
  }, []);
  useEffect(() => {
    void loadSouls();
  }, [loadSouls]);
  const ask = async (cmd: string, p: Record<string, unknown>) => {
    await net.do("life", { cmd, ...p });
    void loadSouls();
  };
  const red = ctx.state.me.faction === "red";
  return (
    <div className="list" style={{ gap: 14 }}>
      <div className="view-title">
        <div>
          <h1>Persone</h1>
          <p className="dim" style={{ margin: 0 }}>
            {red ? "Dietro ogni sistema c'è qualcuno con un mutuo, un capo e un segreto. Li conosci leggendo gli organici." : "Dietro ogni sistema c'è qualcuno che può essere comprato o ricattato. Li conosci leggendo gli organici: avvisali prima degli altri."}
          </p>
        </div>
      </div>
      <NemesisPanel ctx={ctx} />
      <LongOpsPanel ctx={ctx} />
      <div className="panel">
        <div className="panel-head">
          <span className="label">Rubrica</span>
          <span className="faint">{rows?.length ?? 0} persone</span>
        </div>
        <div className="panel-body list">
          {(rows ?? []).map((p) => (
            <div key={p.id} className="lab-build">
              <div>
                <b>{p.name}</b> <span className="faint">{p.job} · {p.city}</span>{" "}
                {p.role === "amministratore" ? <span className="chip fac">amministratore</span> : null} {p.fired ? <span className="chip amber">licenziata da {p.fired}</span> : null}{" "}
                {p.vacation ? <span className="chip">in ferie</span> : null}
                <div className="dim" style={{ fontSize: 12 }}>
                  {p.employer ? `lavora per ${p.employer}` : "senza lavoro"} · adesso {p.where} ({p.clock} ora sua)
                </div>
                <div className="faint" style={{ fontSize: 12 }}>
                  {p.known
                    ? `debiti ${fmtCr(p.debt ?? 0)}${p.affair ? ` · una relazione con ${p.affair}, che nessuno deve sapere` : " · nessuna relazione nascosta"}`
                    : p.debt === -1
                      ? "si dice che abbia dei debiti. Per saperne di più serve un'indagine."
                      : "non sai altro di lei."}
                </div>
              </div>
              <div className="row">
                {p.can.map((c) => (
                  <button key={c.act} className={`btn small ${c.act === "blackmail" ? "danger" : ""}`} disabled={Boolean(c.why) || ctx.state.me.credits < c.cost} title={c.why ?? undefined} onClick={() => void go(p.id, c.act)}>
                    {c.label}
                    {c.cost ? ` · ${fmtCr(c.cost)}` : ""}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {rows && !rows.length ? (
            <p className="dim" style={{ margin: 0 }}>
              Non conosci nessuno. Entra in un sistema, sali a operatore e leggi l'organico all'ufficio del personale: i nomi finiscono qui.
            </p>
          ) : null}
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <span className="label">Le crew della scena</span>
        </div>
        <div className="panel-body list">
          {(souls?.gangs ?? []).map((g, i) => (
            <div key={g.id} className="lab-build">
              <div>
                <b className="px" style={{ fontSize: 22 }}>{i + 1}. {g.name}</b> <span className={`chip ${g.side === "red" ? "red" : "fac"}`}>{g.side === "red" ? "rossi" : "blu"}</span> {g.mine ? <span className="chip green">sei dei loro</span> : null}
                <div className="dim" style={{ fontSize: 12 }}>«{g.motto}» · {g.score} imprese di recente</div>
                <div className="faint" style={{ fontSize: 12 }}>{g.members.join(", ")}</div>
              </div>
              {!g.mine && g.side === ctx.state.me.faction ? (
                <button className="btn small" onClick={() => void ask("join", { gang: g.id })}>
                  Affiancali
                </button>
              ) : null}
            </div>
          ))}
          <p className="faint" style={{ margin: 0, fontSize: 12 }}>
            Affiancare una crew ti fa guardare meglio dai suoi, e chi ti guarda bene ogni tanto ti scrive: un indirizzo, mezza password, un avvertimento.
          </p>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <span className="label">La gente del Reticolo</span>
          <span className="faint">{souls?.rows.filter((x) => x.status === "sveglio").length ?? 0} svegli adesso</span>
        </div>
        <div className="panel-body list">
          {(souls?.rows ?? []).map((p) => (
            <div key={p.handle} className="lab-build">
              <div style={{ flex: "1 1 260px" }}>
                <b className={p.status === "sveglio" ? "t-green" : p.status === "custodia" ? "t-red" : ""}>{p.handle}</b>{" "}
                <span className="faint">{p.city}, {p.clock} · {p.status === "custodia" ? "in custodia" : p.status}{p.gang ? ` · ${p.gang}` : ""}</span>
                <div className="dim" style={{ fontSize: 12 }}>{p.about}. Vuole {p.ambition} ({p.progress}%).</div>
                {p.last ? <div className="faint" style={{ fontSize: 12 }}>Ultima notizia: {p.last}.</div> : null}
                <div className="org-stat" style={{ maxWidth: 280 }}>
                  <span className="faint">{p.favor >= 60 ? "amico" : p.favor >= 30 ? "ti stima" : p.favor <= -40 ? "ti detesta" : p.favor < 0 ? "diffidente" : "indifferente"}</span>
                  <span className="org-bar">
                    <i style={{ width: `${Math.abs(p.favor)}%`, background: p.favor < 0 ? "var(--red)" : "var(--green)" }} />
                  </span>
                </div>
              </div>
              <div className="row">
                {p.can.map((c) => (
                  <button key={c.act} className="btn small" disabled={Boolean(c.why)} title={c.why ?? undefined} onClick={() => void ask(c.act, { handle: p.handle })}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** «1 ora», «5 ore», a partire da millisecondi (almeno un'ora). */
const ore = (ms: number) => {
  const h = Math.max(1, Math.round(ms / 3600_000));
  if (h >= 48) return `${Math.round(h / 24)} giorni`;
  return h === 1 ? "un'ora" : `${h} ore`;
};

/** Chi ti dà la caccia, chi ti sta seguendo nei log, e il favore che ti hanno chiesto. */
function NemesisPanel({ ctx }: { ctx: DeckCtx }) {
  const [v, setV] = useState<NemesisView | null>(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const r = await net.do("nemesis", {}, true);
    if (r.ok) setV(r.data as NemesisView);
  }, []);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);
  const run = async (cmd: string) => {
    const r = await net.do("nemesis", { cmd });
    setMsg(r.ok ? (r.note ?? "") : (r.error ?? "errore"));
    if (r.ok) setV(r.data as NemesisView);
  };
  if (!v || (!v.nemesis && !v.favor && !v.watchers.length)) return null;
  const n = v.nemesis;
  const credits = ctx.state.me.credits;
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">{n ? "La tua nemesi" : "Chi ti segue"}</span>
        {n ? <span className="chip red">{n.handle} · {n.city}</span> : null}
      </div>
      <div className="panel-body list" style={{ gap: 8 }}>
        {n ? (
          <>
            <p style={{ margin: 0 }}>
              {n.handle} ha preso il tuo caso {ore(ctx.serverNow - n.since)} fa. La prossima mossa{" "}
              {n.nextAt > ctx.serverNow ? `fra circa ${ore(n.nextAt - ctx.serverNow)}` : "appena si sveglia"}. Si stufa se resti tranquillo (calore sotto 15) per un giorno intero
              {n.calmFor >= 3600_000 ? `: sei tranquillo da ${ore(n.calmFor)}` : ""}.
            </p>
            {n.moves.map((m, i) => (
              <div key={i} className="dim" style={{ fontSize: 13 }}>
                <span className="faint">{new Date(m.at).toLocaleTimeString(NUM_LOCALE, { hour: "2-digit", minute: "2-digit" })}</span> · {m.text}
              </div>
            ))}
            <div className="row" style={{ gap: 8 }}>
              <button className="btn small" disabled={credits < v.decoyCost} onClick={() => void run("decoy")} title="Più di metà delle volte ci casca: per dodici ore cerca altrove">
                Depistalo · {v.decoyCost.toLocaleString(NUM_LOCALE)} CR
              </button>
              <button className="btn small danger" disabled={credits < v.bribeCost} onClick={() => void run("bribe")} title="Accetta meno di metà delle volte: se rifiuta, lo mette a verbale">
                Compralo · {v.bribeCost.toLocaleString(NUM_LOCALE)} CR
              </button>
            </div>
          </>
        ) : (
          <p className="dim" style={{ margin: 0 }}>
            Qualcuno della Guardia di Notte sta trovando le tue righe nei log: {v.watchers.map((w) => `${w.handle} (${w.att}/5)`).join(", ")}. A cinque prende il tuo caso.
          </p>
        )}
        {v.favor ? (
          <div className="t-amber" style={{ fontSize: 13 }}>
            {v.favor.handle} ti ha chiesto un favore: «{v.favor.title}», nella tua bacheca, ancora per {ore(v.favor.until - ctx.serverNow)}.
          </div>
        ) : null}
        {msg ? <span className="t-amber">{msg}</span> : null}
      </div>
    </div>
  );
}

/** Operazioni lunghe: talpe per i rossi, infiltrazioni per i blu. Lavorano anche quando sei scollegato. */
function LongOpsPanel({ ctx }: { ctx: DeckCtx }) {
  const [v, setV] = useState<LongOpsView | null>(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const r = await net.do("longop", {}, true);
    if (r.ok) setV(r.data as LongOpsView);
  }, []);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);
  const run = async (cmd: string, p: Record<string, unknown>) => {
    const r = await net.do("longop", { cmd, ...p });
    setMsg(r.ok ? (r.note ?? "") : (r.error ?? "errore"));
    if (r.ok) setV(r.data as LongOpsView);
  };
  if (!v) return null;
  const red = ctx.state.me.faction === "red";
  const full = v.ops.length >= v.max;
  const credits = ctx.state.me.credits;
  const hours = (t: number) => ore(t - ctx.serverNow);
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">Operazioni lunghe</span>
        <span className="faint">
          {v.ops.length}/{v.max} in corso
        </span>
      </div>
      <div className="panel-body list" style={{ gap: 8 }}>
        <p className="dim" style={{ margin: 0, fontSize: 13 }}>
          {red
            ? `Una talpa è un dipendente indebitato di cui hai il fascicolo: per ${MOLE_DAYS} giorni, ogni sei ore, ti passa quello che vede. Ogni volta possono scoprirla.`
            : `Sotto copertura in una banda di abitanti rossi: per ${COVER_DAYS} giorni, ogni sei ore, sai dove colpiranno, e qualcuno finisce dentro. Ogni volta possono scoprirti.`}{" "}
          Lavorano anche quando sei scollegato.
        </p>
        {v.ops.map((o) => (
          <div key={o.id} className="list" style={{ gap: 4, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            <div className="spread">
              <b>{o.title}</b>
              <span className="row" style={{ gap: 6 }}>
                <span className="faint" style={{ fontSize: 12 }}>
                  prossimo esito fra {hours(o.nextAt)} · finisce fra {hours(o.until)}
                </span>
                <button className="btn small" onClick={() => void run("recall", { id: o.id })}>
                  Chiudi
                </button>
              </span>
            </div>
            {o.log.map((l, i) => (
              <div key={i} className="dim" style={{ fontSize: 12 }}>
                <span className="faint">{new Date(l.at).toLocaleTimeString(NUM_LOCALE, { hour: "2-digit", minute: "2-digit" })}</span> · {l.text}
              </div>
            ))}
          </div>
        ))}
        {red && v.moles.length ? (
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {v.moles.map((m) => (
              <button key={m.pid} className="btn small" disabled={full || credits < MOLE_COST} onClick={() => void run("mole", { pid: m.pid })} title={`Debiti per ${m.debt.toLocaleString(NUM_LOCALE)} CR`}>
                Talpa: {m.name} ({m.employer}) · {MOLE_COST.toLocaleString(NUM_LOCALE)} CR
              </button>
            ))}
          </div>
        ) : null}
        {red && !v.moles.length ? <span className="faint" style={{ fontSize: 12 }}>Nessun candidato: servono il fascicolo di un dipendente e debiti oltre 3.000 CR.</span> : null}
        {!red ? (
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {v.gangs.map((g) => (
              <button key={g.id} className="btn small" disabled={full || credits < COVER_COST} onClick={() => void run("cover", { gang: g.id })}>
                Infiltrati: {g.name} · {COVER_COST.toLocaleString(NUM_LOCALE)} CR
              </button>
            ))}
          </div>
        ) : null}
        {msg ? <span className="t-amber">{msg}</span> : null}
      </div>
    </div>
  );
}
