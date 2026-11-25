// I toni della Blue Box: il minigioco che affianca la scansione del War Dialer.
// Mentre il modem compone numeri a tappeto, puoi fischiare nella cornetta: il centralino suona una
// sequenza di toni e tu la ripeti sul tastierino. Tre giri, ogni volta un tono in più.

export const TONE_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;

/** Le coppie di frequenze DTMF vere (riga, colonna), nell'ordine di TONE_KEYS. */
const ROWS = [697, 770, 852, 941];
const COLS = [1209, 1336, 1477];
export const toneFreq = (key: number): [number, number] => [ROWS[Math.floor(key / 3)]!, COLS[key % 3]!];

/** Lunghezza della sequenza a ogni giro. */
export const TONE_ROUNDS = [4, 5, 6] as const;
/** Nodi in più che il centralino ti passa se chiudi i tre giri. */
export const TONE_BONUS_FINDS = 2;
/** Un tono sbagliato: l'operatore ti addebita l'interurbana. */
export const TONE_FAIL_COST = 300;
/** Quanto la linea resta aperta ad aspettarti, oltre la fine della scansione. */
export const TONE_WINDOW_MS = 90_000;

export type ToneView = {
  round: number; // giro in corso, da 0
  rounds: number;
  /** la sequenza da ripetere in questo giro */
  seq: number[];
  state: "open" | "won" | "lost";
  until: number;
};
