// L'orologio del mondo. Il Reticolo gira sull'ora vera: ogni punto della mappa ha la sua ora locale,
// ricavata dalla longitudine, e da quella dipendono la notte, gli orari d'ufficio, la pausa pranzo, il fine settimana.
import type { NodeKind } from "./types.ts";

export type DayPart = "notte" | "alba" | "mattina" | "pranzo" | "pomeriggio" | "sera";
export const PART_NAME: Record<DayPart, string> = { notte: "notte", alba: "alba", mattina: "mattina", pranzo: "pausa pranzo", pomeriggio: "pomeriggio", sera: "sera" };

const lonOf = (x: number) => (x / 320) * 360 - 180;
/** Ora locale (0-24, con i decimali) in un punto della mappa. */
export function localHour(x: number, atMs: number) {
  const d = new Date(atMs);
  return (((d.getUTCHours() + d.getUTCMinutes() / 60 + lonOf(x) / 15) % 24) + 24) % 24;
}
/** Giorno della settimana locale: 0 domenica … 6 sabato. */
export function localWeekday(x: number, atMs: number) {
  return new Date(atMs + (lonOf(x) / 15) * 3600_000).getUTCDay();
}
export const isWeekend = (x: number, atMs: number) => [0, 6].includes(localWeekday(x, atMs));
export function dayPart(x: number, atMs: number): DayPart {
  const h = localHour(x, atMs);
  return h >= 22 || h < 6 ? "notte" : h < 8 ? "alba" : h < 12.5 ? "mattina" : h < 14 ? "pranzo" : h < 18 ? "pomeriggio" : "sera";
}
export const clockLabel = (x: number, atMs: number) => {
  const h = localHour(x, atMs);
  return `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;
};

/** Chi tiene aperto come: uffici (lun-ven 8-18), negozi (lun-sab 9-20), presidi sempre aperti. */
export type Hours = "ufficio" | "negozio" | "sempre" | "nessuno";
export const HOURS: Partial<Record<NodeKind, Hours>> = { corp: "ufficio", bank: "ufficio", gov: "ufficio", edu: "ufficio", lab: "ufficio", shop: "negozio", law: "sempre", med: "sempre", mil: "sempre", news: "sempre", telco: "sempre", util: "sempre" };
export const hoursOf = (kind: NodeKind): Hours => HOURS[kind] ?? "nessuno";

/** C'è qualcuno alla scrivania? */
export function staffed(kind: NodeKind, x: number, atMs: number) {
  const hrs = hoursOf(kind);
  if (hrs === "sempre") return true;
  if (hrs === "nessuno") return false;
  const h = localHour(x, atMs);
  const wd = localWeekday(x, atMs);
  if (hrs === "negozio") return wd !== 0 && h >= 9 && h < 20;
  return wd >= 1 && wd <= 5 && h >= 8 && h < 18;
}
/** Ore mancanti alla prossima apertura (0 se è aperto). */
export function opensIn(kind: NodeKind, x: number, atMs: number) {
  if (staffed(kind, x, atMs) || hoursOf(kind) === "nessuno") return 0;
  for (let m = 15; m <= 72 * 60; m += 15) if (staffed(kind, x, atMs + m * 60_000)) return m / 60;
  return 0;
}
export function statusLine(kind: NodeKind, x: number, atMs: number) {
  const hrs = hoursOf(kind);
  if (hrs === "nessuno") return "";
  if (hrs === "sempre") return dayPart(x, atMs) === "notte" ? "presidio ridotto: turno di notte" : "presidiato a tutte le ore";
  if (staffed(kind, x, atMs)) return dayPart(x, atMs) === "pranzo" ? "aperto, ma sono in pausa pranzo" : hrs === "negozio" ? "negozio aperto" : "uffici aperti";
  const h = opensIn(kind, x, atMs);
  return `${hrs === "negozio" ? "chiuso" : isWeekend(x, atMs) ? "chiuso per il fine settimana" : "uffici chiusi"} · apre fra ${h < 1 ? "meno di un'ora" : `${Math.round(h)} h`}`;
}

/** Quanto è buio in un punto della mappa, da 0 (giorno pieno) a 1 (notte fonda), con un'ora e mezza di crepuscolo. */
export function darkness(x: number, atMs: number) {
  const h = localHour(x, atMs);
  // distanza in ore dalla mezzanotte locale, 0..12
  const fromMidnight = Math.min(h, 24 - h);
  const edge = 5.25; // notte piena fino alle 5:15 e dalle 18:45
  if (fromMidnight <= edge) return 1;
  if (fromMidnight >= edge + 1.5) return 0;
  return 1 - (fromMidnight - edge) / 1.5;
}
