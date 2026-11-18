// Colonna sonora generativa, alla maniera dei tracker anni '90: pattern a 16 step per battuta,
// voci FM per basso, arpeggi e melodia, pad di onde a dente di sega filtrate, batteria sintetica.
// Tre brani: "title" (schermata d'accesso), "deck" (calma tesa), "trace" (inseguimento),
// e l'intensità del trace accelera e infittisce il brano d'inseguimento.

import { buses, fm, getAudioSettings, hat, kick, midi, noise, snare, tone, whenUnlocked } from "./audio.ts";

export type Mood = "off" | "title" | "deck" | "trace";

type Chord = { root: number; minor: boolean };
type Song = {
  bpm: number;
  chords: Chord[];
  kick: number[];
  snare: number[];
  hat: "8" | "16" | "off";
  bass: number[]; // step su cui suona il basso
  bassOct: boolean; // alterna ottave (pompa da inseguimento)
  arp: boolean;
  pad: boolean;
  lead: number; // probabilità di nota per ottavo
  leadOct: number;
};

const SONGS: Record<Exclude<Mood, "off">, Song> = {
  // La minore, synthwave lento: Am F C G
  title: {
    bpm: 86,
    chords: [
      { root: 57, minor: true },
      { root: 53, minor: false },
      { root: 48, minor: false },
      { root: 55, minor: false },
    ],
    kick: [0, 8],
    snare: [4, 12],
    hat: "8",
    bass: [0, 6, 8, 14],
    bassOct: false,
    arp: true,
    pad: true,
    lead: 0.35,
    leadOct: 72,
  },
  // Re minore, ambient teso: Dm Bb Gm A
  deck: {
    bpm: 100,
    chords: [
      { root: 50, minor: true },
      { root: 46, minor: false },
      { root: 43, minor: true },
      { root: 45, minor: false },
    ],
    kick: [0, 10],
    snare: [12],
    hat: "8",
    bass: [0, 3, 6, 8, 11, 14],
    bassOct: false,
    arp: true,
    pad: true,
    lead: 0.18,
    leadOct: 74,
  },
  // Mi minore, inseguimento: Em C D B
  trace: {
    bpm: 128,
    chords: [
      { root: 52, minor: true },
      { root: 48, minor: false },
      { root: 50, minor: false },
      { root: 47, minor: false },
    ],
    kick: [0, 4, 8, 12],
    snare: [4, 12],
    hat: "16",
    bass: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    bassOct: true,
    arp: false,
    pad: false,
    lead: 0.45,
    leadOct: 76,
  },
};

// generatore pseudocasuale con seme: la melodia cambia ogni 8 battute ma resta coerente
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

class Music {
  private mood: Mood = "off";
  private next: Mood = "off";
  private intensity = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private leadDegree = 0;
  private rand = rng(2039);

  setMood(m: Mood) {
    if (m === this.next) return;
    this.next = m;
    if (m === "off") return;
    whenUnlocked(() => this.start());
  }

  setIntensity(x: number) {
    this.intensity = Math.max(0, Math.min(1, x));
  }

