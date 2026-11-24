// Sottosistemi di un nodo: le «stanze» in cui muoversi una volta dentro. Ognuna chiede un livello
// di accesso (impiegato, operatore, admin) e offre poche azioni; la posta interna si legge qui.
import { useEffect, useState } from "react";
import type { OpView } from "../../../shared/types.ts";
import { CLEARANCE, type MailMsg, type ZoneView } from "../../../shared/zones.ts";
import { net } from "../net.ts";
import { sfx } from "../audio.ts";
import { Decode, TypeOut } from "../cinema.tsx";

const ICON: Record<string, string> = { posta: "✉", centralino: "☎", telecamere: "◉", contabilita: "¤", personale: "☰", rete: "⌬" };

export function ZonesPanel({ op }: { op: OpView }) {
  const [sel, setSel] = useState<string | null>(null);
  const [out, setOut] = useState<string[] | null>(null);
  const zones = op.zones;
  const zone = zones.find((z) => z.id === sel) ?? null;
  useEffect(() => {
    setSel(null);
    setOut(null);
  }, [op.id]);
  if (!zones.length) return null;
  const run = async (z: ZoneView, act: string) => {
    sfx.click();
    const r = await net.do("zone", { zone: z.id, act });
    const lines = (r.data as { lines?: string[] } | undefined)?.lines;
    setOut(lines ?? null);
  };
  return (
    <div className="panel" style={{ gridColumn: "1 / -1" }}>
      <div className="panel-head">
        <span className="label">Sottosistemi</span>
        <span className={op.clearance ? "t-green" : "faint"}>
          il tuo livello: <b>{CLEARANCE[op.clearance]}</b>
        </span>
      </div>
      <div className="panel-body list">
        {op.clearance === 0 ? (
          <p className="dim" style={{ margin: 0, fontSize: 13 }}>
            Non serve per forza la password di root. Con le credenziali personali di un dipendente (nome e anno di nascita: l'anagrafe li conosce) entri da{" "}
            <b>impiegato</b>; la password dell'<b>operatore</b> gira nella posta interna. Scrivile nel login qui sopra.
          </p>
        ) : null}
        <div className="zones">
          {zones.map((z) => (
            <button
              key={z.id}
              className={`zone ${z.open ? "open" : "locked"} ${sel === z.id ? "on" : ""}`}
              onClick={() => {
                setSel(z.id === sel ? null : z.id);
                setOut(null);
              }}
              aria-pressed={sel === z.id}
            >
              <span className="zone-icon">{ICON[z.id] ?? "▣"}</span>
              <span className="px zone-name">{z.name}</span>
              <span className={z.open ? "t-green" : "t-red"} style={{ fontSize: 11 }}>
                {z.open ? "aperto" : `serve: ${CLEARANCE[z.need]}`}
              </span>
            </button>
          ))}
        </div>
        {zone ? (
          <div className="zone-body">
            <div className="dim" style={{ fontSize: 13 }}>
              <Decode key={zone.id} text={zone.blurb} ms={400} />
            </div>
            {!zone.open ? (
              <p className="t-amber" style={{ margin: 0 }}>
                Porta chiusa: serve il livello {CLEARANCE[zone.need]}.
              </p>
            ) : (
              <>
                {zone.id === "posta" ? <Mailbox key={op.id} /> : null}
                {zone.actions.map((a) => (
                  <div key={a.id} className="spread zone-act">
                    <span style={{ minWidth: 0 }}>
                      <b>{a.name}</b>
                      <div className="faint" style={{ fontSize: 12 }}>
                        {a.desc}
                      </div>
                    </span>
                    <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      {a.blocked ? <span className="t-amber" style={{ fontSize: 12 }}>{a.blocked}</span> : null}
                      <button className="btn small" disabled={Boolean(a.blocked)} onClick={() => void run(zone, a.id)}>
                        Esegui
                      </button>
                    </span>
                  </div>
                ))}
                {out ? <TypeOut lines={out} /> : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Mailbox() {
  const [mail, setMail] = useState<MailMsg[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = async () => {
    const r = await net.do("zone", { zone: "posta", act: "leggi" }, true);
    if (r.ok) setMail((r.data as { mail: MailMsg[] }).mail);
  };
  useEffect(() => {
    void load();
  }, []);
  if (!mail) return <p className="dim">Apro le caselle…</p>;
  const msg = mail.find((m) => m.id === open) ?? null;
  return (
    <div className="mailbox">
      <div className="mailbox-list">
        {mail.map((m) => (
          <button key={m.id} className={`${m.id === open ? "on" : ""} ${m.act && !m.act.done ? "hot" : ""}`} onClick={() => setOpen(m.id)}>
            <span className="mailbox-from">{m.from}</span>
            <span className="mailbox-subj">{m.subject}</span>
          </button>
        ))}
      </div>
      <div className="mailbox-msg">
        {msg ? (
          <>
            <div className="faint" style={{ fontSize: 12 }}>
              Da: {msg.from} · A: {msg.to}
            </div>
            <div className="px" style={{ fontSize: 20 }}>
              {msg.subject}
            </div>
            <pre>{msg.body}</pre>
            {msg.act ? (
              <button
                className="btn small primary"
                disabled={msg.act.done}
                onClick={() => void net.do("zone", { zone: "posta", act: msg.act!.kind, arg: msg.id }).then(() => load())}
              >
                {msg.act.done ? "Già fatto" : msg.act.label}
              </button>
            ) : null}
          </>
        ) : (
          <p className="dim" style={{ margin: 0 }}>
            {mail.length} messaggi. Quelli evidenziati hanno qualcosa da portare via.
          </p>
        )}
      </div>
    </div>
  );
}
