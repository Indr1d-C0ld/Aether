// La copertura: un'attività legale intestata a te. Incassa in orario d'ufficio, dà lavoro a chi è stato licenziato,
// ti fa una fattura di comodo quando serve. E se ti scaldi troppo, arriva la finanza.
export type FrontKind = { id: string; name: string; side: "red" | "blue"; blurb: string };
export const FRONT_KINDS: FrontKind[] = [
  { id: "arcade", name: "Sala giochi", side: "red", blurb: "Gettoni, cabinati, e un retro dove nessuno fa domande." },
  { id: "copy", name: "Copisteria", side: "red", blurb: "Fotocopie, rilegature, e duplicazione di dischetti «per uso personale»." },
  { id: "import", name: "Import-export", side: "red", blurb: "Cosa importi e cosa esporti non l'ha mai capito nessuno. È il bello." },
  { id: "assist", name: "Assistenza computer", side: "blue", blurb: "Riparazioni, installazioni, e una parola buona sull'antivirus." },
  { id: "agency", name: "Agenzia di sicurezza", side: "blue", blurb: "Consulenze, verifiche, turni di guardia in subappalto." },
];
export const FRONT_COST = 6000;
export const FRONT_UP = [0, 8000, 20000] as const;
/** Crediti a battito (45 s) in orario d'ufficio, per livello. */
export const FRONT_RATE = [5, 9, 14] as const;
/** Quanto tiene la cassa prima che tu passi a ritirare. */
export const FRONT_CAP = [1500, 3500, 7000] as const;
export const FRONT_ALIBI_COST = 300;
export const FRONT_STAFF_MAX = 2;
export type FrontView = {
  has: boolean;
  name: string;
  kind: string;
  level: number;
  till: number;
  cap: number;
  rate: number;
  open: boolean;
  frozenUntil: number;
  staff: { id: string; name: string }[];
  hirable: { id: string; name: string; job: string }[];
  alibiReady: boolean;
  earned: number;
};
