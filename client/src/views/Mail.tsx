import { useState } from "react";
import { latticeClock } from "../../../shared/rules.ts";
import { net } from "../net.ts";
import type { DeckCtx } from "./Deck.tsx";

export function Mail({ ctx }: { ctx: DeckCtx }) {
  const mail = ctx.state.mail;
  const [open, setOpen] = useState<string | null>(mail[0]?.id ?? null);
  const m = mail.find((x) => x.id === open) ?? null;
  return (
    <div className="list" style={{ gap: 14 }}>
      <div className="view-title">
        <h2>Posta</h2>
        <span className="dim">{mail.filter((x) => x.unread).length} non lette</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 320px) 1fr", gap: 14 }} className="mail-layout">
        <div className="list" style={{ gap: 6, alignContent: "start" }}>
          {mail.map((x) => (
            <button
              key={x.id}
              className={`mail-item ${x.unread ? "unread" : ""} ${x.id === open ? "on" : ""}`}
              onClick={() => {
                setOpen(x.id);
                if (x.unread) void net.do("readMail", { id: x.id });
              }}
            >
              <div className="spread">
                <span className="t-fac" style={{ fontSize: 12 }}>{x.from}</span>
                <span className="faint" style={{ fontSize: 11 }}>{latticeClock(x.at).slice(11, 16)}</span>
              </div>
              <div>{x.subject}</div>
            </button>
          ))}
          {!mail.length ? <p className="dim">Casella vuota.</p> : null}
        </div>
        {m ? (
          <article className="panel">
            <div className="panel-head">
              <span className="label">{m.from}</span>
              <span className="faint">{latticeClock(m.at)}</span>
            </div>
            <div className="panel-body">
              <div className="px" style={{ fontSize: 28, marginBottom: 10 }}>
                {m.subject}
              </div>
              <div className="mail-body">{m.body}</div>
            </div>
          </article>
        ) : null}
      </div>
      <style>{`@media (max-width: 860px){ .mail-layout{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
