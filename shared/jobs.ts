// Commissioni: contratti scritti dai giocatori su un nodo a scelta, con un obiettivo e delle condizioni.
// La ricompensa resta in deposito come per le taglie; il contratto si consegna quando tutti gli obiettivi risultano fatti.
export type JobGoal = { id: string; deed: string; side: "red" | "blue"; label: (org: string) => string; name: string };
export const JOB_GOALS: JobGoal[] = [
  { id: "admin", deed: "admin", side: "red", name: "Entrare da admin", label: (o) => `Diventa admin su ${o}` },
  { id: "copy", deed: "t:copy", side: "red", name: "Portare via un file", label: (o) => `Copia un file qualsiasi da ${o}` },
  { id: "shutdown", deed: "sys:shutdown", side: "red", name: "Spegnere il sistema", label: (o) => `Spegni ${o}` },
  { id: "plant", deed: "mw:plant", side: "red", name: "Impiantare una creatura", label: (o) => `Impianta una creatura in ${o}` },
  { id: "mastro", deed: "z:mastro", side: "red", name: "Copiare il libro mastro", label: (o) => `Copia il libro mastro di ${o}` },
  { id: "patch", deed: "t:patch", side: "blue", name: "Rinforzare il sistema", label: (o) => `Rinforza ${o} con il Patch Kit` },
  { id: "preside", deed: "preside", side: "blue", name: "Presidiarlo", label: (o) => `Presidia ${o}` },
  { id: "clean", deed: "av:clean", side: "blue", name: "Bonificarlo dai virus", label: (o) => `Togli un'infezione da ${o}` },
  { id: "riregistra", deed: "z:riregistra", side: "blue", name: "Ri-registrare il personale", label: (o) => `Ri-registra il personale di ${o}` },
];
export type JobCond = "ghost" | "notte" | "giorno" | "fretta" | "esperti";
export const JOB_CONDS: { id: JobCond; name: string; hint: string; side?: "red" | "blue" }[] = [
  { id: "ghost", name: "Senza lasciare tracce", hint: "Uscita pulita: nel log del bersaglio non deve restare nessuna riga leggibile che porti a chi lo fa.", side: "red" },
  { id: "notte", name: "Solo di notte (ora loro)", hint: "L'obiettivo conta solo se fatto quando nel fuso del bersaglio è notte." },
  { id: "giorno", name: "Solo in orario d'ufficio", hint: "L'obiettivo conta solo se fatto mentre negli uffici del bersaglio c'è gente." },
  { id: "fretta", name: "Entro 30 minuti dall'accettazione", hint: "Chi accetta ha mezz'ora." },
  { id: "esperti", name: "Solo per gente esperta", hint: "Lo può accettare solo chi ha almeno 1.500 XP." },
];
/** Ogni condizione alza la paga minima: chi chiede di più paga di più. */
export const JOB_MIN = 800;
export const jobMin = (conds: string[]) => Math.round(JOB_MIN * (1 + conds.length * 0.35));
