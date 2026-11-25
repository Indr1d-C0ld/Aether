// Persone: chi conosci, dov'è adesso, cosa sai di lei e cosa puoi farle.
import { useCallback, useEffect, useState } from "react";
import type { CitizenRow } from "../../../shared/citizens.ts";
import { fmtCr } from "../../../shared/rules.ts";
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
