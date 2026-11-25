// Il ricettatore ha un mercato: quello che tutti gli portano lo paga meno, quello che nessuno gli porta da un po'
// lo paga di più, e ogni giorno cerca qualcosa in particolare. Le vendite degli abitanti contano come le tue.
import type { NodeKind } from "./types.ts";

export type FenceCat = NodeKind | "exploit" | "chip" | "gadget";
export const FENCE_CAT_NAME: Partial<Record<FenceCat, string>> = {
  bank: "dati bancari",
  corp: "documenti aziendali",
  gov: "atti pubblici",
  law: "fascicoli di polizia",
  lab: "ricerca di laboratorio",
  med: "cartelle cliniche",
  mil: "materiale militare",
  news: "fonti giornalistiche",
  edu: "archivi universitari",
  shop: "registri di cassa",
  telco: "tabulati telefonici",
  util: "schemi di rete",
  home: "roba da PC privati",
  exploit: "exploit",
  chip: "chip",
  gadget: "gadget",
};
/** Moltiplicatore del prezzo dall'offerta recente: scarsità +25%, saturazione fino a −55%. */
export const demandMult = (supply: number) => Math.max(0.45, Math.min(1.25, 1.25 - supply * 0.08));
/** Il livello d'offerta «normale» di una merce oggi: cambia ogni giorno, così qualcosa scarseggia e qualcosa abbonda
 * anche quando nessuno vende. Da 0 (scarsa, ×1,25) a 6 (abbondante, ×0,77); la media dà ×1. */
export const supplyTarget = (cat: string, day: number) => {
  const h = [...`${cat}:${day}`].reduce((q, c) => (Math.imul(q, 33) ^ c.charCodeAt(0)) >>> 0, 5381);
  return [3, 3, 3, 2, 4, 1, 5, 0, 6][h % 9]!;
};
/** Mezza vita dell'offerta, in ore: un mercato saturo torna normale in mezza giornata. */
export const SUPPLY_HALF_H = 6;
/** La richiesta del giorno: quella categoria vale il 50% in più. */
export const WANTED_BONUS = 1.5;
export type FenceMarket = { cat: string; name: string; mult: number; wanted: boolean }[];
