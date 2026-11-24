// Regole e bilanciamento. Tutti i numeri del gioco vivono qui, condivisi da server e client
// (il client li usa solo per stime e testi; il server è l'unico arbitro).

import type { Faction, HardwareId, MissionType, NodeKind, ToolId } from "./types.ts";

export const START_CREDITS = 3000;
export const HEAT_BURN = 100;
export const MAX_TOOL_VERSION = 3;
export const MAX_HW = 5;

export const RANK_CUTS = [0, 200, 550, 1100, 2000, 3500, 6000, 10000, 16000, 25000, 38000, 56000, 80000, 110000, 150000, 200000, 270000, 360000, 480000, 640000];
const RANK_RED = [
  "Collegamento", "Courier", "Runner", "Operatore", "Intruso", "Spettro", "Architetto", "Maestro", "Élite", "Tecnomante", "Mito",
  "Cowboy della console", "Fantasma nel guscio", "Rompighiaccio", "Signore del Reticolo", "Entità", "Costrutto", "Singolarità", "Deus ex machina", "TERMINALE",
];
const RANK_BLUE = [
  "Collegamento", "Analista", "Sentinella", "Operatore", "Custode", "Warden", "Arbitro", "Maestro", "Élite", "Inquisitore", "Mito",
  "Sceriffo del Reticolo", "Occhio di Turing", "Muro di ghiaccio", "Gran Custode", "Oracolo", "Demiurgo", "Sentinella eterna", "Panopticon", "TERMINALE",
];

/** Livello numerico (1-99): sale in fretta all'inizio, poi sempre più piano. */
export function levelOf(xp: number) {
  return Math.min(99, 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 66)));
}
export const levelXp = (level: number) => (level - 1) ** 2 * 66;

export function rankOf(xp: number, faction: Faction) {
  let index = 0;
  for (let i = 0; i < RANK_CUTS.length; i += 1) if (xp >= RANK_CUTS[i]!) index = i;
  const names = faction === "red" ? RANK_RED : RANK_BLUE;
  return { index, name: names[index] ?? "TERMINALE", next: RANK_CUTS[index + 1] ?? null };
}

export type ToolDef = {
  id: ToolId;
  name: string;
  faction: Faction | "any";
  baseCost: number;
  blurb: string;
  versions: string[]; // descrizione per versione
};

