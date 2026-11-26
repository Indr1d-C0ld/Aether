// Tipi condivisi tra server autoritativo e client.
// Il client riceve solo "viste": nessun segreto (password, autore reale dei log) esce dal server.

import type { Charge, Item, MissionMod } from "./depth.ts";
import type { Region, RelayClass } from "./rules.ts";
export type { Charge, Item, MissionMod };

export type Faction = "red" | "blue";

export type ToolId =
  | "breaker" // Password Breaker: forza il login admin
  | "dict" // Dizionario: istantaneo se la password è una parola nota
  | "proxy" // Proxy Bypass: serve per tentare il login
  | "firewall" // Firewall Bypass: serve per toccare i file
  | "monbypass" // Monitor Bypass: rallenta il trace attivo
  | "decrypt" // Decrypter: rende leggibili/copiabili i file cifrati
  | "logdel" // Log Deleter (v1 lascia un buco, v2 pulito, v3 falsifica l'origine)
  | "tracker" // Trace Tracker: mostra l'avanzamento del trace
  | "forensics" // Forensics (blu): recupera le righe cancellate male
  | "bdkit" // Kit Backdoor (rosso): avvelena un relay
  | "honey" // Kit Honeypot (blu): trasforma un file in trappola
  | "patch" // Patch Kit (blu): rinforza un nodo, bonifica i backdoor
  | "wardialer" // War Dialer: compone numeri a tappeto e scopre nodi nascosti
  | "worm"; // Worm (rosso): un parassita che rende spiccioli finché un blu non lo schiaccia

export type HardwareId = "cpu" | "modem" | "memory" | "shield" | "soc";

export type NodeKind =
  | "relay"
  | "registry"
  | "edu"
  | "law"
  | "gov"
  | "bank"
  | "corp"
  | "lab"
  | "news"
  | "market"
  | "transit"
  | "mil"
  | "shop" // attività commerciali: negozi, hotel, casinò
  | "med" // ospedali e cliniche
  | "util" // reti elettriche, acquedotti, traffico, porti
  | "telco" // compagnie telefoniche
  | "home" // il PC di casa di un cittadino
  | "gateway";

export type MissionType =
  | "copy"
  | "wipe"
  | "alter"
  | "backdoor"
  | "frame"
  | "hunt"
  | "patch"
  | "seal"
  | "honeypot"
  | "raid" // taglia: colpisci il gateway di un handle
  | "locate" // taglia: scopri l'indirizzo di un handle
  | "profile" // rintraccia una persona da pochi indizi, consegna il suo ID Reticolo
  | "transfer" // sposta denaro fra due conti bancari
  | "purge" // distruggi tutto l'archivio di un nodo
  | "courier" // trasporta un carico da un nodo a un altro prima che si corrompa
  | "restore" // blu: riporta un record manomesso al valore originale
  | "recover" // blu: ripristina un file cancellato dal backup
  | "reverse" // blu: storna un bonifico fraudolento
  | "findata" // trova i dettagli finanziari di una persona (il numero di conto)
  | "tracemoney" // segui un bonifico e scopri chi ha incassato
  | "arrest" // fai finire qualcuno nei guai con la giustizia
  | "sabotage" // spegni un sistema
  | "restart" // blu: rimetti in linea un sistema spento
  | "chain" // operazione in più tappe su nodi precisi
  | "spree" // raffica: tanti sistemi diversi prima della scadenza
  | "stunt" // colpo di scena: una cosa sola, fatta in un modo preciso
  | "audit"; // blu: giro d'ispezione su più sedi

