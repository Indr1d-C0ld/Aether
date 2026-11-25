// Le persone del Reticolo: i cento cittadini dell'anagrafe hanno una giornata, un lavoro che possono perdere,
// debiti, ferie, relazioni. Chi le conosce può usarle: comprarle, ascoltarle, ricattarle. O proteggerle.

export type Where = "in ufficio" | "a casa" | "dorme" | "in ferie" | "in giro";
export type CitizenRow = {
  id: string;
  name: string;
  job: string;
  city: string;
  employer: string | null; // nome dell'organizzazione
  employerId: string | null;
  role: "amministratore" | "dipendente" | "ex dipendente" | "nessuno";
  where: Where;
  clock: string;
  /** quello che sai di lei: all'inizio poco, dopo un'indagine tutto */
  known: boolean;
  debt: number | null;
  fired: string | null; // da chi è stata licenziata
  affair: string | null; // con chi
  vacation: boolean;
  /** cosa puoi farle adesso, e a che prezzo */
  can: { act: "investigate" | "bribe" | "source" | "blackmail" | "warn"; label: string; cost: number; why: string | null }[];
};
export const INVESTIGATE_COST = 300;
export const SOURCE_COST = 500;