export const TOOLS: ToolDef[] = [
  {
    id: "breaker",
    name: "Password Breaker",
    faction: "any",
    baseCost: 900,
    blurb: "Forza la password admin un carattere alla volta. Rumoroso: ogni carattere costa CPU.",
    versions: ["v1 · lento", "v2 · +35% velocità", "v3 · +70% velocità"],
  },
  {
    id: "dict",
    name: "Dizionario",
    faction: "any",
    baseCost: 700,
    blurb: "Se la password è una parola comune, ti propone una rosa di candidati in pochi secondi.",
    versions: ["v1 · 5 candidati", "v2 · 3 candidati", "v3 · 2 candidati"],
  },
  {
    id: "proxy",
    name: "Proxy Bypass",
    faction: "any",
    baseCost: 1200,
    blurb: "Abbatte il proxy del nodo. Senza, il login è bloccato. La versione deve eguagliare il livello.",
    versions: ["v1 · proxy liv.1", "v2 · proxy liv.2", "v3 · proxy liv.3"],
  },
  {
    id: "firewall",
    name: "Firewall Bypass",
    faction: "any",
    baseCost: 1200,
    blurb: "Apre il firewall. Senza, i file restano intoccabili.",
    versions: ["v1 · firewall liv.1", "v2 · firewall liv.2", "v3 · firewall liv.3"],
  },
  {
    id: "monbypass",
    name: "Monitor Bypass",
    faction: "any",
    baseCost: 1600,
    blurb: "Confonde il monitor: il trace rallenta. Dalla v2 vedi chi presidia i nodi.",
    versions: ["v1 · trace −25%", "v2 · −35% e vedi i warden", "v3 · −45%"],
  },
  {
    id: "decrypt",
    name: "Decrypter",
    faction: "any",
    baseCost: 1500,
    blurb: "Decifra i file sul posto. La versione deve eguagliare la cifratura.",
    versions: ["v1 · cifratura 1", "v2 · cifratura 2", "v3 · cifratura 3"],
  },
  {
    id: "logdel",
    name: "Log Deleter",
    faction: "any",
    baseCost: 1100,
    blurb: "Rimuove righe di log. v1 lascia un buco visibile, v2 cancella pulito, v3 riscrive l'origine.",
    versions: ["v1 · lascia buchi", "v2 · cancellazione pulita", "v3 · falsifica l'IP d'origine"],
  },
  {
    id: "tracker",
    name: "Trace Tracker",
    faction: "any",
    baseCost: 500,
    blurb: "Mostra avanzamento e velocità del trace. Senza, sai solo che qualcuno ti sta cercando.",
    versions: ["v1 · percentuale", "v2 · hop per hop", "v3 · stima del tempo"],
  },
  {
    id: "forensics",
    name: "Forensics",
    faction: "blue",
    baseCost: 1300,
    blurb: "Ricostruisce le righe rimosse con un Log Deleter v1 (e dalla v3 anche v2), entro 30 minuti.",
    versions: ["v1 · recupera buchi", "v2 · più veloce", "v3 · recupera anche le cancellazioni pulite"],
  },
  {
    id: "worm",
    name: "Worm",
    faction: "red",
    baseCost: 2600,
    blurb: "Un parassita che screma spiccioli dal nodo, ogni 45 secondi, per un'ora: la tua botnet. Un blu col Patch Kit lo schiaccia.",
    versions: ["v1 · 4 worm vivi", "v2 · 8 worm, resa +40%", "v3 · 12 worm, resa +70%"],
  },
  {
    id: "bdkit",
    name: "Kit Backdoor",
    faction: "red",
    baseCost: 2000,
    blurb: "Avvelena un relay: chi ci rimbalza viene tracciato più in fretta e tu ricevi il suo IP e una provvigione.",
    versions: ["v1", "v2 · provvigione doppia", "v3 · invisibile ai monitor"],
  },
  {
    id: "honey",
    name: "Kit Honeypot",
    faction: "blue",
    baseCost: 1800,
    blurb: "Trasforma un file in trappola: chi lo copia brucia calore e il suo IP arriva a te.",
    versions: ["v1", "v2 · bounty doppia", "v3 · trappola invisibile al Decrypter"],
  },
  {
    id: "patch",
    name: "Patch Kit",
    faction: "blue",
    baseCost: 1400,
    blurb: "Alza proxy e firewall di un nodo per 30 minuti, oppure bonifica i backdoor di un relay.",
    versions: ["v1 · +1", "v2 · +1 e più rapido", "v3 · +2"],
  },
  {
    id: "wardialer",
    name: "War Dialer",
    faction: "any",
    baseCost: 1800,
    blurb: "Compone numeri a tappeto finché qualcosa risponde con un tono di portante. Scopre i nodi che non sono su nessuna mappa.",
    versions: ["v1 · 25 s a scansione", "v2 · 16 s", "v3 · 10 s, risponde più spesso"],
  },
];

export function toolDef(id: ToolId) {
  return TOOLS.find((t) => t.id === id)!;
}

/** Sovrapprezzo per gli strumenti comprati fuori dal proprio canale (un blu al mercato nero, un rosso dal CERT). */
export const CROSS_CHANNEL = 1.75;

export function toolCost(id: ToolId, version: number, faction?: Faction) {
  // v1 ×1, v2 ×2,5, v3 ×9: l'ultimo gradino è un investimento
  const def = toolDef(id);
  const cross = faction && def.faction !== "any" && def.faction !== faction ? CROSS_CHANNEL : 1;
  return Math.round(def.baseCost * ([1, 1, 2.5, 9][version] ?? 9) * cross);
}

