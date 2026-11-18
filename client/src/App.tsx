import { useEffect, useRef } from "react";
import { useNet } from "./hooks.ts";
import { Access } from "./views/Access.tsx";
import { Deck } from "./views/Deck.tsx";
import { sfx } from "./audio.ts";

export function App() {
  const snap = useNet();
  const seen = useRef(0);
  useEffect(() => {
    const last = snap.toasts.at(-1);
    if (!last || last.id <= seen.current) return;
    seen.current = last.id;
    const tx = last.text;
    if (/TRACCIATO/.test(tx)) sfx.caught();
    else if (/INTRUSIONE|CONTRO-TRACE/.test(tx)) sfx.siren();
    else if (/^Posta:/.test(tx)) sfx.mail();
    else if (/trasferiti|consegnato|Bounty|Provvigione/i.test(tx)) sfx.cash();
    else if (last.tone === "bad") sfx.bad();
    else if (last.tone === "ok") sfx.ok();
  }, [snap.toasts]);

  // tastiera meccanica: un tic per ogni tasto nei campi di testo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA") && e.key.length === 1) sfx.key();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {snap.authed && snap.state ? <Deck snap={snap} /> : <Access snap={snap} />}
      <div className="toasts" aria-live="polite">
        {snap.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}
