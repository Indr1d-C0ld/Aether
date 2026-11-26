// Territori. Crew dei giocatori e bande degli abitanti si contendono le città: ogni impresa in una città dà punti di
// presenza a chi l'ha fatta, i punti sbiadiscono, e una città è di chi ne ha abbastanza e con un vantaggio netto.
// Tenere una città conta: i rossi ci lavorano con un trace più lento, i blu ci indagano più in fretta, e chi rimbalza
// sui relay di una città tenuta da un'altra crew paga un pedaggio alla sua cassa.

/** Punti di presenza per impresa (le chiavi sono quelle di Game.deed). */
export const TURF_DEED: Record<string, number> = {
  admin: 2,
  "t:copy": 1,
  transfer: 1,
  "z:mastro": 1,
  "sys:shutdown": 3,
  "sys:blackout": 3,
  "mw:sabot": 3,
  preside: 2,
  "t:patch": 2,
  "av:clean": 1,
  "z:allerta": 1,
};
/** Un abitante che fa qualcosa in una città porta punti alla sua banda. */
export const TURF_NPC = 2;
/** Gli abitanti di una banda scelgono un bersaglio nelle tre città più forti della banda con questa probabilità, se ce n'è uno. */
export const TURF_HOME = 0.6;
/** Mezza vita dei punti, in ore. */
export const TURF_HALF_H = 72;
/** Per tenere una città servono almeno tanti punti, e un vantaggio di tanto sulla seconda; altrimenti è contesa. */
export const TURF_MIN = 10;
export const TURF_LEAD = 1.25;
/** Vantaggi di chi tiene la città. */
export const TURF_TRACE = 0.9; // rossi: trace più lento sui sistemi della città
export const TURF_SWEEP = 0.85; // blu: indagini più rapide sulle intrusioni nella città
export const TURF_TOLL = 40; // a relay, pagato da chi ci rimbalza alla crew che tiene la città

export type TurfHolder = { key: string; name: string; tag: string; side: "red" | "blue"; mine: boolean; npc: boolean };
export type TurfCity = { city: string; x: number; y: number; holder: TurfHolder | null; contested: boolean; top: { name: string; tag: string; pts: number; mine: boolean }[] };
export type TurfView = { cities: TurfCity[]; mine: string | null; held: string[] };
