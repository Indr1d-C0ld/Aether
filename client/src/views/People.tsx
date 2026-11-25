// Persone: chi conosci, dov'è adesso, cosa sai di lei e cosa puoi farle.
import { useCallback, useEffect, useState } from "react";
import type { CitizenRow } from "../../../shared/citizens.ts";
import { fmtCr } from "../../../shared/rules.ts";
import { net } from "../net.ts";
import type { DeckCtx } from "./Deck.tsx";

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
    </div>
  );
}
