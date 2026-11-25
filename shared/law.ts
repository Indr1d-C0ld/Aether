// Leggi e contrappesi. Due bilance che si muovono da sole, con quello che succede davvero.
// 1. La fiducia nella Guardia del Reticolo: sale con gli arresti e le soffiate, scende quando le rubano i fascicoli,
//    le sabotano i sistemi o i suoi documenti finiscono al ricettatore. Alta, la Guardia indaga più in fretta; bassa,
//    più piano; sotto una soglia scoppia lo scandalo e per dodici ore perde i poteri.
// 2. L'aiuto da fuori: se una parte sta perdendo nettamente la guerra delle ultime 24 ore, riceve rinforzi.

export type Side = "red" | "blue";
export type LawMood = "alta" | "normale" | "bassa" | "scandalo";

export const TRUST_START = 60;
/** Ogni ora la fiducia torna di tanto verso il valore di partenza. */
export const TRUST_DRIFT_H = 1.5;
export const TRUST_HIGH = 80;
export const TRUST_LOW = 35;
export const SCANDAL_AT = 25;
export const SCANDAL_H = 12;
/** Dopo lo scandalo la fiducia riparte da qui. */
export const SCANDAL_RESET = 45;

/** Quanto si muove la fiducia, e perché. I sistemi governativi contano la metà di quelli della Guardia. */
export const TRUST_DELTA = {
  theft: -4, // furto in un sistema della Guardia
  sabotage: -8,
  intrusion: -1,
  infection: -2,
  defense: 1,
  arrest: 3, // un handle arrestato
  bust: 1, // un abitante finito in custodia
  leak: -3, // fascicoli di polizia venduti al ricettatore
  snitch: 2, // una soffiata alla Guardia
  disclose: 1, // un'azienda avvisata delle sue password
} as const;

/** Effetto della fiducia sui numeri della giustizia. */
export function lawMult(trust: number, scandal: boolean): { sweep: number; jail: number; bail: number } {
  if (scandal) return { sweep: 1.5, jail: 0.7, bail: 0.7 };
  if (trust >= TRUST_HIGH) return { sweep: 0.9, jail: 1, bail: 1 };
  if (trust <= TRUST_LOW) return { sweep: 1.15, jail: 1, bail: 1 };
  return { sweep: 1, jail: 1, bail: 1 };
}
export const moodOf = (trust: number, scandal: boolean): LawMood => (scandal ? "scandalo" : trust >= TRUST_HIGH ? "alta" : trust <= TRUST_LOW ? "bassa" : "normale");

// ---------------------------------------------------------------- aiuto da fuori
/** Punti guerra in 24 ore sotto i quali nessuno è davvero in testa. */
export const RALLY_MIN = 40;
/** La parte in svantaggio riceve aiuto se ha fatto meno di questa frazione dei punti dell'altra. */
export const RALLY_RATIO = 0.6;
export const RALLY_H = 6;
/** Contratti nuovi della parte aiutata: paga in più. */
export const RALLY_PAY = 1.2;
/** Rossi aiutati: il calore scende di tanto in più a ogni battito (45 s). */
export const RALLY_HEAT = 0.25;
/** Blu aiutati: le indagini corrono di più. */
export const RALLY_SWEEP = 0.85;
/** Gli abitanti della parte aiutata si danno da fare di più. */
export const RALLY_NPC = 1.6;

export type LawView = {
  trust: number;
  mood: LawMood;
  scandalUntil: number;
  effects: string[];
  rally: { side: Side; until: number; text: string } | null;
  war24: { red: number; blue: number };
  hist: number[]; // fiducia, un punto all'ora
};

export const MOOD_LABEL: Record<LawMood, string> = { alta: "fiducia alta", normale: "fiducia normale", bassa: "fiducia bassa", scandalo: "scandalo" };
