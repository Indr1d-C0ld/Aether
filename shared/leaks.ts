// Bottino con un contenuto. Alcuni file rubati non sono solo merce per il ricettatore: dentro c'è qualcosa che si usa.
// - Un progetto o una ricerca (laboratori, aziende, militari) si vende al concorrente diretto della vittima, che ci
//   guadagna mentre la vittima perde, e comincia a sospettare di lui.
// - Una prova di scandalo (allegati compromettenti, documenti riservati di banche, uffici pubblici, polizia, aziende)
//   si porta a un giornale, che la pubblica: la vittima perde reputazione, e se è la Guardia anche la fiducia del pubblico.
//   Oppure la si usa per ricattare l'azienda: paga di più, ma a volte va alla polizia.

export type LeakKind = "research" | "scandal";
export const LEAK_NAME: Record<LeakKind, string> = { research: "progetto riservato", scandal: "prova di uno scandalo" };
export type LeakContent = { kind: LeakKind; nodeId: string; org: string; tier: number };

/** Quali file hanno un contenuto, e con che probabilità (per tipo di sistema, e valore minimo del file). */
export const RESEARCH_FROM = ["lab", "corp", "mil"];
export const SCANDAL_FROM = ["gov", "law", "bank", "corp", "med"];
export const RESEARCH_CHANCE = 0.5;
export const SCANDAL_CHANCE = 0.35;
export const LEAK_MIN_VALUE = 4;

/** Vendere alla concorrenza. */
export const rivalPay = (tier: number) => 600 + tier * 450;
/** Portare a un giornale: poco denaro, molta fama. */
export const pressPay = (tier: number) => 250 + tier * 100;
export const PRESS_FAME = 8;
export const PRESS_REP = 15;
/** Ricattare l'azienda: paga di più, ma a volte va alla polizia. */
export const blackmailPay = (tier: number) => 900 + tier * 550;
export const BLACKMAIL_RISK = 0.3;