export type AgentView = {
  id: string;
  handle: string;
  faction: Faction;
  credits: number;
  xp: number;
  heat: number;
  rank: string;
  rankIndex: number;
  level: number; // livello numerico 1-99
  crew: string | null; // sigla della crew
  cooldowns: Record<string, number>; // gadget: quando tornano pronti
  buffs: Record<string, number>; // effetti attivi (scadenza) o in attesa (contatore)
  nextXp: number | null;
  gatewayIp: string;
  hw: Record<HardwareId, number>;
  tools: Partial<Record<ToolId, number>>; // versione posseduta
  storage: StoredFile[];
  storageCap: number;
  presiding: { nodeId: string; until: number }[]; // nodi presidiati (blu): quanti dipende dalla Console SOC
  sensors: SensorView[]; // sensori installati, con la copia dei log che hanno raccolto
  analystUntil: number; // analista di turno: presidia e contro-traccia anche quando sei scollegato
  stats: { ops: number; clean: number; caught: number; attributions: number; sabotage: number };
  known: KnownAddress[]; // indirizzi di gateway che conosci
  gatewayLogs: LogView[]; // il log del tuo gateway: chi è entrato e da dove
  gatewaySec: { proxy: number; firewall: number; monitor: number };
  overloadUntil: number; // CPU sabotata fino a…
  protectedUntilXp: number; // sotto questa XP il tuo gateway non è attaccabile
  chips: Item[]; // chip montati
  chipSlots: number;
  fame: number;
  fameTitle: string;
  fameNext: number | null;
  ethics: number;
  ethicsTitle: string;
  charges: Charge[];
  warrant: number; // 0-3
  arrests: number;
  jailUntil: number;
  bail: number;
  investigations: { org: string; at: number; sweepAt: number; grave: boolean }[];
  feats: string[];
  counters: Record<string, number>; // contatori personali: statistiche e traguardi
  admin: boolean; // è l'account dell'amministratore
  createdAt: number;
  account: string; // il tuo conto, per i bonifici
  pending: { amount: number; clearAt: number; from: string }[]; // bonifici rubati non ancora accreditati
  scanUntil: number; // War Dialer in corso
  samples: import("./bio.ts").SampleView[]; // campioni biometrici rubati e ancora buoni
  tone: import("./tones.ts").ToneView | null; // i toni della Blue Box, se la linea è aperta
  hiddenFound: number;
  hiddenTotal: number;
  maxHops: number; // modem + chip
  home: { x: number; y: number; city: string; region: Region }; // da dove chiama il tuo gateway
  knownNodes: number; // nodi che hai sulla mappa
  worldNodes: number; // nodi che esistono
  heistReadyAt: number; // il tuo conto è segnalato fino a…: niente bonifici rubati in arrivo
  rerouteUntil: number; // linea deviata: l'ultimo tratto verso il tuo gateway è più lungo da risalire
};

export type SensorView = { nodeId: string; name: string; until: number; lines: { at: number; text: string }[] };

export type KnownAddress = { ip: string; handle: string | null; note: string; at: number };

export type StoredFile = {
  key: string;
  name: string;
  nodeId: string;
  fileId: string;
  size: number;
  at: number;
  fence?: number;
  rarity?: number;
  item?: Item; // exploit o chip: bottino usabile
  expiresAt?: number; // carico che si corrompe
  cargo?: string; // contratto di trasporto a cui appartiene
  value?: number; // valore proprio (allegati e libri mastri: non esistono come file del nodo)
  fresh?: number; // exploit tecnici: quanto sono ancora freschi (1 = nessuno li conosce)
};

export type NodeView = {
  id: string;
  name: string;
  org: string;
  kind: NodeKind;
  ip: string;
  x: number;
  y: number;
  blurb: string;
  public: boolean; // relay e registro: accesso guest senza password
  sec: { proxy: number; firewall: number; monitor: number };
  bio: import("./bio.ts").BioKind | null; // barriera biometrica sull'accesso admin
  patched: boolean;
  backdoors: number | null; // null = non visibile a te
  mineBackdoor: boolean;
  myWorm: boolean; // hai un worm su questo nodo
  worms: number; // worm altrui visibili (ai blu, da dentro)
  wardens: string[]; // handle blu che presidiano (visibile ai blu e a chi ha monitor bypass v2+)
  activity: number; // 0..1: quanto traffico recente (glow sulla mappa)
  catalog: { id: string; name: string }[]; // file noti sul nodo (per le taglie)
  hidden: boolean; // nodo nascosto, scoperto col War Dialer
  region: Region;
  cls: RelayClass | null; // tipo di relay
  myKey: boolean; // hai le chiavi admin di questo relay
  myWear: number; // quante volte l'hai usato di recente
  mySensor: boolean; // hai un sensore qui
  sensors: number | null; // sensori altrui che riesci a vedere (null = non lo sai)
  sub: string; // che cos'è, in due parole (es. «banco dei pegni»)
  city: string;
  night: boolean; // è notte, lì: negli uffici c'è meno sorveglianza
  alert: boolean; // in allerta dopo un'intrusione
  offline: boolean; // spento
  landmark: boolean; // nodo noto a tutti fin dall'inizio
  watch: number; // moltiplicatore del tempo di risalita in questo momento (notte, blackout, allerta)
  blackout: boolean;
} & import("./scars.ts").NodeMarks;

