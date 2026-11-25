// Motore audio di AETHER: tutto sintetizzato in tempo reale con il Web Audio API,
// in stile schede FM anni '90 (AdLib / Sound Blaster, chip OPL). Nessun file da scaricare.
//
// Bus: master → { musica, effetti }. Le impostazioni restano nel browser (localStorage).

export type AudioSettings = { music: boolean; sfx: boolean; musicVol: number; sfxVol: number };

const KEY = "aether.audio.v2";
let settings: AudioSettings = { music: true, sfx: true, musicVol: 0.55, sfxVol: 0.8 };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) settings = { ...settings, ...(JSON.parse(raw) as Partial<AudioSettings>) };
  else if (localStorage.getItem("aether.audio") === "off") settings = { ...settings, music: false, sfx: false };
} catch {
  /* modalità privata: valori di default */
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let sfxBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
const listeners = new Set<() => void>();

function apply() {
  if (!ctx || !musicBus || !sfxBus) return;
  const t = ctx.currentTime;
  musicBus.gain.setTargetAtTime(settings.music ? settings.musicVol * 0.32 : 0, t, 0.08);
  sfxBus.gain.setTargetAtTime(settings.sfx ? settings.sfxVol * 0.9 : 0, t, 0.03);
}

export function getAudioSettings() {
  return settings;
}

export function setAudioSettings(patch: Partial<AudioSettings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignora */
  }
  apply();
  for (const l of listeners) l();
}

export function onAudioSettings(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// compatibilità con il vecchio interruttore unico
export function audioOn() {
  return settings.music || settings.sfx;
}
export function setAudio(on: boolean) {
  setAudioSettings({ music: on, sfx: on });
}

/** Crea il contesto audio (va fatto dopo un gesto dell'utente, per le regole dei browser). */
export function ensureAudio(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.9;
      // un compressore morbido tiene insieme musica ed effetti senza clipping
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      master.connect(comp).connect(ctx.destination);
      musicBus = ctx.createGain();
      sfxBus = ctx.createGain();
      musicBus.connect(master);
      sfxBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
      apply();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

let unlocked = false;
const unlockWaiters: (() => void)[] = [];
/** Al primo clic o tasto il contesto audio si sblocca; poi parte quello che aspettava. */
export function whenUnlocked(fn: () => void) {
  if (unlocked) fn();
  else unlockWaiters.push(fn);
}
if (typeof window !== "undefined") {
  const unlock = () => {
    if (!ensureAudio()) return;
    unlocked = true;
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    for (const fn of unlockWaiters.splice(0)) fn();
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

export function audioNow() {
  return ctx?.currentTime ?? 0;
}

export function buses() {
  return ctx && musicBus && sfxBus ? { ctx, music: musicBus, sfx: sfxBus } : null;
}

// ------------------------------------------------------------ primitive di sintesi

type Env = { attack?: number; decay?: number; sustain?: number; release?: number };

function envGain(c: AudioContext, t: number, dur: number, vol: number, e: Env) {
  const g = c.createGain();
  const a = e.attack ?? 0.005;
  const d = e.decay ?? 0.12;
  const s = e.sustain ?? 0.4;
  const r = e.release ?? 0.08;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + a);
  g.gain.setTargetAtTime(vol * s, t + a, Math.max(0.001, d / 3));
  g.gain.setTargetAtTime(0, t + dur, Math.max(0.001, r / 3));
  return { g, end: t + dur + r * 2 + 0.02 };
}

/** Voce FM a due operatori, come un canale OPL2: portante + modulante. */
export function fm(
  bus: AudioNode,
  freq: number,
  t: number,
  dur: number,
  vol: number,
  o: Env & { ratio?: number; index?: number; indexEnd?: number; type?: OscillatorType; detune?: number } = {},
) {
  const c = ctx;
  if (!c) return;
  const car = c.createOscillator();
  car.type = o.type ?? "sine";
  car.frequency.value = freq;
  if (o.detune) car.detune.value = o.detune;
  const mod = c.createOscillator();
  mod.frequency.value = freq * (o.ratio ?? 1);
  const mg = c.createGain();
  const idx = o.index ?? 1;
  mg.gain.setValueAtTime(freq * idx, t);
  mg.gain.setTargetAtTime(freq * (o.indexEnd ?? idx * 0.25), t, Math.max(0.01, dur / 2));
  mod.connect(mg).connect(car.frequency);
  const { g, end } = envGain(c, t, dur, vol, o);
  car.connect(g).connect(bus);
  car.start(t);
  mod.start(t);
  car.stop(end);
  mod.stop(end);
}

/** Oscillatore semplice con eventuale glissando. */
export function tone(bus: AudioNode, freq: number, t: number, dur: number, vol: number, o: Env & { type?: OscillatorType; slideTo?: number; filter?: number } = {}) {
  const c = ctx;
  if (!c) return;
  const osc = c.createOscillator();
  osc.type = o.type ?? "square";
  osc.frequency.setValueAtTime(freq, t);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur);
  const { g, end } = envGain(c, t, dur, vol, { decay: dur, sustain: 0.6, ...o });
  if (o.filter) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = o.filter;
    osc.connect(f).connect(g).connect(bus);
  } else osc.connect(g).connect(bus);
  osc.start(t);
  osc.stop(end);
}

/** Rumore bianco filtrato: batteria, statica, modem. */
export function noise(
  bus: AudioNode,
  t: number,
  dur: number,
  vol: number,
  o: Env & { type?: BiquadFilterType; freq?: number; q?: number; sweepTo?: number } = {},
) {
  const c = ctx;
  if (!c || !noiseBuf) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = o.type ?? "highpass";
  f.frequency.setValueAtTime(o.freq ?? 6000, t);
  if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + dur);
  f.Q.value = o.q ?? 0.7;
  const { g, end } = envGain(c, t, dur, vol, { attack: 0.001, decay: dur * 0.6, sustain: 0.2, release: 0.03, ...o });
  src.connect(f).connect(g).connect(bus);
  src.start(t, Math.random() * 0.5);
  src.stop(end);
}

