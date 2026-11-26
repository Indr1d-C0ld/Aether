// Imprevisti durante le intrusioni. Ogni sessione può cambiare strada, secondo lo stato vero del sistema:
// l'amministratore che si collega (solo se c'è qualcuno in ufficio), un riavvio programmato, un altro intruso già dentro,
// il turno di notte che controlla i log, un file con un segnalatore, una linea che gracchia. Si sceglie con un pulsante,
// entro pochi secondi; se non si sceglie, decide il caso.

export type SurpriseKind = "admin" | "reboot" | "rival" | "patrol" | "canary" | "static";

export const SURPRISE_NAME: Record<SurpriseKind, string> = {
  admin: "L'amministratore è in linea",
  reboot: "Riavvio programmato",
  rival: "Non sei solo",
  patrol: "Controllo a campione",
  canary: "Il file chiama casa",
  static: "Linea disturbata",
};

export type SurpriseChoice = { id: string; label: string; hint: string; why: string | null };
export type SurpriseView = {
  id: string;
  kind: SurpriseKind;
  title: string;
  text: string;
  until: number; // entro quando scegliere
  deadline: number | null; // quando succede comunque (il riavvio)
  choices: SurpriseChoice[];
  fallback: string; // cosa succede se non scegli
  result: { text: string; tone: "ok" | "warn" | "bad" } | null;
};

/** Ogni quanti secondi una sessione può incontrare un imprevisto, e con che probabilità. */
export const SURPRISE_CHECK_S = 8;
export const SURPRISE_CHANCE = 0.06;
/** Non nei primi secondi di una connessione; al più uno per sessione (più il segnalatore, che dipende da un file). */
export const SURPRISE_GRACE_S = 12;
/** Tempo per scegliere. */
export const SURPRISE_DECIDE_S = 20;
export const CANARY_DECIDE_S = 12;
/** Il riavvio arriva dopo tanto, comunque vada. */
export const REBOOT_S = 30;
/** Probabilità che un file copiato da un'organizzazione spaventata abbia un segnalatore (paura almeno 20). */
export const CANARY_CHANCE = 0.25;
export const CANARY_FEAR = 20;

/** Fingersi un collega: base, più se conosci l'amministratore, più se sei dentro da operatore; il calore pesa. */
export const bluffChance = (knowsAdmin: boolean, clearance: number, heat: number, substitute: boolean) =>
  Math.max(0.1, Math.min(0.9, 0.45 + (knowsAdmin ? 0.25 : 0) + (clearance >= 2 ? 0.15 : 0) + (substitute ? 0.15 : 0) - heat / 200));
