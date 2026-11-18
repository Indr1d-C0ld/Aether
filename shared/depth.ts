// Profondità di gioco: rarità, bottino (exploit e chip), fama, etica, giustizia, imprese.
// Dati e formule condivisi da server e client; il server resta l'unico arbitro.

// ------------------------------------------------------------ rarità

export const RARITY = [
  { name: "Comune", color: "#7487b3" },
  { name: "Non comune", color: "#39ff88" },
  { name: "Raro", color: "#2ef2ff" },
  { name: "Epico", color: "#ff2bd6" },
  { name: "Leggendario", color: "#ffb000" },
] as const;

export const rarityName = (r: number) => RARITY[Math.max(0, Math.min(4, r))]!.name;
export const rarityColor = (r: number) => RARITY[Math.max(0, Math.min(4, r))]!.color;

/** Rarità di un file di dati in base al suo valore (1-12). */
export function dataRarity(value: number) {
  return value >= 11 ? 4 : value >= 9 ? 3 : value >= 7 ? 2 : value >= 4 ? 1 : 0;
}

/** Quanto paga il ricettatore per un oggetto, per rarità. */
export const ITEM_FENCE = [150, 400, 1200, 4000, 15000];

// ------------------------------------------------------------ oggetti

export type ChipEffect = "cpu" | "trace" | "modem" | "storage" | "heat" | "payout" | "luck" | "hops";

export type Item = {
  kind: "exploit" | "chip";
  code: string;
  rarity: number;
  name: string;
  desc: string;
  effects?: Partial<Record<ChipEffect, number>>;
};

export type ExploitDef = { code: string; name: string; rarity: number; desc: string; where: "op" | "any" };

/** Exploit: monouso. Si trovano come bottino, si comprano e si rubano; si consumano all'uso. */
export const EXPLOITS: ExploitDef[] = [
  { code: "alibi", name: "Alibi prefabbricato", rarity: 0, where: "any", desc: "Testimoni, scontrini, un turno di lavoro mai fatto. Calore −25." },
  { code: "freeze", name: "Loop di telecamera", rarity: 1, where: "op", desc: "Il monitor guarda un fermo immagine: trace congelato per 20 secondi." },
  { code: "zproxy", name: "0-day Proxy", rarity: 1, where: "op", desc: "Abbatte all'istante il proxy, di qualunque livello." },
  { code: "zfire", name: "0-day Firewall", rarity: 1, where: "op", desc: "Apre all'istante il firewall, di qualunque livello." },
  { code: "scrub", name: "Scrubber di sessione", rarity: 2, where: "op", desc: "Cancella pulite tutte le righe di questa sessione dal log del bersaglio." },
  { code: "ghost", name: "Rotta fantasma", rarity: 2, where: "op", desc: "Rimescola il rimbalzo: il trace riparte da zero." },
  { code: "skeleton", name: "Chiave scheletro", rarity: 3, where: "op", desc: "Accesso admin immediato, senza password. Lascia comunque la riga di login." },
  { code: "lawyer", name: "Avvocato di Lumen", rarity: 3, where: "any", desc: "Fa cadere il tuo capo d'accusa più grave." },
];

export const exploitDef = (code: string) => EXPLOITS.find((e) => e.code === code) ?? null;

export const CHIP_LABEL: Record<ChipEffect, string> = {
  cpu: "velocità strumenti",
  trace: "velocità del trace",
  modem: "velocità di copia",
  storage: "GQ di archivio",
  heat: "calore accumulato",
  payout: "ricompense dei contratti",
  luck: "probabilità di bottino",
  hops: "hop nel rimbalzo",
};

/** Valore dell'effetto di un chip per rarità (percentuali, GQ o hop). */
export const CHIP_POWER: Record<ChipEffect, number[]> = {
  cpu: [6, 10, 15, 22, 30],
  trace: [-4, -7, -10, -14, -20],
  modem: [15, 25, 40, 60, 90],
  storage: [4, 8, 14, 24, 60],
  heat: [-8, -12, -18, -25, -35],
  payout: [3, 5, 8, 12, 18],
  luck: [5, 8, 12, 18, 25],
  hops: [0, 0, 1, 1, 2],
};

