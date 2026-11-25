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

export type ChipEffect = "cpu" | "trace" | "modem" | "storage" | "heat" | "payout" | "luck" | "hops" | "xp" | "fence";

export type Item = {
  kind: "exploit" | "chip" | "gadget";
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
  // --- seconda ondata
  { code: "map", name: "Mappa rubata", rarity: 0, where: "any", desc: "Una pagina strappata dall'elenco di un tecnico: 5 nodi nuovi sulla tua mappa." },
  { code: "turbo", name: "Compressione V.42bis", rarity: 0, where: "any", desc: "Per 90 secondi copi e carichi tre volte più in fretta." },
  { code: "tokens", name: "Gettoni di Cereal Killer", rarity: 0, where: "any", desc: "Azzera l'usura di tutti i tuoi relay: i monitor dimenticano i tuoi percorsi abituali." },
  { code: "overclock", name: "Overclock a ghiaccio secco", rarity: 1, where: "any", desc: "Per 60 secondi i tuoi strumenti vanno una volta e mezza più veloci." },
  { code: "plague", name: "Agenda di The Plague", rarity: 1, where: "op", desc: "Le quattro password più usate: amore, sesso, segreto e… Restringe subito la rosa a due candidati, se è una parola comune." },
  { code: "relaykeys", name: "Mazzo del centralinista", rarity: 1, where: "op", desc: "Le chiavi admin di tutti i relay del rimbalzo in corso." },
  { code: "dice", name: "Dado truccato di Deckard", rarity: 1, where: "any", desc: "Il prossimo contratto che consegni lascia sicuramente un bottino." },
  { code: "zmon", name: "0-day Monitor", rarity: 2, where: "op", desc: "Acceca il monitor come un Monitor Bypass v3, all'istante." },
  { code: "decoder", name: "Scatola nera di Setec", rarity: 2, where: "op", desc: "Niente più segreti: decifra all'istante tutti i file del nodo." },
  { code: "rewind", name: "Nastro riavvolto", rarity: 2, where: "op", desc: "Il trace torna indietro del 35%." },
  { code: "bribe", name: "Bustarella al distretto", rarity: 2, where: "any", desc: "Calore −60. Qualcuno ha perso il tuo fascicolo per qualche giorno." },
  { code: "fixer", name: "Parola del fixer", rarity: 2, where: "any", desc: "Il prossimo contratto che consegni paga il 50% in più." },
  { code: "coords", name: "Coordinate cifrate", rarity: 3, where: "any", desc: "Un numero che non è su nessun elenco: scopri un nodo nascosto." },
  { code: "icebreaker", name: "Rompighiaccio Kuang", rarity: 3, where: "op", desc: "Proxy, firewall e monitor giù insieme. Lento a caricarsi nei romanzi, istantaneo qui." },
];

