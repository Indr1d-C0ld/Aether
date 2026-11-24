// Specializzazioni: sette mestieri che crescono con quello che fai davvero (i contatori personali).
// Ogni livello (0-10) dà un piccolo vantaggio nel suo campo: l'1% per livello, o poco più.
export type SpecId = "intrusione" | "furtivita" | "dati" | "finanza" | "sabotaggio" | "esplorazione" | "difesa";

export type SpecDef = { id: SpecId; name: string; perk: string; per: number; unit: string; keys: [string, number][] };

export const SPEC_DEFS: SpecDef[] = [
  { id: "intrusione", name: "Intrusione", perk: "velocità degli strumenti", per: 1, unit: "%", keys: [["t:proxy", 1], ["t:firewall", 1], ["t:breaker", 1], ["t:monbypass", 1], ["t:dict", 1], ["nodes", 2], ["staff", 2], ["z:badge", 2], ["z:pivot", 4]] },
  { id: "furtivita", name: "Furtività", perk: "trace più lento", per: 1, unit: "%", keys: [["ghost", 3], ["logs", 0.3], ["close", 2], ["forged", 1], ["ghostpay", 3]] },
  { id: "dati", name: "Dati", perk: "velocità di copia", per: 2, unit: "%", keys: [["t:copy", 1], ["t:decrypt", 1.5], ["t:delete", 0.5], ["a:alter", 1], ["t:upload", 2], ["z:posta", 1], ["z:dossier", 2], ["z:mastro", 2]] },
  { id: "finanza", name: "Finanza", perk: "paga dei contratti", per: 1, unit: "%", keys: [["a:deliver", 1], ["a:transfer", 2], ["a:fence", 0.5], ["sys:cash", 0.5], ["sold", 2]] },
  { id: "sabotaggio", name: "Sabotaggio", perk: "calore in meno", per: 1.5, unit: "%", keys: [["a:sys", 1], ["t:bdkit", 2], ["t:worm", 2], ["a:overload", 2], ["gw", 3], ["duelwin", 4]] },
  { id: "esplorazione", name: "Esplorazione", perk: "probabilità di bottino", per: 0.5, unit: " punti", keys: [["a:wardial", 1], ["seen", 0.2], ["hidden", 20], ["a:registry", 0.5], ["hops", 0.05]] },
  { id: "difesa", name: "Difesa", perk: "esperienza dei contratti", per: 1, unit: "%", keys: [["attrib", 5], ["countertraces", 5], ["t:patch", 1], ["t:forensics", 1], ["t:honey", 1], ["a:preside", 0.5], ["a:deploySensor", 1], ["dewormed", 2]] },
];

export const SPEC_TITLES = ["—", "Novizio", "Apprendista", "Praticante", "Esperto", "Specialista", "Veterano", "Maestro", "Virtuoso", "Luminare", "Leggenda"];

export function specPoints(counters: Record<string, number>, id: SpecId) {
  const d = SPEC_DEFS.find((x) => x.id === id)!;
  return d.keys.reduce((s, [k, w]) => s + (counters[k] ?? 0) * w, 0);
}
/** Punti per arrivare a un livello: 8, 24, 56, 120… (raddoppia ogni volta). */
export const specNeed = (level: number) => 8 * (2 ** level - 1);
export function specLevel(counters: Record<string, number>, id: SpecId) {
  const p = specPoints(counters, id);
  let l = 0;
  while (l < 10 && p >= specNeed(l + 1)) l += 1;
  return l;
}