export const HARDWARE: { id: HardwareId; name: string; blurb: string; faction?: Faction }[] = [
  { id: "cpu", name: "CPU", blurb: "Velocità di tutti gli strumenti. I task attivi si dividono la CPU." },
  { id: "modem", name: "Modem", blurb: "Velocità di copia e numero massimo di hop nel rimbalzo." },
  { id: "memory", name: "Memoria", blurb: "Task contemporanei e spazio per i file rubati." },
  { id: "shield", name: "Difese", blurb: "Proxy, firewall, monitor e password del tuo gateway contro chi viene a cercarti." },
  { id: "soc", name: "Console SOC", faction: "blue", blurb: "Più nodi presidiati e più sensori insieme, presidi più lunghi, contro-trace più forte e più frequente." },
];

// ---- sala operativa dei blu: presidi, sensori, analista
export const socPresidia = (lvl: number) => lvl; // nodi presidiati insieme
export const socSensors = (lvl: number) => 1 + lvl; // sensori attivi insieme
export const socPresidioMin = (lvl: number) => 20 + (lvl - 1) * 10;
export const socBoost = (lvl: number) => 1.7 + (lvl - 1) * 0.1; // quanto accelera il trace un contro-trace
export const socCooldown = (lvl: number) => 35 - (lvl - 1) * 4; // secondi fra un contro-trace e l'altro
export const SENSOR_COST = 1200;
export const SENSOR_MINUTES = 45;
export const SENSOR_BONUS = 0.25; // paga in più sulle cacce chiuse dove avevi un sensore
export const ANALYST_COST = 2500;
export const ANALYST_MINUTES = 60;

/** Sicurezza del gateway di un giocatore in funzione del livello delle Difese. */
export function gatewaySec(shield: number) {
  return {
    proxy: Math.min(3, Math.floor((shield + 1) / 2)),
    firewall: Math.min(3, Math.floor(shield / 2) + 1),
    monitor: Math.min(5, shield + 1),
  };
}

/** XP sotto cui un gateway non si può attaccare (protezione per chi comincia). */
export const GATEWAY_PROTECTION_XP = 200;
export const SIPHON_SHARE = 0.15;
export const SIPHON_MAX = 2000;
export const SIPHON_COOLDOWN = 30 * 60_000;
export const OVERLOAD_MS = 10 * 60_000;

/** Scala globale delle ricompense dei contratti generati: la leva principale dell'economia. */
export const REWARD_SCALE = 0.7;

// ---- mercato nero e taglie
export const MARKET_FEE = 0.1; // trattenuta sulle vendite fra giocatori
export const BOUNTY_FEE = 0.05; // commissione (non rimborsabile) per pubblicare una taglia
export const LISTING_HOURS = 3;
export const BOUNTY_MIN = 300;
export const BOUNTY_MAX = 50000;

/** Quanto paga subito il ricettatore NPC per un file: poco, ma sempre. */
export function fencePrice(value: number, size: number) {
  return 120 + value * 110 + size * 15;
}

// ------------------------------------------------------------ la natura dei nodi

/** Come si comporta un nodo secondo quello che è. */
export type KindProfile = {
  trace: "connect" | "action" | "none"; // quando parte il monitor: appena entri, alla prima mossa rumorosa, mai
  night: boolean; // di notte (ora locale) la sorveglianza cala di un livello
  lockout: number; // tentativi di password prima del blocco (0 = nessun blocco)
  sys: string[]; // comandi di sistema oltre allo spegnimento
};

const P = (trace: KindProfile["trace"], night: boolean, lockout: number, sys: string[] = []): KindProfile => ({ trace, night, lockout, sys });

