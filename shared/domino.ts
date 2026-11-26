// Effetto domino: le organizzazioni dipendono le une dalle altre. Una banca ha bisogno delle linee di una compagnia
// telefonica e della corrente di una rete; un ospedale della corrente e dei farmaci di un laboratorio. Ogni organizzazione
// ha per fornitori le più vicine del tipo che le serve. Quando un fornitore viene sabotato, i suoi clienti restano
// in disservizio per qualche ora, e a volte il guasto si propaga di un altro anello.
import type { NodeKind } from "./types.ts";

/** Di cosa ha bisogno ciascun tipo di organizzazione. */
export const NEEDS: Partial<Record<NodeKind, NodeKind[]>> = {
  bank: ["telco", "util"],
  corp: ["telco", "bank", "util"],
  shop: ["bank", "corp"],
  lab: ["util", "bank"],
  med: ["util", "lab"],
  news: ["telco"],
  gov: ["telco", "util"],
  law: ["telco"],
  edu: ["util"],
  telco: ["util"],
};
/** Cosa manca, quando cade un fornitore di quel tipo. */
export const SUPPLY_WHAT: Partial<Record<NodeKind, string>> = {
  telco: "linee telefoniche e dati",
  util: "corrente e acqua",
  bank: "credito e pagamenti",
  corp: "forniture",
  lab: "farmaci e reagenti",
};

/** Quanto dura un disservizio. */
export const OUTAGE_H = 6;
/** In disservizio i sistemi guardano meno: il trace è più lento. */
export const OUTAGE_WATCH = 1.15;
/** Quanto costa all'organizzazione, una volta. */
export const outageCost = (tier: number) => 200 + tier * 150;
/** Un cliente che è a sua volta fornitore propaga il guasto con questa probabilità (al più un anello in più). */
export const CASCADE_CHANCE = 0.5;
/** Anche un virus su una rete o una compagnia telefonica può far cadere i clienti, con questa probabilità. */
export const INFECTION_OUTAGE = 0.4;

export type OutageMark = { by: string; byId: string; what: string; until: number };
export type SupplyView = {
  suppliers: { id: string; name: string; kind: string; what: string; down: boolean }[];
  clients: { id: string; name: string; down: boolean }[];
  outage: OutageMark | null;
};
