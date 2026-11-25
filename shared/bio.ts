// Barriere biometriche: sui sistemi più protetti la password di root non basta. Serve anche la voce,
// l'impronta o la retina dell'amministratore. Il campione si ruba altrove; davanti al lettore lo si
// «accorda» con l'oscilloscopio finché la traccia non combacia con quella registrata.

export type BioKind = "voce" | "impronta" | "retina";

export const BIO_NAME: Record<BioKind, string> = { voce: "Impronta vocale", impronta: "Lettore d'impronte", retina: "Scanner della retina" };
export const BIO_SAMPLE: Record<BioKind, string> = { voce: "la voce", impronta: "l'impronta", retina: "la retina" };
/** Dove si trova il campione, detto a chi sta davanti alla barriera. */
export const BIO_WHERE: Record<BioKind, string> = {
  voce: "Si registra dal centralino dell'organizzazione: basta entrare da impiegato e farsi rispondere.",
  impronta: "Sta sulla scheda del badge, all'ufficio del personale: serve entrare da operatore.",
  retina: "Sta in una cartella clinica: in qualunque ospedale o clinica, da operatore, alla sezione «Cartelle cliniche».",
};

/** Un campione invecchia: dopo tanto il lettore non lo riconosce più. */
export const SAMPLE_DAYS = 7;

// ---------------------------------------------------------------- l'oscilloscopio

export type ScopeParams = { freq: number; amp: number; phase: number; harm: number };
export const SCOPE_KNOBS: { key: keyof ScopeParams; name: string; min: number; max: number }[] = [
  { key: "freq", name: "Frequenza", min: 1, max: 6 },
  { key: "amp", name: "Ampiezza", min: 1, max: 5 },
  { key: "phase", name: "Fase", min: 0, max: 7 },
  { key: "harm", name: "Armonica", min: 0, max: 4 },
];
export const SCOPE_POINTS = 96;
export const SCOPE_TRIES = 3;
/** Sopra questa somiglianza il lettore accetta. */
export const SCOPE_OK = 0.985;
/** Ogni tentativo respinto fa avanzare il trace di questa frazione del percorso. */
export const SCOPE_FAIL_TRACE = 0.08;
export const SCOPE_START: ScopeParams = { freq: 1, amp: 3, phase: 0, harm: 0 };

/** La traccia: una sinusoide con una terza armonica, campionata su un periodo di schermo. Valori in [-1, 1]. */
export function scopeWave(p: ScopeParams): number[] {
  const out: number[] = [];
  for (let i = 0; i < SCOPE_POINTS; i += 1) {
    const x = (i / SCOPE_POINTS) * Math.PI * 2;
    const ph = (p.phase / 8) * Math.PI * 2;
    const v = Math.sin(p.freq * x + ph) + (p.harm / 4) * 0.6 * Math.sin(3 * p.freq * x + ph);
    out.push((v * p.amp) / 8);
  }
  return out;
}

/** Somiglianza fra due tracce, da 0 a 1. */
export function scopeMatch(a: number[], b: number[]) {
  let err = 0;
  let ref = 0;
  for (let i = 0; i < a.length; i += 1) {
    err += (a[i]! - b[i]!) ** 2;
    ref += a[i]! ** 2 + b[i]! ** 2;
  }
  return ref > 0 ? Math.max(0, 1 - err / ref) : 1;
}

export type ScopeView = {
  /** la traccia registrata, quella da imitare */
  target: number[];
  tries: number;
  state: "open" | "won" | "lost";
  /** somiglianza dell'ultimo tentativo respinto, 0-100 */
  last: number | null;
};

export type BioView = {
  kind: BioKind;
  /** di chi è il campione che serve */
  who: string;
  passed: boolean;
  /** hai un campione valido */
  have: boolean;
  /** lettore bloccato per questa connessione */
  locked: boolean;
  scope: ScopeView | null;
};

export type SampleView = { who: string; kind: BioKind; at: number; expiresAt: number };
