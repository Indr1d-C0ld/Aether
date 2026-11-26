// Operazioni lunghe: lavorano mentre sei scollegato, e al rientro trovi gli esiti.
// - Rossi: una talpa. Un dipendente indebitato, di cui hai il fascicolo, per qualche giorno ti passa quello che vede:
//   la password dell'operatore, mezza password di root, un file, un badge. Ogni volta può essere scoperto.
// - Blu: sotto copertura. Ti infiltri in una banda di abitanti rossi: ti avvisano dei loro prossimi colpi, e qualcuno
//   finisce dentro. Ogni volta possono scoprirti.

export type LongOpKind = "mole" | "cover";
export const MOLE_COST = 1500;
export const MOLE_DAYS = 5;
export const MOLE_DEBT = 3000;
export const COVER_COST = 1500;
export const COVER_DAYS = 3;
/** Ogni quante ore un'operazione dà qualcosa (e rischia di saltare). */
export const LONGOP_TICK_H = 6;
/** Probabilità di essere scoperti a ogni giro: la talpa di più se l'azienda ha paura. */
export const moleRisk = (fear: number) => 0.05 + Math.min(0.1, fear / 1000);
export const COVER_RISK = 0.08;
/** Al più tante operazioni in corso. */
export const LONGOP_MAX = 2;

export type LongOpView = {
  id: string;
  kind: LongOpKind;
  title: string;
  since: number;
  until: number;
  nextAt: number;
  log: { at: number; text: string }[];
};
export type LongOpsView = {
  ops: LongOpView[];
  moles: { pid: string; name: string; employer: string; debt: number }[]; // dipendenti che si possono comprare
  gangs: { id: string; name: string }[]; // bande in cui infiltrarsi
  max: number;
};