  private start() {
    if (this.timer) return;
    const b = buses();
    if (!b) return;
    this.nextTime = b.ctx.currentTime + 0.1;
    this.step = 0;
    this.mood = this.next;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private schedule() {
    const b = buses();
    if (!b) return;
    // in background il browser rallenta i timer: non accumulare note arretrate
    if (this.nextTime < b.ctx.currentTime - 0.2) this.nextTime = b.ctx.currentTime + 0.05;
    while (this.nextTime < b.ctx.currentTime + 0.12) {
      if (this.step === 0) {
        // i cambi di brano avvengono a inizio battuta, come un ordine di pattern
        if (this.next !== this.mood) {
          this.mood = this.next;
          this.bar = 0;
        }
        if (this.mood === "off") {
          this.stop();
          return;
        }
        if (this.bar % 8 === 0) this.rand = rng(2039 + this.bar * 31 + this.mood.length * 977 + Math.floor(Math.random() * 1000));
      }
      const song = SONGS[this.mood as Exclude<Mood, "off">];
      if (getAudioSettings().music) this.playStep(b.music, song, this.nextTime);
      const bpm = this.mood === "trace" ? song.bpm + 28 * this.intensity : song.bpm;
      this.nextTime += 60 / bpm / 4;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar += 1;
    }
  }

  private playStep(bus: AudioNode, song: Song, t: number) {
    const s = this.step;
    const chord = song.chords[this.bar % song.chords.length]!;
    const third = chord.minor ? 3 : 4;
    const tones = [0, third, 7];
    const sixteenth = 60 / song.bpm / 4;
    const hot = this.mood === "trace" ? this.intensity : 0;

    // batteria
    if (song.kick.includes(s)) kick(bus, t, 0.8);
    if (song.snare.includes(s)) snare(bus, t, 0.35 + hot * 0.15);
    if (song.hat === "16" || (song.hat === "8" && s % 2 === 0)) hat(bus, t, s % 4 === 2 ? 0.1 : 0.06, s === 14 && this.mood !== "trace");
    if (hot > 0.75 && s % 2 === 1) hat(bus, t, 0.05);
    // rullata di fine giro
    if (this.bar % 4 === 3 && s >= 12 && this.mood !== "title") snare(bus, t, 0.18 + (s - 12) * 0.05);

    // basso FM
    if (song.bass.includes(s)) {
      const oct = song.bassOct && s % 2 === 1 ? 12 : 0;
      fm(bus, midi(chord.root - 12 + oct), t, sixteenth * (song.bassOct ? 0.9 : 1.6), 0.32, {
        ratio: 1,
        index: 2.2 + hot * 1.5,
        indexEnd: 0.4,
        decay: 0.12,
        sustain: 0.35,
        release: 0.05,
      });
    }

    // pad: accordo lungo a inizio battuta
    if (song.pad && s === 0) {
      for (const iv of tones) {
        const f = midi(chord.root + 12 + iv);
        tone(bus, f, t, sixteenth * 15, 0.035, { type: "sawtooth", filter: 1100, attack: 0.35, decay: 0.5, sustain: 0.8, release: 0.6 });
        tone(bus, f * 1.004, t, sixteenth * 15, 0.03, { type: "sawtooth", filter: 900, attack: 0.4, decay: 0.5, sustain: 0.8, release: 0.6 });
      }
    }

    // arpeggio a campanella (sedicesimi), più rado sul deck
    if (song.arp && (this.mood === "title" || s % 2 === 0)) {
      const iv = [...tones, 12][s % 4]!;
      fm(bus, midi(chord.root + 24 + iv), t, sixteenth * 0.8, 0.05, { ratio: 3.01, index: 1.4, decay: 0.08, sustain: 0.15, release: 0.06 });
    }

    // nell'inseguimento, uno stab d'allarme sugli accenti quando il trace è vicino
    if (this.mood === "trace" && hot > 0.6 && (s === 0 || s === 6 || s === 12)) {
      fm(bus, midi(chord.root + 24), t, sixteenth * 1.5, 0.06 + hot * 0.04, { ratio: 1.5, index: 3, type: "square", decay: 0.1, sustain: 0.3 });
    }

    // melodia: passeggiata sulla scala minore, a ottavi
    if (s % 2 === 0 && this.rand() < song.lead + hot * 0.25) {
      this.leadDegree += Math.round((this.rand() - 0.5) * 4);
      this.leadDegree = Math.max(-3, Math.min(9, this.leadDegree));
      // sugli accenti forti torna verso una nota dell'accordo
      if (s % 8 === 0) this.leadDegree = [0, 2, 4][Math.floor(this.rand() * 3)]!;
      const deg = ((this.leadDegree % 7) + 7) % 7;
      const oct = Math.floor(this.leadDegree / 7) * 12;
      const key = this.mood === "title" ? 57 : this.mood === "deck" ? 50 : 52;
      const note = song.leadOct - 12 + ((key % 12) + MINOR_SCALE[deg]! + oct);
      const len = this.mood === "trace" ? sixteenth * 1.2 : sixteenth * (this.rand() < 0.4 ? 3.5 : 1.8);
      fm(bus, midi(note), t, len, this.mood === "trace" ? 0.07 : 0.08, {
        ratio: this.mood === "trace" ? 1 : 2,
        index: this.mood === "trace" ? 2.5 : 1.6,
        indexEnd: 0.6,
        type: this.mood === "trace" ? "square" : "sine",
        attack: 0.01,
        decay: 0.2,
        sustain: 0.5,
        release: 0.12,
      });
    }

    // statica di fondo sul deck: il carrier che fruscia
    if (this.mood === "deck" && s === 0 && this.bar % 2 === 0) noise(bus, t, sixteenth * 16, 0.012, { type: "bandpass", freq: 2400, q: 0.4, attack: 0.5, sustain: 1, release: 0.5 });
  }
}

export const music = new Music();
