// I toni della Blue Box: il centralino suona una sequenza, tu la ripeti sul tastierino.
import { useEffect, useRef, useState } from "react";
import type { ToneView } from "../../../shared/tones.ts";
import { TONE_BONUS_FINDS, TONE_FAIL_COST, TONE_KEYS, toneFreq } from "../../../shared/tones.ts";
import { fmtCr } from "../../../shared/rules.ts";
import { net } from "../net.ts";
import { sfx } from "../audio.ts";

const STEP_MS = 520;

export function Tones({ tone }: { tone: ToneView }) {
  const [lit, setLit] = useState<number | null>(null);
  const [listening, setListening] = useState(true);
  const [typed, setTyped] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const timers = useRef<number[]>([]);
  const open = tone.state === "open";
  const sig = `${tone.round}:${tone.seq.join(",")}:${tone.state}`;

  // a ogni giro nuovo il centralino risuona la sequenza
  useEffect(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setTyped([]);
    setLit(null);
    if (!open) {
      setListening(false);
      return;
    }
    setListening(true);
    tone.seq.forEach((k, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setLit(k);
          sfx.dtmf(...toneFreq(k), 0.3);
        }, 700 + i * STEP_MS),
        window.setTimeout(() => setLit(null), 700 + i * STEP_MS + 330),
      );
    });
    timers.current.push(window.setTimeout(() => setListening(false), 700 + tone.seq.length * STEP_MS));
    return () => {
      for (const t of timers.current) window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const press = async (k: number) => {
    if (!open || listening || busy) return;
    sfx.dtmf(...toneFreq(k));
    setLit(k);
    window.setTimeout(() => setLit((c) => (c === k ? null : c)), 160);
    const next = [...typed, k];
    setTyped(next);
    if (next.length < tone.seq.length) return;
    setBusy(true);
    const r = await net.do("tone", { act: "dial", keys: next }, true);
    const d = (r.data ?? {}) as { lost?: boolean; won?: boolean };
    if (!r.ok || d.lost) sfx.bad();
    else if (d.won) sfx.ok();
    setBusy(false);
  };

  return (
    <div className={`tone-box ${tone.state}`}>
      <div className="spread">
        <span className="label">Blue Box · linea aperta</span>
        <span className="faint" style={{ fontSize: 12 }}>
          giro {Math.min(tone.round + 1, tone.rounds)}/{tone.rounds}
        </span>
      </div>
      <div className="tone-main">
        <div className="tone-pad" role="group" aria-label="Tastierino">
          {TONE_KEYS.map((label, k) => (
            <button key={label} className={`tone-key ${lit === k ? "lit" : ""}`} disabled={!open || listening || busy} onClick={() => void press(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="tone-side">
          <div className="tone-slots" aria-live="polite">
            {tone.seq.map((k, i) => (
              <span key={i} className={i < typed.length || !open ? "on" : ""}>
                {!open ? TONE_KEYS[k] : i < typed.length ? TONE_KEYS[typed[i]!] : "·"}
              </span>
            ))}
          </div>
          <p className="fw-hint">
            {tone.state === "won" ? (
              <span className="t-green">Il centralino ti ha passato le linee riservate: {TONE_BONUS_FINDS} nodi in più, e più probabilità che risponda qualcosa di segreto.</span>
            ) : tone.state === "lost" ? (
              <span className="t-red">Tono sbagliato: l'operatore ha sentito. La sequenza era questa. La scansione continua.</span>
            ) : listening ? (
              <span className="t-amber">Ascolta…</span>
            ) : (
              <>
                Ripeti i {tone.seq.length} toni. Tre giri, ogni volta uno in più. Un errore costa {fmtCr(TONE_FAIL_COST)} di interurbana.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