export function kick(bus: AudioNode, t: number, vol = 0.9) {
  const c = ctx;
  if (!c) return;
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + 0.35);
}

export function snare(bus: AudioNode, t: number, vol = 0.45) {
  noise(bus, t, 0.14, vol, { type: "bandpass", freq: 1900, q: 0.6, decay: 0.1, sustain: 0.05 });
  tone(bus, 190, t, 0.06, vol * 0.5, { type: "triangle", slideTo: 140 });
}

export function hat(bus: AudioNode, t: number, vol = 0.12, open = false) {
  noise(bus, t, open ? 0.12 : 0.025, vol, { type: "highpass", freq: 7500, decay: open ? 0.1 : 0.02, sustain: 0.05 });
}

export const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

// ------------------------------------------------------------ effetti sonori

function sfxBusOrNull() {
  if (!settings.sfx) return null;
  const c = ensureAudio();
  return c && sfxBus ? { c, bus: sfxBus, t: c.currentTime + 0.005 } : null;
}

/** Compatibilità: il vecchio bip. */
export function blip(freq = 660, dur = 0.05, type: OscillatorType = "square", vol = 0.04) {
  const s = sfxBusOrNull();
  if (s) tone(s.bus, freq, s.t, dur, vol * 4, { type });
}

let lastKey = 0;