export type MissionView = {
  id: string;
  faction: Faction;
  type: MissionType;
  title: string;
  brief: string;
  nodeId: string;
  reward: number;
  xp: number;
  minXp: number;
  requires: ToolId[];
  status: "open" | "taken" | "done" | "failed" | "expired";
  mine: boolean;
  expiresAt: number;
  needsAnswer: boolean; // caccia: va consegnato un IP
  clientAccess: boolean; // contratto blu: credenziali cliente sul nodo
  clientNodes: string[]; // tutti i nodi su cui il contratto dà credenziali
  postedBy: string | null; // handle di chi ha messo la taglia
  postedByMe: boolean;
  where: string; // dove si svolge (senza rivelare gli IP dei gateway)
  tier: number; // grado 0-4: paga, rischio e probabilità di bottino
  mods: MissionMod[];
  answerHint: string | null; // cosa va consegnato, se serve una risposta
  objectives: { label: string; n: number; have: number }[]; // operazioni a tappe
  limitMin: number | null; // tempo massimo dall'accettazione (finché è in bacheca)
};

export type ListingView = {
  id: string;
  seller: string;
  mine: boolean;
  name: string;
  origin: string; // organizzazione da cui è stato sottratto
  size: number;
  price: number;
  expiresAt: number;
  wanted: number; // contratti aperti che chiedono proprio questo file
};

export type MailView = { id: string; from: string; subject: string; body: string; at: number; unread: boolean };

export type FeedItem = { id: string; at: number; text: string; tone: "red" | "blue" | "sys" };

export type BoardRow = {
  handle: string;
  faction: Faction;
  xp: number;
  credits: number;
  heat: number;
  rank: string;
  level: number;
  crew: string | null;
  ghostScore: number;
  defense: number;
  sabotage: number;
  npc: boolean;
  you: boolean;
  online: boolean;
  fame: number;
  fameTitle: string;
  warrant: number;
  feats: number;
};

export type FileView = {
  id: string;
  name: string;
  size: number;
  encryption: number;
  decrypted: boolean;
  honeypot: boolean | null; // null = non lo sai
  preview: string | null;
  rarity: number;
  loot: boolean; // contiene un oggetto (exploit o chip)
  deleted: boolean; // visibile ai blu: si può ripristinare dal backup
};

export type RecordView = {
  id: string;
  name: string;
  photo: string | null; // id della foto tessera
  sub: string; // riga di contesto sotto il nome
  fields: { key: string; label: string; value: string; options: string[] }[];
  account: { number: string; balance: number; cap: number } | null; // record bancario; cap = massimo per bonifico
  alias: { charges: string[]; warrant: number } | null; // fascicolo di un handle nel casellario
};

export type LedgerView = { id: string; at: number; from: string; to: string; amount: number; reversed: boolean };

export type LogView = { id: string; at: number; text: string; gap: boolean; recovered: boolean };

export type TaskView = {
  id: string;
  tool: ToolId | "copy" | "delete" | "upload";
  label: string;
  progress: number; // 0..1 al momento serverNow
  rate: number; // frazione al secondo (per interpolare lato client)
  state: "run" | "done" | "fail";
  note: string | null;
};