export const KIND_PROFILE: Record<NodeKind, KindProfile> = {
  relay: P("connect", false, 0),
  registry: P("none", false, 0),
  gateway: P("connect", false, 0),
  home: P("none", false, 0),
  shop: P("action", true, 0, ["cash"]),
  edu: P("connect", true, 0),
  news: P("connect", false, 0, ["publish"]),
  gov: P("connect", true, 3),
  med: P("connect", false, 3),
  util: P("connect", false, 0, ["blackout"]),
  telco: P("connect", false, 3, ["tap", "reroute"]),
  corp: P("connect", true, 0),
  lab: P("connect", true, 0),
  market: P("connect", false, 0),
  transit: P("connect", false, 0, ["blackout"]),
  law: P("connect", false, 2, ["warrant"]),
  bank: P("connect", false, 2),
  mil: P("connect", false, 2),
};

export const SYS_INFO: Record<string, { name: string; desc: string; needs: "none" | "handle" | "handleTone" }> = {
  shutdown: { name: "Spegni il sistema", needs: "none", desc: "Il nodo va fuori linea per qualche minuto e butta fuori tutti, te compreso. Lo vedranno tutti, e non te lo perdoneranno." },
  cash: { name: "Svuota la cassa", needs: "none", desc: "Storni e rimborsi sul tuo conto: pochi crediti, poco rischio. Una volta ogni mezz'ora per negozio." },
  publish: { name: "Pubblica un articolo", needs: "handleTone", desc: "Un pezzo in prima pagina su un handle: ne fa salire o crollare la fama." },
  tap: { name: "Intercetta un'utenza", needs: "handle", desc: "Cerca un handle o un cittadino negli elenchi: ottieni l'indirizzo del suo gateway o del suo PC di casa." },
  reroute: { name: "Devia la tua linea", needs: "none", desc: "Per mezz'ora l'ultimo tratto verso il tuo gateway passa da una centrale in più: chi ti risale ci mette il 60% in più." },
  blackout: { name: "Stacca la corrente", needs: "none", desc: "Blackout nella regione per cinque minuti: monitor più lenti e sensori ciechi, per tutti. Finisce sui giornali." },
  warrant: { name: "Emetti un mandato", needs: "handle", desc: "Un capo d'accusa falso a carico di un handle. Sei dentro la polizia: tanto vale usarla." },
};

/** È notte in quel punto della mappa? (ora locale dalla longitudine) */
export function isNight(x: number, atMs: number) {
  const lon = (x / 320) * 360 - 180;
  const h = (((new Date(atMs).getUTCHours() + new Date(atMs).getUTCMinutes() / 60 + lon / 15) % 24) + 24) % 24;
  return h >= 22 || h < 6;
}

// Come cambia la sorveglianza: moltiplicatori del tempo di risalita (più alto = più tempo per te)
export const WATCH_NIGHT = 1.3; // turno di notte negli uffici
export const WATCH_BLACKOUT = 1.5; // blackout nella regione
export const WATCH_ALERT = 0.75; // nodo in allerta dopo un'intrusione

// Colpi senza contratto: quanto si può portare via
export const heistCap = (tier: number) => 1000 + tier * 1000; // tetto dell'antifrode per bonifico, secondo il grado della banca
export const HEIST_COOLDOWN = 10 * 60_000; // dopo un bonifico rubato il tuo conto resta segnalato
export const FENCE_MEMORY = 2 * 3600_000; // il ricettatore non ricompra lo stesso file dallo stesso handle
export const FENCE_REPEAT = 0.1;
export const SHOP_CASH: [number, number] = [100, 400];

export const SCAN_COST = 100;
export const scanSeconds = (v: number) => [20, 20, 13, 8][v] ?? 20;
export const scanFinds = (v: number) => [2, 2, 3, 5][v] ?? 2; // nodi nuovi per scansione
export const SHUTDOWN_MINUTES = 8;
export const ALERT_MINUTES = 20;
export const REROUTE_FACTOR = 1.6;