/** Gadget: non si consumano. Si usano dall'archivio e poi devono ricaricarsi. */
export type GadgetDef = { code: string; name: string; rarity: number; desc: string; where: "op" | "any"; cooldownMin: number };
export const GADGETS: GadgetDef[] = [
  { code: "walkman", name: "Walkman con la cassetta giusta", rarity: 1, where: "any", cooldownMin: 10, desc: "Abbassa la tensione: calore −8." },
  { code: "pager", name: "Cercapersone Motorola", rarity: 1, where: "any", cooldownMin: 30, desc: "Qualcuno ti passa un indirizzo: 2 nodi nuovi sulla mappa." },
  { code: "bluebox", name: "Blue Box", rarity: 2, where: "any", cooldownMin: 20, desc: "2600 Hz nella cornetta: azzera l'usura dei tuoi relay." },
  { code: "jammer", name: "Disturbatore a onde corte", rarity: 2, where: "op", cooldownMin: 6, desc: "Trace congelato per 8 secondi." },
  { code: "modelm", name: "Tastiera Model M", rarity: 2, where: "any", cooldownMin: 8, desc: "Il rumore giusto: strumenti una volta e mezza più veloci per 30 secondi." },
  { code: "scanner", name: "Scanner di frequenze", rarity: 2, where: "op", cooldownMin: 5, desc: "Ascolta la sala server: ti dice chi presidia il nodo e quanti sensori ci sono." },
  { code: "bootdisk", name: "Dischetto di avvio pulito", rarity: 2, where: "any", cooldownMin: 120, desc: "Protetto da scrittura dal 1989. Riavvii da lì e il deck torna pulito: toglie tutte le infezioni." },
  { code: "sandbox", name: "PC sacrificale", rarity: 2, where: "any", cooldownMin: 30, desc: "Un 286 che non ti dispiace perdere. Ci provi sopra i programmi scaricati: sai con certezza quali sono infetti." },
  { code: "microcassette", name: "Registratore a microcassette", rarity: 2, where: "op", cooldownMin: 90, desc: "«Il mio nome è il mio passaporto.» Davanti a un'impronta vocale, monta la voce che serve da vecchie telefonate." },
  { code: "gummy", name: "Dito di gelatina", rarity: 2, where: "op", cooldownMin: 90, desc: "Gelatina alimentare e un'impronta lasciata su un bicchiere: davanti a un lettore d'impronte hai il campione." },
  { code: "mirrorlens", name: "Lente a specchio stampata", rarity: 3, where: "op", cooldownMin: 120, desc: "Una lente a contatto con la retina di qualcun altro: davanti a uno scanner hai il campione." },
  { code: "glove", name: "Power Glove modificato", rarity: 3, where: "op", cooldownMin: 12, desc: "«È così brutto che…» Il trace torna indietro del 15%." },
  { code: "deckard", name: "Macchina Esper", rarity: 3, where: "op", cooldownMin: 15, desc: "Ingrandisci. Fermo. Rivela per intero la password del nodo… o quasi: metà dei caratteri." },
];
export const gadgetDef = (code: string) => GADGETS.find((g) => g.code === code) ?? null;

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
  xp: "esperienza dei contratti",
  fence: "prezzi del ricettatore",
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
  xp: [4, 7, 11, 16, 25],
  fence: [8, 14, 22, 32, 45],
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
  xp: ["Manuale fotocopiato", "Numero di Phrack", "Rainbow Books", "Costrutto di un vecchio maestro", "ROM del Flatline"],
  fence: ["Bilancino", "Lente da gioielliere", "Contatto a Chiba", "Tavolo al Chatsubo", "Nastro di Max"],
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
  kuang: {
    kind: "chip",
    code: "kuang",
    rarity: 4,
    name: "Kuang Grade Mark Eleven",
    desc: "Rompighiaccio militare cinese. Si finge parte del sistema finché il sistema non è lui.",
    effects: { cpu: 35, trace: -10 },
  },
  flatline: {
    kind: "chip",
    code: "flatline",
    rarity: 4,
    name: "ROM del Flatline",
    desc: "Un costrutto con la risata di un morto. Chiede solo una cosa in cambio: di essere cancellato, alla fine.",
    effects: { xp: 25, luck: 15 },
  },
  setec: {
    kind: "chip",
    code: "setec",
    rarity: 4,
    name: "Scatola di Setec Astronomy",
    desc: "Anagramma di «too many secrets». Era su una segreteria telefonica, dentro un calcolatore tascabile.",
    effects: { modem: 80, payout: 12 },
  },
  laughing: {
    kind: "chip",
    code: "laughing",
    rarity: 4,
    name: "Marchio dell'Uomo che Ride",
    desc: "«Pensai che avrei potuto fingere di essere uno di quei sordomuti.» Nessuna telecamera ricorda la tua faccia.",
    effects: { heat: -40, trace: -12 },
  },
  disc: {
    kind: "chip",
    code: "disc",
    rarity: 4,
    name: "Disco d'identità",
    desc: "Tutto quello che fai o impari resta inciso qui. Se lo perdi, vieni deresoluto.",
    effects: { payout: 20, xp: 20 },
  },
  redpill: {
    kind: "chip",
    code: "redpill",
    rarity: 4,
    name: "Pillola rossa",
    desc: "Resti nel paese delle meraviglie, e vedi quant'è profonda la tana del bianconiglio.",
    effects: { luck: 30, hops: 2 },
  },
  headroom: {
    kind: "chip",
    code: "headroom",
    rarity: 4,
    name: "Nastro di Max",
    desc: "Venti minuti nel futuro. Balbetta, ma vende qualunque cosa a chiunque.",
    effects: { fence: 45, payout: 10 },
  },
  cyberspace7: {
    kind: "chip",
    code: "cyberspace7",
    rarity: 4,
    name: "Ono-Sendai Cyberspace 7",
    desc: "Un'allucinazione consensuale vissuta ogni giorno da miliardi di operatori. Questo è il biglietto di prima classe.",
    effects: { cpu: 20, storage: 40 },
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
  return Math.min(6, 1 + Math.floor(rankIndex / 3));
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
