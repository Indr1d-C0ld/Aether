// I rotori del Decrypter: si girano, si prova la chiave, si legge quanti sono allineati.
// La chiave resta sul server finché la partita è aperta.
import { useState } from "react";
import type { RotorView } from "../../../shared/rotors.ts";
import { ROTOR_CLEAN, ROTOR_SYMBOLS } from "../../../shared/rotors.ts";
import { net } from "../net.ts";
import { sfx } from "../audio.ts";

const K = ROTOR_SYMBOLS.length;

export function Rotors({ rotor }: { rotor: RotorView }) {
  const [pos, setPos] = useState<number[]>(() => new Array<number>(rotor.rotors).fill(0));
  const [busy, setBusy] = useState(false);
  const open = rotor.state === "open";
  const same = rotor.guesses.some((x) => x.g.every((v, i) => v === pos[i]));

  const turn = (i: number, d: number) => {
    if (!open) return;
    sfx.key();
    setPos((p) => p.map((v, j) => (j === i ? (v + d + K) % K : v)));
  };
  const attempt = async () => {
    if (busy || !open || same) return;
    setBusy(true);
    const r = await net.do("rotor", { act: "try", guess: pos }, true);
    const d = (r.data ?? {}) as { won?: boolean; lost?: boolean; exact?: number };
    if (!r.ok || d.lost) sfx.bad();
    else if (d.won) sfx.ok();
    else sfx.click();
    setBusy(false);
  };
  const shown = open ? pos : (rotor.code ?? pos);

  return (
    <div className={`rot-box ${rotor.state}`}>
      <div className="spread">
        <span className="label">Chiave di {rotor.fileName}</span>
        <span className="fw-pips" title="prove rimaste">
          {Array.from({ length: rotor.tries }, (_, i) => (
            <i key={i} className={rotor.tries - i <= ROTOR_CLEAN ? "spare" : ""} />
          ))}
          <b>{rotor.tries}</b>
        </span>
      </div>
      <div className="rot-main">
        <div className="rot-wheels">
          {shown.map((v, i) => (
            <div className="rot-wheel" key={i}>
              <button className="rot-arrow" disabled={!open} onClick={() => turn(i, 1)} aria-label={`rotore ${i + 1}: avanti`}>
                ▲
              </button>
              <div className="rot-face" aria-live="polite">
                <span className="rot-ghost">{ROTOR_SYMBOLS[(v + 1) % K]}</span>
                <span className="rot-sym">{ROTOR_SYMBOLS[v]}</span>
                <span className="rot-ghost">{ROTOR_SYMBOLS[(v + K - 1) % K]}</span>
              </div>
              <button className="rot-arrow" disabled={!open} onClick={() => turn(i, -1)} aria-label={`rotore ${i + 1}: indietro`}>
                ▼
              </button>
            </div>
          ))}
          <button className="btn primary rot-try" disabled={!open || busy || same} onClick={() => void attempt()}>
            {same && open ? "già provata" : "Prova"}
          </button>
        </div>
        <ol className="rot-log">
          {rotor.guesses.map((x, n) => (
            <li key={n} className={x.exact === rotor.rotors ? "ok" : ""}>
              <span className="rot-code">{x.g.map((v) => ROTOR_SYMBOLS[v]).join(" ")}</span>
              <span className="rot-fb" aria-label={`${x.exact} allineati, ${x.near} fuori posto`}>
                {"●".repeat(x.exact)}
                <em>{"○".repeat(x.near)}</em>
                <s>{"·".repeat(rotor.rotors - x.exact - x.near)}</s>
              </span>
            </li>
          ))}
          {!rotor.guesses.length ? <li className="faint">Nessuna prova ancora.</li> : null}
        </ol>
      </div>
      <p className="fw-hint">
        {rotor.state === "won" ? (
          <span className="t-green">Chiave trovata: il file è in chiaro.</span>
        ) : rotor.state === "lost" ? (
          <span className="t-red">Prove finite: la chiave è stata ruotata{rotor.manual ? ", e il monitor ti ha sentito" : ""}. Era quella qui sopra.</span>
        ) : (
          <>
            ● rotore allineato · ○ simbolo giusto sul rotore sbagliato. Un simbolo può ripetersi.
            {rotor.manual ? " Qui il tuo Decrypter non arriva: o la trovi, o il monitor accelera." : ` Trovala con almeno ${ROTOR_CLEAN} prove avanzate e il trace si ferma per dieci secondi.`}
          </>
        )}
      </p>
    </div>
  );
}
