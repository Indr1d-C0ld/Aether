// Regia: tutto il cinema da hacker anni '90. Caratteri che si sbloccano uno alla volta, foto tessera sfogliate
// a raffica, muri di porte che cadono, dump esadecimali, ACCESS GRANTED a tutto schermo.
// È solo scena: non decide niente, legge lo stato che arriva dal server. Si spegne con l'interruttore «cine».
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { GameState, OpView, TaskView } from "../../shared/types.ts";
import { blip, sfx } from "./audio.ts";
import { useFrame } from "./hooks.ts";
import { art } from "./art.tsx";
import { NUM_LOCALE } from "../../shared/rules.ts";

// ------------------------------------------------------------ interruttore

const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
let enabled = (() => {
  try {
    const v = localStorage.getItem("aether.cine");
    return v === null ? !reduced : v === "1";
  } catch {
    return !reduced;
  }
})();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => void subs.delete(fn);
};
export const cine = {
  get: () => enabled,
  set(v: boolean) {
    enabled = v;
    if (!v) shot = null;
    try {
      localStorage.setItem("aether.cine", v ? "1" : "0");
    } catch {
      /* senza storage vale per questa sessione */
    }
    emit();
  },
};
export const useCine = () => useSyncExternalStore(subscribe, cine.get);

// ------------------------------------------------------------ inquadrature a tutto schermo

export type ShotKind = "granted" | "denied" | "traced" | "busted" | "dial" | "money" | "stamp" | "rank" | "nocarrier" | "boot";
export type Shot = { id: number; kind: ShotKind; title: string; sub?: string; lines?: string[]; amount?: number; ms: number; at: number };
let shot: Shot | null = null;
let shotId = 0;
const DUR: Record<ShotKind, number> = { granted: 1500, denied: 900, traced: 2600, busted: 3200, dial: 1700, money: 2000, stamp: 1500, rank: 2400, nocarrier: 900, boot: 1900 };

/** Manda in scena un'inquadratura. L'ultima vince: non si accodano. */
export function shoot(kind: ShotKind, title: string, o: { sub?: string; lines?: string[]; amount?: number } = {}) {
  if (!enabled) return;
  const s: Shot = { id: ++shotId, kind, title, ...o, ms: DUR[kind], at: performance.now() };
  shot = s;
  emit();
  setTimeout(() => {
    if (shot === s) {
      shot = null;
      emit();
    }
  }, s.ms);
}
const useShot = () => useSyncExternalStore(subscribe, () => shot);

// ------------------------------------------------------------ caso riproducibile

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@*+=<>?/";
const HEX = "0123456789ABCDEF";
/** Un numero in [0,1) che dipende solo dai due semi: lo stesso fotogramma dà sempre lo stesso disegno. */
export function rnd(a: number, b = 0) {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12;
  return (x >>> 0) / 4294967296;
}
const pick = (s: string, a: number, b = 0) => s[Math.floor(rnd(a, b) * s.length)]!;
const hex = (n: number, a: number, b = 0) => Array.from({ length: n }, (_, i) => pick(HEX, a + i * 31, b)).join("");
const ip = (a: number, b = 0) => [0, 1, 2, 3].map((i) => 1 + Math.floor(rnd(a + i * 17, b) * 253)).join(".");
const seedOf = (s: string) => [...s].reduce((q, c) => (Math.imul(q, 31) + c.charCodeAt(0)) | 0, 7);

// ------------------------------------------------------------ testo che si decifra

/** Il testo compare come caratteri a caso che si fermano uno dopo l'altro. */
export function Decode({ text, ms = 650, className }: { text: string; ms?: number; className?: string }) {
  const on = useCine();
  const [start, setStart] = useState(() => performance.now());
  useEffect(() => setStart(performance.now()), [text]);
  const t = useFrame(on, 24);
  const k = on ? Math.min(1, (t - start) / ms) : 1;
  if (k >= 1) return <span className={className}>{text}</span>;
  const shown = Math.floor(text.length * k);
  const f = Math.floor(t / 45);
  return (
    <span className={className}>
      {text.slice(0, shown)}
      <span className="cine-scramble">{[...text.slice(shown)].map((c, i) => (c === " " ? " " : pick(GLYPHS, f, shown + i))).join("")}</span>
    </span>
  );
}

