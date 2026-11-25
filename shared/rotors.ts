// I rotori del Decrypter: il minigioco che affianca la barra della decifratura.
// La chiave è una fila di rotori, ognuno fermo su un simbolo. A ogni prova il sistema dice quanti rotori
// sono allineati e quanti simboli sono giusti ma sul rotore sbagliato. Indovinata la chiave, il file si apre subito.

export const ROTOR_SYMBOLS = ["0", "3", "7", "A", "C", "F"] as const;

export type RotorSpec = { rotors: number; tries: number };

/** Rotori e prove per livello di cifratura. «manual» = senza la versione giusta del Decrypter. */
export function rotorSpec(level: number, manual: boolean): RotorSpec {
  const l = Math.max(1, Math.min(3, level));
  const base = [
    { rotors: 3, tries: 6 },
    { rotors: 4, tries: 6 },
    { rotors: 5, tries: 7 },
  ][l - 1]!;
  return manual ? { ...base, tries: base.tries - 1 } : base;
}

/** Riscontro di una prova: rotori allineati e simboli giusti fuori posto (come nel Mastermind). */
export function rotorScore(code: number[], guess: number[]) {
  let exact = 0;
  const a = new Array<number>(ROTOR_SYMBOLS.length).fill(0);
  const b = new Array<number>(ROTOR_SYMBOLS.length).fill(0);
  for (let i = 0; i < code.length; i += 1) {
    if (code[i] === guess[i]) exact += 1;
    else {
      a[code[i]!]! += 1;
      b[guess[i]!]! += 1;
    }
  }
  let near = 0;
  for (let s = 0; s < a.length; s += 1) near += Math.min(a[s]!, b[s]!);
  return { exact, near };
}

/** Prove avanzate che fanno credere al sistema che la chiave fosse quella vera: il trace si ferma per un po'. */
export const ROTOR_CLEAN = 2;
export const ROTOR_FREEZE_MS = 10_000;
/** Prove finite a mano: il trace avanza di questa frazione del percorso. */
export const ROTOR_FAIL_TRACE = 0.12;

export type RotorView = {
  fileId: string;
  fileName: string;
  rotors: number;
  guesses: { g: number[]; exact: number; near: number }[];
  tries: number; // prove rimaste
  state: "open" | "won" | "lost";
  manual: boolean;
  /** a partita chiusa: la chiave */
  code: number[] | null;
};
