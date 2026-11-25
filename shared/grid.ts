// La griglia del firewall: il minigioco che affianca la barra del Firewall Bypass.
// Il firewall è una tabella di regole; qualcuna è stata lasciata aperta. Ogni sonda che non la trova
// dice a quante caselle sta la falla più vicina. Trovate tutte, il firewall cade subito.

export type GridSpec = { side: number; holes: number; probes: number };

/** Lato, falle e sonde per livello del firewall. «manual» = senza la versione giusta dello strumento. */
export function gridSpec(level: number, manual: boolean): GridSpec {
  const l = Math.max(1, Math.min(3, level));
  const base = [
    { side: 5, holes: 2, probes: 7 },
    { side: 6, holes: 3, probes: 9 },
    { side: 7, holes: 4, probes: 11 },
  ][l - 1]!;
  return manual ? { ...base, probes: base.probes - 1 } : base;
}

export const gridDist = (side: number, a: number, b: number) => Math.abs((a % side) - (b % side)) + Math.abs(Math.floor(a / side) - Math.floor(b / side));

/** Distanza dalla falla ancora nascosta più vicina. */
export const gridClue = (side: number, cell: number, hidden: number[]) => Math.min(...hidden.map((h) => gridDist(side, cell, h)));

/** Sonde avanzate che rendono la breccia «pulita» (nessuna riga nel log). */
export const GRID_CLEAN = 2;

/** Sonde finite: il trace avanza di questa frazione del percorso. */
export const GRID_FAIL_TRACE = 0.12;

export type GridView = {
  side: number;
  holes: number;
  found: number[];
  /** caselle sondate a vuoto → distanza dalla falla nascosta più vicina */
  clues: Record<number, number>;
  probes: number; // sonde rimaste
  state: "open" | "won" | "lost";
  manual: boolean;
  /** a partita persa: dove stavano le falle non trovate */
  missed: number[];
};
