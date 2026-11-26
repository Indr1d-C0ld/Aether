// Le cicatrici del Reticolo: quello che succede lascia segni sulla mappa, e per giorni.
// - Un sistema sabotato resta segnato (e in allerta per un giorno intero).
// - Un sabotaggio alla rete elettrica lascia al buio la sua città: per ore i sistemi lì guardano meno.
// - Un'organizzazione colpita troppe volte in una settimana trasloca: un'altra città, un altro indirizzo,
//   password nuove. Sulla mappa resta la traccia del trasloco.

/** Per quanto resta visibile la cicatrice di un sabotaggio. */
export const SCAR_H = 72;
/** Dopo un sabotaggio il sistema resta in allerta per tanto. */
export const SCAR_ALERT_H = 24;
/** Una città al buio dopo un sabotaggio a una rete: quanto dura, e di quanto rallenta il trace lì. */
export const DARK_H = 6;
export const DARK_WATCH = 1.3;
/** Traslochi: colpi in sette giorni oltre i quali l'organizzazione cambia sede (un sabotaggio vale 3, un furto 1). */
export const MOVE_AT = 9;
export const MOVE_WINDOW_H = 7 * 24;
/** Al più un trasloco ogni due settimane per organizzazione; la traccia resta tre giorni. */
export const MOVE_COOLDOWN_H = 14 * 24;
export const MOVE_TRAIL_H = 72;
/** Chi può traslocare: aziende, banche, laboratori, telefoni, giornali, cliniche, negozi. */
export const MOVERS = ["corp", "bank", "lab", "telco", "news", "med", "shop"];

export type NodeMarks = {
  scar?: number; // 0..1: quanto è fresca la cicatrice
  scarAt?: number;
  dark?: boolean;
  moved?: { x: number; y: number; city: string; at: number } | null;
  /** effetto domino (server/domino.ts): disservizio in corso e fornitori */
  outage?: import("./domino.ts").OutageMark | null;
  suppliers?: string[];
};
