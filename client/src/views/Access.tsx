import { useEffect, useRef, useState } from "react";
import type { Faction } from "../../../shared/types.ts";
import { net, type Snapshot } from "../net.ts";
import { drawRain, drawSkyline } from "../pixel.ts";
import { sfx } from "../audio.ts";
import { music } from "../music.ts";
import { AudioToggles } from "./AudioToggles.tsx";
import { art } from "../art.tsx";

/** L'APK dell'app Android, allegato all'ultima release su GitHub (android/README.md). */
const ANDROID_APK = "https://github.com/Indr1d-C0ld/Aether/releases/latest/download/aether.apk";
import { DevLog } from "./DevLog.tsx";

export function Access({ snap }: { snap: Snapshot }) {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [handle, setHandle] = useState("");
  const [pass, setPass] = useState("");
  const [faction, setFaction] = useState<Faction>("red");
  const sky = useRef<HTMLCanvasElement>(null);
  const [hero, setHero] = useState<"try" | "ok" | "none">("try");
  const heroRef = useRef(hero);
  heroRef.current = hero;

  useEffect(() => {
    music.setMood("title");
  }, []);

  useEffect(() => {
    const c = sky.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    let raf = 0;
    const loop = (t: number) => {
      if (heroRef.current === "ok") drawRain(g, c.width, c.height, t);
      else drawSkyline(g, c.width, c.height, t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const busy = snap.status !== "online";
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    sfx.connect();
    net.auth(mode, handle.trim(), pass, faction);
  };

  return (
    <div className={`access faction-${faction}`}>
      <div className="access-grid">
        <section>
          <div className="spread">
            <p className="label t-fac" style={{ margin: 0 }}>
              Reticolo · 2039
            </p>
            <AudioToggles />
          </div>
          <h1 className="logo glitch" data-text="AETHER">
            AETHER
          </h1>
          <p style={{ fontSize: 17, maxWidth: 560 }} className="dim">
            Un deck d'intrusione persistente. Non sei un avatar: sei un handle in una rete condivisa, dove i contratti pagano, il trace brucia e i log
            ricordano tutto quello che non cancelli.
          </p>
          <div style={{ position: "relative" }}>
            {hero !== "none" ? (
              <img src={art.hero} alt="" className="sky" style={{ display: hero === "ok" ? "block" : "none" }} onLoad={() => setHero("ok")} onError={() => setHero("none")} />
            ) : null}
            <canvas
              ref={sky}
              className="sky"
              width={320}
              height={120}
              aria-hidden
              style={hero === "ok" ? { position: "absolute", inset: 0, marginTop: 18, border: "none", height: "auto" } : undefined}
            />
          </div>
          <ol className="list" style={{ paddingLeft: 0, listStyle: "none", marginTop: 18 }}>
            <li>
              <span className="t-amber px" style={{ fontSize: 20 }}>
                01
              </span>{" "}
              Rimbalza sui relay, abbatti proxy e firewall, forza la password. Stacca prima che il monitor risalga al tuo gateway.
            </li>
            <li>
              <span className="t-mag px" style={{ fontSize: 20 }}>
                02
              </span>{" "}
              I rossi rubano, cancellano, riscrivono, avvelenano i relay e incastrano i rivali.
            </li>
            <li>
              <span className="t-cyan px" style={{ fontSize: 20 }}>
                03
              </span>{" "}
              I blu leggono i log, seguono gli IP fino al colpevole, presidiano i nodi e tendono trappole.
            </li>
          </ol>
        </section>

        <form className="panel" onSubmit={submit}>
          <div className="panel-head">
            <span className="label">Identificazione</span>
            <span className={`chip ${snap.status === "online" ? "green" : "amber"}`}>{snap.status === "online" ? "carrier ok" : "in attesa di carrier"}</span>
          </div>
          <div className="panel-body list" style={{ gap: 12 }}>
            <div className="tabs">
              <button type="button" className={mode === "register" ? "on" : ""} onClick={() => setMode("register")}>
                Nuovo handle
              </button>
              <button type="button" className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>
                Rientra
              </button>
            </div>
            <label className="list" style={{ gap: 4 }}>
              <span className="label">Handle</span>
              <input value={handle} onChange={(e) => setHandle(e.target.value)} autoComplete="username" placeholder="es. NEON_RAT" maxLength={16} required />
            </label>
            <label className="list" style={{ gap: 4 }}>
              <span className="label">Chiave</span>
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                minLength={6}
                required
              />
            </label>
            {mode === "register" ? (
              <div className="list" style={{ gap: 6 }}>
                <span className="label">Cellula</span>
                <div className="faction-pick">
                  <button type="button" className={`faction-card red ${faction === "red" ? "on" : ""}`} onClick={() => setFaction("red")}>
                    <div className="px t-mag" style={{ fontSize: 26 }}>
                      ROSSO
                    </div>
                    <div className="dim" style={{ fontSize: 13 }}>
                      Intrusione, furto, sabotaggio. Vivi del trace che riesci a battere.
                    </div>
                  </button>
                  <button type="button" className={`faction-card blue ${faction === "blue" ? "on" : ""}`} onClick={() => setFaction("blue")}>
                    <div className="px t-cyan" style={{ fontSize: 26 }}>
                      BLU
                    </div>
                    <div className="dim" style={{ fontSize: 13 }}>
                      Difesa, forensica, caccia. Ogni log dimenticato è un nome.
                    </div>
                  </button>
                </div>
              </div>
            ) : null}
            {snap.authError ? <p className="t-red" style={{ margin: 0 }}>{snap.authError}</p> : null}
            <button className="btn primary" disabled={busy}>
              {mode === "register" ? "Apri il canale" : "Rientra nel deck"}
            </button>
            <p className="faint" style={{ margin: 0, fontSize: 12 }}>
              L'handle è pubblico e compare in classifica. La chiave resta sul server, cifrata.
            </p>
            {/* dentro l'app Android il link non serve: la riconosce dal referrer con cui la apre */}
            {document.referrer.startsWith("android-app://") ? null : (
              <p className="faint" style={{ margin: 0, fontSize: 12 }}>
                Su Android c'è anche l'app:{" "}
                <a href={ANDROID_APK} className="t-fac">
                  scarica l'APK
                </a>{" "}
                (si installa a mano, permettendo le app da origini sconosciute).
              </p>
            )}
          </div>
        </form>
        <div className="access-wide">
          <DevLog />
        </div>
      </div>
    </div>
  );
}
