// Sottosistemi: le «stanze» di un nodo. Ognuna chiede un livello di accesso e offre poche azioni sue.
// Livelli: 0 nessuno · 1 impiegato (credenziali personali) · 2 operatore · 3 admin (o credenziali cliente).
import type { NodeKind } from "./types.ts";

export const CLEARANCE = ["nessun accesso", "impiegato", "operatore", "admin"] as const;

export type ZoneAction = { id: string; name: string; desc: string; need: number; side?: "red" | "blue" };
export type ZoneDef = { id: string; name: string; blurb: string; need: number; kinds: NodeKind[] | "org"; actions: ZoneAction[] };

/** I tipi di nodo che hanno uffici, personale e posta. */
export const ORG_KINDS: NodeKind[] = ["corp", "bank", "gov", "law", "edu", "lab", "med", "news", "util", "telco", "mil", "shop"];

export const ZONES: ZoneDef[] = [
  {
    id: "posta",
    name: "Posta interna",
    blurb: "Le caselle del personale. Qui si scrive quello che non si dovrebbe.",
    need: 1,
    kinds: "org",
    actions: [{ id: "allerta", name: "Avvisa il personale", desc: "Una circolare a tutti: il sistema resta in allerta per 15 minuti.", need: 3, side: "blue" }],
  },
  {
    id: "centralino",
    name: "Centralino",
    blurb: "La rubrica interna e le linee in uscita.",
    need: 1,
    kinds: ["corp", "gov", "telco", "med", "edu", "news", "law", "bank", "util"],
    actions: [
      { id: "rubrica", name: "Sfoglia la rubrica", desc: "Clienti, fornitori, sedi: due indirizzi nuovi sulla tua mappa.", need: 1 },
      { id: "silenzia", name: "Stacca la linea della sicurezza", desc: "Nessuno riesce a dare l'allarme: l'allerta del sistema si spegne.", need: 2, side: "red" },
    ],
  },
  {
    id: "telecamere",
    name: "Telecamere",
    blurb: "La sala monitor. Qualcuno, di solito, guarda.",
    need: 2,
    kinds: ["shop", "bank", "corp", "mil", "law", "med", "lab", "util", "gov"],
    actions: [
      { id: "guarda", name: "Guarda la sala server", desc: "Chi presidia il nodo, e quanti sensori ci sono.", need: 2 },
      { id: "loop", name: "Metti il nastro in loop", desc: "Il monitor guarda un corridoio vuoto: trace fermo per 15 secondi. Una volta per connessione.", need: 2, side: "red" },
      { id: "nastri", name: "Rivedi i nastri", desc: "Le registrazioni non si cancellano col Log Deleter: ricostruisci fino a due righe sparite dal log.", need: 3, side: "blue" },
    ],
  },
  {
    id: "contabilita",
    name: "Contabilità",
    blurb: "Fatture, stipendi, e una colonna che non torna mai.",
    need: 2,
    kinds: ["corp", "shop", "bank", "gov", "med", "util", "telco"],
    actions: [
      { id: "fattura", name: "Storna una fattura", desc: "Un rimborso a un fornitore che non esiste. Poco, ma subito.", need: 2, side: "red" },
      { id: "mastro", name: "Copia il libro mastro", desc: "I conti veri: un file che il ricettatore paga bene.", need: 2, side: "red" },
    ],
  },
  {
    id: "personale",
    name: "Ufficio del personale",
    blurb: "Chi lavora qui, con che badge, fino a quando.",
    need: 2,
    kinds: ["corp", "gov", "lab", "mil", "edu", "med", "bank", "telco", "util", "law", "news"],
    actions: [
      { id: "organico", name: "Leggi l'organico", desc: "Nomi e mansioni di chi lavora qui.", need: 2 },
      { id: "badge", name: "Stampati un badge", desc: "Per 24 ore entri in questo sistema da operatore, senza password.", need: 2, side: "red" },
      { id: "revoca", name: "Revoca i badge sospetti", desc: "Annulla tutti i badge che non corrispondono a un dipendente.", need: 3, side: "blue" },
    ],
  },
  {
    id: "rete",
    name: "Rete interna",
    blurb: "Macchine che da fuori non rispondono.",
    need: 3,
    kinds: ["corp", "bank", "lab", "mil"],
    actions: [{ id: "mappa", name: "Mappa la rete interna", desc: "Trovi la macchina che conta davvero, e per 15 minuti puoi raggiungerla passando da qui.", need: 3 }],
  },
];

export type ZoneView = { id: string; name: string; blurb: string; need: number; open: boolean; actions: { id: string; name: string; desc: string; need: number; blocked: string | null }[] };
export type MailMsg = { id: string; from: string; to: string; subject: string; body: string; act: null | { kind: "lead" | "dossier"; label: string; done: boolean } };
