// La barriera biometrica e l'oscilloscopio: due tracce, quattro manopole, tre letture.
import { useMemo, useState } from "react";
import type { BioView } from "../../../shared/bio.ts";
import { BIO_NAME, BIO_SAMPLE, BIO_WHERE, SCOPE_FAIL_TRACE, SCOPE_KNOBS, SCOPE_START, SCOPE_TRIES, scopeWave, type ScopeParams } from "../../../shared/bio.ts";
import { net } from "../net.ts";
import { sfx } from "../audio.ts";

const W = 320;
const H = 120;
const path = (ys: number[]) => ys.map((v, i) => `${i ? "L" : "M"}${((i / (ys.length - 1)) * W).toFixed(1)},${(H / 2 - v * (H / 2 - 6)).toFixed(1)}`).join(" ");

export function BioBarrier({ bio, proxyDown }: { bio: BioView; proxyDown: boolean }) {
  if (bio.passed) {
    return (
      <div className="bio-box won">
        <div className="spread">
          <span className="label">{BIO_NAME[bio.kind]}</span>
          <span className="t-green" style={{ fontSize: 12 }}>
            identità confermata
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className={`bio-box ${bio.locked ? "lost" : ""}`}>
      <div className="spread">
        <span className="label">{BIO_NAME[bio.kind]}</span>
        <span className={bio.locked ? "t-red" : "t-amber"} style={{ fontSize: 12 }}>
          {bio.locked ? "lettore bloccato" : "attivo"}
        </span>
      </div>
      <p className="fw-hint">
        L'accesso admin vuole anche {BIO_SAMPLE[bio.kind]} di <b className="t-amber">{bio.who}</b>: né la password né il Password Breaker bastano.
      </p>
      {bio.scope ? (
        <Scope bio={bio} />
      ) : bio.locked ? null : bio.have ? (
        <button
          className="btn primary"
          disabled={!proxyDown}
          onClick={() => {
            sfx.click();
            void net.do("scope", { act: "open" });
          }}
        >
          {proxyDown ? "Presenta il campione" : "Prima abbatti il proxy"}
        </button>
      ) : (
        <p className="fw-hint">
          <span className="t-red">Non hai il campione.</span> {BIO_WHERE[bio.kind]}
        </p>
      )}
    </div>
  );
}

function Scope({ bio }: { bio: BioView }) {
  const scope = bio.scope!;
  const [p, setP] = useState<ScopeParams>(SCOPE_START);
  const [busy, setBusy] = useState(false);
  const open = scope.state === "open";
  const mine = useMemo(() => path(scopeWave(p)), [p]);
  const target = useMemo(() => path(scope.target), [scope.target]);

  const turn = (key: keyof ScopeParams, d: number, min: number, max: number) => {
    if (!open) return;
    sfx.key();
    setP((q) => ({ ...q, [key]: Math.min(max, Math.max(min, q[key] + d)) }));
  };
  const present = async () => {
    if (busy || !open) return;
    setBusy(true);
    const r = await net.do("scope", { act: "try", params: p }, true);
    const d = (r.data ?? {}) as { won?: boolean };
    if (d.won) sfx.ok();
    else sfx.bad();
    setBusy(false);
  };

  return (
    <div className="scope">
      <svg viewBox={`0 0 ${W} ${H}`} className="scope-screen" role="img" aria-label="Oscilloscopio: la traccia registrata e la tua">
        {[1, 2, 3].map((i) => (
          <line key={`h${i}`} x1={0} x2={W} y1={(H / 4) * i} y2={(H / 4) * i} className="scope-grid" />
        ))}
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <line key={`v${i}`} y1={0} y2={H} x1={(W / 8) * i} x2={(W / 8) * i} className="scope-grid" />
        ))}
        <path d={target} className="scope-target" />
        <path d={mine} className="scope-mine" />
      </svg>
      <div className="scope-legend">
        <span className="t-amber">▬ registrata</span>
        <span className="t-cyan">▬ la tua</span>
        <span className="fw-pips" title="letture rimaste">
          {Array.from({ length: scope.tries }, (_, i) => (
            <i key={i} />
          ))}
          <b>
            {scope.tries}/{SCOPE_TRIES}
          </b>
        </span>
      </div>
      <div className="scope-knobs">
        {SCOPE_KNOBS.map((k) => (
          <div className="scope-knob" key={k.key}>
            <span className="label">{k.name}</span>
            <div className="row" style={{ gap: 4 }}>
              <button className="rot-arrow" style={{ width: 28 }} disabled={!open || p[k.key] <= k.min} onClick={() => turn(k.key, -1, k.min, k.max)} aria-label={`${k.name}: meno`}>
                −
              </button>
              <span className="scope-val">{p[k.key]}</span>
              <button className="rot-arrow" style={{ width: 28 }} disabled={!open || p[k.key] >= k.max} onClick={() => turn(k.key, 1, k.min, k.max)} aria-label={`${k.name}: più`}>
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <button className="btn primary" disabled={!open || busy} onClick={() => void present()}>
        Presenta al lettore
      </button>
      <p className="fw-hint">
        {scope.state === "lost" ? (
          <span className="t-red">Tre letture respinte: il lettore è bloccato per questa connessione.</span>
        ) : scope.last !== null ? (
          <span className="t-red">
            Respinto: somiglianza {scope.last}%. Il trace è avanzato del {Math.round(SCOPE_FAIL_TRACE * 100)}%.
          </span>
        ) : (
          <>Sovrapponi la tua traccia a quella registrata e presentala. Ogni lettura respinta fa avanzare il trace; alla terza il lettore si blocca.</>
        )}
      </p>
    </div>
  );
}