// ---- War Dialer e bonifici
export const WARDIAL_COST = 100; // la bolletta di ogni scansione
export const wardialSeconds = (v: number) => [25, 25, 16, 10][v] ?? 25;
export const wardialChance = (v: number) => [0, 0.5, 0.6, 0.8][v] ?? 0.5;
export const TRANSFER_MAX_SHARE = 0.25; // quota massima di un conto spostabile in un colpo
export const CARGO_MINUTES = 12;

export function hwCost(level: number) {
  // costo per passare dal livello indicato al successivo
  return [0, 1500, 4500, 12000, 26000][level] ?? 26000;
}

export const cpuPower = (cpu: number) => 1 + (cpu - 1) * 0.4;
export const modemSpeed = (modem: number) => 2 + (modem - 1) * 1.5; // GQ al secondo
export const maxHops = (modem: number) => 2 + modem;
export const maxTasks = (memory: number) => 1 + memory;
export const storageCap = (memory: number) => memory * 10;
const versionSpeed = (v: number) => 1 + (v - 1) * 0.3;

// Lavoro (in secondi a CPU 1, strumento v1) per ogni azione.
export function toolWork(tool: ToolId | "copy" | "delete", opts: { level?: number; size?: number; chars?: number; lines?: number; version?: number }) {
  const v = versionSpeed(opts.version ?? 1);
  switch (tool) {
    case "proxy":
    case "firewall":
      return (1 + 4 * (opts.level ?? 1)) / v;
    case "monbypass":
      return 6 / v;
    case "breaker":
      return ((opts.chars ?? 6) * 1.2 * (1 + (opts.level ?? 1) * 0.3 + (opts.level ?? 1) ** 2 * 0.04)) / v;
    case "dict":
      return 3;
    case "decrypt":
      return ((opts.size ?? 4) * 0.9 * (opts.level ?? 1)) / v;
    case "logdel":
      return (0.6 * (opts.lines ?? 1)) / v;
    case "forensics":
      return 8 / v;
    case "bdkit":
      return 9;
    case "worm":
      return 11 / v;
    case "honey":
      return 6;
    case "patch":
      return 10 / v;
    case "delete":
      return 1.5;
    case "copy":
      return opts.size ?? 4; // diviso per modemSpeed lato server
    default:
      return 5;
  }
}

// Trace: millisecondi necessari al monitor per risalire un hop.
export function hopTraceMs(monitor: number) {
  if (monitor <= 0) return 0;
  return [0, 10500, 8200, 6400, 4000, 2900][Math.min(5, monitor)]!;
}

export const POISON_HOP_FACTOR = 0.35;
export const TRACE_PENALTY_MS = 2500;

export function monitorBypassFactor(version: number) {
  return [1, 0.75, 0.65, 0.55][version] ?? 1;
}

export function heatTraceFactor(heat: number) {
  return heat >= 75 ? 1.35 : heat >= 50 ? 1.15 : 1;
}

export const KIND_LABEL: Record<NodeKind, string> = {
  relay: "Relay pubblico",
  registry: "Registro",
  edu: "Università",
  law: "Forze dell'ordine",
  gov: "Archivio civico",
  bank: "Banca",
  corp: "Corporazione",
  lab: "Laboratorio",
  news: "Testata",
  market: "Mercato",
  transit: "Infrastruttura",
  mil: "Rete militare",
  shop: "Attività commerciale",
  med: "Sanità",
  util: "Servizi pubblici",
  telco: "Telefonia",
  home: "PC privato",
  gateway: "Gateway privato",
};

