// Nemesi e favori. Gli abitanti si ricordano dei giocatori, nel bene e nel male.
// - Nemesi: un abitante blu che trova troppe volte le tue tracce nei log prende il tuo caso. Ogni poche ore fa una mossa,
//   sempre più dura: sorveglia i sistemi che colpisci di più, ti prepara un'esca in bacheca, ti segnala alla Guardia.
//   Si stufa se resti tranquillo per un giorno, chiude il caso se ti arrestano; puoi depistarlo o provare a comprarlo.
// - Favori: un abitante della tua parte che ti stima ti chiede un lavoro, con una scadenza. Farlo rafforza il rapporto
//   e lui ti ripaga; ignorarlo lo raffredda.

/** Tracce nei log (un'indagine aperta vale 1, una grave 2) oltre le quali un abitante blu prende il tuo caso. */
export const NEMESIS_AT = 5;
/** Ogni quante ore la nemesi fa una mossa (fra il minimo e il massimo). */
export const NEMESIS_MOVE_H = [3, 6] as const;
/** Si stufa se il tuo calore resta sotto questa soglia per tante ore. */
export const NEMESIS_CALM = 15;
export const NEMESIS_CALM_H = 24;
/** Depistare: costo, probabilità, effetto. */
export const DECOY_COST = 1200;
export const DECOY_CHANCE = 0.6;
export const DECOY_DELAY_H = 12;
/** Comprarla: costo e probabilità che accetti. */
export const BRIBE_COST = 4000;
export const BRIBE_CHANCE = 0.4;
/** L'esca: quanto paga in più di un contratto normale, e quanto calore costa cascarci. */
export const BAIT_PAY = 1.5;
export const BAIT_HEAT = 20;

/** Un favore: chi stima almeno tanto lo chiede, al più uno ogni 12 ore, da fare entro 12 ore. */
export const FAVOR_MIN = 20;
export const FAVOR_EVERY_H = 12;
export const FAVOR_H = 12;
export const FAVOR_GAIN = 12;
export const FAVOR_LOSS = 8;

export type NemesisMove = { at: number; text: string };
export type NemesisView = {
  nemesis: { handle: string; city: string; level: number; since: number; nextAt: number; moves: NemesisMove[]; calmFor: number } | null;
  watchers: { handle: string; att: number }[]; // chi sta seguendo le tue tracce, e quanto
  favor: { handle: string; title: string; until: number; missionId: string } | null;
  decoyCost: number;
  bribeCost: number;
};