/** Righe battute a macchina, una dopo l'altra. */
export function TypeOut({ lines, cps = 90 }: { lines: string[]; cps?: number }) {
  const on = useCine();
  const text = lines.join("\n");
  const [start, setStart] = useState(() => performance.now());
  useEffect(() => setStart(performance.now()), [text]);
  const t = useFrame(on, 24);
  const n = on ? Math.floor(((t - start) / 1000) * cps) : text.length;
  return (
    <pre className="t-green cine-type">
      {text.slice(0, n)}
      {n < text.length ? <span className="cine-caret">█</span> : null}
    </pre>
  );
}

/** Una cifra che scorre fino al valore nuovo invece di saltarci. */
export function Rolling({ value, format }: { value: number; format: (n: number) => string }) {
  const on = useCine();
  const from = useRef(value);
  const [anim, setAnim] = useState<{ a: number; b: number; at: number } | null>(null);
  useEffect(() => {
    if (value !== from.current) {
      if (on) setAnim({ a: from.current, b: value, at: performance.now() });
      from.current = value;
    }
  }, [value, on]);
  const t = useFrame(Boolean(anim), 30);
  if (!anim) return <>{format(value)}</>;
  const k = Math.min(1, (t - anim.at) / 900);
  if (k >= 1) {
    queueMicrotask(() => setAnim(null));
    return <>{format(value)}</>;
  }
  const e = 1 - (1 - k) ** 3;
  return <span className={anim.b > anim.a ? "cine-up" : "cine-down"}>{format(Math.round(anim.a + (anim.b - anim.a) * e))}</span>;
}

// ------------------------------------------------------------ la password che cede

