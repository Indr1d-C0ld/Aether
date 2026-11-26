// Il mercato nero ha una memoria.
// 1. Gli 0-day invecchiano: ogni volta che qualcuno ne usa uno (giocatore o abitante), le aziende vedono la firma e si
//    aggiornano. Più è usato, più è facile che sui sistemi grossi trovi la falla già chiusa, e meno lo paga il ricettatore.
//    Se nessuno lo usa per un po', torna buono: gira una variante nuova.
// 2. Le retate: quando la Guardia arresta molto, o scatta lo stato d'emergenza, il mercato nero si svuota per tre giorni.
//    I moduli del Laboratorio costano fino al triplo, il ricettatore paga di più exploit, chip e gadget, e i rossi
//    del Reticolo stanno buoni.

/** Gli exploit tecnici: quelli che sfruttano una falla vera, e che una patch può chiudere. */
export const ZERO_DAYS = ["zproxy", "zfire", "zmon", "freeze", "scrub", "skeleton", "icebreaker", "decoder"] as const;
export const isZeroDay = (code: string) => (ZERO_DAYS as readonly string[]).includes(code);
/** Mezza vita della notorietà di un exploit, in ore. */
export const EXPLOIT_HALF_H = 72;
/** Freschezza da 1 (nessuno l'ha visto) verso 0: con 6 usi recenti vale la metà. */
export const freshness = (uses: number) => 1 / (1 + Math.max(0, uses) / 6);
/** Probabilità che la falla sia già chiusa su un sistema di quel grado (0-4). */
export const patchedChance = (fresh: number, tier: number) => Math.min(0.85, Math.max(0, (1 - fresh) * (0.4 + 0.15 * tier)));
/** Fresco: nessuno lo conosce; noto: qualche sistema grosso ha la patch; mezzo patchato; patchato: quasi ovunque. */
export const freshLabel = (f: number) => (f >= 0.8 ? "fresco" : f >= 0.55 ? "noto" : f >= 0.3 ? "mezzo patchato" : "patchato");
/** Gli abitanti usano 0-day anche loro: probabilità per battito (45 s). */
export const NPC_EXPLOIT_CHANCE = 0.003;

/** Quanto dura una retata, e quanto pesa all'inizio (poi cala fino a zero). */
export const RAID_H = 72;
/** Punti arresto in 24 ore che fanno scattare una retata: un giocatore vale 2, un abitante in custodia 1.
 * Gli arresti degli handle di sfondo non contano: cadono ogni giorno e terrebbero la retata sempre accesa. */
export const RAID_AT = 4;
/** Dopo una retata, almeno tanto prima della prossima. */
export const RAID_COOLDOWN_H = 48;
export const raidK = (start: number, now: number) => (start ? Math.max(0, 1 - (now - start) / (RAID_H * 3600_000)) : 0);
export const raidModMult = (k: number) => 1 + 2 * k; // moduli del Laboratorio: fino al triplo
export const raidFenceMult = (k: number) => 1 + 0.6 * k; // exploit, chip e gadget dal ricettatore
export const raidNpcMult = (k: number) => 1 - 0.4 * k; // i rossi del Reticolo si fanno vedere meno

export type BlackView = {
  raid: { start: number; until: number; k: number; why: string } | null;
  modMult: number;
  fenceMult: number;
  zerodays: { code: string; name: string; fresh: number; label: string }[];
  arrests24: number;
};
