// Informazioni come merce. Quello che un giocatore sa (una password di root, l'indirizzo di un gateway, un numero
// nascosto, la mappa di una rete interna, il fascicolo di una persona) si vende: al Mediatore, che paga subito,
// alla bancarella, dove giocatori e abitanti comprano, all'azienda stessa (che cambia le password) o alla Guardia.
// Un'informazione non si consuma: si vende più volte. Ma vale meno a ogni copia in giro, e un'informazione
// bruciata (la password cambiata, il gateway spostato) non vale più niente.

export type IntelKind = "cred" | "addr" | "dial" | "inner" | "dossier";

export const INTEL_NAME: Record<IntelKind, string> = {
  cred: "Password di root",
  addr: "Indirizzo di un gateway",
  dial: "Numero nascosto",
  inner: "Mappa di rete interna",
  dossier: "Fascicolo su una persona",
};

export const INTEL_DESC: Record<IntelKind, string> = {
  cred: "Viene da un accesso admin. Resta buona finché l'azienda non cambia la password: dopo un'intrusione con danni la cambia subito.",
  addr: "Un handle e il suo gateway. Buona finché quello non cambia indirizzo.",
  dial: "Una portante trovata col War Dialer. Non scade, ma vale meno quanta più gente la conosce.",
  inner: "Viene dalla mappatura di una rete interna. Chi la compra raggiunge la macchina interna per sei ore senza passare dal nodo davanti.",
  dossier: "Debiti, relazioni, licenziamenti: quello che hai scoperto indagando.",
};

/** Una cosa che sai e puoi vendere. Il dettaglio (la password, l'indirizzo) lo vedi solo tu. */
export type IntelPiece = {
  key: string;
  kind: IntelKind;
  title: string;
  detail: string;
  fresh: boolean;
  note: string; // da quando la sai, o perché non vale più
  bought: boolean; // comprata da altri: il Mediatore non la prende
  fair: number; // quanto vale oggi, con le copie che girano
  quote: number; // quanto paga il Mediatore (0 = non la prende)
  quoteWhy: string | null;
  listing: string | null; // id dell'annuncio, se è in bancarella
  disclose: number; // premio dell'azienda per la segnalazione (0 = non si può)
  discloseWhy: string | null;
  snitch: number; // quanto paga la Guardia (0 = non si può)
  snitchWhy: string | null;
};

/** Un annuncio in bancarella. Chi compra non vede il contenuto prima di pagare: solo il titolo. */
export type IntelListing = {
  id: string;
  kind: IntelKind;
  title: string;
  seller: string;
  npc: boolean; // l'annuncio è di un abitante
  price: number;
  until: number;
  sold: number;
  mine: boolean;
  owned: boolean; // la sai già
};

export type IntelView = {
  pieces: IntelPiece[];
  board: IntelListing[];
  brokerLeft: number; // vendite al Mediatore ancora possibili oggi
  log: { at: number; text: string }[];
};

/** Quanto resta un annuncio in bancarella. */
export const INTEL_LISTING_H = 24;
/** Annunci aperti al massimo per giocatore. */
export const INTEL_MAX_LISTINGS = 6;
/** Prezzo d'annuncio: limiti. */
export const INTEL_MIN_PRICE = 50;
export const INTEL_MAX_PRICE = 20000;
/** Il Mediatore paga questa frazione del valore, e compra al massimo tante informazioni al giorno da ciascuno. */
export const BROKER_SHARE = 0.6;
export const BROKER_DAILY = 8;
/** Ogni tanto il Mediatore è sotto sorveglianza: chi gli vende prende calore. */
export const BROKER_RISK = 0.1;
export const BROKER_HEAT = 12;
/** Ogni copia venduta toglie valore alle altre. */
export const COPY_DECAY = 0.8;
/** Mappa di rete interna comprata: quanto dura l'accesso. */
export const INNER_BOUGHT_H = 6;
/** Una mappa la puoi vendere fino a un giorno dopo averla fatta. */
export const INNER_SELL_H = 24;
/** Premio dell'azienda per chi la avvisa: frazione del valore; ai blu un po' di più. */
export const DISCLOSE_SHARE = 0.5;
export const DISCLOSE_BLUE = 1.3;
/** Commissione della bancarella. */
export const INTEL_FEE = 0.1;
/** Gli abitanti comprano al massimo tante informazioni al giorno da ciascun giocatore. */
export const NPC_BUYS_DAILY = 5;

export const intelValue = {
  cred: (tier: number) => 200 + tier * 300,
  addr: (fame: number, warrant: number) => 300 + Math.min(1500, Math.round(fame * 2)) + warrant * 300,
  dial: (tier: number) => 250 + tier * 200,
  inner: (tier: number) => 500 + tier * 300,
  dossier: (f: { debt: number; affair: boolean; fired: boolean; admin: boolean }) => 150 + (f.debt > 3000 ? 250 : 0) + (f.affair ? 200 : 0) + (f.fired ? 150 : 0) + (f.admin ? 200 : 0),
};

/** Quanto paga la Guardia per l'indirizzo di un handle: conta quanto è ricercato. */
export const snitchPay = (warrant: number, heat: number) => 200 + warrant * 400 + Math.round(heat * 4);
