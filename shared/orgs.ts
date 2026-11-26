// Organizzazioni vive: ogni azienda, banca o ufficio ha una cassa, una reputazione, un morale e una paura.
// Quello che le succede la cambia, e lei reagisce: investe in difese, taglia il turno di notte, sospetta
// un concorrente, entra in crisi, viene comprata. La Cronaca tiene memoria di tutto.

export type OrgStatus = "attiva" | "in crisi" | "in sciopero" | "in guerra";
export type OrgView = {
  id: string;
  name: string;
  kind: string;
  city: string;
  status: OrgStatus;
  group: string | null; // chi l'ha comprata, se è stata comprata
  cash: number;
  rep: number; // 0-100
  morale: number; // 0-100
  fear: number; // 0-100
  cuts: boolean; // turno di notte tagliato
  sec: { proxy: number; firewall: number; monitor: number };
  base: { proxy: number; firewall: number; monitor: number };
  rivals: { id: string; name: string; heat: number; war: boolean }[];
  supply?: import("./domino.ts").SupplyView | null;
  history: { at: number; text: string }[];
};
export type NewsKind = "sabotaggio" | "intrusione" | "difesa" | "economia" | "guerra" | "legge" | "virus" | "gente";
export type NewsRow = { id: number; at: number; kind: NewsKind; text: string; org: string | null; orgName: string | null };
export type WorldView = {
  news: NewsRow[];
  emergencyUntil: number;
  alerts: { region: string; until: number }[];
  wars: { a: string; aName: string; b: string; bName: string; until: number }[];
  crisis: { id: string; name: string; cash: number }[];
  hit: { id: string; name: string; fear: number }[];
  intrusions24h: number;
  law: import("./law.ts").LawView | null;
};
export const NEWS_LABEL: Record<NewsKind, string> = { sabotaggio: "Sabotaggi", intrusione: "Intrusioni", difesa: "Sicurezza", economia: "Economia", guerra: "Guerre commerciali", legge: "Legge e ordine", virus: "Virus", gente: "Gente" };
/** Intrusioni in 24 ore oltre le quali scatta lo stato d'emergenza. */
export const EMERGENCY_AT = 45;