export const CHIP_NAMES: Record<ChipEffect, string[]> = {
  cpu: ["Coprocessore 387", "Coprocessore Hitachi RM", "Overdrive DX4", "Coprocessore Ono-Sendai", "Kuang Mark Eleven"],
  trace: ["Scrambler a toni", "Scrambler Blue Box", "Scrambler Red Box", "Ripetitore Captain Crunch", "Nucleo Joshua"],
  modem: ["Modem 2400 baud", "Modem 9600 baud", "Modem 14.4", "Modem 28.8 V.34", "Uplink ottico Pharmakom"],
  storage: ["Banco RAM 4 GQ", "Banco RAM 8 GQ", "Disco Zip", "Impianto mnemonico", "Memoria di Johnny"],
  heat: ["Identità di riserva", "Passaporto pulito", "Doppio fondo", "Volto nuovo", "Cortex di Jobe"],
  payout: ["Agenda del broker", "Rubrica di Pale Market", "Commercialista ombra", "Fixer personale", "La mano di Plague"],
  luck: ["Dado truccato", "Fiuto da rigattiere", "Orecchio in sala server", "Talpa al mercato", "Deck di Zero Cool"],
  hops: ["", "", "Tabella di instradamento", "Chiave di centrale", "Occhiali di Acid Burn"],
};

/** Leggendari unici: due effetti e un nome da film. Vivono nei nodi nascosti. */
export const LEGENDARY: Record<string, Item> = {
  joshua: {
    kind: "chip",
    code: "joshua",
    rarity: 4,
    name: "Nucleo Joshua",
    desc: "Ha giocato ogni partita possibile. L'unica mossa vincente è non giocare.",
    effects: { trace: -20, payout: 15 },
  },
  zerocool: {
    kind: "chip",
    code: "zerocool",
    rarity: 4,
    name: "Deck di Zero Cool",
    desc: "1507 sistemi in un giorno. Poi sette anni senza toccare una tastiera.",
    effects: { cpu: 25, luck: 25 },
  },
  johnny: {
    kind: "chip",
    code: "johnny",
    rarity: 4,
    name: "Memoria di Johnny",
    desc: "Capacità raddoppiata, e poi raddoppiata ancora. I ricordi d'infanzia non ci stanno più.",
    effects: { storage: 80, modem: 60 },
  },
  jobe: {
    kind: "chip",
    code: "jobe",
    rarity: 4,
    name: "Cortex di Jobe",
    desc: "Progetto 5. Quando squilleranno tutti i telefoni del mondo, saprai chi è stato.",
    effects: { cpu: 30, heat: -30 },
  },
};

export function chipSlots(rankIndex: number) {
  return Math.min(4, 1 + Math.floor(rankIndex / 3));
}

export function describeEffects(effects: Partial<Record<ChipEffect, number>> | undefined) {
  if (!effects) return "";
  return (Object.entries(effects) as [ChipEffect, number][])
    .map(([k, v]) => (k === "storage" ? `+${v} ${CHIP_LABEL[k]}` : k === "hops" ? `+${v} ${CHIP_LABEL[k]}` : `${v > 0 ? "+" : ""}${v}% ${CHIP_LABEL[k]}`))
    .join(" · ");
}

// ------------------------------------------------------------ contratti: grado e complicazioni

export const TIER_NAME = ["Ordinario", "Delicato", "Rischioso", "Scottante", "Leggendario"];
/** Fama minima per vedere i contratti di un certo grado. */
export const TIER_FAME = [0, 0, 60, 250, 700];
/** Probabilità di bottino alla consegna, per grado. */
export const TIER_LOOT = [0.08, 0.14, 0.22, 0.35, 0.6];

export type MissionMod = "urgent" | "ghost" | "guarded";
export const MOD_INFO: Record<MissionMod, { name: string; desc: string }> = {
  urgent: { name: "Urgente", desc: "Scade presto, paga il 40% in più." },
  ghost: { name: "Senza traccia", desc: "+50% se alla consegna nel log del nodo non resta nessuna tua riga." },
  guarded: { name: "Presidiato", desc: "Un SOC privato sorveglia il nodo: trace più rapido del 35%. Paga il 30% in più." },
};

// ------------------------------------------------------------ fama ed etica

export const FAME_TITLES: { min: number; name: string }[] = [
  { min: 0, name: "Sconosciuto" },
  { min: 25, name: "Voce di corridoio" },
  { min: 60, name: "Nome che gira" },
  { min: 130, name: "Nome noto" },
  { min: 250, name: "Ricercato dai clienti" },
  { min: 450, name: "Leggenda urbana" },
  { min: 700, name: "Icona del Reticolo" },
  { min: 1100, name: "Mito" },
];