/** Il Password Breaker in scena: le caselle girano a vuoto e si bloccano una alla volta sul carattere giusto. */
export function CrackDisplay({ cracked, running, blocked }: { cracked: string | null; running: boolean; blocked: boolean }) {
  const on = useCine();
  const t = useFrame(on && running, 24);
  const lockedAt = useRef(new Map<number, number>());
  const began = useRef(0);
  if (running && !began.current) began.current = performance.now();
  if (!running) began.current = 0;
  const cells = [...(cracked ?? "????????")];
  const hid = (c: string) => c === "?" || c === "·"; // il server segna così i caratteri ancora ignoti
  cells.forEach((c, i) => {
    if (!hid(c) && cracked && !lockedAt.current.has(i)) {
      lockedAt.current.set(i, performance.now());
      if (on && running) blip(700 + i * 55, 0.05, "square", 0.05);
    }
  });
  if (!cracked) lockedAt.current.clear();
  if (blocked) return <div className="lockline">PROXY</div>;
  if (!on) return <div className="lockline">{cracked ?? "········"}</div>;
  const f = Math.floor(t / 42);
  const tries = running ? Math.floor(((t - began.current) / 1000) * 48211) : 0;
  return (
    <div className={`cine-crack ${running ? "run" : ""}`}>
      <div className="cine-cells">
        {cells.map((c, i) => {
          const open = !hid(c) && Boolean(cracked);
          const fresh = open && performance.now() - (lockedAt.current.get(i) ?? 0) < 450;
          return (
            <span key={i} className={`cine-cell ${open ? "open" : ""} ${fresh ? "fresh" : ""}`}>
              {open ? c : running ? pick(GLYPHS, f, i) : "·"}
            </span>
          );
        })}
      </div>
      {running ? (
        <div className="cine-crack-foot">
          <span>
            BRUTE FORCE · {cracked ? cells.filter((c) => !hid(c)).length : 0}/{cells.length}
          </span>
          <span>{tries.toLocaleString(NUM_LOCALE)} tentativi</span>
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------ gli strumenti al lavoro

const WORDS = "GOD LOVE SECRET SEX PASSWORD ADMIN ROSEBUD JOSHUA PENCIL ZEROCOOL GIBSON SYSTEM GUEST MASTER ORACLE PHOENIX DRAGON SHADOW WIZARD COOKIE MATRIX".split(" ");
const LOGS = ["auth admin from", "session open from", "file read src=", "route via", "passwd fail from", "conn accept from", "proxy relay src=", "fs write from"];
const ASM = ["mov eax,", "xor ebx,", "push", "call", "jmp", "lea esi,", "int 0x80 ;", "cmp al,", "inject →", "patch @"];
const TITLE: Record<string, string> = {
  proxy: "PROXY TUNNEL",
  firewall: "FIREWALL · SCANSIONE PORTE",
  monbypass: "MONITOR · FEED IN LOOP",
  breaker: "BRUTE FORCE",
  dict: "ATTACCO A DIZIONARIO",
  decrypt: "DECIFRATURA",
  copy: "DOWNLOAD",
  upload: "UPLOAD",
  delete: "DISTRUZIONE DATI",
  logdel: "RISCRITTURA DEI LOG",
  patch: "PATCH DEL KERNEL",
  bdkit: "INIEZIONE BACKDOOR",
  worm: "WORM · REPLICAZIONE",
  honey: "ESCA IN POSA",
  forensics: "RICOSTRUZIONE FORENSE",
};
const ROWS = 6;

function Screen({ task, p, f }: { task: TaskView; p: number; f: number }) {
  const seed = seedOf(task.id);
  let body: React.ReactNode;
  switch (task.tool) {
    case "firewall": {
      const cols = 28;
      const cur = Math.floor(rnd(seed, f) * cols * ROWS);
      body = (
        <>
          <div className="cine-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: cols * ROWS }, (_, i) => (
              <i key={i} className={rnd(seed, i + 1000) < p ? "o" : i === cur ? "c" : ""} />
            ))}
          </div>
          <div className="cine-foot">
            PORT 0x{hex(4, seed, f)} {rnd(seed, f + 5) < p ? <b className="t-green">OPEN</b> : <b className="t-red">FILTERED</b>} · {Math.round(p * cols * ROWS)}/{cols * ROWS}
          </div>
        </>
      );
      break;
    }
    case "monbypass": {
      const amp = 1 - p;
      const pts = Array.from({ length: 80 }, (_, i) => {
        const y = 30 + (Math.sin(i * 0.45 + f * 0.6) * 16 + (rnd(seed + i, f) - 0.5) * 22) * amp;
        return `${(i * 320) / 79},${y.toFixed(1)}`;
      }).join(" ");
      body = (
        <>
          <svg viewBox="0 0 320 60" preserveAspectRatio="none" className="cine-scope">
            <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <div className="cine-foot">
            CAM {String(1 + (Math.floor(f / 6) % 8)).padStart(2, "0")} ▸ <span className={f % 8 < 4 ? "t-green" : "faint"}>● REC LOOP</span> · segnale {Math.round(amp * 100)}%
          </div>
        </>
      );
      break;
    }
    case "decrypt": {
      const cols = 34;
      const plain = `${task.label.toUpperCase()} · RISERVATO · NON DIVULGARE · `;
      body = (
        <pre>
          {Array.from({ length: ROWS }, (_, r) => (
            <div key={r}>
              {Array.from({ length: cols }, (_, c) => {
                const i = r * cols + c;
                return rnd(seed, i + 77) < p ? <b key={c}>{plain[i % plain.length]}</b> : <span key={c}>{pick(HEX, f + i, r)}</span>;
              })}
            </div>
          ))}
        </pre>
      );
      break;
    }
    case "copy":
    case "upload": {
      const base = Math.floor(p * 4096) * 16;
      body = (
        <>
          <pre>
            {Array.from({ length: ROWS - 1 }, (_, r) => {
              const off = base + r * 16;
              return `${off.toString(16).toUpperCase().padStart(6, "0")}  ${Array.from({ length: 8 }, (_, c) => hex(2, off, c)).join(" ")}  ${Array.from({ length: 8 }, (_, c) => pick(GLYPHS, off, c + 40)).join("")}\n`;
            }).join("")}
          </pre>
          <div className="cine-foot">
            {task.tool === "copy" ? "REMOTO ▸▸▸ ARCHIVIO" : "ARCHIVIO ▸▸▸ REMOTO"} · blocco {Math.floor(p * 4096)}/4096 · {(180 + rnd(seed, f) * 60).toFixed(0)} kb/s
          </div>
        </>
      );
      break;
    }
    case "delete": {
      const cols = 34;
      body = (
        <>
          <pre>
            {Array.from({ length: ROWS - 1 }, (_, r) =>
              Array.from({ length: cols }, (_, c) => (rnd(seed, r * cols + c) < p ? "░" : rnd(seed, r * cols + c) < p + 0.12 ? "▒" : pick(HEX, f + c, r))).join("") + "\n",
            ).join("")}
          </pre>
          <div className="cine-foot">SHRED · passata {Math.min(3, 1 + Math.floor(p * 3))}/3 · settori azzerati {Math.round(p * 100)}%</div>
        </>
      );
      break;
    }
    case "logdel":
      body = (
        <pre>
          {Array.from({ length: ROWS }, (_, r) => {
            const gone = rnd(seed, r + 300) < p;
            const line = `${String(Math.floor(rnd(seed, r) * 24)).padStart(2, "0")}:${String(Math.floor(rnd(seed, r + 9) * 60)).padStart(2, "0")} ${LOGS[Math.floor(rnd(seed, r + 50) * LOGS.length)]} ${ip(seed, r)}`;
            return (
              <div key={r} className={gone ? "gone" : ""}>
                {gone ? "█".repeat(line.length) : line}
              </div>
            );
          })}
        </pre>
      );
      break;
    case "dict":
      body = (
        <>
          <div className="cine-words">
            {WORDS.map((w, i) => (
              <span key={w} className={i === f % WORDS.length ? "cur" : i < f % WORDS.length ? "tried" : ""}>
                {w}
              </span>
            ))}
          </div>
          <div className="cine-foot">hash ≟ {hex(16, seed, f)}</div>
        </>
      );
      break;
    case "breaker":
      body = (
        <pre>
          {Array.from({ length: ROWS }, (_, r) => `login: admin  pass: ${Array.from({ length: 8 }, (_, c) => pick(GLYPHS, f - r, c)).join("")}  → ${r === 0 ? "…" : "DENIED"}\n`).join("")}
        </pre>
      );
      break;
    case "proxy":
      body = (
        <pre>
          {Array.from({ length: ROWS }, (_, r) => {
            const k = f - r;
            return `SYN ${ip(k, 1).padEnd(15)} :${String(1024 + Math.floor(rnd(k, 2) * 60000)).padEnd(5)} spoof ${ip(k, 3).padEnd(15)} ${r === 0 ? "[ .. ]" : rnd(k, 4) < 0.25 ? "[DROP]" : "[ OK ]"}\n`;
          }).join("")}
        </pre>
      );
      break;
    default:
      body = (
        <pre>
          {Array.from({ length: ROWS }, (_, r) => {
            const k = f - r;
            return `${hex(8, k, 1)}  ${ASM[Math.floor(rnd(k, 2) * ASM.length)]} 0x${hex(4, k, 3)}\n`;
          }).join("")}
        </pre>
      );
  }
  return (
    <div className={`cine-screen tool-${task.tool}`}>
      <div className="cine-screen-head">
        <span>■ {TITLE[task.tool] ?? task.label.toUpperCase()}</span>
        <span>{Math.round(p * 100)}%</span>
      </div>
      <div className="cine-screen-body">{body}</div>
      <div className="cine-bar">
        <i style={{ width: `${p * 100}%` }} />
      </div>
    </div>
  );
}

/** Uno schermo per ogni strumento in corso: è qui che si vede il lavoro. */
export function ToolTheater({ op, elapsed }: { op: OpView; elapsed: number }) {
  const on = useCine();
  const running = op.tasks.filter((k) => k.state === "run");
  if (!on || !running.length) return null;
  const f = Math.floor(performance.now() / 70);
  return (
    <div className="cine-theater">
      {running.map((k) => (
        <Screen key={k.id} task={k} p={Math.min(1, k.progress + k.rate * (elapsed / 1000))} f={f} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------ lo schedario

const ALL_PHOTOS = Array.from({ length: 100 }, (_, i) => `p${String(i + 1).padStart(3, "0")}`);
let preloaded = false;
export function preloadPhotos() {
  if (preloaded || !enabled) return;
  preloaded = true;
  for (const id of ALL_PHOTOS) new Image().src = art.person(id);
}

/** Le foto tessera sfogliate a raffica mentre l'archivio «confronta». */
export function PhotoShuffle({ total, label = "CONFRONTO SCHEDE" }: { total: number; label?: string }) {
  const t = useFrame(true, 20);
  const start = useRef(performance.now());
  const f = Math.floor((t - start.current) / 50);
  const tickAt = useRef(-1);
  if (f !== tickAt.current && f % 2 === 0) {
    tickAt.current = f;
    blip(1200 + (f % 5) * 90, 0.015, "square", 0.02);
  }
  const at = (k: number) => ALL_PHOTOS[Math.floor(rnd(k, 91) * ALL_PHOTOS.length)]!;
  return (
    <div className="cine-shuffle">
      <div className="cine-strip">
        {[-2, -1, 0, 1, 2].map((d) => (
          <img key={d} src={art.person(at(f + d))} alt="" className={d === 0 ? "mid" : ""} width={d === 0 ? 128 : 64} height={d === 0 ? 128 : 64} />
        ))}
        <span className="cine-scanline" />
      </div>
      <div className="cine-foot">
        {label} · {String(Math.min(total, 1 + ((f * 7) % Math.max(1, total)))).padStart(3, "0")}/{String(total).padStart(3, "0")} · ID {hex(2, f)}-{hex(3, f, 2)}-{hex(4, f, 3)}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ il War Dialer

export function DialLog({ serverNow }: { serverNow: number }) {
  const f = Math.floor(serverNow / 260);
  return (
    <pre className="cine-dial">
      {Array.from({ length: 5 }, (_, r) => {
        const k = f - r;
        const hit = rnd(k, 8) < 0.12;
        const num = `${String(200 + Math.floor(rnd(k, 1) * 700))}-555-${String(Math.floor(rnd(k, 2) * 10000)).padStart(4, "0")}`;
        return (
          <div key={k} className={r === 0 ? "" : hit ? "hit" : "miss"}>
            ATDT {num} {r === 0 ? "…" : hit ? "CARRIER 2400 ◄" : rnd(k, 9) < 0.3 ? "BUSY" : "NO CARRIER"}
          </div>
        );
      })}
    </pre>
  );
}

// ------------------------------------------------------------ la regia: cosa mandare in scena, e quando

let booted = false;

/** Guarda lo stato cambiare e chiama le inquadrature: collegamento, accesso, trace chiuso, arresto, promozione. */
export function CinemaLayer({ state, traceFrac, serverNow }: { state: GameState; traceFrac: number | null; serverNow: number }) {
  const on = useCine();
  const s = useShot();
  const op = state.op;
  const me = state.me;
  const prev = useRef({ opId: op?.id ?? null, access: op?.access ?? "none", frac: 0, jailed: me.jailUntil > serverNow, rank: me.rank });

  useEffect(() => {
    if (booted) return;
    booted = true;
    shoot("boot", "AETHER DECK", {
      lines: ["BIOS 2.39 · 640K OK", `CPU L${me.hw.cpu} · MODEM L${me.hw.modem} · MEM L${me.hw.memory}`, "CARRIER DETECT … OK", `HANDLE ${me.handle.toUpperCase()} · AUTENTICATO`, "UPLINK AL RETICOLO PRONTO"],
    });
  }, [me]);

  useEffect(() => {
    const p = prev.current;
    const jailed = me.jailUntil > serverNow;
    if (op && op.id !== p.opId) {
      const hops = op.chain.slice(0, -1).map((id) => state.nodes.find((n) => n.id === id));
      shoot("dial", op.target.org, {
        lines: [...hops.map((n, i) => `HOP ${i + 1} ${(n?.ip ?? "?.?.?.?").padEnd(15)} ${n?.name ?? "relay"} … OK`), `ATDT ${op.target.ip}`, "CONNECT 2400 · LINK STABILITO"],
      });
      p.access = "none";
    } else if (op && op.access !== p.access && (op.access === "admin" || op.access === "client")) {
      shoot("granted", "ACCESS GRANTED", { sub: `${op.access === "admin" ? "root" : "cliente"}@${op.target.name}` });
      sfx.ok();
    }
    if (jailed && !p.jailed) {
      shoot("busted", "ARRESTATO", { sub: "La Guardia del Reticolo ha chiuso il cerchio" });
    } else if (!op && p.opId && !jailed) {
      if (p.frac >= 0.97) shoot("traced", "TRACE COMPLETO", { sub: "connessione terminata dal bersaglio" });
      else shoot("nocarrier", "NO CARRIER");
    }
    if (me.rank !== p.rank && p.rank) shoot("rank", me.rank.toUpperCase(), { sub: "nuovo rango" });
    p.opId = op?.id ?? null;
    p.access = op?.access ?? "none";
    p.jailed = jailed;
    p.rank = me.rank;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op?.id, op?.access, me.jailUntil > serverNow, me.rank]);
  prev.current.frac = op ? (traceFrac ?? prev.current.frac) : prev.current.frac;
  useEffect(() => {
    if (op) prev.current.frac = traceFrac ?? 0;
  }, [op?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!on) return null;
  const level = traceFrac === null ? 0 : traceFrac > 0.9 ? 3 : traceFrac > 0.75 ? 2 : traceFrac > 0.5 ? 1 : 0;
  return (
    <>
      {level ? <div className={`cine-vignette l${level}`} aria-hidden /> : null}
      {level === 3 ? (
        <div className="cine-imminent px" aria-hidden>
          TRACE {Math.round((traceFrac ?? 0) * 100)}% · STACCA
        </div>
      ) : null}
      {s ? <ShotView key={s.id} s={s} /> : null}
    </>
  );
}

function ShotView({ s }: { s: Shot }) {
  const t = useFrame(true, 30);
  const age = t - s.at;
  const k = Math.min(1, age / s.ms);
  if (s.kind === "dial" || s.kind === "boot") {
    const lines = s.lines ?? [];
    const shown = Math.min(lines.length, 1 + Math.floor((age / (s.ms * 0.75)) * lines.length));
    return (
      <div className={`cine-shot ${s.kind}`} aria-hidden>
        <div className="cine-term">
          <div className="cine-term-head">{s.kind === "boot" ? s.title : `CHIAMATA ▸ ${s.title}`}</div>
          <pre>
            {lines.slice(0, shown).join("\n")}
            <span className="cine-caret">█</span>
          </pre>
        </div>
      </div>
    );
  }
  return (
    <div className={`cine-shot ${s.kind}`} aria-hidden>
      <div className="cine-plate">
        <div className="cine-big px">
          <Decode text={s.title} ms={s.kind === "denied" || s.kind === "nocarrier" ? 150 : 450} />
        </div>
        {s.kind === "money" && s.amount ? <div className="cine-amount px">{Math.round(s.amount * Math.min(1, k * 1.8)).toLocaleString(NUM_LOCALE)} CR</div> : null}
        {s.sub ? <div className="cine-sub">{s.sub}</div> : null}
      </div>
    </div>
  );
}