export const MISSION_LABEL: Record<MissionType, string> = {
  copy: "Estrazione",
  wipe: "Cancellazione",
  alter: "Alterazione",
  backdoor: "Backdoor",
  frame: "Incastrare",
  hunt: "Caccia",
  patch: "Rinforzo",
  seal: "Bonifica",
  honeypot: "Honeypot",
  raid: "Assalto",
  locate: "Localizzazione",
  profile: "Profilo",
  transfer: "Bonifico",
  purge: "Distruzione",
  courier: "Trasporto",
  restore: "Ripristino",
  recover: "Recupero",
  reverse: "Storno",
  findata: "Dati finanziari",
  tracemoney: "Segui il denaro",
  arrest: "Arresto",
  sabotage: "Sabotaggio",
  restart: "Riavvio",
  chain: "Operazione",
  spree: "Raffica",
  stunt: "Colpo di scena",
  audit: "Ispezione",
};

// ------------------------------------------------------------ planisfero e rimbalzo

export const MAP_W = 320;
export const MAP_H = 180;
const LAT_TOP = 80;
const LAT_BOT = -58;

/** Longitudine e latitudine → pixel del planisfero 320×180. */
export function project(lon: number, lat: number) {
  return { x: Math.round(((lon + 180) / 360) * MAP_W), y: Math.round(((LAT_TOP - lat) / (LAT_TOP - LAT_BOT)) * MAP_H) };
}

export type Region = "na" | "sa" | "eu" | "af" | "as" | "oc";
export const REGION_NAME: Record<Region, string> = {
  na: "Nord America",
  sa: "Sud America",
  eu: "Europa",
  af: "Africa",
  as: "Asia",
  oc: "Oceania",
};

/** In quale giurisdizione cade un punto della mappa. */
export function regionAt(x: number, y: number): Region {
  const lon = (x / MAP_W) * 360 - 180;
  const lat = LAT_TOP - (y / MAP_H) * (LAT_TOP - LAT_BOT);
  if (lon < -30) return lat > 12 ? "na" : "sa";
  if (lon >= 110 && lat < -10) return "oc";
  if (lon < 45 && lat > 36) return "eu";
  if ((lon < 35 && lat <= 36) || (lon < 52 && lat < 12)) return "af";
  return "as";
}

export type RelayClass = "public" | "carrier" | "grey" | "offshore" | "sat";

/** Tipi di relay: quanto rallentano chi ti risale, quanto costano, per quanto conservano i log. */
export const RELAY_CLASS: Record<RelayClass, { name: string; hop: number; fee: number; logMin: number; blurb: string }> = {
  public: { name: "Pubblico", hop: 1, fee: 0, logMin: 25, blurb: "Gratis e nella media. I log ruotano ogni 25 minuti." },
  carrier: { name: "Carrier commerciale", hop: 0.75, fee: 0, logMin: 45, blurb: "Collabora con chi indaga: si risale in fretta e i log durano 45 minuti." },
  grey: { name: "Rete grigia", hop: 1.25, fee: 60, logMin: 10, blurb: "Non fa domande e dimentica presto: log per 10 minuti. Si paga a passaggio." },
  offshore: { name: "Offshore", hop: 1.5, fee: 200, logMin: 5, blurb: "Paradiso dei dati: le rogatorie si perdono, i log durano 5 minuti. Caro." },
  sat: { name: "Satellitare", hop: 1.8, fee: 350, logMin: 15, blurb: "Un ponte in orbita: il più lento da risalire, il più caro da usare." },
};

export const BORDER_BONUS = 1.35; // ogni confine attraversato è una rogatoria internazionale
export const KEY_BONUS = 1.4; // hai le chiavi admin del relay: instradi in profondità
export const WEAR_STEP = 0.12; // ogni uso recente dello stesso relay insegna qualcosa ai monitor
export const WEAR_FLOOR = 0.5;
export const WEAR_WINDOW = 10 * 60_000;

export type HopInput = { cls: RelayClass; x: number; y: number; hasKey: boolean; recentUses: number; poisoned: boolean };