export const sfx = {
  /** Un tasto del telefono: la coppia di frequenze DTMF vera. */
  dtmf: (lo: number, hi: number, dur = 0.16) => {
    const s = sfxBusOrNull();
    if (!s) return;
    tone(s.bus, lo, s.t, dur, 0.09, { type: "sine" });
    tone(s.bus, hi, s.t, dur, 0.09, { type: "sine" });
  },
  /** Il fischio a 2600 Hz che apre la linea. */
  whistle: () => {
    const s = sfxBusOrNull();
    if (s) tone(s.bus, 2600, s.t, 0.5, 0.06, { type: "sine" });
  },
  click: () => {
    const s = sfxBusOrNull();
    if (s) fm(s.bus, 1320, s.t, 0.025, 0.12, { ratio: 2, index: 0.8, decay: 0.02, sustain: 0.1, release: 0.02 });
  },
  /** Tasto della tastiera meccanica: rumore secco più un'ombra di tono. */
  key: () => {
    const s = sfxBusOrNull();
    if (!s || s.t - lastKey < 0.02) return;
    lastKey = s.t;
    noise(s.bus, s.t, 0.012, 0.09, { type: "highpass", freq: 3200 + Math.random() * 1500 });
    tone(s.bus, 1700 + Math.random() * 700, s.t, 0.008, 0.02, { type: "square" });
  },
  ok: () => {
    const s = sfxBusOrNull();
    if (!s) return;
    fm(s.bus, midi(88), s.t, 0.07, 0.14, { ratio: 2, index: 1.2, decay: 0.06, sustain: 0.2 });
    fm(s.bus, midi(95), s.t + 0.07, 0.12, 0.14, { ratio: 2, index: 1.2, decay: 0.1, sustain: 0.2 });
  },
  bad: () => {
    const s = sfxBusOrNull();
    if (!s) return;
    tone(s.bus, 110, s.t, 0.22, 0.16, { type: "sawtooth", filter: 1400 });
    tone(s.bus, 116.5, s.t, 0.22, 0.16, { type: "square", filter: 1100 });
  },
  alarm: () => {
    const s = sfxBusOrNull();
    if (!s) return;
    tone(s.bus, 880, s.t, 0.09, 0.09, { type: "square", filter: 3000 });
    tone(s.bus, 660, s.t + 0.1, 0.09, 0.09, { type: "square", filter: 3000 });
  },
  /** Handshake del modem: toni DTMF, portante, poi lo stridio della negoziazione. */
  connect: () => {
    const s = sfxBusOrNull();
    if (!s) return;
    const dtmf: [number, number][] = [
      [697, 1209],
      [770, 1336],
      [852, 1477],
      [941, 1336],
    ];
    dtmf.forEach(([a, b], i) => {
      const t = s.t + i * 0.09;
      tone(s.bus, a, t, 0.06, 0.06, { type: "sine" });
      tone(s.bus, b, t, 0.06, 0.06, { type: "sine" });
    });
    const t1 = s.t + 0.42;
    tone(s.bus, 2100, t1, 0.28, 0.05, { type: "sine" });
    tone(s.bus, 1300, t1 + 0.3, 0.12, 0.05, { type: "sine" });
    fm(s.bus, 980, t1 + 0.44, 0.4, 0.05, { ratio: 1.51, index: 6, indexEnd: 2, type: "square", sustain: 0.7 });
    noise(s.bus, t1 + 0.44, 0.45, 0.07, { type: "bandpass", freq: 900, sweepTo: 2600, q: 1.2, sustain: 0.8 });
  },
  hangup: () => {
    const s = sfxBusOrNull();
    if (!s) return;
    tone(s.bus, 620, s.t, 0.22, 0.12, { type: "square", slideTo: 110, filter: 2000 });
    noise(s.bus, s.t + 0.22, 0.03, 0.12, { type: "lowpass", freq: 1500 });
  },
  taskDone: () => {
    const s = sfxBusOrNull();
    if (!s) return;
    fm(s.bus, midi(84), s.t, 0.06, 0.1, { ratio: 3, index: 1, decay: 0.05, sustain: 0.2 });
    fm(s.bus, midi(91), s.t + 0.06, 0.16, 0.1, { ratio: 3, index: 1, decay: 0.12, sustain: 0.2 });
  },
  copy: () => {
    const s = sfxBusOrNull();
    if (!s) return;
    for (let i = 0; i < 6; i += 1) tone(s.bus, 1900 + Math.random() * 1600, s.t + i * 0.035, 0.02, 0.05, { type: "square" });
  },
  mail: () => {
    const s = sfxBusOrNull();
    if (!s) return;
    fm(s.bus, midi(81), s.t, 0.9, 0.16, { ratio: 3.5, index: 3, indexEnd: 0.3, decay: 0.7, sustain: 0.05, release: 0.3 });
  },
  cash: () => {
    const s = sfxBusOrNull();
    if (!s) return;
    [76, 83, 88].forEach((n, i) => fm(s.bus, midi(n), s.t + i * 0.055, 0.08, 0.11, { ratio: 4, index: 1.5, decay: 0.06, sustain: 0.3 }));
  },
  caught: () => {
    const s = sfxBusOrNull();
    if (!s) return;
    noise(s.bus, s.t, 1.2, 0.3, { type: "lowpass", freq: 5000, sweepTo: 120, attack: 0.002, decay: 0.9, sustain: 0.1 });
    tone(s.bus, 110, s.t, 0.9, 0.25, { type: "sawtooth", slideTo: 36, filter: 900 });
  },
  siren: () => {
    const s = sfxBusOrNull();
    if (!s) return;
    tone(s.bus, 600, s.t, 0.45, 0.08, { type: "sawtooth", slideTo: 1200, filter: 2500 });
    tone(s.bus, 1200, s.t + 0.45, 0.45, 0.08, { type: "sawtooth", slideTo: 600, filter: 2500 });
  },
};