export function fameTier(fame: number) {
  let i = 0;
  FAME_TITLES.forEach((t, k) => {
    if (fame >= t.min) i = k;
  });
  return { index: i, name: FAME_TITLES[i]!.name, next: FAME_TITLES[i + 1]?.min ?? null };
}

/** Etica da −100 (spietato) a +100 (idealista): cambia con quello che fai. */
export function ethicsTitle(e: number) {
  if (e <= -60) return "Spietato";
  if (e <= -25) return "Mercenario";
  if (e < 25) return "Neutrale";
  if (e < 60) return "Con un codice";
  return "Idealista";
}

// ------------------------------------------------------------ giustizia

export type Charge = { id: string; text: string; severity: number; at: number; where: string };

export const WARRANT = [
  { name: "Pulito", desc: "Nessuno ti cerca." },
  { name: "Attenzionato", desc: "Il tuo nome è in un fascicolo: i monitor ti risalgono il 10% più in fretta." },
  { name: "Ricercato", desc: "Trace +20%, indagini due volte più rapide." },
  { name: "Mandato federale", desc: "Trace +30%. Al prossimo passo falso ti arrestano." },
];

export function warrantLevel(charges: Charge[]) {
  const pts = charges.reduce((s, c) => s + c.severity, 0);
  return pts >= 9 ? 3 : pts >= 6 ? 2 : pts >= 3 ? 1 : 0;
}

export const WARRANT_TRACE = [1, 1.1, 1.2, 1.3];

export function bailCost(charges: Charge[], arrests: number) {
  return 600 + charges.reduce((s, c) => s + c.severity, 0) * 250 + arrests * 400;
}

export function jailSeconds(charges: Charge[], arrests: number) {
  return Math.min(240, 45 + charges.reduce((s, c) => s + c.severity, 0) * 12 + arrests * 20);
}

// ------------------------------------------------------------ imprese

export type FeatDef = { id: string; name: string; desc: string; fame: number; faction?: "red" | "blue"; secret?: boolean };

export const FEATS: FeatDef[] = [
  { id: "first", name: "Primo collegamento", desc: "Consegna il tuo primo contratto.", fame: 5 },
  { id: "planet", name: "Hack the Planet!", desc: "Ottieni l'accesso admin su 10 nodi diversi.", fame: 40 },
  { id: "ghost5", name: "Mai stato qui", desc: "Cinque indagini chiuse senza un nome.", fame: 30, faction: "red" },
  { id: "crash", name: "Crash Override", desc: "Distruggi l'intero archivio di un nodo.", fame: 35, faction: "red" },
  { id: "duel", name: "Mess with the best", desc: "Entra da admin nel gateway di un altro giocatore.", fame: 40 },
  { id: "banker", name: "Il colpo", desc: "Incassa un bonifico rubato di almeno 5.000 CR.", fame: 45, faction: "red" },
  { id: "clean", name: "Fedina immacolata", desc: "Cancella i tuoi capi d'accusa dal casellario.", fame: 35 },
  { id: "courier", name: "Corriere mnemonico", desc: "Consegna un carico prima che si corrompa.", fame: 30 },
  { id: "profiler", name: "Cento volti", desc: "Rintraccia cinque profili.", fame: 30 },
  { id: "dialer", name: "Giochiamo?", desc: "Scopri un nodo nascosto con il War Dialer.", fame: 25 },
  { id: "wopr", name: "L'unica mossa vincente", desc: "Entra nel Crystal Palace e stacca senza toccare nulla.", fame: 60, secret: true },
  { id: "gibson", name: "Garbage file", desc: "Copia garbage.dat dal Gibson.", fame: 60, secret: true },
  { id: "jobe", name: "Il Tagliaerbe", desc: "Entra da admin in Virtual Space Industries.", fame: 60, secret: true },
  { id: "legend", name: "Collezionista", desc: "Possiedi un oggetto leggendario.", fame: 50 },
  { id: "jail", name: "Sette anni senza tastiera", desc: "Fatti arrestare. Succede ai migliori.", fame: 15 },
  { id: "hound", name: "Segugio", desc: "Cinque attribuzioni riuscite.", fame: 35, faction: "blue" },
  { id: "wall", name: "Il muro", desc: "Tre intrusi presi con il contro-trace.", fame: 40, faction: "blue" },
  { id: "archivist", name: "Archivista", desc: "Cinque fra ripristini, recuperi e storni.", fame: 30, faction: "blue" },
];

export const featDef = (id: string) => FEATS.find((f) => f.id === id) ?? null;