/** Moltiplicatore del tempo di risalita di un relay, dato l'hop che lo precede nel rimbalzo. */
export function hopFactor(hop: HopInput, prev: { x: number; y: number }) {
  let f = RELAY_CLASS[hop.cls].hop;
  if (regionAt(hop.x, hop.y) !== regionAt(prev.x, prev.y)) f *= BORDER_BONUS;
  if (hop.hasKey) f *= KEY_BONUS;
  f *= Math.max(WEAR_FLOOR, 1 - hop.recentUses * WEAR_STEP);
  // le tratte lunghe costano tempo anche a chi ti cerca
  f *= 0.85 + Math.min(1, Math.hypot(hop.x - prev.x, hop.y - prev.y) / 160) * 0.4;
  if (hop.poisoned) f *= POISON_HOP_FACTOR;
  return f;
}

/**
 * Tempi di risalita di un rimbalzo, dal bersaglio verso il gateway (stessa funzione su server e client).
 * `relays` è nell'ordine di percorrenza: il primo è quello a cui si collega il gateway.
 */
export function routeTrace(monitor: number, gateway: { x: number; y: number }, relays: HopInput[]) {
  const base = hopTraceMs(monitor);
  const factors = relays.map((r, i) => hopFactor(r, i === 0 ? gateway : relays[i - 1]!));
  const hopTimes = [...factors].reverse().map((f) => Math.round(base * f));
  hopTimes.push(base); // l'ultimo tratto: dal primo relay (o dal bersaglio) al tuo gateway
  return { hopTimes, factors, total: hopTimes.reduce((s, v) => s + v, 0), fee: relays.reduce((s, r) => s + RELAY_CLASS[r.cls].fee, 0) };
}

/** Le città da cui chiamano i gateway: ogni handle ne riceve una dal proprio indirizzo. */
export const GATEWAY_CITIES: [string, number, number][] = [
  ["Los Angeles", -118.2, 34], ["Chicago", -87.6, 41.9], ["Città del Messico", -99.1, 19.4], ["Miami", -80.2, 25.8], ["Vancouver", -123.1, 49.3],
  ["Bogotá", -74.1, 4.7], ["Lima", -77, -12], ["Buenos Aires", -58.4, -34.6], ["Santiago", -70.7, -33.4],
  ["Madrid", -3.7, 40.4], ["Roma", 12.5, 41.9], ["Amsterdam", 4.9, 52.4], ["Varsavia", 21, 52.2], ["Stoccolma", 18, 59.3], ["Atene", 23.7, 38],
  ["Il Cairo", 31.2, 30], ["Nairobi", 36.8, -1.3], ["Dakar", -17.4, 14.7], ["Kinshasa", 15.3, -4.3],
  ["Teheran", 51.4, 35.7], ["Delhi", 77.2, 28.6], ["Bangkok", 100.5, 13.8], ["Shanghai", 121.5, 31.2], ["Manila", 121, 14.6], ["Giacarta", 106.8, -6.2],
  ["Melbourne", 145, -37.8], ["Perth", 115.9, -32], ["Auckland", 174.8, -36.9],
];

/** Posizione sulla mappa del gateway del giocatore, ricavata dal suo IP. */
export function gatewayPos(ip: string) {
  let h = 0;
  for (const ch of ip) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [city, lon, lat] = GATEWAY_CITIES[h % GATEWAY_CITIES.length]!;
  return { ...project(lon, lat), city };
}

export function fmtCr(n: number) {
  return `${Math.round(n).toLocaleString("it-IT")} CR`;
}

export function latticeClock(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `2039.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function clockShort(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ------------------------------------------------------------ botnet
export const WORM_CAP = [4, 8, 12];
export const WORM_LIFE_MIN = 60;
/** Crediti che un worm rende a ogni battito (45 s), per grado del nodo e versione. */
export const wormYield = (tier: number, version: number) => Math.round((3 + tier * 2) * [1, 1.4, 1.7][Math.min(2, version - 1)]!);
