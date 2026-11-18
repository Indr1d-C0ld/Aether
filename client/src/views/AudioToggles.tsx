import { useSyncExternalStore } from "react";
import { cine, useCine } from "../cinema.tsx";
import { getAudioSettings, onAudioSettings, setAudioSettings } from "../audio.ts";

/** Interruttori separati per musica ed effetti, con il volume della musica. */
export function AudioToggles() {
  const s = useSyncExternalStore(onAudioSettings, getAudioSettings);
  const c = useCine();
  return (
    <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
      <button className={`btn small ${s.music ? "" : "dim"}`} onClick={() => setAudioSettings({ music: !s.music })} title="Musica" aria-pressed={s.music}>
        {s.music ? "♪ musica" : "♪ off"}
      </button>
      {s.music ? (
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={s.musicVol}
          onChange={(e) => setAudioSettings({ musicVol: Number(e.target.value) })}
          aria-label="Volume musica"
          style={{ width: 70, minHeight: 0, padding: 0, accentColor: "var(--faction)" }}
        />
      ) : null}
      <button className={`btn small ${s.sfx ? "" : "dim"}`} onClick={() => setAudioSettings({ sfx: !s.sfx })} title="Effetti" aria-pressed={s.sfx}>
        {s.sfx ? "fx on" : "fx off"}
      </button>
      <button className={`btn small ${c ? "" : "dim"}`} onClick={() => cine.set(!c)} title="Animazioni cinematografiche" aria-pressed={c}>
        {c ? "cine on" : "cine off"}
      </button>
    </div>
  );
}
