// Dev-log: le ultime novità, sulla pagina d'ingresso e nel deck (scheda Feed).
import { useState } from "react";
import { DEVLOG } from "../../../shared/devlog.ts";
import { NUM_LOCALE } from "../../../shared/rules.ts";
import { lang } from "../i18n.ts";

const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(NUM_LOCALE, { day: "numeric", month: "long", year: "numeric" });

export function DevLog({ first = 1 }: { first?: number }) {
  const [open, setOpen] = useState<Set<string>>(new Set(DEVLOG.slice(0, first).map((e) => e.v)));
  const toggle = (v: string) => {
    const n = new Set(open);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    setOpen(n);
  };
  return (
    <section className="panel devlog" aria-label="Dev-log">
      <div className="panel-head">
        <span className="label">Dev-log · novità del gioco</span>
        {lang === "en" ? <span className="faint">older entries in Italian</span> : null}
        <span className="faint">v{DEVLOG[0]!.v}</span>
      </div>
      <div className="panel-body list" style={{ gap: 0 }}>
        {DEVLOG.map((e) => (
          <article key={e.v} className={`devlog-entry ${open.has(e.v) ? "open" : ""}`}>
            <button className="devlog-head" onClick={() => toggle(e.v)} aria-expanded={open.has(e.v)} data-i18n-skip={lang === "en" && !e.en ? "" : undefined}>
              <span className="px t-fac devlog-v">v{e.v}</span>
              <span className="devlog-title">
                {lang === "en" && e.en ? e.en.title : e.title}
                <span className="faint devlog-date">{fmt(e.date)}</span>
              </span>
              <span className="faint">{open.has(e.v) ? "−" : "+"}</span>
            </button>
            {open.has(e.v) ? (
              <div className="devlog-body" data-i18n-skip={lang === "en" && !e.en ? "" : undefined}>
                <div className="row" style={{ gap: 4 }}>
                  {e.tags.map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                </div>
                <ul>
                  {(lang === "en" && e.en ? e.en.items : e.items).map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