export type OpView = {
  id: string;
  chain: string[]; // id nodi, l'ultimo è il bersaglio
  targetId: string;
  connectedAt: number;
  access: "none" | "guest" | "admin" | "client";
  bypass: { proxy: boolean; firewall: boolean; monitor: boolean };
  trace: {
    active: boolean;
    known: boolean; // false se non hai il Trace Tracker
    progressMs: number | null;
    totalMs: number | null;
    rate: number | null; // ms di trace per ms reale
    hopTimes: number[] | null; // dal bersaglio verso il gateway
  };
  cracked: string | null; // password parzialmente rivelata dal breaker ("K?L?" ecc.)
  dictOptions: string[] | null;
  tasks: TaskView[];
  files: FileView[] | null;
  logs: LogView[] | null;
  records: { count: number; kind: "people" | "accounts" } | null; // l'archivio si interroga con searchRecords
  ledger: LedgerView[] | null; // movimenti recenti (banche)
  frozenUntil: number; // trace congelato da un exploit
  sensors: number; // sensori sul bersaglio, visibili da admin
  sys: SysCommand[]; // comandi di sistema disponibili su questo nodo
  banner: string | null; // quello che il nodo dice di sé a chi si collega
  lockedUntil: number; // login bloccato dopo troppi tentativi
  wardens: string[];
  poisoned: string[]; // relay avvelenati che hai attraversato (scoperti al rimbalzo)
  target: NodeView; // il bersaglio (anche un gateway, che non compare sulla mappa)
  looted: boolean; // conti già prosciugati in questa sessione
  clearance: number; // 0 nessuno · 1 impiegato · 2 operatore · 3 admin o cliente
  zones: import("./zones.ts").ZoneView[]; // i sottosistemi di questo nodo
  grid: import("./grid.ts").GridView | null; // la griglia del firewall, se aperta
  bio: import("./bio.ts").BioView | null; // la barriera biometrica del bersaglio, se c'è
  infections: import("./malware.ts").NodeInfection[];
  /** connesso da admin al gateway di chi ha un BBS: puoi sfregiarne l'insegna */
  bbsDeface?: { name: string; owner: string } | null;
  /** un imprevisto in corso (server/surprises.ts) */
  surprise?: import("./surprises.ts").SurpriseView | null;
  rotor: import("./rotors.ts").RotorView | null; // i rotori del Decrypter, se c'è una chiave sul banco
};

export type SysCommand = { id: string; name: string; desc: string; needs: "none" | "handle" | "handleTone"; blocked: string | null };

export type LiveIntrusion = { opId: string; nodeId: string; since: number; boosted: boolean; own: boolean };

export type GameState = {
  me: AgentView;
  nodes: NodeView[];
  missions: MissionView[];
  mail: MailView[];
  feed: FeedItem[];
  board: BoardRow[];
  op: OpView | null;
  intrusions: LiveIntrusion[];
  market: ListingView[];
  war: { red: number; blue: number };
  serverNow: number;
  notice: { text: string; tone: "info" | "warn" | "bad" } | null; // avviso dell'amministrazione
  crews: CrewView[];
  duels: DuelView[];
  trades: TradeView[];
};

export type CrewView = {
  tag: string;
  name: string;
  faction: Faction;
  motto: string;
  leader: string;
  members: { handle: string; rank: string; level: number; online: boolean }[];
  score: number;
  bank: number;
  mine: boolean;
  lead: boolean;
  invited: boolean;
};
export type DuelView = { id: string; foe: string; stake: number; state: "offered" | "live"; incoming: boolean; node: string | null; nodeId: string | null; expiresAt: number };
export type TradeView = { id: string; with: string; incoming: boolean; name: string; rarity: number; price: number; expiresAt: number };

// ---- rete IRC ----
export type IrcLine = { id: number; at: number; chan: string; nick: string; kind: "msg" | "act" | "join" | "part" | "quit" | "topic" | "mode" | "notice" | "sys" | "kick"; text: string };
export type IrcUser = { nick: string; mode: "" | "+" | "@" | "~"; away: boolean; bot: boolean };
export type IrcChan = { name: string; topic: string; users: IrcUser[]; modes: string };
export type IrcEvent =
  | { e: "line"; line: IrcLine }
  | { e: "chan"; chan: IrcChan }
  | { e: "gone"; chan: string }
  | { e: "sync"; server: string; nick: string; host: string; motd: string[]; chans: IrcChan[]; backlog: IrcLine[] };

// ---- Protocollo WebSocket ----

export type ClientMsg =
  | { t: "hello"; token: string }
  | { t: "auth"; mode: "login" | "register"; handle: string; pass: string; faction?: Faction }
  | { t: "do"; id: number; a: string; p?: Record<string, unknown> };

export type ServerMsg =
  | { t: "auth_ok"; token: string }
  | { t: "auth_err"; error: string }
  // `nodes` arriva a intervalli: quando è null il client tiene l'elenco che ha già
  | { t: "state"; s: Omit<GameState, "nodes"> & { nodes: NodeView[] | null } }
  | { t: "res"; id: number; ok: boolean; error?: string; note?: string; data?: unknown }
  | { t: "toast"; text: string; tone: "ok" | "warn" | "bad" | "info" }
  | { t: "irc"; ev: IrcEvent };
