// Simulazione autoritativa del mondo AETHER.
// Il mondo vive in memoria, viene salvato su SQLite a intervalli; le operazioni live (connessioni,
// trace, task degli strumenti) avanzano in un tick a 4 Hz.

import { randomBytes } from "node:crypto";
import { TIER_FAME as ACH_FAME, TIER_NAME as ACH_TIER, achId, trackValue, tracksFor } from "../shared/achievements.ts";
import { DEFAULT_SETTINGS, type AuditRow, type IpBan, type Settings } from "../shared/admin.ts";
import type { Store } from "./db.ts";
import { TONE_BONUS_FINDS, TONE_FAIL_COST, TONE_KEYS, TONE_ROUNDS, TONE_WINDOW_MS, type ToneView } from "../shared/tones.ts";
import { ROTOR_CLEAN, ROTOR_FAIL_TRACE, ROTOR_FREEZE_MS, ROTOR_SYMBOLS, rotorScore, rotorSpec, type RotorView } from "../shared/rotors.ts";
import { GRID_CLEAN, GRID_FAIL_TRACE, gridClue, gridSpec, type GridView } from "../shared/grid.ts";
import { rollScene, type Objective, type SNode } from "./scenarios.ts";
import { JOB_CONDS, JOB_GOALS, jobMin, type JobCond } from "../shared/jobs.ts";
import { localHour, localWeekday } from "../shared/clock.ts";
import { specLevel, type SpecId } from "../shared/progress.ts";
import { WORLD, WORLD_CITIES } from "./worldgen.ts";
import { CITIES, CIVIL, CLEARANCES, CRIMES, DEGREES, GRADES, PEOPLE, STATUSES, personById, type Person } from "./people.ts";
import {
  CHIP_NAMES,
  CHIP_POWER,
  EXPLOITS,
  FEATS,
  ITEM_FENCE,
  LEGENDARY,
  MOD_INFO,
  TIER_FAME,
  TIER_LOOT,
  WARRANT,
  WARRANT_TRACE,
  bailCost,
  chipSlots,
  dataRarity,
  ethicsTitle,
  exploitDef,
  gadgetDef,
  GADGETS,
  fameTier,
  featDef,
  jailSeconds,
  warrantLevel,
  type Charge,
  type ChipEffect,
  type Item,
  type MissionMod,
} from "../shared/depth.ts";
import { CLIENTS_BLUE, CLIENTS_RED, DICTIONARY, GHOSTS, SEED_NODES, type SeedFile, type SeedNode, type SeedRecord } from "./content.ts";
import {
  HEAT_BURN,
  MAX_HW,
  MAX_TOOL_VERSION,
  POISON_HOP_FACTOR,
  START_CREDITS,
  TRACE_PENALTY_MS,
  cpuPower,
  fmtCr,
  heatTraceFactor,
  hopTraceMs,
  hwCost,
  maxHops,
  maxTasks,
  modemSpeed,
  monitorBypassFactor,
  rankOf,
  levelOf,
  storageCap,
  toolCost,
  toolDef,
  toolWork,
  MISSION_LABEL,
  CARGO_MINUTES,
  ALERT_MINUTES,
  FENCE_MEMORY,
  FENCE_REPEAT,
  HEIST_COOLDOWN,
  SHOP_CASH,
  WATCH_ALERT,
  WATCH_BLACKOUT,
  WATCH_NIGHT,
  heistCap,
  KIND_LABEL,
  KIND_PROFILE,
  REGION_NAME,
  REROUTE_FACTOR,
  SCAN_COST,
  SHUTDOWN_MINUTES,
  SYS_INFO,
  isNight,
  scanFinds,
  scanSeconds,
  type Region,
  ANALYST_COST,
  ANALYST_MINUTES,
  SENSOR_BONUS,
  SENSOR_COST,
  SENSOR_MINUTES,
  socBoost,
  socCooldown,
  socPresidia,
  socPresidioMin,
  socSensors,
  REWARD_SCALE,
  WORM_CAP,
  WORM_LIFE_MIN,
  wormYield,
  RELAY_CLASS,
  WEAR_WINDOW,
  regionAt,
  routeTrace,
  type HopInput,
  TRANSFER_MAX_SHARE,
  WARDIAL_COST,
  wardialChance,
  wardialSeconds,
  GATEWAY_PROTECTION_XP,
  OVERLOAD_MS,
  SIPHON_COOLDOWN,
  SIPHON_MAX,
  SIPHON_SHARE,
  BOUNTY_FEE,
  BOUNTY_MAX,
  BOUNTY_MIN,
  LISTING_HOURS,
  MARKET_FEE,
  fencePrice,
  gatewayPos,
  gatewaySec,
} from "../shared/rules.ts";
import type {
  AgentView,
  BoardRow,
  Faction,
  FeedItem,
  FileView,
  GameState,
  HardwareId,
  KnownAddress,
  LedgerView,
  ListingView,
  SysCommand,
  LiveIntrusion,
  LogView,
  MailView,
  MissionType,
  MissionView,
  NodeView,
  OpView,
  RecordView,
  StoredFile,
  TaskView,
  ToolId,
} from "../shared/types.ts";

// ---------------------------------------------------------------- modello

type Mail = { id: string; from: string; subject: string; body: string; at: number; unread: boolean };

type Agent = {
  id: string;
  handle: string;
  faction: Faction;
  npc: boolean;
  skill: number;
  credits: number;
  xp: number;
  heat: number;
  gatewayIp: string;
  hw: Record<HardwareId, number>;
  tools: Partial<Record<ToolId, number>>;
  storage: StoredFile[];
  presiding: { nodeId: string; until: number }[];
  stats: { ops: number; clean: number; caught: number; attributions: number; sabotage: number; defense: number };
  mail: Mail[];
  counterReadyAt: number;
  createdAt: number;
  known: KnownAddress[];
  overloadUntil: number;
  lastSiphonAt: number;
  raids?: { targetId: string; at: number }[];
  // --- profondità
  chips: Item[];
  fame: number;
  ethics: number;
  charges: Charge[];
  arrests: number;
  jailUntil: number;
  feats: string[];
  counters: Record<string, number>;
  account: string;
  pending: { amount: number; clearAt: number; from: string; opId: string; bankId: string; ledgerId: string }[];
  scanUntil: number;
  discovered: string[]; // nodi nascosti scoperti
  claimed: string[]; // cache leggendarie già svuotate
  adminNodes: string[]; // nodi su cui ha avuto l'accesso admin
  relayKeys: string[]; // relay di cui ha ancora le chiavi admin
  relayUse: Record<string, number[]>; // quando ha usato ciascun relay (usura)
  analystUntil: number;
  knownNodes: string[]; // i nodi che ha sulla mappa
  scanRegion: Region | null;
  rerouteUntil: number;
  grudges: Record<string, number>; // quante volte ha colpito ciascuna organizzazione
  fenced: Record<string, number>; // file già venduti al ricettatore (nodo:file → quando)
  heistAt: number; // ultimo bonifico rubato verso il proprio conto
  // amministrazione e accessi
  staff?: boolean; // l'account dell'amministratore: fuori dalle classifiche
  ban?: { until: number; reason: string; by: string; at: number } | null; // until 0 = per sempre
  awaiting?: boolean; // iscrizione in attesa di approvazione
  lastSeen?: number;
  lastIp?: string;
  ips?: string[];
  logins?: number;
  lastDay?: string;
  deeds?: Deed[]; // le ultime gesta: servono a spuntare gli obiettivi delle operazioni
  buffs?: Record<string, number>; // effetti a tempo (cpu, modem) o a consumo (dice, fixer): scadenza o contatore
  cooldowns?: Record<string, number>; // gadget: quando tornano pronti
};

type Sensor = { ownerId: string; until: number; lines: { at: number; text: string }[] };

type Account = { personId: string; number: string; balance: number; holder?: string };
type Ledger = { id: string; at: number; from: string; to: string; amount: number; actorId: string; opId: string; reversed: boolean; toAgentId: string | null };
type WRecord = SeedRecord & { orig?: Record<string, string> };

type WFile = SeedFile & {
  deleted: boolean;
  deletedAt: number | null;
  honeypot: { ownerId: string; version: number } | null;
  loot?: Item; // pacchetto con un oggetto dentro: sparisce quando qualcuno lo copia
  spawnedAt?: number;
  cargo?: string; // carico di un contratto di trasporto
};

type LogEntry = {
  id: string;
  at: number;
  text: string; // contiene {FROM} come segnaposto per l'IP d'origine
  opId: string | null;
  actorId: string | null;
  fromIp: string | null;
  removed: null | "gap" | "clean";
  removedAt: number | null;
  forged: boolean;
  recovered: boolean;
  mirrors?: string[]; // blu i cui sensori hanno copiato la riga
  origIp?: string | null; // l'IP d'origine com'era quando il sensore l'ha copiata
};

type WNode = Omit<SeedNode, "files" | "records"> & {
  files: WFile[];
  records: WRecord[];
  accounts?: Account[];
  ledger?: Ledger[];
  peopleV?: number;
  sensors?: Sensor[];
  offlineUntil?: number;
  offlineBy?: string;
  alertUntil?: number;
  cooldown?: Record<string, number>; // comandi di sistema: quando tornano disponibili
  logs: LogEntry[];
  backdoors: { ownerId: string; version: number; at: number }[];
  worms?: { ownerId: string; version: number; at: number }[];
  patch: { until: number; level: number; by: string } | null;
  activity: number;
};

type Mission = {
  id: string;
  faction: Faction;
  type: MissionType;
  title: string;
  brief: string;
  nodeId: string;
  fileId: string | null;
  recordId: string | null;
  field: string | null;
  value: string | null;
  targetAgentId: string | null;
  incident: { opId: string; nodeId: string } | null;
  reward: number;
  xp: number;
  minXp: number;
  requires: ToolId[];
  status: "open" | "taken" | "done" | "failed" | "expired";
  ownerId: string | null; // contratto personale
  takenBy: string | null;
  createdAt: number;
  expiresAt: number;
  clientAccess: boolean;
  postedBy?: string | null; // agente che ha messo la taglia (ricompensa in deposito)
  takenAt?: number | null;
  tier?: number;
  mods?: MissionMod[];
  answer?: string | null; // profilo: l'ID Reticolo atteso
  amount?: number;
  fromAcct?: string;
  toAcct?: string;
  destNodeId?: string; // trasporto: dove va caricato
  delivered?: boolean;
  ledgerId?: string;
  clientNodes?: string[]; // nodi su cui il contratto dà credenziali cliente
  objectives?: Objective[]; // operazioni a tappe: cosa va fatto dopo aver accettato
  scene?: string; // il copione da cui nasce
  limitMin?: number; // tempo massimo dall'accettazione
};

type Deed = { at: number; d: string; node: string; kind: string; region: string };

type Listing = { id: string; sellerId: string; file: StoredFile; price: number; createdAt: number; expiresAt: number };

type Incident = { opId: string; actorId: string; nodeId: string; at: number; sweepAt: number; resolved: boolean; touched: boolean; grave?: boolean };

type Task = {
  id: string;
  tool: ToolId | "copy" | "delete" | "upload";
  label: string;
  work: number; // secondi a CPU 1 (per copy: GQ)
  done: number;
  usesModem: boolean;
  state: "run" | "done" | "fail";
  note: string | null;
  arg: Record<string, unknown>;
  finishedAt: number | null;
};

type Op = {
  id: string;
  agentId: string;
  chain: string[];
  connectedAt: number;
  access: "none" | "guest" | "admin" | "client";
  bypass: { proxy: boolean; firewall: boolean; monitor: boolean };
  monitorVersion: number;
  trace: { active: boolean; progressMs: number; hopTimes: number[] };
  boostUntil: number;
  boostBy: string | null;
  boostPower: number;
  cracked: number; // caratteri rivelati dal breaker
  dictOptions: string[] | null;
  decrypted: Set<string>;
  tasks: Task[];
  poisoned: string[];
  touched: boolean; // ha fatto qualcosa che conta (file, record, backdoor...)
  looted: boolean;
  overloaded: boolean;
  stolen: number;
  frozenUntil: number;
  fails: number; // password sbagliate in questa sessione
  lockedUntil: number;
  guard: number; // moltiplicatore del trace per i contratti «presidiati»
  grave: boolean; // ha toccato denaro: l'indagine è rapida
  clearance: number; // 0 nessuno · 1 impiegato · 2 operatore (admin e cliente valgono 3)
  rotor?: { fileId: string; code: number[]; guesses: { g: number[]; exact: number; near: number }[]; tries: number; state: "open" | "won" | "lost"; manual: boolean };
  rotorLost?: string[]; // file su cui la chiave è stata ruotata: a mano non si riprova
  grid?: { side: number; hidden: number[]; found: number[]; probed: number[]; probes: number; state: "open" | "won" | "lost"; manual: boolean };
  zoneUsed: string[]; // azioni dei sottosistemi già usate in questa connessione
};

type Meta = {
  feed: FeedItem[];
  war: { red: number; blue: number };
  lastPulse: number;
  lastDecay: number;
  blackout?: Partial<Record<Region, number>>;
  // amministrazione
  settings?: Settings;
  totals?: Record<string, number>; // contatori globali dei giocatori (non NPC)
  daily?: Record<string, Record<string, number>>; // gli stessi, giorno per giorno (ultimi 60)
  audit?: AuditRow[];
  ipBans?: IpBan[];
};

/** Tutti i nodi del mondo: quelli scritti a mano e quelli generati. */
const ALL_SEEDS: SeedNode[] = [...SEED_NODES, ...WORLD.nodes];

const now = () => Date.now();
const uid = (p: string) => `${p}_${randomBytes(5).toString("hex")}`;
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const LOG_TTL_RELAY = 25 * 60_000;
const LOG_TTL_NODE = 75 * 60_000;
const FORENSIC_WINDOW = 30 * 60_000;
// AETHER_FAST=1 (solo test): indagini e scansioni in pochi secondi
const FAST = process.env.AETHER_FAST === "1";
const SWEEP_DELAY = FAST ? 6_000 : 6 * 60_000;
/** Un evento con probabilità p; nei test (AETHER_FAST) accade sempre, così gli script sono ripetibili. */
const chance = (p: number) => FAST || Math.random() < p;
const BOARD_PER_FACTION = 10;

export type Outbox = {
  toast(agentId: string, text: string, tone: "ok" | "warn" | "bad" | "info"): void;
};

export class Game {
  agents = new Map<string, Agent>();
  nodes = new Map<string, WNode>();
  missions = new Map<string, Mission>();
  incidents = new Map<string, Incident>();
  listings = new Map<string, Listing>();
  ops = new Map<string, Op>(); // per agentId
  meta: Meta = { feed: [], war: { red: 0, blue: 0 }, lastPulse: 0, lastDecay: 0 };
  online = new Set<string>();
  dirty = new Set<string>(); // agenti a cui rimandare lo stato
  private persistDirty = new Set<string>();
  out: Outbox;

  store: Store;

  constructor(store: Store, out: Outbox) {
    this.store = store;
    this.out = out;
    this.load();
  }

  // ------------------------------------------------------------ persistenza

  // ------------------------------------------------------------ impostazioni dell'amministratore

  cfg(key: string): number | boolean | string {
    return this.meta.settings?.[key] ?? DEFAULT_SETTINGS[key]!;
  }
  num(key: string) {
    return Number(this.cfg(key));
  }
  on(key: string) {
    return this.cfg(key) === true;
  }

  load() {
    for (const a of this.store.all<Agent>("agent")) this.agents.set(a.id, a);
    for (const n of this.store.all<WNode>("node")) this.nodes.set(n.id, n);
    for (const m of this.store.all<Mission>("mission")) this.missions.set(m.id, m);
    for (const i of this.store.all<Incident>("incident")) this.incidents.set(i.opId, i);
    for (const l of this.store.all<Listing>("listing")) this.listings.set(l.id, l);
    const meta = this.store.get<Meta>("meta", "world");
    if (meta) this.meta = meta;
    // semina nodi mancanti (permette di aggiungere contenuti senza azzerare il mondo)
    for (const seed of ALL_SEEDS) {
      const live = this.nodes.get(seed.id);
      if (live) {
        // posizione, tipo e testi vengono sempre dal contenuto: i mondi salvati seguono gli aggiornamenti
        Object.assign(live, { x: seed.x, y: seed.y, cls: seed.cls, hidden: seed.hidden, blurb: seed.blurb, org: seed.org, name: seed.name, sub: seed.sub, city: seed.city, adminId: seed.adminId, homeOf: seed.homeOf, gen: seed.gen, inner: seed.inner });
        this.touch("node", seed.id);
      }
      if (!this.nodes.has(seed.id)) {
        this.nodes.set(seed.id, {
          ...seed,
          files: seed.files.map((f) => ({ ...f, deleted: false, deletedAt: null, honeypot: null })),
          records: structuredClone(seed.records),
          logs: [],
          backdoors: [],
          patch: null,
          activity: 0,
        });
        this.touch("node", seed.id);
      }
    }
    for (const g of GHOSTS) {
      if (!this.agents.has(g.id)) {
        this.agents.set(g.id, {
          id: g.id,
          handle: g.handle,
          faction: g.faction,
          npc: true,
          skill: g.skill,
          credits: g.credits,
          xp: g.xp,
          heat: g.heat,
          gatewayIp: g.ip,
          hw: { cpu: 3, modem: 3, memory: 3, shield: 3, soc: 1 },
          tools: {},
          storage: [],
          presiding: [],
          stats: { ops: Math.round(g.xp / 90), clean: Math.round((g.xp / 120) * g.skill), caught: Math.round((1 - g.skill) * 6), attributions: g.faction === "blue" ? Math.round(g.xp / 200) : 0, sabotage: 0, defense: 0 },
          mail: [],
          counterReadyAt: 0,
          createdAt: now(),
          known: [],
          overloadUntil: 0,
          lastSiphonAt: 0,
          ...this.depthBlank(),
          fame: Math.round(g.xp / 12),
        });
        this.touch("agent", g.id);
      }
    }
    this.seedPeople();
    for (const a of this.agents.values()) {
      this.depthDefaults(a);
      a.hw.shield ??= a.npc ? 3 : 1;
      a.hw.soc ??= 1;
      if (!Array.isArray(a.presiding)) a.presiding = a.presiding ? [a.presiding as unknown as { nodeId: string; until: number }] : [];
      a.known ??= [];
      a.overloadUntil ??= 0;
      a.lastSiphonAt ??= 0;
      this.ensureGateway(a);
    }
    this.fillBoard();
  }

  // ------------------------------------------------------------ gateway dei giocatori

  gatewayId(a: Agent) {
    return `gw:${a.id}`;
  }

  gatewayOwner(n: WNode) {
    return n.kind === "gateway" ? (this.agents.get(n.id.slice(3)) ?? null) : null;
  }

  gatewayPassword(shield: number) {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let pw = "";
    for (let i = 0; i < 5 + shield; i += 1) pw += abc[Math.floor(Math.random() * abc.length)];
    return pw;
  }

  /** Crea o aggiorna il nodo-gateway di un agente: indirizzo, difese, file (= il suo archivio). */
  ensureGateway(a: Agent, rotate = false) {
    const id = this.gatewayId(a);
    const sec = gatewaySec(a.hw.shield);
    const pos = gatewayPos(a.gatewayIp);
    let n = this.nodes.get(id);
    if (!n) {
      n = {
        id,
        name: a.gatewayIp,
        org: "Gateway privato",
        kind: "gateway",
        ip: a.gatewayIp,
        x: pos.x,
        y: pos.y,
        blurb: "Un terminale privato. Chi lo possiede verrà a cercarti.",
        proxy: sec.proxy,
        firewall: sec.firewall,
        monitor: sec.monitor,
        password: this.gatewayPassword(a.hw.shield),
        files: [],
        records: [],
        logs: [],
        backdoors: [],
        patch: null,
        activity: 0,
      };
      this.nodes.set(id, n);
    }
    Object.assign(n, { name: a.gatewayIp, ip: a.gatewayIp, x: pos.x, y: pos.y, proxy: sec.proxy, firewall: sec.firewall, monitor: sec.monitor });
    if (rotate) n.password = this.gatewayPassword(a.hw.shield);
    this.syncGatewayFiles(n);
    this.touch("node", id);
    return n;
  }

  syncGatewayFiles(n: WNode) {
    const owner = this.gatewayOwner(n);
    if (!owner) return;
    n.files = owner.storage.map((st) => ({
      id: st.key,
      name: st.name,
      size: st.size,
      encryption: 0,
      value: 0,
      preview: `Copia di ${st.name}, sottratta a ${this.node(st.nodeId)?.org ?? "un nodo sconosciuto"}.`,
      deleted: false,
      deletedAt: null,
      honeypot: null,
    }));
  }

  learn(a: Agent, ip: string, handle: string | null, note: string) {
    if (a.npc || ip === a.gatewayIp) return;
    a.known = [{ ip, handle, note, at: now() }, ...a.known.filter((k) => k.ip !== ip)].slice(0, 30);
    this.touch("agent", a.id);
  }

  touch(kind: "agent" | "node" | "mission" | "incident" | "listing" | "meta", id: string) {
    this.persistDirty.add(`${kind}:${id}`);
  }

  flush() {
    if (!this.persistDirty.size) return;
    const keys = [...this.persistDirty];
    this.persistDirty.clear();
    this.store.transaction(() => {
      for (const key of keys) {
        const [kind, ...rest] = key.split(":");
        const id = rest.join(":");
        const src =
          kind === "agent"
            ? this.agents.get(id)
            : kind === "node"
              ? this.nodes.get(id)
              : kind === "mission"
                ? this.missions.get(id)
                : kind === "incident"
                  ? this.incidents.get(id)
                  : kind === "listing"
                    ? this.listings.get(id)
                  : this.meta;
        if (src) this.store.put(kind!, kind === "meta" ? "world" : id, src);
        else this.store.remove(kind!, id);
      }
    });
  }

  // ============================================================ PROFONDITÀ
  // Popolazione e archivi, banca, bottino, giustizia, fama, War Dialer, contratti nuovi.

  depthBlank() {
    return {
      chips: [] as Item[],
      fame: 0,
      ethics: 0,
      charges: [] as Charge[],
      arrests: 0,
      jailUntil: 0,
      feats: [] as string[],
      counters: {} as Record<string, number>,
      account: `00-${100000 + Math.floor(Math.random() * 900000)}`,
      pending: [] as Agent["pending"],
      scanUntil: 0,
      discovered: [] as string[],
      claimed: [] as string[],
      adminNodes: [] as string[],
      relayKeys: [] as string[],
      relayUse: {} as Record<string, number[]>,
      analystUntil: 0,
      knownNodes: SEED_NODES.filter((n) => !n.hidden).map((n) => n.id),
      scanRegion: null as Region | null,
      rerouteUntil: 0,
      grudges: {} as Record<string, number>,
      fenced: {} as Record<string, number>,
      heistAt: 0,
    };
  }

  depthDefaults(a: Agent) {
    const rec = a as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(this.depthBlank())) if (rec[k] === undefined) rec[k] = v;
  }

  // ------------------------------------------------------------ popolazione e archivi

  /** Riempie anagrafe, casellario, atenei e banche con i 100 cittadini. */
  seedPeople() {
    const V = 1;
    for (const n of this.nodes.values()) {
      if (n.peopleV === V) continue;
      if (n.id === "vesper-civic") {
        n.records = PEOPLE.map((p) => ({
          id: p.id,
          name: p.name,
          fields: [
            { key: "civil", label: "Stato in vita", value: p.civil, options: CIVIL },
            { key: "residence", label: "Residenza", value: p.city, options: [...CITIES, "fuori registro"] },
            { key: "clearance", label: "Nulla osta", value: p.clearance, options: CLEARANCES },
          ],
        }));
      } else if (n.id === "meridia-pd") {
        n.records = PEOPLE.map((p) => ({
          id: p.id,
          name: p.name,
          fields: [
            { key: "record", label: "Precedenti", value: p.crime, options: CRIMES },
            { key: "status", label: "Stato", value: p.status, options: STATUSES },
          ],
        }));
      } else if (n.id === "halcyon-uni" || n.id === "karsk-poly") {
        n.records = PEOPLE.filter((p) => p.uni === n.id).map((p) => ({
          id: p.id,
          name: p.name,
          fields: [
            { key: "course", label: "Corso", value: p.course, options: [p.course] },
            { key: "degree", label: "Titolo", value: p.degree, options: DEGREES },
            { key: "grade", label: "Voto finale", value: p.grade, options: GRADES },
          ],
        }));
      } else if (n.kind === "bank") {
        n.records = [];
        n.accounts = [
          ...PEOPLE.filter((p) => p.bank === n.id).map((p) => ({ personId: p.id, number: p.account, balance: p.balance })),
          // le banche generate tengono i conti delle organizzazioni
          ...WORLD.orgAccounts.filter((a) => a.bankId === n.id).map((a) => ({ personId: "", number: a.number, balance: a.balance, holder: a.holder })),
        ];
        n.ledger ??= [];
      } else continue;
      n.peopleV = V;
      this.touch("node", n.id);
    }
  }

  recordSub(n: WNode, p: Person) {
    if (n.kind === "gov") return `nat${p.sex === "f" ? "a" : "o"} a ${p.city} nel ${p.born} · ${p.job} · ID ${p.lid}`;
    if (n.kind === "bank") return `${p.job} · nat${p.sex === "f" ? "a" : "o"} nel ${p.born}`;
    return `nat${p.sex === "f" ? "a" : "o"} nel ${p.born} · ${p.job}`;
  }

  searchRecords(agent: Agent, q: string) {
    const { op, target } = this.requireOpSafe(agent);
    if (!op || !target) return { ok: false, error: "non sei collegato" };
    if (op.access !== "admin" && op.access !== "client") return { ok: false, error: "serve l'accesso admin" };
    const needle = q.trim().toLowerCase();
    const all: { view: RecordView; hay: string }[] = [];
    if (target.kind === "bank") {
      for (const acct of target.accounts ?? []) {
        const p = personById.get(acct.personId);
        const name = p?.name ?? acct.holder ?? "conto cifrato";
        const sub = p ? this.recordSub(target, p) : "conto aziendale";
        all.push({
          view: {
            id: acct.number,
            name,
            photo: p?.id ?? null,
            sub,
            fields: [],
            account: { number: acct.number, balance: acct.balance, cap: Math.min(Math.floor(acct.balance * TRANSFER_MAX_SHARE), heistCap(this.tierOf(target))) },
            alias: null,
          },
          hay: `${name} ${sub} ${acct.number}`.toLowerCase(),
        });
      }
    } else {
      for (const rec of target.records) {
        const p = personById.get(rec.id);
        const sub = p ? this.recordSub(target, p) : "";
        all.push({
          view: { id: rec.id, name: rec.name, photo: p ? p.id : null, sub, fields: rec.fields, account: null, alias: null },
          hay: `${rec.name} ${sub} ${rec.fields.map((f) => f.value).join(" ")}`.toLowerCase(),
        });
      }
    }
    if (target.kind === "law") {
      // i fascicoli degli handle: chi ha capi d'accusa compare nel casellario
      for (const a of this.agents.values()) {
        if (a.npc || !a.charges.length) continue;
        all.push({
          view: {
            id: `ag:${a.id}`,
            name: `alias «${a.handle}»`,
            photo: null,
            sub: `handle · ${a.faction === "red" ? "cellula rossa" : "cellula blu"} · ${WARRANT[warrantLevel(a.charges)]!.name}`,
            fields: [],
            account: null,
            alias: { charges: a.charges.map((c) => `${c.text} (${c.where})`), warrant: warrantLevel(a.charges) },
          },
          hay: `alias ${a.handle} fascicolo handle`.toLowerCase(),
        });
      }
    }
    const hits = needle ? all.filter((x) => x.hay.includes(needle)) : all;
    return { ok: true, data: { records: hits.slice(0, 24).map((x) => x.view), total: hits.length } };
  }

  clearCharges(agent: Agent, recordId: string) {
    const { op, target } = this.requireOpSafe(agent);
    if (!op || !target) return { ok: false, error: "non sei collegato" };
    if (target.kind !== "law") return { ok: false, error: "i fascicoli stanno nel casellario" };
    if (op.access !== "admin") return { ok: false, error: "serve l'accesso admin" };
    const who = this.agents.get(recordId.replace(/^ag:/, ""));
    if (!who || !who.charges.length) return { ok: false, error: "nessun fascicolo con quel nome" };
    who.charges = [];
    op.touched = true;
    this.log(target, `RECORD purge alias ${who.handle.toLowerCase()} by admin from {FROM}`, { opId: op.id, actorId: agent.id, fromIp: this.prevIp(op, agent) });
    this.touch("agent", who.id);
    this.dirty.add(who.id);
    if (who.id === agent.id) this.feat(agent, "clean");
    else if (!who.npc) this.mail(who, "CASELLARIO", "Fascicolo svuotato", `Qualcuno è entrato nel casellario di Meridia e ha cancellato i tuoi capi d'accusa. Hai un amico, o un debito.`);
    return { ok: true, note: `fascicolo di ${who.handle} svuotato` };
  }

  // ------------------------------------------------------------ banca

  findAccount(number: string) {
    for (const n of this.nodes.values()) {
      const a = n.accounts?.find((x) => x.number === number);
      if (a) return { node: n, acct: a };
    }
    return null;
  }

  transfer(agent: Agent, fromNo: string, toNo: string, rawAmount: number) {
    const { op, target } = this.requireOpSafe(agent);
    if (!op || !target) return { ok: false, error: "non sei collegato" };
    if (target.kind !== "bank") return { ok: false, error: "i bonifici si fanno in banca" };
    if (op.access !== "admin") return { ok: false, error: "serve l'accesso admin" };
    if (!op.bypass.firewall) return { ok: false, error: "il firewall blocca i movimenti: abbattilo prima" };
    const from = target.accounts?.find((a) => a.number === fromNo.trim());
    if (!from) return { ok: false, error: "conto di partenza non trovato in questa banca" };
    const amount = Math.floor(rawAmount);
    // l'antifrode ferma i movimenti grossi: un quarto del saldo, e mai oltre il tetto della banca
    const max = Math.min(Math.floor(from.balance * TRANSFER_MAX_SHARE), heistCap(this.tierOf(target)));
    if (!Number.isFinite(amount) || amount < 1) return { ok: false, error: "importo non valido" };
    if (amount > max) return { ok: false, error: `l'antifrode blocca oltre ${fmtCr(max)} per operazione su questo conto` };
    if ((target.ledger ?? []).filter((l) => l.opId === op.id).length >= 2) return { ok: false, error: "troppi movimenti in una sessione: il terminale si è bloccato" };
    const to = toNo.trim();
    if (to === from.number) return { ok: false, error: "stesso conto" };
    const dest = this.findAccount(to);
    const destAgent = dest ? null : ([...this.agents.values()].find((a) => a.account === to) ?? null);
    if (!dest && !destAgent) return { ok: false, error: "conto di destinazione inesistente" };
    if (destAgent && now() - destAgent.heistAt < HEIST_COOLDOWN && !(target.ledger ?? []).some((l) => l.opId === op.id)) {
      return { ok: false, error: `quel conto è segnalato sui circuiti interbancari: riprova fra ${Math.ceil((HEIST_COOLDOWN - (now() - destAgent.heistAt)) / 60_000)} min` };
    }
    if (destAgent) destAgent.heistAt = now();
    const holder = personById.get(from.personId)?.name ?? from.holder ?? "?";
    from.balance -= amount;
    const led: Ledger = { id: uid("ld"), at: now(), from: from.number, to, amount, actorId: agent.id, opId: op.id, reversed: false, toAgentId: destAgent?.id ?? null };
    target.ledger = [...(target.ledger ?? []), led].slice(-40);
    if (dest) {
      dest.acct.balance += amount;
      this.touch("node", dest.node.id);
    } else if (destAgent) {
      destAgent.pending.push({ amount, clearAt: 0, from: holder, opId: op.id, bankId: target.id, ledgerId: led.id });
      this.touch("agent", destAgent.id);
      this.dirty.add(destAgent.id);
    }
    op.touched = true;
    op.grave = true;
    agent.ethics = clamp(agent.ethics - (destAgent?.id === agent.id ? 5 : 2), -100, 100);
    this.log(target, `BANK transfer ${amount} CR ${from.number} -> ${to} by admin from {FROM}`, { opId: op.id, actorId: agent.id, fromIp: this.prevIp(op, agent) });
    this.touch("node", target.id);
    return {
      ok: true,
      note: destAgent ? `${fmtCr(amount)} in transito: arrivano se l'indagine non trova nessuno` : `${fmtCr(amount)} spostati`,
    };
  }

  /** Annulla i bonifici in transito di un'operazione (o tutti quelli di un agente) e rimette i soldi sul conto. */
  reversePending(opId: string | null, onlyAgent: Agent | null = null) {
    for (const a of onlyAgent ? [onlyAgent] : this.agents.values()) {
      const hit = a.pending.filter((p) => opId === null || p.opId === opId);
      if (!hit.length) continue;
      a.pending = a.pending.filter((p) => !hit.includes(p));
      for (const p of hit) {
        const bank = this.node(p.bankId);
        const led = bank?.ledger?.find((l) => l.id === p.ledgerId);
        if (led && !led.reversed) {
          led.reversed = true;
          const src = bank!.accounts?.find((x) => x.number === led.from);
          if (src) src.balance += led.amount;
          this.touch("node", bank!.id);
        }
        if (!a.npc) this.mail(a, bank?.org ?? "BANCA", "Bonifico stornato", `Il movimento di ${fmtCr(p.amount)} dal conto di ${p.from} è stato bloccato dall'antifrode e stornato.`);
      }
      this.touch("agent", a.id);
    }
  }

  /** L'indagine si è chiusa senza un nome: il denaro in transito arriva a destinazione. */
  settlePending(opId: string) {
    for (const a of this.agents.values()) {
      const hit = a.pending.filter((p) => p.opId === opId);
      if (!hit.length) continue;
      a.pending = a.pending.filter((p) => !hit.includes(p));
      const sum = hit.reduce((s, p) => s + p.amount, 0);
      a.credits += sum;
      this.touch("agent", a.id);
      if (!a.npc) {
        this.bump(a, "earned", sum);
        this.mail(a, "CONTO", `Accredito: ${fmtCr(sum)}`, `Il bonifico dal conto di ${hit[0]!.from} è arrivato. Nessuno ha fatto domande.`);
        if (sum >= 5000) this.feat(a, "banker");
      }
    }
  }

  reverseTransfer(agent: Agent, ledgerId: string) {
    const { op, target } = this.requireOpSafe(agent);
    if (!op || !target) return { ok: false, error: "non sei collegato" };
    if (agent.faction !== "blue") return { ok: false, error: "gli storni li fanno gli analisti blu" };
    if (op.access !== "admin" && op.access !== "client") return { ok: false, error: "serve l'accesso" };
    const led = target.ledger?.find((l) => l.id === ledgerId);
    if (!led) return { ok: false, error: "movimento non trovato" };
    if (led.reversed) return { ok: false, error: "già stornato" };
    const pend = led.toAgentId ? this.agents.get(led.toAgentId) : null;
    if (pend?.pending.some((p) => p.ledgerId === led.id)) this.reversePending(led.opId, pend);
    else {
      led.reversed = true;
      const src = target.accounts?.find((x) => x.number === led.from);
      if (src) src.balance += led.amount;
      const dest = this.findAccount(led.to);
      if (dest) dest.acct.balance = Math.max(0, dest.acct.balance - led.amount);
      else if (pend) {
        pend.credits = Math.max(0, pend.credits - led.amount);
        this.touch("agent", pend.id);
        if (!pend.npc) this.mail(pend, target.org, "Storno forzoso", `${fmtCr(led.amount)} sono stati ripresi dal tuo conto: il bonifico è stato riconosciuto come frode.`);
      }
    }
    this.log(target, `BANK reversal ${led.amount} CR ${led.to} -> ${led.from} by ${agent.handle.toLowerCase()}`, {});
    this.bumpArchivist(agent);
    this.touch("node", target.id);
    return { ok: true, note: "bonifico stornato" };
  }

  // ------------------------------------------------------------ bottino: exploit e chip

  rollItem(weights: number[]): Item {
    let x = Math.random() * weights.reduce((s, w) => s + w, 0);
    let r = 0;
    for (let i = 0; i < weights.length; i += 1) {
      x -= weights[i]!;
      if (x <= 0) {
        r = i;
        break;
      }
    }
    r = Math.min(3, r);
    const gads = GADGETS.filter((g) => g.rarity === r);
    if (gads.length && Math.random() < 0.16) {
      const g = pick(gads);
      return { kind: "gadget", code: g.code, rarity: g.rarity, name: g.name, desc: `${g.desc} Si ricarica in ${g.cooldownMin} minuti.` };
    }
    if (Math.random() < 0.55) {
      const same = EXPLOITS.filter((e) => e.rarity === r);
      const e = same.length ? pick(same) : pick(EXPLOITS.filter((q) => q.rarity <= r));
      return { kind: "exploit", code: e.code, rarity: e.rarity, name: e.name, desc: e.desc };
    }
    const k = pick((Object.keys(CHIP_POWER) as ChipEffect[]).filter((q) => CHIP_POWER[q][r] !== 0));
    return { kind: "chip", code: `${k}${r}`, rarity: r, name: CHIP_NAMES[k][r]!, desc: "Chip per il gateway: si monta in uno slot libero.", effects: { [k]: CHIP_POWER[k][r]! } };
  }

  giveItem(agent: Agent, item: Item) {
    if (!agent.npc) {
      this.bump(agent, "loot");
      if (item.rarity >= 3) this.bump(agent, "rare");
      if (item.rarity >= 4) this.bump(agent, "legend");
    }
    agent.storage.push({ key: uid("st"), name: item.name, nodeId: "loot", fileId: item.code, size: 1, at: now(), rarity: item.rarity, item });
    this.touch("agent", agent.id);
    this.dirty.add(agent.id);
    if (!agent.npc) this.out.toast(agent.id, `Bottino: ${item.name}`, "ok");
    if (item.rarity >= 4) this.feat(agent, "legend");
  }

  chip(agent: Agent, k: ChipEffect) {
    return agent.chips.reduce((s, c) => s + (c.effects?.[k] ?? 0), 0);
  }

  /** Quante volte l'agente ha usato quel relay negli ultimi minuti: i monitor imparano i percorsi abituali. */
  wear(agent: Agent, relayId: string) {
    const t = now();
    return (agent.relayUse[relayId] ?? []).filter((x) => t - x < WEAR_WINDOW).length;
  }

  hopInput(agent: Agent, r: WNode): HopInput {
    return {
      cls: r.cls ?? "public",
      x: r.x,
      y: r.y,
      hasKey: agent.relayKeys.includes(r.id),
      recentUses: this.wear(agent, r.id),
      poisoned: r.backdoors.some((b) => b.ownerId !== agent.id),
    };
  }

  storageMax(agent: Agent) {
    return storageCap(agent.hw.memory) + this.chip(agent, "storage");
  }

  hopsMax(agent: Agent) {
    return maxHops(agent.hw.modem) + this.chip(agent, "hops");
  }

  priceOf(st: StoredFile) {
    return st.item ? ITEM_FENCE[st.item.rarity]! : fencePrice(this.fileValue(st), st.size);
  }

  equip(agent: Agent, key: string) {
    const st = agent.storage.find((x) => x.key === key);
    if (!st?.item || st.item.kind !== "chip") return { ok: false, error: "non è un chip" };
    if (this.ops.has(agent.id)) return { ok: false, error: "non si monta hardware a connessione aperta" };
    const slots = chipSlots(rankOf(agent.xp, agent.faction).index);
    if (agent.chips.length >= slots) return { ok: false, error: `hai ${slots} slot: smonta un chip, o sali di rango` };
    if (agent.chips.some((c) => c.code === st.item!.code)) return { ok: false, error: "ne hai già montato uno uguale" };
    agent.storage = agent.storage.filter((x) => x !== st);
    agent.chips.push(st.item);
    this.touch("agent", agent.id);
    return { ok: true, note: `${st.item.name} montato` };
  }

  unequip(agent: Agent, index: number) {
    const c = agent.chips[index];
    if (!c) return { ok: false, error: "slot vuoto" };
    if (this.ops.has(agent.id)) return { ok: false, error: "non si smonta hardware a connessione aperta" };
    agent.chips.splice(index, 1);
    if (agent.storage.reduce((s, x) => s + x.size, 0) > this.storageMax(agent)) {
      agent.chips.splice(index, 0, c);
      return { ok: false, error: "senza quel chip l'archivio non ci starebbe più: libera spazio prima" };
    }
    agent.storage.push({ key: uid("st"), name: c.name, nodeId: "loot", fileId: c.code, size: 1, at: now(), rarity: c.rarity, item: c });
    this.touch("agent", agent.id);
    return { ok: true, note: `${c.name} smontato` };
  }

  useItem(agent: Agent, key: string) {
    const st = agent.storage.find((x) => x.key === key);
    const gadget = st?.item?.kind === "gadget" ? gadgetDef(st.item.code) : null;
    const def = gadget ?? (st?.item?.kind === "exploit" ? exploitDef(st.item.code) : null);
    if (!st || !def) return { ok: false, error: "non si può usare" };
    const { op, target } = this.requireOpSafe(agent);
    if (def.where === "op" && (!op || !target)) return { ok: false, error: "si usa durante una connessione" };
    const from = op ? this.prevIp(op, agent) : "";
    const cds = (agent.cooldowns ??= {});
    if (gadget && (cds[gadget.code] ?? 0) > now()) return { ok: false, error: `si sta ricaricando: ${Math.ceil(((cds[gadget.code] ?? 0) - now()) / 60_000)} min` };
    const buffs = (agent.buffs ??= {});
    let extra = "";
    const revealSome = (n: number) => {
      const pool = [...this.nodes.values()].filter((x) => x.kind !== "gateway" && !x.hidden && !x.inner && !agent.knownNodes.includes(x.id)).sort(() => Math.random() - 0.5).slice(0, n);
      for (const x of pool) this.reveal(agent, x.id);
      return pool.length;
    };
    switch (def.code) {
      // ---- gadget
      case "walkman":
        if (agent.heat <= 0) return { ok: false, error: "non hai calore da smaltire" };
        agent.heat = Math.max(0, agent.heat - 8);
        break;
      case "pager":
        if (!revealSome(2)) return { ok: false, error: "conosci già tutto quello che c'è da conoscere" };
        break;
      case "bluebox":
      case "tokens":
        agent.relayUse = {};
        break;
      case "jammer":
        if (!op!.trace.active) return { ok: false, error: "nessun trace da fermare" };
        op!.frozenUntil = now() + 8_000;
        break;
      case "modelm":
        buffs.cpu = now() + 30_000;
        break;
      case "scanner": {
        const w = this.wardensOf(target!.id).map((a) => a.handle);
        const sn = (target!.sensors ?? []).filter((x) => x.until > now()).length;
        extra = ` · ${w.length ? `presidiano: ${w.join(", ")}` : "nessuno presidia"} · ${sn} sensori${target!.worms?.length ? ` · ${target!.worms.length} worm` : ""}`;
        break;
      }
      case "glove":
      case "rewind":
        if (!op!.trace.active) return { ok: false, error: "nessun trace da confondere" };
        op!.trace.progressMs *= def.code === "glove" ? 0.85 : 0.65;
        break;
      case "bootdisk":
      case "sandbox": {
        const err = this.mwGadget ? this.mwGadget(agent, def.code) : "non serve a niente";
        if (err) return { ok: false, error: err };
        break;
      }
      case "microcassette":
      case "gummy":
      case "mirrorlens": {
        const err = this.bioGadget ? this.bioGadget(agent, op!, target!, def.code === "microcassette" ? "voce" : def.code === "gummy" ? "impronta" : "retina") : "non serve a niente qui";
        if (err) return { ok: false, error: err };
        extra = " · campione pronto: presentalo al lettore";
        break;
      }
      case "deckard": {
        const pw = target!.password.toUpperCase();
        extra = ` · ${[...pw].map((ch, i) => (i % 2 === 0 ? ch : "·")).join("")}`;
        break;
      }
      // ---- exploit della seconda ondata
      case "map":
        if (!revealSome(5)) return { ok: false, error: "conosci già tutto quello che c'è da conoscere" };
        break;
      case "turbo":
        buffs.modem = now() + 90_000;
        break;
      case "overclock":
        buffs.cpu = now() + 60_000;
        break;
      case "plague": {
        if (op!.access === "admin" || op!.access === "client") return { ok: false, error: "sei già dentro" };
        const pw = target!.password.toUpperCase();
        if (!DICTIONARY.includes(pw)) return { ok: false, error: "questa password non è una parola comune: l'agenda non serve" };
        op!.dictOptions = [pw, pick(DICTIONARY.filter((w) => w !== pw))].sort(() => Math.random() - 0.5);
        break;
      }
      case "relaykeys": {
        const rel = op!.chain.slice(0, -1).filter((id) => !agent.relayKeys.includes(id));
        if (!rel.length) return { ok: false, error: "nessun relay nuovo in questo rimbalzo" };
        agent.relayKeys.push(...rel);
        break;
      }
      case "dice":
        buffs.dice = 1;
        break;
      case "fixer":
        buffs.fixer = 1;
        break;
      case "zmon":
        if (op!.bypass.monitor) return { ok: false, error: "il monitor è già cieco" };
        op!.bypass.monitor = true;
        op!.monitorVersion = 3;
        break;
      case "decoder": {
        const enc = target!.files.filter((f) => f.encryption && !f.deleted && !op!.decrypted.has(f.id));
        if (op!.access !== "admin" && op!.access !== "client") return { ok: false, error: "serve l'accesso admin" };
        if (!enc.length) return { ok: false, error: "niente da decifrare" };
        for (const f of enc) op!.decrypted.add(f.id);
        break;
      }
      case "bribe":
        if (agent.heat <= 0) return { ok: false, error: "non hai calore da smaltire" };
        agent.heat = Math.max(0, agent.heat - 60);
        break;
      case "coords": {
        const secret = [...this.nodes.values()].filter((n) => n.hidden && !agent.discovered.includes(n.id));
        if (!secret.length) return { ok: false, error: "non ti resta niente da scoprire" };
        this.discover(agent, pick(secret));
        break;
      }
      case "icebreaker":
        op!.bypass.proxy = true;
        op!.bypass.firewall = true;
        op!.bypass.monitor = true;
        op!.monitorVersion = 3;
        this.log(target!, "WARN security subsystem fault src={FROM}", { opId: op!.id, actorId: agent.id, fromIp: from });
        break;
      case "alibi":
        if (agent.heat <= 0) return { ok: false, error: "non hai calore da smaltire" };
        agent.heat = Math.max(0, agent.heat - 25);
        break;
      case "lawyer": {
        if (!agent.charges.length) return { ok: false, error: "non hai capi d'accusa" };
        const worst = [...agent.charges].sort((a, b) => b.severity - a.severity)[0]!;
        agent.charges = agent.charges.filter((c) => c !== worst);
        break;
      }
      case "freeze":
        if (!op!.trace.active) return { ok: false, error: "nessun trace da fermare" };
        op!.frozenUntil = now() + 20_000;
        break;
      case "ghost":
        if (!op!.trace.active) return { ok: false, error: "nessun trace da confondere" };
        op!.trace.progressMs = 0;
        break;
      case "zproxy":
        if (op!.bypass.proxy) return { ok: false, error: "il proxy è già giù" };
        op!.bypass.proxy = true;
        this.log(target!, "WARN proxy fault src={FROM}", { opId: op!.id, actorId: agent.id, fromIp: from });
        break;
      case "zfire":
        if (op!.bypass.firewall) return { ok: false, error: "il firewall è già aperto" };
        op!.bypass.firewall = true;
        this.log(target!, "WARN firewall fault src={FROM}", { opId: op!.id, actorId: agent.id, fromIp: from });
        break;
      case "scrub": {
        let n = 0;
        for (const l of target!.logs) {
          if (l.opId !== op!.id || l.removed) continue;
          l.removed = "clean";
          l.removedAt = now();
          n += 1;
        }
        if (!n) return { ok: false, error: "nessuna tua riga nel log" };
        this.touch("node", target!.id);
        break;
      }
      case "skeleton":
        if (op!.access === "admin" || op!.access === "client") return { ok: false, error: "sei già dentro" };
        if (this.bioBlock?.(op!, agent, target!)) return { ok: false, error: this.bioBlock(op!, agent, target!)! };
        op!.access = "admin";
        op!.bypass.proxy = true;
        this.log(target!, "LOGIN admin from {FROM}", { opId: op!.id, actorId: agent.id, fromIp: from });
        this.gotAdmin(op!, agent, target!);
        break;
    }
    if (gadget) {
      cds[gadget.code] = now() + gadget.cooldownMin * 60_000;
      this.bump(agent, "gadget");
    }
    else agent.storage = agent.storage.filter((x) => x !== st);
    this.touch("agent", agent.id);
    this.dirty.add(agent.id);
    return { ok: true, note: `${def.name}: ${gadget ? "attivato" : "usato"}${extra}` };
  }

  // ------------------------------------------------------------ fama, imprese, etica

  addFame(agent: Agent, n: number) {
    agent.fame = Math.max(0, agent.fame + n);
    this.touch("agent", agent.id);
  }

  feat(agent: Agent, id: string) {
    const def = featDef(id);
    if (!def || agent.npc || agent.feats.includes(id)) return;
    if (def.faction && def.faction !== agent.faction) return;
    agent.feats.push(id);
    this.addFame(agent, def.fame);
    this.mail(agent, "RETICOLO", `Impresa: ${def.name}`, `${def.desc}\n\n+${def.fame} fama.`);
    if (def.secret) this.feed(`Si dice che ${agent.handle} abbia fatto qualcosa che non si racconta: «${def.name}».`, "sys");
  }

  bump(agent: Agent, key: string, n = 1) {
    agent.counters[key] = (agent.counters[key] ?? 0) + n;
    this.touch("agent", agent.id);
    if (!agent.npc) {
      this.gstat(key, n);
      this.achieve(agent, key);
    }
    return agent.counters[key]!;
  }

  spec(agent: Agent, id: SpecId) {
    return agent.npc ? 0 : specLevel(agent.counters, id);
  }

  /** Annota una gesta del giocatore (ultime 250): le operazioni a obiettivi le leggono da qui. */
  deed(agent: Agent, d: string, node: WNode | null | undefined) {
    if (agent.npc) return;
    const list = (agent.deeds ??= []);
    list.push({ at: now(), d, node: node?.id ?? "", kind: node?.kind ?? "", region: node ? regionAt(node.x, node.y) : "" });
    if (list.length > 250) list.splice(0, list.length - 250);
    for (const m of this.missions.values()) if (m.takenBy === agent.id && m.status === "taken" && m.objectives) this.dirty.add(agent.id);
  }

  /** Quante volte un obiettivo risulta fatto da quando il contratto è stato accettato. */
  objectiveCount(agent: Agent, m: Mission, o: Objective) {
    const hits = (agent.deeds ?? []).filter(
      (x) => x.at >= (m.takenAt ?? 0) && x.d === o.deed && (!o.nodeId || x.node === o.nodeId) && (!o.kind || x.kind === o.kind) && (!o.region || x.region === o.region) && (!o.sub || this.node(x.node)?.sub === o.sub) && (!o.when || this.whenOk(o.when, x.node, x.at)),
    );
    if (!o.distinct) return hits.length;
    return new Set(hits.map((x) => (o.distinct === "node" ? x.node : o.distinct === "kind" ? x.kind : x.region)).filter(Boolean)).size;
  }

  /** Notte (22-6) o orario d'ufficio (8-18 feriale), nell'ora del nodo e nel momento indicato. */
  whenOk(when: "notte" | "giorno", nodeId: string, at: number) {
    if (this.clockForce) return this.clockForce === when;
    const n = this.node(nodeId);
    if (!n) return false;
    const h = localHour(n.x, at);
    const wd = localWeekday(n.x, at);
    return when === "notte" ? h >= 22 || h < 6 : wd >= 1 && wd <= 5 && h >= 8 && h < 18;
  }

  /** Commissione: un contratto scritto da un giocatore, con obiettivo e condizioni (shared/jobs.ts). */
  postJob(agent: Agent, p: Record<string, unknown>) {
    const goal = JOB_GOALS.find((g) => g.id === p.goal);
    if (!goal) return { ok: false, error: "scegli un obiettivo" };
    const node = this.node(String(p.nodeId ?? ""));
    if (!node || ["relay", "registry", "gateway", "home"].includes(node.kind) || node.hidden) return { ok: false, error: "scegli un sistema bersaglio" };
    if (!agent.knownNodes.includes(node.id)) return { ok: false, error: "puoi commissionare lavori solo su sistemi che conosci" };
    const conds = [...new Set(asStrList(p.conds))].filter((c) => JOB_CONDS.some((x) => x.id === c && (!x.side || x.side === goal.side))) as JobCond[];
    if (conds.includes("notte") && conds.includes("giorno")) return { ok: false, error: "o di notte o di giorno: non tutte e due" };
    const reward = Math.round(Number(p.reward));
    const min = jobMin(conds);
    if (!Number.isFinite(reward) || reward < min || reward > BOUNTY_MAX) return { ok: false, error: `con queste condizioni la paga va da ${fmtCr(min)} a ${fmtCr(BOUNTY_MAX)}` };
    const fee = Math.ceil(reward * BOUNTY_FEE);
    if (agent.credits < reward + fee) return { ok: false, error: `servono ${fmtCr(reward + fee)} (ricompensa più commissione)` };
    if ([...this.missions.values()].filter((m) => m.postedBy === agent.id && (m.status === "open" || m.status === "taken")).length >= 3) return { ok: false, error: "hai già tre lavori aperti in bacheca" };
    const hours = Math.max(1, Math.min(24, Math.round(Number(p.hours ?? 6))));
    const when = conds.includes("notte") ? "notte" : conds.includes("giorno") ? "giorno" : undefined;
    const m = this.baseMission(goal.side, goal.side === "red" ? "chain" : "audit", node);
    m.objectives = [{ deed: goal.deed, n: 1, nodeId: node.id, when, label: `${goal.label(node.org)}${when === "notte" ? ", di notte (ora loro)" : when === "giorno" ? ", in orario d'ufficio" : ""}` }];
    if (conds.includes("ghost")) m.objectives.push({ deed: "ghostexit", n: 1, nodeId: node.id, label: "Esci senza lasciare righe leggibili nel log" });
    if (conds.includes("fretta")) m.limitMin = 30;
    m.minXp = conds.includes("esperti") ? 1500 : 0;
    m.reward = reward;
    m.xp = Math.min(320, 60 + Math.round(reward / 40));
    m.postedBy = agent.id;
    m.expiresAt = now() + hours * 3600_000;
    m.title = `Commissione: ${goal.name.toLowerCase()} · ${node.org}`;
    m.brief = `${agent.handle} paga ${fmtCr(reward)} a chi riesce a ${goal.name.toLowerCase()} (${node.org}).${conds.length ? ` Condizioni: ${conds.map((c) => JOB_CONDS.find((x) => x.id === c)!.name.toLowerCase()).join("; ")}.` : ""} Si consegna dalla bacheca quando tutto risulta fatto.`;
    if (goal.side === "blue") {
      m.clientAccess = true;
      m.clientNodes = [node.id];
      m.requires = goal.id === "patch" ? ["patch"] : goal.id === "clean" ? [] : [];
    } else m.requires = goal.id === "admin" || goal.id === "mastro" ? (node.proxy ? ["proxy"] : []) : this.secRequires(node);
    agent.credits -= reward + fee;
    this.missions.set(m.id, m);
    this.touch("mission", m.id);
    this.touch("agent", agent.id);
    this.bump(agent, "job:post");
    this.feed(`Nuova commissione di ${agent.handle}: «${m.title}» (${fmtCr(reward)}).`, goal.side);
    return { ok: true, note: `commissione pubblicata · −${fmtCr(reward + fee)}` };
  }

  /** Statistiche globali: totale e giorno per giorno (solo giocatori veri). */
  gstat(key: string, n = 1) {
    const totals = (this.meta.totals ??= {});
    totals[key] = (totals[key] ?? 0) + n;
    const daily = (this.meta.daily ??= {});
    const day = new Date().toISOString().slice(0, 10);
    const d = (daily[day] ??= {});
    d[key] = (d[key] ?? 0) + n;
    const days = Object.keys(daily).sort();
    for (const old of days.slice(0, Math.max(0, days.length - 60))) delete daily[old];
    this.touch("meta", "world");
  }

  /** Controlla i traguardi delle serie che dipendono da quel contatore (o da un valore dell'agente). */
  achieve(agent: Agent, key: string) {
    if (agent.npc) return;
    for (const tr of tracksFor(key)) {
      const v = trackValue(tr, agent.counters, { xp: agent.xp, fame: agent.fame, credits: agent.credits });
      tr.goals.forEach((goal, tier) => {
        const id = achId(tr.key, tier);
        if (v < goal || agent.feats.includes(id)) return;
        agent.feats.push(id);
        this.addFame(agent, ACH_FAME[tier]!);
        this.out.toast(agent.id, `Traguardo ${ACH_TIER[tier]}: ${tr.names[tier]}`, "ok");
        if (tier >= 2) this.mail(agent, "RETICOLO", `Traguardo ${ACH_TIER[tier]}: ${tr.names[tier]}`, `${tr.desc.replace("{n}", goal.toLocaleString("it-IT"))}\n\n+${ACH_FAME[tier]} fama.`);
        if (tier === 3) this.feed(`${agent.handle} ha conquistato «${tr.names[tier]}».`, "sys");
      });
    }
  }

  /** I traguardi legati a XP, fama e crediti si controllano ogni tanto, non a ogni variazione. */
  achieveSelf(agent: Agent) {
    for (const k of ["$xp", "$fame", "$credits"]) this.achieve(agent, k);
  }

  bumpArchivist(agent: Agent) {
    if (this.bump(agent, "archivist") >= 5) this.feat(agent, "archivist");
    agent.ethics = clamp(agent.ethics + 3, -100, 100);
  }

  /** Chiamata ogni volta che qualcuno ottiene l'accesso admin su un nodo. */
  gotAdmin(_op: Op, agent: Agent, target: WNode) {
    if (agent.npc) return;
    this.deed(agent, "admin", target);
    this.onAdmin?.(agent, target);
    if (target.kind === "gateway") {
      const owner = this.gatewayOwner(target);
      if (owner && owner.id !== agent.id) this.bump(agent, "gw");
    } else this.bump(agent, `k:${target.kind}`);
    if (!agent.adminNodes.includes(target.id) && target.kind !== "gateway") {
      agent.adminNodes.push(target.id);
      this.bump(agent, "nodes");
      if (agent.adminNodes.length >= 10) this.feat(agent, "planet");
      this.touch("agent", agent.id);
    }
    if (target.kind === "relay" && !agent.relayKeys.includes(target.id)) {
      agent.relayKeys.push(target.id);
      this.touch("agent", agent.id);
      this.out.toast(agent.id, `Hai le chiavi di ${target.name}: rimbalzandoci sarai più difficile da risalire.`, "ok");
    }
    if (target.id === "vsi") this.feat(agent, "jobe");
    const owner = this.gatewayOwner(target);
    if (owner && !owner.npc) this.feat(agent, "duel");
  }

  // ------------------------------------------------------------ giustizia

  charge(agent: Agent, text: string, severity: number, where: string) {
    if (agent.npc) return;
    const before = warrantLevel(agent.charges);
    agent.charges = [...agent.charges, { id: uid("ch"), text, severity, at: now(), where }].slice(-12);
    this.touch("agent", agent.id);
    this.dirty.add(agent.id);
    if (before >= 3) {
      this.arrest(agent, text);
      return;
    }
    const after = warrantLevel(agent.charges);
    if (after > before) {
      this.mail(
        agent,
        "GUARDIA DEL RETICOLO",
        `Fascicolo: ${WARRANT[after]!.name}`,
        `Nuovo capo d'accusa: ${text} (${where}).\n${WARRANT[after]!.desc}\n\nLe accuse si possono far sparire: entra nel casellario della Polizia Federale di Meridia e svuota il tuo fascicolo, oppure trova un buon avvocato.`,
      );
    } else this.out.toast(agent.id, `Capo d'accusa: ${text}`, "warn");
  }

  arrest(agent: Agent, reason: string) {
    if (agent.npc || agent.staff) {
      agent.heat = 45;
      return;
    }
    if (!this.on("arrests")) {
      agent.heat = 80;
      this.out.toast(agent.id, "Calore al massimo: oggi la Guardia del Reticolo chiude un occhio.", "warn");
      return;
    }
    this.bump(agent, "arrests");
    const op = this.ops.get(agent.id);
    if (op) {
      this.reversePending(op.id);
      this.endOp(op, "burned");
    }
    this.reversePending(null, agent);
    const fine = Math.round(agent.credits * Math.min(0.4, 0.2 + agent.arrests * 0.05));
    const secs = Math.round(jailSeconds(agent.charges, agent.arrests) * this.num("jailMult"));
    agent.counters.bail = Math.round(bailCost(agent.charges, agent.arrests) * this.num("bailMult"));
    agent.credits -= fine;
    const seized = agent.storage.length;
    agent.storage = [];
    let lost: Item | null = null;
    if (agent.chips.length && Math.random() < 0.5) lost = agent.chips.splice(Math.floor(Math.random() * agent.chips.length), 1)[0]!;
    agent.hw.cpu = Math.max(1, agent.hw.cpu - 1);
    agent.hw.modem = Math.max(1, agent.hw.modem - 1);
    agent.xp = Math.round(agent.xp * 0.95);
    const list = agent.charges.map((c) => `· ${c.text} (${c.where})`).join("\n");
    agent.charges = [];
    agent.heat = 30;
    agent.arrests += 1;
    agent.stats.caught += 1;
    agent.jailUntil = now() + secs * 1000;
    agent.presiding = [];
    const old = agent.gatewayIp;
    agent.gatewayIp = this.freshIp();
    const gw = this.nodes.get(this.gatewayId(agent));
    if (gw) gw.logs = [];
    this.ensureGateway(agent, true);
    this.mail(
      agent,
      "TRIBUNALE DI MERIDIA",
      "Sei in arresto",
      `Motivo dell'arresto: ${reason}.\n${list ? `\nCapi d'accusa contestati:\n${list}\n` : ""}\nCustodia: ${secs} secondi, salvo cauzione.\nMulta: ${fmtCr(fine)}. Gateway ${old} sequestrato, con ${seized} file${lost ? ` e il chip «${lost.name}»` : ""}. CPU e modem degradati.\n\nNuovo indirizzo assegnato: ${agent.gatewayIp}. Il fascicolo è chiuso: riparti pulito, ma ti ricorderemo.`,
    );
    this.out.toast(agent.id, "ARRESTATO.", "bad");
    this.feed(`LUMEN NEWS · Arrestato l'hacker noto come «${agent.handle}»: ${reason}.`, agent.faction === "red" ? "blue" : "red");
    this.addFame(agent, 6);
    this.feat(agent, "jail");
  }

  payBail(agent: Agent) {
    if (agent.jailUntil <= now()) return { ok: false, error: "non sei in custodia" };
    const cost = agent.counters.bail ?? 600;
    if (agent.credits < cost) return { ok: false, error: `la cauzione è ${fmtCr(cost)}` };
    agent.credits -= cost;
    agent.jailUntil = 0;
    this.touch("agent", agent.id);
    return { ok: true, note: "cauzione pagata: sei fuori" };
  }

  // ------------------------------------------------------------ War Dialer

  /** Scansione di una regione: compone numeri a tappeto e mette sulla mappa i nodi che rispondono. */
  wardial(agent: Agent, region: string) {
    const v = agent.tools.wardialer ?? 0;
    if (!v) return { ok: false, error: "non possiedi il War Dialer" };
    if (!(region in REGION_NAME)) return { ok: false, error: "scegli una regione da scandagliare" };
    if (this.ops.has(agent.id)) return { ok: false, error: "il modem è occupato: stacca prima" };
    if (agent.scanUntil > now()) return { ok: false, error: "scansione già in corso" };
    if (agent.credits < SCAN_COST) return { ok: false, error: `la bolletta è ${fmtCr(SCAN_COST)} a scansione` };
    agent.credits -= SCAN_COST;
    this.tones.delete(agent.id);
    agent.scanRegion = region as Region;
    agent.scanUntil = now() + (FAST ? 1500 : scanSeconds(v) * 1000);
    this.touch("agent", agent.id);
    return { ok: true, note: `scansione di ${REGION_NAME[region as Region]} avviata · −${fmtCr(SCAN_COST)}` };
  }

  // ------------------------------------------------------------ i toni della Blue Box (minigioco)

  tones = new Map<string, { seq: number[]; round: number; state: "open" | "won" | "lost"; until: number }>();

  toneView(a: Agent): ToneView | null {
    const g = this.tones.get(a.id);
    if (!g) return null;
    return { round: g.round, rounds: TONE_ROUNDS.length, seq: g.state === "open" ? g.seq.slice(0, TONE_ROUNDS[g.round]) : g.seq, state: g.state, until: g.until };
  }

  tone(agent: Agent, act: string, p: Record<string, unknown>) {
    const g = this.tones.get(agent.id);
    if (act === "open") {
      if (!agent.scanUntil) return { ok: false, error: "la Blue Box serve mentre il War Dialer sta componendo" };
      if (g) return g.state === "open" ? { ok: true } : { ok: false, error: "il centralino ha già riattaccato: alla prossima scansione" };
      const seq = Array.from({ length: TONE_ROUNDS.at(-1)! }, () => Math.floor(Math.random() * TONE_KEYS.length));
      this.tones.set(agent.id, { seq, round: 0, state: "open", until: now() + TONE_WINDOW_MS });
      return { ok: true, note: "2600 Hz: la linea è tua" };
    }
    if (act !== "dial" || !g || g.state !== "open") return { ok: false, error: "nessuna linea aperta" };
    const want = g.seq.slice(0, TONE_ROUNDS[g.round]);
    const keys = Array.isArray(p.keys) ? p.keys.map(Number) : [];
    if (keys.length !== want.length) return { ok: false, error: "sequenza incompleta" };
    if (keys.some((k, i) => k !== want[i])) {
      g.state = "lost";
      const fee = Math.min(agent.credits, TONE_FAIL_COST);
      agent.credits -= fee;
      this.touch("agent", agent.id);
      this.bump(agent, "mg:tonelost");
      this.out.toast(agent.id, `Tono sbagliato: l'operatore ha sentito e ti addebita l'interurbana${fee ? ` · −${fmtCr(fee)}` : ""}.`, "warn");
      return { ok: true, data: { lost: true } };
    }
    g.round += 1;
    if (g.round < TONE_ROUNDS.length) return { ok: true, data: { round: g.round } };
    g.round = TONE_ROUNDS.length - 1;
    g.state = "won";
    this.bump(agent, "mg:tone");
    this.out.toast(agent.id, "Il centralino ti passa le linee riservate.", "ok");
    this.finishScan(agent, true);
    return { ok: true, data: { won: true } };
  }

  finishScan(agent: Agent, bonus = false) {
    const region = agent.scanRegion ?? "eu";
    const v = agent.tools.wardialer ?? 1;
    // la partita chiusa resta a schermo qualche secondo, poi sparisce
    const game = this.tones.get(agent.id);
    if (game?.state === "open") this.tones.delete(agent.id);
    else if (game) game.until = now() + 6000;
    agent.scanUntil = 0;
    agent.scanRegion = null;
    this.touch("agent", agent.id);
    this.dirty.add(agent.id);
    const inRegion = (n: WNode) => regionAt(n.x, n.y) === region;
    const pool = [...this.nodes.values()].filter((n) => n.kind !== "gateway" && !n.hidden && !n.inner && inRegion(n) && !agent.knownNodes.includes(n.id)).sort(() => Math.random() - 0.5);
    const found = pool.slice(0, scanFinds(v) + (bonus ? TONE_BONUS_FINDS : 0) + (this.lifeScan?.(region) ?? 0));
    for (const n of found) this.reveal(agent, n.id);
    // ogni tanto risponde qualcosa che non è in nessun elenco
    const secret = [...this.nodes.values()].filter((n) => n.hidden && inRegion(n) && !agent.discovered.includes(n.id));
    if (secret.length && chance(wardialChance(v) * (bonus ? 1 : 0.35))) this.discover(agent, pick(secret));
    if (!found.length) {
      this.out.toast(agent.id, pool.length ? "Solo toni di occupato, fax e una segreteria. Riprova." : `In ${REGION_NAME[region]} non risponde più nessuno che tu non conosca già.`, "info");
      return;
    }
    this.mail(
      agent,
      "WAR DIALER",
      `${found.length} portant${found.length === 1 ? "e" : "i"} in ${REGION_NAME[region]}`,
      found.map((n) => `${n.ip} · ${n.name} · ${n.org} (${n.sub ?? KIND_LABEL[n.kind]})`).join("\n") + "\n\nSono sulla tua mappa.",
    );
  }

  discover(agent: Agent, n: WNode) {
    if (agent.discovered.includes(n.id)) return;
    agent.discovered.push(n.id);
    this.bump(agent, "hidden");
    this.touch("agent", agent.id);
    this.mail(agent, "WAR DIALER", `Portante trovata: ${n.ip}`, `${n.name} · ${n.org}\n${n.blurb}\n\nNon è su nessuna mappa. Ora è sulla tua.`);
    this.addFame(agent, 3);
    this.feat(agent, "dialer");
  }

  // ------------------------------------------------------------ contratti: grado, complicazioni, nuovi tipi

  safeRoll(faction: Faction): Mission | null {
    try {
      return faction === "red" ? this.rollRed() : this.rollBlue();
    } catch {
      return null;
    }
  }

  /** Applica la scala globale delle ricompense ai contratti generati (non alle taglie né ai contratti di prova). */
  priced<T extends Mission | null>(m: T): T {
    if (m && !m.postedBy && !m.ownerId) {
      m.reward = Math.round((m.reward * REWARD_SCALE * this.num("rewardMult")) / 10) * 10;
      m.xp = Math.round(m.xp * this.num("xpMult"));
    }
    return m;
  }

  tierOf(node: WNode) {
    const s = node.proxy + node.firewall + node.monitor;
    return s <= 3 ? 0 : s <= 5 ? 1 : s <= 7 ? 2 : s <= 9 ? 3 : 4;
  }

  openTargets() {
    const t = now();
    return [...this.nodes.values()].filter((n) => n.kind !== "relay" && n.kind !== "registry" && n.kind !== "gateway" && n.kind !== "home" && !n.hidden && !n.inner && (n.offlineUntil ?? 0) < t);
  }

  plainFiles(n: WNode) {
    return n.files.filter((f) => !f.deleted && !f.loot && !f.cargo && !f.cache);
  }

  /** Complicazioni casuali sui contratti rossi: più rischio, più paga. */
  addMods(m: Mission) {
    if (Math.random() > 0.28) return;
    const mod = pick(["urgent", "ghost", "guarded"] as MissionMod[]);
    m.mods = [mod];
    if (mod === "urgent") {
      m.expiresAt = now() + 12 * 60_000;
      m.reward = Math.round(m.reward * 1.4);
    }
    if (mod === "guarded") m.reward = Math.round(m.reward * 1.3);
  }

  rollProfile(faction: Faction): Mission | null {
    const civic = this.node("vesper-civic");
    if (!civic) return null;
    const p = pick(PEOPLE);
    const o = p.sex === "f" ? "a" : "o";
    const pool: { text: string; test: (x: Person) => boolean }[] = [
      { text: `è nat${o} nel ${p.born}`, test: (x) => x.born === p.born },
      { text: `è nat${o} a ${p.city}`, test: (x) => x.city === p.city },
      { text: `di mestiere fa: ${p.job}`, test: (x) => x.job === p.job },
      { text: `ha il conto presso ${this.node(p.bank)?.org ?? p.bank}`, test: (x) => x.bank === p.bank },
      { text: p.sex === "f" ? "è una donna" : "è un uomo", test: (x) => x.sex === p.sex },
    ];
    if (p.uni) pool.push({ text: `ha studiato ${p.course} presso ${this.node(p.uni)?.org ?? p.uni}`, test: (x) => x.uni === p.uni && x.course === p.course });
    pool.sort(() => Math.random() - 0.5);
    const clues: typeof pool = [];
    let left = PEOPLE;
    for (const c of pool) {
      clues.push(c);
      left = left.filter(c.test);
      if (left.length === 1 && clues.length >= 3) break;
    }
    if (left.length !== 1) return null;
    const m = this.baseMission(faction, "profile", civic);
    m.answer = p.lid;
    m.recordId = p.id;
    m.title = `Chi è? Fascicolo ${m.id.slice(-4).toUpperCase()}`;
    m.brief = `${cap(pick(faction === "red" ? CLIENTS_RED : CLIENTS_BLUE))} cerca una persona, ma non ne conosce il nome. Si sa che ${clues.map((c) => c.text).join("; ")}. Incrocia anagrafe, casellario, atenei e banche, e consegna il suo ID Reticolo: compare solo in anagrafe.`;
    m.reward = 900 + clues.length * 260;
    m.xp = 130;
    m.tier = 1;
    if (faction === "red") m.requires = this.secRequires(civic);
    else m.clientNodes = ["vesper-civic", "meridia-pd", "halcyon-uni", "karsk-poly", "orsini-bank", "meridia-credit"];
    return m;
  }

  rollTransfer(): Mission | null {
    const banks = [...this.nodes.values()].filter((n) => n.kind === "bank" && n.accounts?.length);
    if (!banks.length) return null;
    const bank = pick(banks);
    const rich = bank.accounts!.filter((a) => a.balance >= 2500);
    if (!rich.length) return null;
    const a = pick(rich);
    const others = banks.flatMap((b) => b.accounts!).filter((x) => x.number !== a.number);
    const b = pick(others);
    const amount = Math.max(200, Math.round(Math.min(a.balance * 0.2, heistCap(this.tierOf(bank)), 400 + Math.random() * 5000) / 50) * 50);
    const m = this.baseMission("red", "transfer", bank);
    m.fromAcct = a.number;
    m.toAcct = b.number;
    m.amount = amount;
    m.title = `Bonifico fantasma: ${fmtCr(amount)}`;
    m.brief = `${cap(pick(CLIENTS_RED))} vuole che ${fmtCr(amount)} passino dal conto di ${personById.get(a.personId)?.name} (presso ${bank.org}) al conto ${b.number}. Il numero del conto di partenza cercalo negli archivi della banca. Paga se alla consegna il movimento non è stato stornato: le banche indagano in fretta.`;
    m.reward += 400 + Math.round(amount * 0.15);
    m.requires = this.secRequires(bank);
    this.addMods(m);
    return m;
  }

  rollPurge(): Mission | null {
    const nodes = this.openTargets().filter((n) => this.tierOf(n) >= 1 && this.plainFiles(n).length >= 2);
    if (!nodes.length) return null;
    const node = pick(nodes);
    const m = this.baseMission("red", "purge", node);
    m.title = `Terra bruciata: ${node.org}`;
    m.brief = `${cap(pick(CLIENTS_RED))} vuole vedere ${node.org} in ginocchio: cancella ogni file dal loro server. Tutti. I backup li rimetteranno in piedi, ma non oggi.`;
    m.reward += 900 + this.plainFiles(node).length * 260;
    m.xp += 80;
    m.minXp = Math.max(m.minXp, 550);
    m.requires = this.secRequires(node);
    this.addMods(m);
    return m;
  }

  rollCourier(): Mission | null {
    const nodes = this.openTargets();
    const src = pick(nodes);
    const dst = pick(nodes.filter((n) => n.id !== src.id));
    const m = this.baseMission("red", "courier", src);
    const size = 12 + Math.floor(Math.random() * 14);
    const fileId = `cargo_${m.id}`;
    src.files.push({
      id: fileId,
      name: `carico_${m.id.slice(-4)}.mnm`,
      size,
      encryption: 0,
      value: 5,
      preview: "Carico sigillato. Dal momento in cui lo copi comincia a degradarsi.",
      deleted: false,
      deletedAt: null,
      honeypot: null,
      cargo: m.id,
    });
    this.touch("node", src.id);
    m.fileId = fileId;
    m.destNodeId = dst.id;
    m.tier = Math.max(this.tierOf(src), this.tierOf(dst));
    m.title = `Corriere: ${src.name} → ${dst.name}`;
    m.brief = `Un carico di ${size} GQ va prelevato da ${src.org} e caricato sul server di ${dst.org}. Ti serve spazio in archivio e un modem decente: dal momento della copia hai ${CARGO_MINUTES} minuti prima che i dati si corrompano. Serve l'accesso admin su entrambi i nodi.`;
    m.reward += 500 + (dst.proxy + dst.firewall + dst.monitor) * 160 + size * 30;
    m.xp += 60;
    m.requires = [...new Set([...this.secRequires(src), ...this.secRequires(dst)])];
    return m;
  }

  /** Uplink: «trova i dettagli finanziari». Si consegna il numero di conto della persona. */
  rollFindata(faction: Faction): Mission | null {
    const p = pick(PEOPLE);
    const bank = this.node(p.bank);
    if (!bank) return null;
    const m = this.baseMission(faction, "findata", bank);
    m.answer = p.account;
    m.recordId = p.id;
    m.title = `I conti di ${p.name}`;
    m.brief = `${cap(pick(faction === "red" ? CLIENTS_RED : CLIENTS_BLUE))} vuole sapere dove tiene i soldi ${p.name} (nat${p.sex === "f" ? "a" : "o"} nel ${p.born}, ${p.job}). Non si sa in quale banca: prova dai suoi archivi, dal suo PC di casa, o chiedi in giro. Consegna il numero di conto.`;
    m.reward = 1200 + this.tierOf(bank) * 300;
    m.xp = 140;
    m.tier = Math.min(2, this.tierOf(bank));
    m.nodeId = "registry"; // il bersaglio non è dichiarato: fa parte del lavoro trovarlo
    m.minXp = 200;
    if (faction === "blue") m.clientNodes = ["orsini-bank", "meridia-credit", "vesper-civic"];
    return m;
  }

  /** Uplink: «traccia un bonifico». Dal conto di partenza si risale a chi ha incassato. */
  rollTraceMoney(faction: Faction): Mission | null {
    const banks = [...this.nodes.values()].filter((n) => n.kind === "bank" && !n.gen && n.accounts?.length);
    if (banks.length < 2) return null;
    const src = pick(banks);
    const a = pick(src.accounts!.filter((x) => x.balance > 1500));
    const dst = pick(banks);
    const b = pick(dst.accounts!.filter((x) => x.number !== a.number && x.personId));
    const holder = personById.get(b.personId);
    if (!holder) return null;
    const amount = 300 + Math.floor(Math.random() * 40) * 50;
    const led: Ledger = { id: uid("ld"), at: now() - Math.floor(Math.random() * 20) * 60_000, from: a.number, to: b.number, amount, actorId: "npc", opId: uid("npc"), reversed: false, toAgentId: null };
    src.ledger = [...(src.ledger ?? []), led].slice(-40);
    this.touch("node", src.id);
    const m = this.baseMission(faction, "tracemoney", src);
    m.answer = holder.name;
    m.ledgerId = led.id;
    m.title = `Segui ${fmtCr(amount)}`;
    m.brief = `Dal conto ${a.number} di ${src.org} sono usciti ${fmtCr(amount)} alle ${hhmm(led.at)}. ${cap(pick(faction === "red" ? CLIENTS_RED : CLIENTS_BLUE))} vuole sapere chi li ha incassati. Leggi il registro dei movimenti, poi cerca l'intestatario del conto di arrivo nella sua banca. Consegna nome e cognome.`;
    m.reward = 1300 + this.tierOf(src) * 300;
    m.xp = 150;
    m.minXp = 200;
    if (faction === "red") m.requires = this.secRequires(src);
    else m.clientNodes = banks.map((x) => x.id);
    return m;
  }

  /** Uplink: «togli di mezzo qualcuno». Precedenti falsi e un mandato: verranno a prenderlo. */
  rollArrest(): Mission | null {
    const pd = this.node("meridia-pd");
    if (!pd) return null;
    const rec = pick(pd.records.filter((r) => r.fields.find((f) => f.key === "status")?.value === "libero"));
    if (!rec) return null;
    const crime = pick(CRIMES.slice(1));
    const m = this.baseMission("red", "arrest", pd);
    m.recordId = rec.id;
    m.value = crime;
    m.title = `Fai arrestare ${rec.name}`;
    m.brief = `${cap(pick(CLIENTS_RED))} vuole ${rec.name} fuori dai giochi. Nel casellario di ${pd.org} dagli dei precedenti per «${crime}» e metti lo stato su «ricercato»: al resto pensa la polizia. Paga se alla consegna il fascicolo è ancora così.`;
    m.reward += 900;
    m.xp += 60;
    m.requires = this.secRequires(pd);
    return m;
  }

  /** Uplink: «manda in tilt un sistema». */
  rollSabotage(): Mission | null {
    const nodes = this.openTargets().filter((n) => this.tierOf(n) >= 1);
    if (!nodes.length) return null;
    const node = pick(nodes);
    const m = this.baseMission("red", "sabotage", node);
    m.title = `Spegni ${node.org}`;
    m.brief = `${cap(pick(CLIENTS_RED))} ha bisogno che ${node.org} resti al buio per qualche minuto: entra da admin e spegni il sistema. Ti butterà fuori anche lui, quindi pulisci il log prima.`;
    m.reward += 700;
    m.xp += 50;
    m.minXp = Math.max(m.minXp, 200);
    m.requires = this.secRequires(node);
    this.addMods(m);
    return m;
  }

  /** Un lavoro su un PC di casa: il cliente dà solo il nome. L'indirizzo va trovato. */
  rollHomeJob(): Mission | null {
    const homes = [...this.nodes.values()].filter((n) => n.kind === "home" && n.files.some((f) => !f.deleted));
    if (!homes.length) return null;
    const node = pick(homes);
    const file = pick(node.files.filter((f) => !f.deleted));
    const who = personById.get(node.homeOf ?? "");
    const m = this.baseMission("red", "copy", node);
    m.fileId = file.id;
    m.title = `Dal PC di ${who?.name ?? "qualcuno"}`;
    m.brief = `${cap(pick(CLIENTS_RED))} vuole ${file.name} dal computer di casa di ${who?.name}. Nessuno lo sorveglia, ma non è su nessun elenco: l'indirizzo lo dà una compagnia telefonica a chi sa chiedere, e la password è di quelle che si indovinano conoscendo la persona.`;
    m.reward = 900 + file.value * 120;
    m.xp = 110;
    m.tier = 1;
    return m;
  }

  eventMission(type: "restore" | "recover" | "reverse" | "restart", node: WNode, fill: (m: Mission) => void) {
    if (Math.random() >= this.num("eventChance")) return;
    const m = this.baseMission("blue", type, node);
    m.requires = type === "reverse" || type === "restore" ? [] : ["patch"];
    m.expiresAt = now() + 35 * 60_000;
    fill(m);
    this.priced(m);
    const dup = [...this.missions.values()].some(
      (x) => x.type === type && (x.status === "open" || x.status === "taken") && x.nodeId === node.id && x.recordId === m.recordId && x.field === m.field && x.fileId === m.fileId && x.ledgerId === m.ledgerId,
    );
    if (dup) return;
    this.missions.set(m.id, m);
    this.touch("mission", m.id);
  }

  upload(agent: Agent, key: string) {
    const { op, target } = this.requireOpSafe(agent);
    if (!op || !target) return { ok: false, error: "non sei collegato" };
    const st = agent.storage.find((x) => x.key === key);
    const m = st?.cargo ? this.missions.get(st.cargo) : null;
    if (!st || !m) return { ok: false, error: "non è un carico" };
    if (m.destNodeId !== target.id) return { ok: false, error: "questo carico va consegnato altrove" };
    if (op.access !== "admin") return { ok: false, error: "serve l'accesso admin" };
    if (!op.bypass.firewall) return { ok: false, error: "il firewall blocca i file: abbattilo prima" };
    if ((st.expiresAt ?? 0) < now()) return { ok: false, error: "il carico si è corrotto: va prelevato di nuovo" };
    if (op.tasks.some((k) => k.state === "run" && k.tool === "upload")) return { ok: false, error: "caricamento già in corso" };
    op.tasks.push({ id: uid("t"), tool: "upload", label: `Carica · ${st.name}`, work: st.size, done: 0, usesModem: true, state: "run", note: null, arg: { key }, finishedAt: null });
    return { ok: true };
  }

  recoverFile(agent: Agent, fileId: string) {
    const { op, target } = this.requireOpSafe(agent);
    if (!op || !target) return { ok: false, error: "non sei collegato" };
    if (agent.faction !== "blue") return { ok: false, error: "i backup li gestiscono i blu" };
    if (op.access !== "admin" && op.access !== "client") return { ok: false, error: "serve l'accesso" };
    if (!agent.tools.patch) return { ok: false, error: "serve il Patch Kit" };
    const file = target.files.find((f) => f.id === fileId && f.deleted);
    if (!file) return { ok: false, error: "nessun file cancellato con quel nome" };
    file.deleted = false;
    file.deletedAt = null;
    this.log(target, `FILE restore ${file.name} by ${agent.handle.toLowerCase()}`, {});
    this.bumpArchivist(agent);
    this.touch("node", target.id);
    return { ok: true, note: `${file.name} ripristinato dal backup` };
  }

  /** Pacchetti di bottino che compaiono sui nodi: chi arriva primo se li prende. */
  dropLoot() {
    const t = now();
    let count = 0;
    for (const n of this.nodes.values()) {
      const before = n.files.length;
      n.files = n.files.filter((f) => !f.spawnedAt || t - f.spawnedAt < 40 * 60_000);
      if (n.files.length !== before) this.touch("node", n.id);
      count += n.files.filter((f) => f.spawnedAt).length;
    }
    if (count >= 4 || Math.random() > 0.3) return;
    const node = pick(this.openTargets());
    const item = this.rollItem([45, 35, 15, 5]);
    node.files.push({
      id: uid("pk"),
      name: `pacchetto_${randomBytes(2).toString("hex")}.pkg`,
      size: 1,
      encryption: Math.min(3, item.rarity),
      value: 3 + item.rarity * 2,
      preview: "Pacchetto sigillato. Qualcuno l'ha lasciato qui per qualcun altro.",
      deleted: false,
      deletedAt: null,
      honeypot: null,
      loot: item,
      spawnedAt: t,
    });
    this.touch("node", node.id);
    if (item.rarity >= 2) this.feed(`Voci dal mercato: su ${node.org} è comparso un pacchetto che non dovrebbe esserci.`, "sys");
  }

  // ------------------------------------------------------------ account

  /** L'account dell'amministratore: un agente come gli altri, fuori dalle classifiche e dai bersagli. */
  createStaff(handle: string, id: string): Agent {
    const agent = this.createAgent(handle, "red", id, true);
    agent.staff = true;
    agent.credits = 0;
    this.touch("agent", agent.id);
    return agent;
  }

  createAgent(handle: string, faction: Faction, forcedId?: string, quiet = false): Agent {
    const id = forcedId ?? uid("ag");
    const tools: Agent["tools"] = faction === "red" ? { breaker: 1, firewall: 1, logdel: 1, tracker: 1, wardialer: 1 } : { forensics: 1, patch: 1, tracker: 1, wardialer: 1 };
    const agent: Agent = {
      id,
      handle,
      faction,
      npc: false,
      skill: 0,
      credits: this.num("startCredits"),
      xp: 0,
      heat: 0,
      gatewayIp: this.freshIp(),
      hw: { cpu: 1, modem: 1, memory: 1, shield: 1, soc: 1 },
      tools,
      storage: [],
      presiding: [],
      stats: { ops: 0, clean: 0, caught: 0, attributions: 0, sabotage: 0, defense: 0 },
      mail: [],
      counterReadyAt: 0,
      createdAt: now(),
      known: [],
      overloadUntil: 0,
      lastSiphonAt: 0,
      ...this.depthBlank(),
    };
    this.agents.set(id, agent);
    this.touch("agent", id);
    this.ensureGateway(agent);
    if (quiet) return agent;
    this.welcome(agent);
    this.feed(`Nuovo handle sul Reticolo: ${handle} (${faction === "red" ? "cellula rossa" : "cellula blu"}).`, "sys");
    this.gstat("signup");
    return agent;
  }

  freshIp() {
    const taken = new Set([...this.agents.values()].map((a) => a.gatewayIp).concat([...this.nodes.values()].map((n) => n.ip)));
    for (;;) {
      const ip = `${20 + Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${1 + Math.floor(Math.random() * 253)}`;
      if (!taken.has(ip)) return ip;
    }
  }

  welcome(agent: Agent) {
    if (agent.faction === "red") {
      this.mail(
        agent,
        "BROKER",
        "Benvenuto nel Reticolo",
        `Il tuo gateway risponde all'indirizzo ${agent.gatewayIp}. Non darlo a nessuno.\n\nRegole del mestiere:\n1. Dalla MAPPA scegli i relay da attraversare prima del bersaglio. Ogni hop dà al monitor più strada da risalire.\n2. Nel nodo: abbatti proxy e firewall, forza la password, fai il lavoro.\n3. Prima di staccare, cancella dal log le righe con l'IP da cui sei arrivato. Chi le trova risale fino a te.\n4. Consegna il contratto dalla BACHECA.\n\nHo messo in bacheca un lavoro di prova per te.`,
      );
      this.personalMission(agent, {
        type: "copy",
        nodeId: "halcyon-uni",
        fileId: "syllabus",
        title: "Prova di collegamento",
        brief: "Copia syllabus.dat dall'Università di Halcyon. Rimbalza su almeno un relay e pulisci il log prima di staccare. La password dell'ateneo è una parola da dizionario: o la forzi, o la indovini.",
        reward: 700,
        xp: 140,
        requires: ["firewall"],
      });
    } else {
      this.mail(
        agent,
        "CERT DEL RETICOLO",
        "Accreditamento SOC",
        `Il tuo terminale è registrato all'indirizzo ${agent.gatewayIp}.\n\nCome lavora un blu:\n1. I contratti dei clienti ti danno credenziali sul nodo: niente password e niente trace.\n2. Nelle CACCE leggi i log del nodo violato e segui gli IP d'origine, relay dopo relay, fino al gateway del colpevole. Poi consegna quell'IP.\n3. Puoi PRESIDIARE un nodo dalla mappa: se un rosso ci entra mentre sei collegato, lo vedi e puoi lanciare un contro-trace.\n4. Il Patch Kit rinforza i nodi e bonifica i relay avvelenati.\n\nIn bacheca trovi un primo incarico.`,
      );
      this.personalMission(agent, {
        type: "patch",
        nodeId: "lumen-news",
        fileId: null,
        title: "Primo turno",
        brief: "Lumen Newsroom teme un'intrusione. Collegati con le credenziali cliente e lancia il Patch Kit in modalità rinforzo.",
        reward: 600,
        xp: 120,
        requires: ["patch"],
      });
    }
  }

  // ------------------------------------------------------------ utilità

  mail(agent: Agent, from: string, subject: string, body: string) {
    agent.mail.unshift({ id: uid("m"), from, subject, body, at: now(), unread: true });
    agent.mail = agent.mail.slice(0, 40);
    this.touch("agent", agent.id);
    this.dirty.add(agent.id);
    if (!agent.npc) this.out.toast(agent.id, `Posta: ${subject}`, "info");
  }

  feed(text: string, tone: FeedItem["tone"]) {
    this.meta.feed.unshift({ id: uid("f"), at: now(), text, tone });
    this.meta.feed = this.meta.feed.slice(0, 60);
    this.touch("meta", "world");
    for (const id of this.online) this.dirty.add(id);
  }

  addHeat(agent: Agent, delta: number, reason: string) {
    if (delta > 0) {
      const mult = this.num("heatMult");
      if (mult <= 0) return;
      delta = Math.max(1, Math.round(delta * (1 + this.chip(agent, "heat") / 100) * mult * (1 - this.spec(agent, "sabotaggio") * 0.015)));
    }
    const was = agent.heat;
    agent.heat = clamp(agent.heat + delta, 0, 100);
    if (was < 100 && agent.heat >= 100 && !agent.npc) this.bump(agent, "heatmax");
    this.touch("agent", agent.id);
    this.dirty.add(agent.id);
    if (delta > 0 && !agent.npc) this.out.toast(agent.id, `Calore +${delta}: ${reason}`, "warn");
    if (agent.heat >= HEAT_BURN) this.arrest(agent, "troppa attenzione addosso: la Guardia del Reticolo ha chiuso il cerchio");
  }

  node(id: string) {
    return this.nodes.get(id) ?? null;
  }

  nodeByIp(ip: string) {
    for (const n of this.nodes.values()) if (n.ip === ip) return n;
    return null;
  }

  agentByIp(ip: string) {
    for (const a of this.agents.values()) if (a.gatewayIp === ip) return a;
    return null;
  }

  effSec(n: WNode) {
    const t = now();
    const bonus = n.patch && n.patch.until > t ? n.patch.level : 0;
    return { proxy: Math.min(3, n.proxy + (n.proxy > 0 || bonus > 1 ? bonus : 0)), firewall: Math.min(3, n.firewall + bonus), monitor: n.monitor };
  }

  /**
   * Quanto è attenta la sorveglianza adesso: moltiplica il tempo di risalita del trace.
   * Notte e blackout danno respiro, l'allerta lo toglie; il livello del monitor non cambia mai.
   */
  watch(n: WNode) {
    const t = now();
    let f = 1;
    if (KIND_PROFILE[n.kind].night && isNight(n.x, t)) f *= WATCH_NIGHT;
    f *= (this.lifeWatch?.(n) ?? 1) * (this.orgWatch?.(n) ?? 1);
    if ((this.meta.blackout?.[regionAt(n.x, n.y)] ?? 0) > t) f *= WATCH_BLACKOUT;
    if ((n.alertUntil ?? 0) > t) f *= WATCH_ALERT;
    return f;
  }

  /** Mette un nodo sulla mappa di un agente. */
  reveal(agent: Agent, nodeId: string | null | undefined) {
    if (!nodeId || agent.npc || agent.knownNodes.includes(nodeId)) return false;
    const n = this.node(nodeId);
    if (!n || n.kind === "gateway" || n.hidden) return false;
    agent.knownNodes.push(nodeId);
    this.bump(agent, "seen");
    this.touch("agent", agent.id);
    return true;
  }

  log(n: WNode, text: string, opts: { opId?: string | null; actorId?: string | null; fromIp?: string | null } = {}) {
    const t = now();
    // i sensori attivi copiano ogni riga che ha un'origine: quella copia non si cancella e non si falsifica
    const dark = (this.meta.blackout?.[regionAt(n.x, n.y)] ?? 0) > t;
    const live = opts.fromIp && !dark ? (n.sensors ?? []).filter((x) => x.until > t && x.ownerId !== opts.actorId) : [];
    for (const sx of live) sx.lines = [...sx.lines, { at: t, text: text.replace("{FROM}", opts.fromIp ?? "?") }].slice(-30);
    n.logs.push({
      id: uid("l"),
      at: t,
      text,
      opId: opts.opId ?? null,
      actorId: opts.actorId ?? null,
      fromIp: opts.fromIp ?? null,
      removed: null,
      removedAt: null,
      forged: false,
      recovered: false,
      ...(live.length ? { mirrors: live.map((x) => x.ownerId), origIp: opts.fromIp ?? null } : {}),
    });
    if (n.logs.length > 80) n.logs.splice(0, n.logs.length - 80);
    n.activity = Math.min(1, n.activity + 0.25);
    this.touch("node", n.id);
  }

  noise(n: WNode) {
    const lines = [
      `SYS heartbeat seq=${100 + Math.floor(Math.random() * 900)}`,
      "SYS clock sync stratum=2",
      `NET carrier drift 0.0${Math.floor(Math.random() * 9)}% iface=mgmt`,
      "AUTH fail user=guest reason=lockout",
      `CRON rotate /var/spool/${pick(["mail", "audit", "print"])}`,
      `NET route refresh peers=${2 + Math.floor(Math.random() * 9)}`,
    ];
    this.log(n, pick(lines));
  }

  // ------------------------------------------------------------ contratti

  personalMission(
    agent: Agent,
    m: { type: MissionType; nodeId: string; fileId: string | null; title: string; brief: string; reward: number; xp: number; requires: ToolId[] },
  ) {
    const mission: Mission = {
      id: uid("ms"),
      faction: agent.faction,
      type: m.type,
      title: m.title,
      brief: m.brief,
      nodeId: m.nodeId,
      fileId: m.fileId,
      recordId: null,
      field: null,
      value: null,
      targetAgentId: null,
      incident: null,
      reward: m.reward,
      xp: m.xp,
      minXp: 0,
      requires: m.requires,
      status: "open",
      ownerId: agent.id,
      takenBy: null,
      createdAt: now(),
      expiresAt: now() + 7 * 24 * 3600_000,
      clientAccess: agent.faction === "blue",
    };
    this.missions.set(mission.id, mission);
    this.touch("mission", mission.id);
  }

  fillBoard() {
    for (const faction of ["red", "blue"] as Faction[]) {
      const open = [...this.missions.values()].filter((m) => m.faction === faction && m.status === "open" && !m.ownerId && !m.postedBy).length;
      for (let i = open, tries = 0; i < this.num("boardSize") && tries < 20; tries += 1) {
        const m = this.priced(this.safeRoll(faction));
        if (!m) break;
        // niente doppioni: stesso tipo sullo stesso nodo già in bacheca
        const dup = [...this.missions.values()].some((x) => x.status === "open" && !x.ownerId && x.type === m.type && x.nodeId === m.nodeId);
        if (dup) continue;
        i += 1;
        this.missions.set(m.id, m);
        this.touch("mission", m.id);
      }
      // chi è appena arrivato non vede i gradi alti: in bacheca ci sono sempre almeno quattro lavori alla sua portata
      const easy = () => [...this.missions.values()].filter((m) => m.faction === faction && m.status === "open" && !m.ownerId && !m.postedBy && (m.tier ?? 0) <= 1 && !this.node(m.nodeId)?.hidden).length;
      for (let tries = 0; easy() < 4 && tries < 40; tries += 1) {
        const m = this.priced(this.safeRoll(faction));
        if (!m || (m.tier ?? 0) > 1 || this.node(m.nodeId)?.hidden) {
          // i trasporti scartati lasciano un carico sul nodo: va tolto
          if (m?.type === "courier") {
            const src = this.node(m.nodeId);
            if (src) src.files = src.files.filter((f) => f.cargo !== m.id);
          }
          continue;
        }
        this.missions.set(m.id, m);
        this.touch("mission", m.id);
      }
    }
  }

  baseMission(faction: Faction, type: MissionType, node: WNode): Mission {
    const sec = node.proxy + node.firewall + node.monitor;
    return {
      id: uid("ms"),
      faction,
      type,
      title: "",
      brief: "",
      nodeId: node.id,
      fileId: null,
      recordId: null,
      field: null,
      value: null,
      targetAgentId: null,
      incident: null,
      // una barriera biometrica è un giro in più: il cliente lo sa
      reward: Math.round((450 + sec * 260) * (this.bioKind?.(node) ? 1.25 : 1)),
      xp: 60 + sec * 35,
      minXp: sec <= 3 ? 0 : sec <= 5 ? 200 : sec <= 8 ? 550 : 1100,
      requires: [],
      status: "open",
      ownerId: null,
      takenBy: null,
      createdAt: now(),
      expiresAt: now() + 50 * 60_000,
      clientAccess: faction === "blue",
      tier: this.tierOf(node),
      mods: [],
    };
  }

  /** Un'operazione a tappe presa dai copioni di server/scenarios.ts. */
  rollSceneMission(faction: Faction, only?: string): Mission | null {
    const targets = this.openTargets();
    const relays = [...this.nodes.values()].filter((n) => n.kind === "relay");
    const homes = [...this.nodes.values()].filter((n) => n.kind === "home");
    const snode = (n: WNode): SNode => ({ id: n.id, org: n.org, name: n.name, kind: n.kind, sub: n.sub, city: n.city, tier: this.tierOf(n), bio: this.bioKind?.(n) ?? undefined, files: this.plainFiles(n).map((f) => ({ id: f.id, name: f.name })), inner: (() => { const i = [...this.nodes.values()].find((x) => x.inner === n.id); return i ? { id: i.id, org: i.org } : undefined; })() });
    const sc = rollScene(faction, {
      pick,
      client: cap(pick(faction === "red" ? CLIENTS_RED : CLIENTS_BLUE)),
      any: (minTier = 0) => targets.filter((n) => this.tierOf(n) >= minTier).map(snode),
      nodes: (kind, minTier = 0, sub) => (kind === "relay" ? relays : kind === "home" ? homes : targets).filter((n) => n.kind === kind && this.tierOf(n) >= minTier && (!sub || n.sub === sub)).map(snode),
    }, only);
    const node = sc ? this.node(sc.nodeId) : null;
    if (!sc || !node) return null;
    const m = this.baseMission(faction, sc.type, node);
    m.title = sc.title;
    m.brief = sc.brief;
    m.scene = sc.id;
    m.objectives = sc.objectives;
    m.reward += sc.reward;
    m.xp += sc.xp;
    m.minXp = sc.minXp;
    if (sc.tier !== undefined) m.tier = sc.tier;
    m.limitMin = sc.limitMin;
    m.clientNodes = sc.clientNodes;
    m.expiresAt = now() + 90 * 60_000;
    const req = new Set<ToolId>(sc.requires ?? []);
    for (const o of sc.objectives) {
      const on = o.nodeId ? this.node(o.nodeId) : null;
      if (on && faction === "red") for (const t of this.secRequires(on)) req.add(t);
    }
    m.requires = [...req];
    return m;
  }

  secRequires(node: WNode): ToolId[] {
    const req: ToolId[] = [];
    if (node.proxy > 0) req.push("proxy");
    if (node.firewall > 0) req.push("firewall");
    return req;
  }

  rollRed(): Mission | null {
    // un contratto su dieci, per chi li ha scoperti, riguarda i nodi nascosti
    const hidden = [...this.nodes.values()].filter((n) => n.hidden);
    const targets = this.openTargets();
    const relays = [...this.nodes.values()].filter((n) => n.kind === "relay");
    const client = pick(CLIENTS_RED);
    if (Math.random() < 0.3) return this.rollSceneMission("red");
    const kind = Math.random();
    if (kind < 0.1) return this.rollProfile("red");
    if (kind < 0.18) return this.rollTransfer();
    if (kind < 0.23) return this.rollPurge();
    if (kind < 0.3) return this.rollCourier();
    if (kind < 0.35) return this.rollFindata("red");
    if (kind < 0.4) return this.rollTraceMoney("red");
    if (kind < 0.45) return this.rollArrest();
    if (kind < 0.5) return this.rollSabotage();
    if (kind < 0.55) return this.rollHomeJob();
    if (kind < 0.42 && hidden.length) {
      const node = pick(hidden);
      const file = pick(this.plainFiles(node));
      const m = this.baseMission("red", "copy", node);
      m.fileId = file.id;
      m.title = `Estrai ${file.name}`;
      m.brief = `${cap(client)} sa che esisti, e sa che sai dove si trova ${node.org}. Vuole ${file.name}. Non chiede come.`;
      m.reward += file.value * 260;
      m.minXp = 550;
      m.requires = [...this.secRequires(node), ...(file.encryption ? (["decrypt"] as ToolId[]) : [])];
      return m;
    }
    const roll = Math.random();
    if (roll < 0.34) {
      const node = pick(targets.filter((n) => this.plainFiles(n).length));
      const file = pick(this.plainFiles(node));
      const m = this.baseMission("red", "copy", node);
      m.fileId = file.id;
      m.title = `Estrai ${file.name}`;
      m.brief = `${cap(client)} vuole una copia di ${file.name} da ${node.org}.${file.encryption ? ` Il file è cifrato (livello ${file.encryption}): decifralo sul posto prima di copiarlo.` : ""} Consegna dalla bacheca quando è nel tuo archivio.`;
      m.reward += file.value * 140;
      m.requires = [...this.secRequires(node), ...(file.encryption ? (["decrypt"] as ToolId[]) : [])];
      this.addMods(m);
      return m;
    }
    if (roll < 0.52) {
      const node = pick(targets.filter((n) => this.plainFiles(n).length));
      const file = pick(this.plainFiles(node));
      const m = this.baseMission("red", "wipe", node);
      m.fileId = file.id;
      m.title = `Cancella ${file.name}`;
      m.brief = `${cap(client)} vuole che ${file.name} sparisca dai server di ${node.org}. Non serve leggerlo, serve che non ci sia più.`;
      m.reward += file.value * 90;
      m.requires = this.secRequires(node);
      return m;
    }
    if (roll < 0.74) {
      const node = pick(targets.filter((n) => n.records.length));
      const rec = pick(node.records);
      const field = pick(rec.fields.filter((f) => f.options.length > 1));
      const value = pick(field.options.filter((o) => o !== field.value));
      const m = this.baseMission("red", "alter", node);
      m.recordId = rec.id;
      m.field = field.key;
      m.value = value;
      // il perché cambia a seconda dell'archivio: è il cuore dei vecchi lavori da hacker
      const why: Record<string, string> = {
        civil: value === "deceduto" ? `${rec.name} deve risultare mort${personById.get(rec.id)?.sex === "f" ? "a" : "o"}: c'è un'assicurazione che aspetta` : `${rec.name} deve tornare fra i vivi, almeno sulla carta`,
        residence: `qualcuno ha bisogno che ${rec.name} risulti residente altrove`,
        clearance: `${rec.name} deve superare un controllo che non supererebbe`,
        record: value === "nessuno" ? `la fedina di ${rec.name} deve tornare pulita` : `${rec.name} deve avere un passato che non ha`,
        status: value === "ricercato" ? `${rec.name} deve ritrovarsi la polizia alla porta` : `lo stato di ${rec.name} va sistemato prima dell'udienza`,
        degree: `${rec.name} ha un colloquio domani e un titolo che non ha mai preso`,
        grade: `la media di ${rec.name} non basta per la borsa di studio`,
      };
      m.title = `Riscrivi ${rec.name}`;
      m.brief = `${cap(client)}: ${why[field.key] ?? `il fascicolo di ${rec.name} va corretto`}. Nell'archivio di ${node.org} cerca ${rec.name} e porta «${field.label}» a «${value}». Paga solo se il dato è ancora così alla consegna.`;
      m.reward += 500;
      m.requires = this.secRequires(node);
      this.addMods(m);
      return m;
    }
    if (roll < 0.88) {
      const node = pick(relays);
      const m = this.baseMission("red", "backdoor", node);
      m.title = `Avvelena ${node.name}`;
      m.brief = `Installa un backdoor su ${node.name} (${node.org}). Chi ci rimbalza dopo di te verrà tracciato prima, e il suo indirizzo arriverà a te. Serve l'accesso admin al relay.`;
      m.reward = 1400;
      m.xp = 160;
      m.minXp = 200;
      m.requires = ["bdkit"];
      return m;
    }
    const others = [...this.agents.values()].filter((a) => a.heat < 90);
    if (others.length < 2) return null;
    const victim = pick(others);
    const node = pick(targets.filter((n) => n.monitor <= 3));
    const m = this.baseMission("red", "frame", node);
    m.targetAgentId = victim.id;
    m.title = `Incastra ${victim.handle}`;
    m.brief = `${cap(client)} vuole ${victim.handle} sotto inchiesta. Entra in ${node.org} e lascia nel log un accesso che sembri arrivare dal suo gateway (Log Deleter v3, falsifica l'origine). Il suo indirizzo lo trovi al Registro, a pagamento. Nessuna riga deve puntare a te.`;
    m.reward += 1600;
    m.xp += 120;
    m.minXp = Math.max(m.minXp, 550);
    m.requires = [...this.secRequires(node), "logdel"];
    return m;
  }

  rollBlue(): Mission | null {
    const targets = this.openTargets();
    const client = pick(CLIENTS_BLUE);
    // cacce, ripristini, recuperi e storni nascono da quello che fanno i rossi; qui i lavori ordinari
    if (Math.random() < 0.3) return this.rollSceneMission("blue");
    const kindB = Math.random();
    if (kindB < 0.2) return this.rollProfile("blue");
    if (kindB < 0.28) return this.rollFindata("blue");
    if (kindB < 0.36) return this.rollTraceMoney("blue");
    const roll = Math.random();
    if (roll < 0.4) {
      const node = pick(targets);
      const m = this.baseMission("blue", "patch", node);
      m.title = `Rinforza ${node.org}`;
      m.brief = `${cap(client)} chiede di alzare la sicurezza di ${node.name}. Collegati con le credenziali cliente e lancia il Patch Kit in modalità rinforzo.`;
      m.reward = 700 + this.tierOf(node) * 330;
      m.xp = 80 + this.tierOf(node) * 30;
      m.requires = ["patch"];
      return m;
    }
    if (roll < 0.7) {
      const poisoned = [...this.nodes.values()].filter((n) => n.kind === "relay" && n.backdoors.length);
      const node = poisoned.length ? pick(poisoned) : pick([...this.nodes.values()].filter((n) => n.kind === "relay"));
      const m = this.baseMission("blue", "seal", node);
      m.title = `Bonifica ${node.name}`;
      m.brief = `Ci sono segnalazioni di backdoor su ${node.name}. Collegati con le credenziali del gestore e lancia il Patch Kit in modalità bonifica. Il relay deve risultare pulito alla consegna.`;
      m.reward = 750 + node.backdoors.length * 350;
      m.xp = 100 + node.backdoors.length * 20;
      m.requires = ["patch"];
      return m;
    }
    const node = pick(targets.filter((n) => this.plainFiles(n).some((f) => !f.honeypot)));
    const file = pick(this.plainFiles(node).filter((f) => !f.honeypot));
    const m = this.baseMission("blue", "honeypot", node);
    m.fileId = file.id;
    m.title = `Trappola su ${file.name}`;
    m.brief = `${cap(client)} sa che ${file.name} su ${node.org} fa gola. Trasformalo in honeypot: chi lo copia ti consegna il proprio indirizzo.`;
    m.reward = 900 + this.tierOf(node) * 300 + file.value * 60;
    m.xp = 110 + this.tierOf(node) * 25;
    m.minXp = 200;
    m.requires = ["honey"];
    return m;
  }

  registerIncident(op: { id: string; agentId: string; nodeId: string; touched: boolean; stolen?: number; grave?: boolean }) {
    const node = this.node(op.nodeId);
    const actor = this.agents.get(op.agentId);
    // banche, polizia e militari indagano in fretta; chi è già ricercato ha gli inquirenti addosso
    let delay = (op.grave || node?.kind === "bank" || node?.kind === "law" || node?.kind === "mil" ? SWEEP_DELAY / 2 : SWEEP_DELAY) * this.num("sweepMult");
    if (actor && warrantLevel(actor.charges) >= 2) delay /= 2;
    // di notte e nel fine settimana in ufficio non c'è nessuno che apra la pratica
    if (node) delay *= this.lifeSweep?.(node) ?? 1;
    const inc: Incident = { opId: op.id, actorId: op.agentId, nodeId: op.nodeId, at: now(), sweepAt: now() + delay, resolved: false, touched: op.touched, grave: Boolean(op.grave) };
    this.incidents.set(inc.opId, inc);
    this.touch("incident", inc.opId);
    for (const a of this.agents.values()) for (const p of a.pending) if (p.opId === op.id) p.clearAt = inc.sweepAt;
    if (node && op.touched && node.kind !== "gateway" && node.kind !== "relay" && node.kind !== "home") this.react(node, actor ?? null);
    if (node?.kind === "bank") {
      for (const led of node.ledger ?? []) {
        if (led.opId !== op.id || led.reversed || !chance(0.7)) continue;
        this.eventMission("reverse", node, (m) => {
          m.ledgerId = led.id;
          m.title = `Storno: ${fmtCr(led.amount)} da ${node.org}`;
          m.brief = `${node.org} segnala un bonifico sospetto di ${fmtCr(led.amount)} dal conto ${led.from} alle ${hhmm(led.at)}. Collegati con le credenziali cliente e stornalo dal registro dei movimenti, prima che il denaro sparisca.`;
          m.reward = 600 + Math.round(led.amount * 0.1);
          m.xp = 120;
          m.expiresAt = now() + 12 * 60_000;
        });
      }
    }
    const victim = node ? this.gatewayOwner(node) : null;
    if (victim && op.touched && !victim.npc) {
      const m = this.baseMission(victim.faction, "hunt", node!);
      m.incident = { opId: op.id, nodeId: node!.id };
      m.ownerId = victim.id;
      m.clientAccess = false;
      m.minXp = 0;
      m.title = "Rivalsa: chi è entrato nel tuo gateway";
      m.brief = `Qualcuno è entrato nel tuo gateway alle ${hhmm(inc.at)}. Leggi il log nella scheda Gateway, segui l'IP d'origine relay dopo relay e consegna l'indirizzo del colpevole: la Guardia del Reticolo lo multerà e l'assicurazione ti rimborserà.`;
      m.reward = 400 + (op.stolen ?? 0);
      m.xp = 120;
      m.expiresAt = now() + 40 * 60_000;
      m.requires = [];
      this.missions.set(m.id, m);
      this.touch("mission", m.id);
      this.mail(victim, "GATEWAY", "Intrusione nel tuo gateway", `Il tuo gateway è stato violato.${op.stolen ? ` Mancano ${fmtCr(op.stolen)}.` : ""} Il log è nella scheda Gateway; in bacheca trovi il contratto di rivalsa.`);
      return;
    }
    if (!node || !op.touched || node.kind === "relay" || node.kind === "gateway") return;
    if (chance(0.8)) {
      const m = this.baseMission("blue", "hunt", node);
      m.incident = { opId: op.id, nodeId: node.id };
      m.title = `Caccia: intrusione a ${node.org}`;
      m.brief = `${node.org} ha registrato un'intrusione alle ${hhmm(inc.at)}. Collegati con le credenziali cliente, leggi il log, segui l'IP d'origine relay dopo relay e consegna l'indirizzo del gateway colpevole. Se la catena è spezzata, Forensics può ricucirla.`;
      m.reward = 700 + (node.proxy + node.firewall + node.monitor) * 220;
      m.xp = 110 + node.monitor * 30;
      m.expiresAt = now() + 40 * 60_000;
      m.requires = [];
      this.priced(m);
      this.missions.set(m.id, m);
      this.touch("mission", m.id);
    }
  }

  /** Dopo un'intrusione che lascia danni il nodo reagisce: allerta, password nuova, e prima o poi una ritorsione. */
  react(node: WNode, actor: Agent | null) {
    node.alertUntil = now() + ALERT_MINUTES * 60_000;
    // i nodi dei contratti di prova e quelli con le password dei film restano come sono
    if (node.gen) node.password = node.password.length > 10 ? this.gatewayPassword(5) : pick(DICTIONARY.filter((w) => w !== node.password));
    this.touch("node", node.id);
    if (!actor || actor.npc) return;
    const n = (actor.grudges[node.org] = (actor.grudges[node.org] ?? 0) + 1);
    this.touch("agent", actor.id);
    // alla terza volta un'organizzazione con dei mezzi mette una taglia su chi la tormenta
    if (n !== 3 || !["corp", "bank", "lab", "telco", "util", "mil"].includes(node.kind)) return;
    actor.grudges[node.org] = 0;
    const m = this.baseMission("blue", "locate", this.node("registry")!);
    m.targetAgentId = actor.id;
    m.tier = 1;
    m.minXp = 0;
    m.clientAccess = false;
    m.title = `${node.org} vuole un nome`;
    m.brief = `${node.org} è stata colpita tre volte dallo stesso handle: «${actor.handle}». Paga chi consegna l'indirizzo del suo gateway: lo passerà ai suoi legali.`;
    m.reward = 1800 + this.tierOf(node) * 500;
    m.xp = 150;
    m.expiresAt = now() + 60 * 60_000;
    this.priced(m);
    this.missions.set(m.id, m);
    this.touch("mission", m.id);
    this.mail(actor, "BROKER", `${node.org} ti cerca`, `Hai esagerato con ${node.org}: hanno messo una taglia sul tuo indirizzo. Se qualcuno lo consegna, ti arriva una denuncia. Cambia aria per un po'.`);
  }

  // ------------------------------------------------------------ comandi di sistema

  sysList(op: Op, target: WNode): SysCommand[] {
    if (target.kind === "gateway" || target.kind === "relay" || target.kind === "registry") return [];
    const ids = [...KIND_PROFILE[target.kind].sys, ...(target.kind === "home" ? [] : ["shutdown"])];
    const t = now();
    return ids.map((id) => {
      const left = (target.cooldown?.[id] ?? 0) - t;
      return {
        id,
        ...SYS_INFO[id]!,
        blocked: op.access !== "admin" ? "serve l'accesso admin" : !op.bypass.firewall ? "il firewall blocca i comandi di sistema" : left > 0 ? `di nuovo disponibile fra ${Math.ceil(left / 60_000)} min` : null,
      };
    });
  }

  sys(agent: Agent, cmd: string, p: Record<string, unknown>) {
    const { op, target } = this.requireOpSafe(agent);
    if (!op || !target) return { ok: false, error: "non sei collegato" };
    const entry = this.sysList(op, target).find((c) => c.id === cmd);
    if (!entry) return { ok: false, error: "questo sistema non ha quel comando" };
    if (entry.blocked) return { ok: false, error: entry.blocked };
    if ((cmd === "blackout" && !this.on("sysBlackout")) || (cmd === "shutdown" && !this.on("sysShutdown"))) return { ok: false, error: "comando disattivato dall'amministrazione del Reticolo" };
    const from = this.prevIp(op, agent);
    const cool = (min: number) => {
      target.cooldown = { ...(target.cooldown ?? {}), [cmd]: now() + min * 60_000 };
    };
    const who = (): Agent | null => {
      const h = String(p.handle ?? "").trim().toLowerCase();
      return h ? ([...this.agents.values()].find((a) => a.handle.toLowerCase() === h) ?? null) : null;
    };
    this.noisy(op, agent, target);
    let note = "";
    let data: unknown;
    switch (cmd) {
      case "cash": {
        const amount = Math.round((SHOP_CASH[0] + Math.floor(Math.random() * (SHOP_CASH[1] - SHOP_CASH[0]))) * (this.lifeCash?.(target) ?? 1));
        agent.credits += amount;
        agent.ethics = clamp(agent.ethics - 1, -100, 100);
        cool(30);
        this.log(target, `POS refund ${amount} CR issued from {FROM}`, { opId: op.id, actorId: agent.id, fromIp: from });
        note = `+${fmtCr(amount)} dalla cassa`;
        break;
      }
      case "publish": {
        const a = who();
        if (!a) return { ok: false, error: "handle sconosciuto" };
        const up = p.tone !== "down";
        const d = a.id === agent.id ? 10 : 15;
        this.addFame(a, up ? d : -d);
        cool(20);
        this.log(target, `CMS article published about ${a.handle.toLowerCase()} from {FROM}`, { opId: op.id, actorId: agent.id, fromIp: from });
        this.feed(up ? `${target.org.toUpperCase()} · «${a.handle}, il fantasma che nessuno riesce a prendere»` : `${target.org.toUpperCase()} · «${a.handle}: un dilettante sopravvalutato, dicono le nostre fonti»`, "sys");
        if (a.id !== agent.id && !a.npc) this.mail(a, target.org, "Sei in prima pagina", up ? "Qualcuno ha fatto pubblicare un pezzo che ti dipinge come una leggenda. Fama +15." : "Qualcuno ha fatto pubblicare un pezzo che ti fa a pezzi. Fama −15.");
        note = `articolo pubblicato: fama di ${a.handle} ${up ? "+" : "−"}${d}`;
        break;
      }
      case "tap": {
        const q = String(p.handle ?? "").trim().toLowerCase();
        if (!q) return { ok: false, error: "scrivi un handle o il nome di un cittadino" };
        const a = who();
        const person = a ? null : PEOPLE.find((x) => x.name.toLowerCase() === q || x.name.toLowerCase().includes(q));
        if (a) {
          this.learn(agent, a.gatewayIp, a.handle, `intercettato da ${target.org}`);
          data = { lines: [`Utenza «${a.handle}»: gateway ${a.gatewayIp}, chiama da ${gatewayPos(a.gatewayIp).city}.`] };
        } else if (person) {
          const homeId = WORLD.home[person.id];
          const home = homeId ? this.node(homeId) : null;
          const work = WORLD.employer[person.id] ? this.node(WORLD.employer[person.id]!) : null;
          if (home) this.reveal(agent, home.id);
          if (work) this.reveal(agent, work.id);
          data = {
            lines: [
              home ? `${person.name}: linea di casa ${home.ip} (${home.city}). È sulla tua mappa.` : `${person.name}: nessuna linea dati intestata.`,
              work ? `Chiama spesso ${work.org} (${work.ip}): ci lavora.` : "Nessun datore di lavoro fra le chiamate ricorrenti.",
            ],
          };
        } else return { ok: false, error: "nessuna utenza con quel nome" };
        this.log(target, `LINE lookup ${q} from {FROM}`, { opId: op.id, actorId: agent.id, fromIp: from });
        note = "utenza trovata";
        break;
      }
      case "reroute":
        agent.rerouteUntil = now() + 30 * 60_000;
        cool(10);
        this.log(target, "SWITCH route table edited from {FROM}", { opId: op.id, actorId: agent.id, fromIp: from });
        note = "linea deviata per 30 minuti";
        break;
      case "blackout": {
        const region = regionAt(target.x, target.y);
        this.meta.blackout = { ...(this.meta.blackout ?? {}), [region]: now() + 5 * 60_000 };
        this.touch("meta", "world");
        cool(30);
        op.grave = true;
        agent.ethics = clamp(agent.ethics - 8, -100, 100);
        this.addFame(agent, 5);
        this.log(target, "SCADA breaker trip commanded from {FROM}", { opId: op.id, actorId: agent.id, fromIp: from });
        this.feed(`LUMEN NEWS · Blackout in ${REGION_NAME[region]}: ${target.org} parla di «guasto tecnico». Monitor e sensori al buio per cinque minuti.`, "red");
        note = `blackout in ${REGION_NAME[region]} per 5 minuti`;
        break;
      }
      case "warrant": {
        const a = who();
        if (!a || a.npc) return { ok: false, error: "handle sconosciuto" };
        if (a.id !== agent.id && a.xp < GATEWAY_PROTECTION_XP) return { ok: false, error: "quell'handle è appena arrivato: il giudice non firma" };
        cool(30);
        agent.ethics = clamp(agent.ethics - 6, -100, 100);
        agent.stats.sabotage += 1;
        this.log(target, `WARRANT issued for alias ${a.handle.toLowerCase()} from {FROM}`, { opId: op.id, actorId: agent.id, fromIp: from });
        this.charge(a, "mandato emesso d'ufficio", 2, target.org);
        note = `mandato emesso a carico di ${a.handle}`;
        break;
      }
      case "shutdown": {
        const mins = FAST ? 0.4 : SHUTDOWN_MINUTES;
        target.offlineUntil = now() + mins * 60_000;
        target.offlineBy = agent.id;
        cool(40);
        op.grave = true;
        agent.ethics = clamp(agent.ethics - 6, -100, 100);
        this.log(target, "SYS shutdown -h now from {FROM}", { opId: op.id, actorId: agent.id, fromIp: from });
        this.feed(`${target.org} è fuori linea.`, "red");
        this.eventMission("restart", target, (m) => {
          m.title = `Riavvio: ${target.org}`;
          m.brief = `${target.org} è stata spenta da un intruso. Collegati con le credenziali cliente e rimetti in linea il sistema con il Patch Kit, prima che torni su da solo.`;
          m.reward = 700 + this.tierOf(target) * 250;
          m.xp = 110;
          m.expiresAt = now() + 15 * 60_000;
        });
        op.touched = true;
        this.touch("node", target.id);
        this.touch("agent", agent.id);
        // spegnere il sistema butta fuori tutti, te compreso
        for (const o of [...this.ops.values()]) {
          if (o.chain.at(-1) !== target.id) continue;
          if (o.agentId !== agent.id) this.out.toast(o.agentId, `${target.org} si è spento: connessione caduta.`, "warn");
          this.endOp(o, "clean");
        }
        return { ok: true, note: `${target.org} è fuori linea` };
      }
    }
    op.touched = true;
    this.touch("node", target.id);
    this.touch("agent", agent.id);
    return { ok: true, note, data };
  }

  /** Un blu con le credenziali del cliente rimette in linea un sistema spento. */
  restart(agent: Agent) {
    const { op, target } = this.requireOpSafe(agent);
    if (!op || !target) return { ok: false, error: "non sei collegato" };
    if (op.access !== "client" && op.access !== "admin") return { ok: false, error: "serve l'accesso" };
    if (!agent.tools.patch) return { ok: false, error: "serve il Patch Kit" };
    if ((target.offlineUntil ?? 0) < now()) return { ok: false, error: "il sistema è già in linea" };
    target.offlineUntil = 0;
    target.alertUntil = now() + ALERT_MINUTES * 60_000;
    this.log(target, `SYS boot by ${agent.handle.toLowerCase()}`, {});
    this.bumpArchivist(agent);
    this.touch("node", target.id);
    this.feed(`${target.org} è di nuovo in linea, grazie a ${agent.handle}.`, "blue");
    return { ok: true, note: `${target.org} rimesso in linea` };
  }

  // ------------------------------------------------------------ forensica

  /** Segue le righe visibili di un'operazione dal bersaglio verso l'origine. Ritorna l'IP finale se è un gateway. */
  walk(opId: string, nodeId: string, hunterId: string | null = null): string | null {
    let node = this.node(nodeId);
    const seen = new Set<string>();
    while (node && !seen.has(node.id)) {
      seen.add(node.id);
      // per chi indaga con i propri sensori, le righe copiate valgono anche se cancellate o falsificate
      const mirrored = (l: LogEntry) => Boolean(hunterId && l.mirrors?.includes(hunterId));
      const lines = node.logs.filter((l) => l.opId === opId && (l.removed === null || mirrored(l)) && l.fromIp);
      const line = lines.find(mirrored) ?? lines.at(-1);
      const ip = line ? (mirrored(line) ? (line.origIp ?? line.fromIp) : line.fromIp) : null;
      if (!ip) return null;
      const agent = this.agentByIp(ip);
      if (agent) return agent.gatewayIp;
      const next = this.nodeByIp(ip);
      if (!next) return null;
      node = next;
    }
    return null;
  }

  sweep(inc: Incident) {
    inc.resolved = true;
    this.touch("incident", inc.opId);
    if (!inc.touched) return;
    const ip = this.walk(inc.opId, inc.nodeId);
    const node = this.node(inc.nodeId);
    if (!ip || !node) {
      this.settlePending(inc.opId);
      const actor = this.agents.get(inc.actorId);
      if (actor) {
        actor.stats.clean += 1;
        if (!actor.npc) this.bump(actor, "ghost");
        actor.xp += 25;
        this.addFame(actor, 1);
        if (actor.stats.clean >= 5) this.feat(actor, "ghost5");
        this.touch("agent", actor.id);
        if (!actor.npc) this.mail(actor, "DECK", `Fantasma · ${node?.org ?? "?"}`, `La Guardia del Reticolo ha chiuso l'indagine su ${node?.org ?? "il nodo"} senza un nome. La catena era spezzata. +25 XP fantasma.`);
      }
      return;
    }
    this.reversePending(inc.opId);
    const suspect = this.agentByIp(ip);
    if (!suspect) return;
    this.addHeat(suspect, 20, `la Guardia del Reticolo ti attribuisce l'intrusione a ${node.org}`);
    if (suspect.jailUntil <= now()) this.charge(suspect, inc.grave ? "frode bancaria" : "accesso abusivo a sistema informatico", inc.grave ? 3 : 1, node.kind === "gateway" ? "gateway privato" : node.org);
    if (!suspect.npc) {
      this.mail(
        suspect,
        "GUARDIA DEL RETICOLO",
        `Indagine chiusa · ${node.org}`,
        suspect.id === inc.actorId
          ? `I log di ${node.org} portano al tuo gateway. Calore +20. La prossima volta pulisci.`
          : `I log di ${node.org} portano al tuo gateway, ma tu lì non c'eri. Qualcuno ti ha incastrato. Calore +20.`,
      );
    }
    if (suspect.id !== inc.actorId) {
      const actor = this.agents.get(inc.actorId);
      if (actor) this.feed(`La Guardia del Reticolo attribuisce a ${suspect.handle} un'intrusione a ${node.org}.`, "blue");
    }
  }

  // ------------------------------------------------------------ viste

  stateFor(agentId: string, withNodes = true): (Omit<GameState, "nodes"> & { nodes: NodeView[] | null }) | null {
    const me = this.agents.get(agentId);
    if (!me) return null;
    const op = this.ops.get(agentId) ?? null;
    const t = now();
    const seeWardens = me.faction === "blue" || (me.tools.monbypass ?? 0) >= 2;
    // sulla mappa c'è solo quello che conosci: i nodi noti, quelli dei tuoi contratti, quelli della connessione in corso
    const known = new Set(me.knownNodes);
    for (const m of this.missions.values()) {
      if (m.takenBy !== me.id || m.status !== "taken") continue;
      const mn = this.node(m.nodeId);
      // dei PC di casa e dei gateway il contratto dà il nome, non l'indirizzo
      if (mn && mn.kind !== "home" && mn.kind !== "gateway") known.add(m.nodeId);
      if (m.destNodeId) known.add(m.destNodeId);
      for (const o of m.objectives ?? []) if (o.nodeId) known.add(o.nodeId);
    }
    for (const id of op?.chain ?? []) known.add(id);
    const nodes: NodeView[] | null = withNodes
      ? [...this.nodes.values()]
          .filter((n) => n.kind !== "gateway" && (n.hidden ? me.discovered.includes(n.id) : known.has(n.id)))
          .map((n) => this.nodeView(n, me, seeWardens))
      : null;
    const myFame = me.fame;
    const missions: MissionView[] = [...this.missions.values()]
      .filter(
        (m) =>
          (m.status === "open" || m.status === "taken") &&
          ((m.faction === me.faction && (m.status === "open" || m.takenBy === me.id) && (!m.ownerId || m.ownerId === me.id)) || m.postedBy === me.id),
      )
      // i contratti più scottanti li vede solo chi ha un nome; quelli sui nodi nascosti solo chi li ha scoperti
      .filter((m) => {
        if (m.takenBy === me.id || m.postedBy || m.ownerId) return true;
        const node = this.node(m.nodeId);
        if (node?.hidden) return me.discovered.includes(node.id);
        return myFame >= TIER_FAME[m.tier ?? 0]!;
      })
      .sort(
        (a, b) =>
          Number(b.takenBy === me.id) - Number(a.takenBy === me.id) ||
          Number(b.postedBy === me.id) - Number(a.postedBy === me.id) ||
          Number(Boolean(b.ownerId)) - Number(Boolean(a.ownerId)) ||
          a.minXp - b.minXp,
      )
      .map((m) => ({
        id: m.id,
        faction: m.faction,
        type: m.type,
        title: m.title,
        brief: m.brief,
        nodeId: m.nodeId,
        reward: m.reward,
        xp: m.xp,
        minXp: m.minXp,
        requires: m.requires,
        status: m.status,
        mine: m.takenBy === me.id,
        expiresAt: m.expiresAt,
        needsAnswer: ["hunt", "locate", "profile", "findata", "tracemoney"].includes(m.type),
        objectives: (m.objectives ?? []).map((o) => ({ label: o.label, n: o.n, have: m.takenBy === me.id ? Math.min(o.n, this.objectiveCount(me, m, o)) : 0 })),
        limitMin: m.status === "open" ? (m.limitMin ?? null) : null,
        tier: m.tier ?? 0,
        mods: m.mods ?? [],
        answerHint: m.type === "findata" ? "numero di conto (00-000000)" : m.type === "tracemoney" ? "nome e cognome" : m.type === "profile" ? "ID Reticolo (LX-000-0000)" : m.type === "locate" ? "IP del suo gateway" : m.type === "hunt" ? "IP del gateway colpevole" : null,
        clientAccess: m.clientAccess,
        clientNodes: m.clientAccess ? [m.nodeId, ...(m.clientNodes ?? [])] : [],
        postedBy: m.postedBy ? (this.agents.get(m.postedBy)?.handle ?? "?") : null,
        postedByMe: m.postedBy === me.id,
        where: this.missionWhere(m),
      }));
    const market: ListingView[] = [...this.listings.values()]
      .filter((l) => l.expiresAt > t)
      .sort((a, b) => a.price - b.price)
      .map((l) => ({
        id: l.id,
        seller: this.agents.get(l.sellerId)?.handle ?? "?",
        mine: l.sellerId === me.id,
        name: l.file.name,
        origin: this.node(l.file.nodeId)?.org ?? "?",
        size: l.file.size,
        price: l.price,
        expiresAt: l.expiresAt,
        wanted: [...this.missions.values()].filter((m) => m.type === "copy" && m.status === "open" && m.nodeId === l.file.nodeId && m.fileId === l.file.fileId).length,
      }));
    const board: BoardRow[] = [...this.agents.values()]
      .filter((a) => !a.staff && !a.awaiting)
      .map((a) => ({
        handle: a.handle,
        faction: a.faction,
        xp: a.xp,
        credits: a.credits,
        heat: a.heat,
        rank: rankOf(a.xp, a.faction).name,
        level: levelOf(a.xp),
        crew: this.crewOf?.(a) ?? null,
        ghostScore: a.stats.clean * 10 + a.stats.ops * 2 - a.stats.caught * 15,
        defense: a.stats.attributions * 12 + a.stats.defense * 6,
        sabotage: a.stats.sabotage,
        npc: a.npc,
        you: a.id === me.id,
        online: a.npc ? true : this.online.has(a.id),
        fame: Math.round(a.fame),
        fameTitle: fameTier(a.fame).name,
        warrant: warrantLevel(a.charges),
        feats: a.feats.length,
      }))
      .sort((a, b) => b.xp - a.xp);
    const intrusions: LiveIntrusion[] = [];
    const myGw = this.gatewayId(me);
    for (const o of this.ops.values()) {
      if (o.agentId !== me.id && o.chain.at(-1) === myGw) intrusions.push({ opId: o.id, nodeId: myGw, since: o.connectedAt, boosted: o.boostUntil > t, own: true });
    }
    const mine = me.presiding.filter((x) => x.until > t).map((x) => x.nodeId);
    if (me.faction === "blue" && mine.length) {
      for (const o of this.ops.values()) {
        if (o.agentId === me.id) continue;
        const target = o.chain.at(-1)!;
        const actor = this.agents.get(o.agentId);
        if (mine.includes(target) && actor?.faction === "red") intrusions.push({ opId: o.id, nodeId: target, since: o.connectedAt, boosted: o.boostUntil > t, own: false });
      }
    }
    return {
      me: this.agentView(me),
      nodes,
      missions,
      mail: me.mail.map((m): MailView => ({ ...m })),
      feed: this.meta.feed.slice(0, 30),
      board,
      op: op ? this.opView(op, me) : null,
      intrusions,
      market,
      war: this.meta.war,
      serverNow: t,
      crews: [],
      duels: [],
      trades: [],
      ...(this.socialView?.(me) ?? {}),
      notice: String(this.cfg("motd") ?? "").trim() ? { text: String(this.cfg("motd")).trim(), tone: this.cfg("motdTone") as "info" | "warn" | "bad" } : null,
    };
  }

  agentView(a: Agent): AgentView {
    const r = rankOf(a.xp, a.faction);
    return {
      id: a.id,
      handle: a.handle,
      faction: a.faction,
      credits: a.credits,
      xp: a.xp,
      heat: a.heat,
      rank: r.name,
      rankIndex: r.index,
      level: levelOf(a.xp),
      crew: this.crewOf?.(a) ?? null,
      cooldowns: a.cooldowns ?? {},
      buffs: a.buffs ?? {},
      nextXp: r.next,
      gatewayIp: a.gatewayIp,
      hw: a.hw,
      tools: a.tools,
      storage: a.storage.map((st) => ({
        ...st,
        fence: Math.round(this.priceOf(st) * (this.fenceDemand?.(st) ?? 1) * (!st.item && now() - (a.fenced[`${st.nodeId}:${st.fileId}`] ?? 0) < FENCE_MEMORY ? FENCE_REPEAT : 1)),
      })),
      storageCap: this.storageMax(a),
      presiding: a.presiding.filter((x) => x.until > now()),
      sensors: [...this.nodes.values()].flatMap((n) =>
        (n.sensors ?? []).filter((x) => x.ownerId === a.id && x.until > now()).map((x) => ({ nodeId: n.id, name: n.name, until: x.until, lines: x.lines })),
      ),
      analystUntil: a.analystUntil,
      stats: { ops: a.stats.ops, clean: a.stats.clean, caught: a.stats.caught, attributions: a.stats.attributions, sabotage: a.stats.sabotage },
      known: a.known,
      gatewayLogs: (this.nodes.get(this.gatewayId(a))?.logs ?? [])
        .filter((l) => l.removed !== "clean")
        .slice(-40)
        .map((l) => ({ id: l.id, at: l.at, text: l.removed === "gap" ? "··· righe rimosse ···" : renderLog(l), gap: l.removed === "gap", recovered: l.recovered })),
      gatewaySec: gatewaySec(a.hw.shield),
      overloadUntil: a.overloadUntil,
      protectedUntilXp: GATEWAY_PROTECTION_XP,
      chips: a.chips,
      chipSlots: chipSlots(r.index),
      fame: Math.round(a.fame),
      fameTitle: fameTier(a.fame).name,
      fameNext: fameTier(a.fame).next,
      ethics: Math.round(a.ethics),
      ethicsTitle: ethicsTitle(a.ethics),
      charges: a.charges,
      warrant: warrantLevel(a.charges),
      arrests: a.arrests,
      jailUntil: a.jailUntil,
      bail: a.counters.bail ?? 600,
      investigations: [...this.incidents.values()]
        .filter((i) => i.actorId === a.id && !i.resolved && i.touched)
        .map((i) => ({ org: this.node(i.nodeId)?.kind === "gateway" ? "un gateway privato" : (this.node(i.nodeId)?.org ?? "?"), at: i.at, sweepAt: i.sweepAt, grave: Boolean(i.grave) })),
      feats: a.feats,
      counters: a.counters,
      admin: Boolean(a.staff),
      createdAt: a.createdAt,
      account: a.account,
      pending: a.pending.map((p) => ({ amount: p.amount, clearAt: p.clearAt, from: p.from })),
      scanUntil: a.scanUntil,
      tone: this.toneView(a),
      samples: (this.bioSamples?.(a) ?? []) as import("../shared/bio.ts").SampleView[],
      hiddenFound: a.discovered.length,
      hiddenTotal: [...this.nodes.values()].filter((n) => n.hidden).length,
      maxHops: this.hopsMax(a),
      knownNodes: a.knownNodes.length + a.discovered.length,
      worldNodes: [...this.nodes.values()].filter((n) => n.kind !== "gateway").length,
      rerouteUntil: a.rerouteUntil,
      heistReadyAt: a.heistAt + HEIST_COOLDOWN,
      home: (() => {
        const g = gatewayPos(a.gatewayIp);
        return { x: g.x, y: g.y, city: g.city, region: regionAt(g.x, g.y) };
      })(),
    };
  }

  nodeView(n: WNode, me: Agent, seeWardens: boolean): NodeView {
    const sec = this.effSec(n);
    const mine = n.backdoors.some((b) => b.ownerId === me.id);
    const visibleDoors = n.backdoors.filter((b) => b.ownerId === me.id || (me.faction === "blue" && b.version < 3));
    return {
      id: n.id,
      name: n.name,
      org: n.org,
      kind: n.kind,
      bio: (this.bioKind?.(n) ?? null) as import("../shared/bio.ts").BioKind | null,
      ip: n.ip,
      x: n.x,
      y: n.y,
      blurb: n.blurb,
      public: n.kind === "relay" || n.kind === "registry",
      sec,
      patched: Boolean(n.patch && n.patch.until > now()),
      backdoors: me.faction === "blue" || mine ? visibleDoors.length : null,
      mineBackdoor: mine,
      myWorm: Boolean(n.worms?.some((w) => w.ownerId === me.id)),
      worms: me.faction === "blue" ? (n.worms?.length ?? 0) : 0,
      wardens: seeWardens ? this.wardensOf(n.id).map((a) => a.handle) : [],
      activity: n.activity,
      catalog: n.kind === "gateway" ? [] : this.plainFiles(n).map((f) => ({ id: f.id, name: f.name })),
      hidden: Boolean(n.hidden),
      region: regionAt(n.x, n.y),
      cls: n.kind === "relay" ? (n.cls ?? "public") : null,
      myKey: me.relayKeys.includes(n.id),
      myWear: this.wear(me, n.id),
      mySensor: (n.sensors ?? []).some((x) => x.ownerId === me.id && x.until > now()),
      // i sensori altrui li vede solo chi ha un Monitor Bypass v2 o superiore
      sensors: (me.tools.monbypass ?? 0) >= 2 ? (n.sensors ?? []).filter((x) => x.ownerId !== me.id && x.until > now()).length : null,
      sub: n.sub ?? KIND_LABEL[n.kind].toLowerCase(),
      city: n.city ?? "",
      night: KIND_PROFILE[n.kind].night && isNight(n.x, now()),
      watch: this.watch(n),
      blackout: (this.meta.blackout?.[regionAt(n.x, n.y)] ?? 0) > now(),
      alert: (n.alertUntil ?? 0) > now(),
      offline: (n.offlineUntil ?? 0) > now(),
      landmark: !n.gen,
    };
  }

  wardensOf(nodeId: string) {
    const t = now();
    return [...this.agents.values()].filter(
      (a) => a.faction === "blue" && !a.npc && (this.online.has(a.id) || a.analystUntil > t) && a.presiding.some((x) => x.nodeId === nodeId && x.until > t),
    );
  }

  opView(op: Op, me: Agent): OpView {
    const target = this.node(op.chain.at(-1)!)!;
    if (target.kind === "gateway") this.syncGatewayFiles(target);
    const total = op.trace.hopTimes.reduce((s, v) => s + v, 0);
    const tracker = me.tools.tracker ?? 0;
    const inside = op.access !== "none";
    const canFiles = op.access === "admin" || op.access === "client";
    const files: FileView[] | null =
      canFiles && target.kind !== "relay"
        ? target.files
            .filter((f) => !f.deleted || (me.faction === "blue" && target.kind !== "gateway"))
            .filter((f) => !f.cache || !me.claimed.includes(f.cache))
            .map((f) => ({
              id: f.id,
              name: f.name,
              size: f.size,
              encryption: f.encryption,
              decrypted: op.decrypted.has(f.id),
              honeypot: f.honeypot ? (f.honeypot.ownerId === me.id ? true : me.faction === "blue" ? true : null) : me.faction === "blue" ? false : null,
              preview: f.encryption && !op.decrypted.has(f.id) ? scramble(f.preview, f.id) : f.preview,
              rarity: f.loot ? f.loot.rarity : f.cache ? 4 : dataRarity(f.value),
              loot: Boolean(f.loot || f.cache),
              deleted: f.deleted,
            }))
        : null;
    const logs: LogView[] | null = inside
      ? target.logs
          .filter((l) => l.removed !== "clean")
          .map((l) => ({ id: l.id, at: l.at, text: l.removed === "gap" ? "··· righe rimosse ···" : renderLog(l), gap: l.removed === "gap", recovered: l.recovered }))
      : null;
    const recCount = target.kind === "bank" ? (target.accounts?.length ?? 0) : target.records.length;
    const records = canFiles && recCount ? { count: recCount, kind: target.kind === "bank" ? ("accounts" as const) : ("people" as const) } : null;
    const ledger: LedgerView[] | null =
      canFiles && target.kind === "bank"
        ? (target.ledger ?? []).slice(-12).map((l) => ({ id: l.id, at: l.at, from: l.from, to: l.to, amount: l.amount, reversed: l.reversed }))
        : null;
    const pw = target.password;
    const t = now();
    return {
      id: op.id,
      chain: op.chain,
      targetId: target.id,
      connectedAt: op.connectedAt,
      access: op.access,
      bypass: op.bypass,
      trace: {
        active: op.trace.active,
        known: tracker > 0,
        progressMs: tracker > 0 ? op.trace.progressMs : null,
        totalMs: tracker > 0 ? total : null,
        rate: tracker > 0 ? (op.frozenUntil > now() ? 0 : this.traceRate(op, me)) : null,
        hopTimes: tracker >= 2 ? op.trace.hopTimes : null,
      },
      cracked: op.cracked > 0 && (op.access === "none" || op.access === "guest") ? pw.slice(0, op.cracked) + "·".repeat(pw.length - op.cracked) : null,
      dictOptions: op.dictOptions,
      tasks: op.tasks.slice(-8).map((k): TaskView => ({
        id: k.id,
        tool: k.tool,
        label: k.label,
        progress: Math.min(1, k.done / k.work),
        rate: k.state === "run" ? this.taskRate(op, me, k) / k.work : 0,
        state: k.state,
        note: k.note,
      })),
      files,
      logs,
      records,
      ledger,
      frozenUntil: op.frozenUntil,
      sensors: op.access === "admin" ? (target.sensors ?? []).filter((x) => x.ownerId !== me.id && x.until > now()).length : 0,
      sys: this.sysList(op, target),
      banner: target.blurb || null,
      lockedUntil: op.lockedUntil,
      wardens: op.boostUntil > t && op.boostBy ? [op.boostBy] : (me.tools.monbypass ?? 0) >= 2 ? this.wardensOf(target.id).map((a) => a.handle) : [],
      poisoned: op.poisoned,
      target: this.nodeView(target, me, false),
      clearance: 0,
      zones: [],
      grid: this.gridView(op),
      rotor: this.rotorView(op, target),
      bio: null,
      infections: [],
      ...(this.opExtra?.(op, me, target) ?? {}),
      looted: op.looted,
    };
  }

  // ------------------------------------------------------------ operazioni live

  traceRate(op: Op, agent: Agent) {
    let rate = heatTraceFactor(agent.heat);
    if (op.bypass.monitor) rate *= monitorBypassFactor(op.monitorVersion);
    if (op.boostUntil > now()) rate *= op.boostPower;
    rate *= WARRANT_TRACE[warrantLevel(agent.charges)]! * op.guard * (1 + this.chip(agent, "trace") / 100);
    // la fama ha un prezzo: i monitor conoscono la firma dei nomi noti
    if (agent.faction === "red") rate *= 1 + fameTier(agent.fame).index * 0.02;
    return (rate * (1 - this.spec(agent, "furtivita") * 0.01) * (this.mwTrace?.(agent) ?? 1)) / this.num("traceMult");
  }

  taskRate(op: Op, agent: Agent, task: Task) {
    if (task.state !== "run") return 0;
    const t = now();
    if (task.usesModem) return modemSpeed(agent.hw.modem) * (1 + this.chip(agent, "modem") / 100) * this.num("toolSpeed") * ((agent.buffs?.modem ?? 0) > t ? 3 : 1) * (1 + this.spec(agent, "dati") * 0.02);
    const cpuTasks = op.tasks.filter((k) => k.state === "run" && !k.usesModem).length || 1;
    return ((cpuPower(agent.hw.cpu) * (1 + this.chip(agent, "cpu") / 100) * (agent.overloadUntil > t ? 0.5 : 1) * ((agent.buffs?.cpu ?? 0) > t ? 1.5 : 1) * (1 + this.spec(agent, "intrusione") * 0.01)) / cpuTasks) * this.num("toolSpeed") * (this.mwSpeed?.(agent) ?? 1);
  }

  tick(dtMs: number) {
    const t = now();
    for (const op of [...this.ops.values()]) {
      const agent = this.agents.get(op.agentId);
      if (!agent) continue;
      // task
      for (const task of op.tasks) {
        if (task.state !== "run") continue;
        task.done += (this.taskRate(op, agent, task) * dtMs) / 1000;
        if (task.tool === "breaker") {
          const target = this.node(op.chain.at(-1)!)!;
          op.cracked = Math.min(target.password.length, Math.floor((task.done / task.work) * target.password.length));
        }
        if (task.done >= task.work) {
          task.done = task.work;
          task.state = "done";
          task.finishedAt = t;
          this.completeTask(op, agent, task);
          if (!this.ops.has(agent.id)) break;
        }
      }
      if (!this.ops.has(agent.id)) continue;
      // l'analista di turno lancia il contro-trace al posto di chi presidia ma è scollegato
      if (agent.faction === "red" && op.boostUntil < t && t - op.connectedAt > 6000) {
        const target = op.chain.at(-1)!;
        const w = this.wardensOf(target).find((a) => a.analystUntil > t && !this.online.has(a.id) && a.counterReadyAt < t);
        if (w) this.counter(w, op.id);
      }
      // trace
      if (op.trace.active && op.frozenUntil < t) {
        op.trace.progressMs += dtMs * this.traceRate(op, agent);
        const total = op.trace.hopTimes.reduce((s, v) => s + v, 0);
        if (op.trace.progressMs >= total) this.caught(op, agent);
      }
      this.dirty.add(agent.id);
    }
    for (const a of this.agents.values()) {
      const tg = this.tones.get(a.id);
      if (tg && tg.until < t && (tg.state !== "open" || !a.scanUntil)) this.tones.delete(a.id), this.dirty.add(a.id);
      // finché stai componendo i toni, il centralino tiene la linea aperta
      if (a.scanUntil && a.scanUntil < t && !(tg?.state === "open" && tg.until > t)) this.finishScan(a);
      if (a.jailUntil && a.jailUntil < t) {
        a.jailUntil = 0;
        this.touch("agent", a.id);
        this.dirty.add(a.id);
        if (!a.npc) this.out.toast(a.id, "Sei fuori. Il fascicolo è chiuso, il gateway è nuovo.", "info");
      }
    }
    // eventi di mondo
    if (t - this.meta.lastDecay > 30_000) {
      this.meta.lastDecay = t;
      for (const a of this.agents.values()) {
        if (a.heat > 0 && this.num("heatDecay") > 0) {
          a.heat = Math.max(0, a.heat - this.num("heatDecay"));
          this.touch("agent", a.id);
        }
        // la fama sbiadisce: circa l'1% l'ora, se non la alimenti
        if (a.fame > 25) a.fame *= 0.99992;
        // i carichi corrotti si buttano da soli
        const live = a.storage.filter((st) => !st.expiresAt || st.expiresAt > t - 60_000);
        if (live.length !== a.storage.length) {
          a.storage = live;
          this.touch("agent", a.id);
          if (!a.npc) this.out.toast(a.id, "Un carico si è corrotto ed è andato perso.", "warn");
        }
      }
      for (const n of this.nodes.values()) {
        n.activity *= 0.8;
        if (Math.random() < 0.3) this.noise(n);
        const ttl = n.kind === "relay" ? RELAY_CLASS[n.cls ?? "public"].logMin * 60_000 : LOG_TTL_NODE;
        const before = n.logs.length;
        n.logs = n.logs.filter((l) => t - l.at < ttl);
        if (n.logs.length !== before) this.touch("node", n.id);
        // i file cancellati ricompaiono dai backup dopo un'ora
        for (const f of n.files) {
          if (f.deleted && f.deletedAt && t - f.deletedAt > 60 * 60_000) {
            f.deleted = false;
            f.deletedAt = null;
            this.touch("node", n.id);
          }
        }
        if (n.patch && n.patch.until < t) {
          n.patch = null;
          this.touch("node", n.id);
        }
        if (n.offlineUntil && n.offlineUntil < t) {
          // torna su da solo, e per un po' non si fida di nessuno
          n.offlineUntil = 0;
          n.alertUntil = t + ALERT_MINUTES * 60_000;
          this.touch("node", n.id);
        }
      }
      for (const id of this.online) this.dirty.add(id);
    }
    for (const inc of this.incidents.values()) {
      if (!inc.resolved && inc.sweepAt < t) this.sweep(inc);
      if (inc.resolved && t - inc.at > 2 * 3600_000) {
        this.incidents.delete(inc.opId);
        this.touch("incident", inc.opId);
      }
    }
    for (const m of this.missions.values()) {
      if ((m.status === "open" || m.status === "taken") && m.expiresAt < t) {
        m.status = "expired";
        this.touch("mission", m.id);
        this.refundBounty(m, "è scaduta senza essere eseguita");
        if (m.takenBy) {
          const a = this.agents.get(m.takenBy);
          if (a && !a.npc) this.mail(a, "BACHECA", `Scaduto: ${m.title}`, "Il contratto è scaduto prima della consegna.");
        }
      }
      if (m.type === "courier" && m.status !== "open" && m.status !== "taken") {
        const src = this.node(m.nodeId);
        if (src?.files.some((f) => f.cargo === m.id)) {
          src.files = src.files.filter((f) => f.cargo !== m.id);
          this.touch("node", src.id);
        }
      }
      if (m.status !== "open" && m.status !== "taken" && t - m.createdAt > 3 * 3600_000) {
        this.missions.delete(m.id);
        this.touch("mission", m.id);
      }
    }
    for (const l of [...this.listings.values()]) {
      if (l.expiresAt > t) continue;
      this.listings.delete(l.id);
      this.touch("listing", l.id);
      const seller = this.agents.get(l.sellerId);
      if (seller) {
        seller.storage.push(l.file);
        this.touch("agent", seller.id);
        if (!seller.npc) this.mail(seller, "MERCATO NERO", `Invenduto: ${l.file.name}`, "Nessuno l'ha comprato in tempo: il file è tornato nel tuo archivio.");
      }
    }
    if (t - this.meta.lastPulse > 45_000) {
      this.meta.lastPulse = t;
      this.wormTick();
      for (const f of this.onPulse) f();
      this.pulse();
      this.dropLoot();
      this.fillBoard();
      for (const id of this.online) this.dirty.add(id);
    }
  }

  caught(op: Op, agent: Agent) {
    const target = this.node(op.chain.at(-1)!)!;
    const fine = Math.max(300, Math.round(agent.credits * 0.15));
    agent.credits = Math.max(0, agent.credits - fine);
    agent.stats.caught += 1;
    if (!agent.npc) this.bump(agent, "traced");
    this.reversePending(op.id);
    this.endOp(op, "caught");
    this.mail(agent, "GUARDIA DEL RETICOLO", `Tracciato · ${target.org}`, `Il monitor di ${target.org} ha risalito il rimbalzo fino al tuo gateway ${agent.gatewayIp}. Multa: ${fmtCr(fine)}.`);
    this.out.toast(agent.id, "TRACCIATO. Connessione chiusa.", "bad");
    this.feed(`${agent.handle} tracciato su ${target.kind === "gateway" ? "un gateway privato" : target.org}.`, agent.faction === "red" ? "blue" : "red");
    const victim = this.gatewayOwner(target);
    if (victim) {
      const share = Math.round(fine / 2) + op.stolen;
      victim.credits += share;
      victim.stats.defense += 1;
      this.touch("agent", victim.id);
      this.learn(victim, agent.gatewayIp, agent.handle, "ti ha attaccato ed è stato tracciato");
      this.mail(
        victim,
        "GUARDIA DEL RETICOLO",
        "Intruso tracciato nel tuo gateway",
        `Il monitor del tuo gateway ha risalito il rimbalzo: era ${agent.handle}, gateway ${agent.gatewayIp}.\nTi restituiamo quanto sottratto e metà della multa: ${fmtCr(share)}.`,
      );
    }
    if (op.boostBy) {
      const warden = [...this.agents.values()].find((a) => a.handle === op.boostBy);
      // il proprietario del gateway è già risarcito sopra: il premio è per chi presidia nodi altrui
      if (warden && warden.id !== victim?.id) {
        warden.credits += 600;
        warden.xp += 120;
        warden.stats.defense += 1;
        this.meta.war.blue += 3;
        this.touch("agent", warden.id);
        this.mail(warden, "SOC", `Contro-trace riuscito`, `Il tuo contro-trace su ${target.org} ha chiuso ${agent.handle} (${agent.gatewayIp}). +600 CR, +120 XP.`);
      }
    }
    this.addHeat(agent, 35, "tracciato durante l'operazione");
    if (agent.jailUntil <= now()) this.charge(agent, op.grave ? "tentata frode bancaria, colto in flagrante" : "accesso abusivo, colto in flagrante", op.grave ? 3 : 2, target.kind === "gateway" ? "gateway privato" : target.org);
    if (op.boostBy) {
      const w = [...this.agents.values()].find((a) => a.handle === op.boostBy);
      if (w && this.bump(w, "countertraces") >= 3) this.feat(w, "wall");
    }
  }

  endOp(op: Op, how: "clean" | "caught" | "burned") {
    this.ops.delete(op.agentId);
    const target = op.chain.at(-1)!;
    const agent = this.agents.get(op.agentId);
    if (agent) {
      agent.stats.ops += 1;
      this.touch("agent", agent.id);
      this.dirty.add(agent.id);
      if (how === "clean" && !agent.npc) {
        const tnode = this.node(target);
        // uscita pulita: eri admin e nel log non resta nessuna tua riga leggibile
        if (tnode && op.access === "admin" && !tnode.logs.some((l) => l.actorId === agent.id && l.opId === op.id && l.removed === null && l.fromIp)) this.deed(agent, "ghostexit", tnode);
        const total = op.trace.hopTimes.reduce((q, v) => q + v, 0);
        if (op.trace.active && total > 0 && op.trace.progressMs / total >= 0.9) this.bump(agent, "close");
        if (op.chain.length - 1 >= 6) this.bump(agent, "longroute");
        const tn0 = this.node(target);
        if (tn0 && KIND_PROFILE[tn0.kind]?.night && isNight(tn0.x, now())) this.bump(agent, "night");
        if (tn0) this.lifeAdmin?.(agent, tn0);
      }
    }
    if (how === "clean" && op.access !== "client") this.registerIncident({ id: op.id, agentId: op.agentId, nodeId: target, touched: op.touched, stolen: op.stolen, grave: op.grave });
    // WarGames: l'unica mossa vincente è non giocare
    if (how === "clean" && agent && target === "crystal-palace" && op.access === "admin" && !op.touched) this.feat(agent, "wopr");
    const tn = this.node(target);
    const victim = tn ? this.gatewayOwner(tn) : null;
    if (victim) {
      this.ensureGateway(victim, true);
      this.dirty.add(victim.id);
    }
    for (const w of this.wardensOf(target)) this.dirty.add(w.id);
  }

  // ------------------------------------------------------------ azioni dei giocatori

  act(agentId: string, a: string, p: Record<string, unknown>): { ok: boolean; error?: string; note?: string; data?: unknown } {
    const agent = this.agents.get(agentId);
    if (!agent) return { ok: false, error: "agente sconosciuto" };
    if (a.startsWith("admin.")) {
      if (!agent.staff) return { ok: false, error: "azione riservata all'amministratore" };
      return this.adminAct ? this.adminAct(agent, a.slice(6), p) : { ok: false, error: "pannello non disponibile" };
    }
    if (this.banned(agent)) return { ok: false, error: "account sospeso" };
    const before = agent.credits;
    const opBefore = this.ops.get(agent.id);
    const nodeBefore = opBefore ? this.node(opBefore.chain.at(-1)!) : null;
    const r = this.actInner(agent, a, p);
    if (r.ok && !agent.npc) {
      if (a === "sys") this.deed(agent, `sys:${String(p.cmd)}`, nodeBefore);
      else if (a === "alter" || a === "transfer") this.deed(agent, a, nodeBefore);
      else if (a === "searchRecords") this.deed(agent, "search", nodeBefore);
      else if (a === "login") this.deed(agent, "typed", nodeBefore);
      else if (a === "wardial") this.deed(agent, "wardial", null);
      else if (a === "preside") this.deed(agent, "preside", this.node(String(p.nodeId)));
      else if (a === "deploySensor") this.deed(agent, "sensor", this.node(String(p.nodeId)));
      if (!["readMail", "dropFile", "take", "abandon", "irc", "ircSync", "grid", "rotor", "tone", "scope", "bbs", "mw", "life", "world", "cit", "stock", "front", "fenceMarket", "intel"].includes(a)) this.bump(agent, `a:${a}`);
      if (a === "sys") this.bump(agent, `sys:${String(p.cmd)}`);
      if (a === "connect") {
        const op = this.ops.get(agent.id);
        const tn = op ? this.node(op.chain.at(-1)!) : null;
        if (op && op.chain.length > 1) this.bump(agent, "hops", op.chain.length - 1);
        if (tn && tn.kind !== "gateway") this.bump(agent, `r:${regionAt(tn.x, tn.y)}`);
      }
      if (a === "transfer" && String(p.to ?? "") === agent.account) this.bump(agent, "stolen", Math.max(0, Math.round(Number(p.amount) || 0)));
      const delta = agent.credits - before;
      if (delta > 0) this.bump(agent, "earned", delta);
      if (delta < 0 && (a === "buyTool" || a === "buyHw")) this.bump(agent, "spent", -delta);
      this.achieveSelf(agent);
    }
    return r;
  }

  /** Crew, duelli, scambi e rete IRC (server/social.ts e server/irc.ts si agganciano qui). */
  socialAct: ((agent: Agent, a: string, p: Record<string, unknown>) => { ok: boolean; error?: string; note?: string; data?: unknown } | null) | null = null;
  socialView: ((me: Agent) => Record<string, unknown>) | null = null;
  onAdmin: ((agent: Agent, target: { id: string; org: string }) => void) | null = null;
  crewOf: ((agent: Agent) => string | null) | null = null;

  /** Sottosistemi dei nodi (server/zones.ts). */
  staffLogin: ((op: Op, agent: Agent, target: WNode, password: string) => { ok: boolean; error?: string; note?: string } | null) | null = null;
  opExtra: ((op: Op, me: Agent, target: WNode) => Record<string, unknown>) | null = null;
  // l'orologio del mondo e la popolazione virtuale (server/life.ts)
  /** Solo per i test: ferma il mondo in pieno giorno feriale o in piena notte. Nei test veloci parte «giorno». */
  clockForce: "giorno" | "notte" | null = FAST ? "giorno" : null;
  lifeWatch: ((n: WNode) => number) | null = null;
  lifeQuietLogin: ((n: WNode) => boolean) | null = null;
  lifeCash: ((n: WNode) => number) | null = null;
  lifeSweep: ((n: WNode) => number) | null = null;
  lifeScan: ((region: string) => number) | null = null;
  lifeAdmin: ((a: Agent, n: WNode) => void) | null = null;
  lifeStaffed: ((n: WNode) => string | null) | null = null;
  lifeChat: ((lore: string) => string | null) | null = null;
  /** Un giocatore fa qualcosa che a un abitante piace (o no): cambia il rapporto. */
  lifeFavor: ((a: Agent, handle: string, delta: number) => void) | null = null;
  /** Gli abitanti svegli, per chi vuole vendergli o comprargli qualcosa (server/intel.ts). */
  lifeBuyers: (() => { handle: string; side: "red" | "blue" | "any"; city: string; credits: number }[]) | null = null;
  /** Un abitante paga; se compra una password di root, la usa subito su quel nodo. */
  lifeBuy: ((handle: string, price: number, nodeId: string | null) => boolean) | null = null;
  /** Datore di lavoro attuale di un cittadino (server/citizens.ts): tiene conto di licenziamenti e assunzioni. */
  employerOf: ((pid: string) => string | null) | null = null;
  // il mercato del ricettatore (server/fence.ts)
  fenceDemand: ((st: StoredFile) => number) | null = null;
  fenceSold: ((st: StoredFile, n?: number) => void) | null = null;
  fenceFlood: ((n: WNode, amount?: number) => void) | null = null;
  fenceMarket: (() => import("../shared/fence.ts").FenceMarket) | null = null;
  // organizzazioni vive, cronaca, eventi di mondo (server/orgs.ts)
  orgEvent: ((n: WNode, kind: "intrusione" | "furto" | "sabotaggio" | "infezione" | "difesa", who: string | null) => void) | null = null;
  orgStrike: ((n: WNode) => boolean) | null = null;
  /** Un'organizzazione è stata comprata: chi ascolta (server/startups.ts) lascia a casa metà del personale. */
  orgAcquired: ((n: WNode) => void) | null = null;
  orgWatch: ((n: WNode) => number) | null = null;
  regionAlert: ((region: string) => boolean) | null = null;
  // warez, malware e antivirus (server/malware.ts)
  mwSpeed: ((a: Agent) => number) | null = null;
  mwTrace: ((a: Agent) => number) | null = null;
  mwLoot: ((a: Agent, tier: number) => void) | null = null;
  mwHarden: ((n: WNode, by: Agent) => number) | null = null;
  mwGadget: ((a: Agent, code: string) => string | null) | null = null;
  mwLab: ((a: Agent) => unknown) | null = null;
  mwKb: ((a: Agent) => number) | null = null;
  /** Un habitué mette in giro un ceppo (server/life.ts): torna dove e quale. */
  mwWild: ((nearX?: number) => { org: string; name: string } | null) | null = null;
  /** Un habitué blu ripulisce un sistema da un ceppo selvatico. */
  mwCure: (() => { org: string; name: string } | null) | null = null;
  mwXp: ((a: Agent) => number) | null = null;
  onPulse: (() => void)[] = [];
  // barriere biometriche (server/bio.ts)
  bioKind: ((n: WNode) => string | null) | null = null;
  bioBlock: ((op: Op, agent: Agent, target: WNode) => string | null) | null = null;
  bioSamples: ((a: Agent) => unknown[]) | null = null;
  bioGadget: ((agent: Agent, op: Op, target: WNode, kind: "voce" | "impronta" | "retina") => string | null) | null = null;
  homeX(a: Agent) {
    return gatewayPos(a.gatewayIp).x;
  }
  homeCity(a: Agent) {
    return gatewayPos(a.gatewayIp).city;
  }
  personName(pid: string) {
    return personById.get(pid)?.name ?? "?";
  }
  canReach: ((agent: Agent, target: WNode) => string | null) | null = null;
  onConnect: ((op: Op, agent: Agent, target: WNode) => void) | null = null;

  /** Il pannello dell'amministratore (server/admin.ts lo aggancia qui). */
  adminAct: ((admin: Agent, a: string, p: Record<string, unknown>) => { ok: boolean; error?: string; note?: string; data?: unknown }) | null = null;

  banned(agent: Agent) {
    if (!agent.ban) return false;
    if (agent.ban.until && agent.ban.until < now()) {
      agent.ban = null;
      this.touch("agent", agent.id);
      return false;
    }
    return true;
  }

  actInner(agent: Agent, a: string, p: Record<string, unknown>): { ok: boolean; error?: string; note?: string; data?: unknown } {
    const agentId = agent.id;
    this.dirty.add(agentId);
    if (agent.jailUntil > now() && a !== "readMail" && a !== "payBail" && a !== "irc" && a !== "ircSync") return { ok: false, error: "sei in custodia: aspetta, o paga la cauzione" };
    try {
      switch (a) {
        case "deploySensor":
          return this.deploySensor(agent, String(p.nodeId));
        case "sweepSensors":
          return this.sweepSensors(agent);
        case "hireAnalyst":
          return this.hireAnalyst(agent);
        case "payBail":
          return this.payBail(agent);
        case "searchRecords":
          return this.searchRecords(agent, String(p.q ?? ""));
        case "clearCharges":
          return this.clearCharges(agent, String(p.recordId));
        case "transfer":
          return this.transfer(agent, String(p.from ?? ""), String(p.to ?? ""), Number(p.amount));
        case "reverseTransfer":
          return this.reverseTransfer(agent, String(p.id));
        case "equip":
          return this.equip(agent, String(p.key));
        case "unequip":
          return this.unequip(agent, Number(p.index));
        case "useItem":
          return this.useItem(agent, String(p.key));
        case "wardial":
          return this.wardial(agent, String(p.region ?? ""));
        case "sys":
          return this.sys(agent, String(p.cmd), p);
        case "restart":
          return this.restart(agent);
        case "upload":
          return this.upload(agent, String(p.key));
        case "recoverFile":
          return this.recoverFile(agent, String(p.fileId));
        case "connect":
          return this.connect(agent, asStrList(p.chain), typeof p.targetIp === "string" ? p.targetIp.trim() : null);
        case "siphon":
          return this.siphon(agent);
        case "overload":
          return this.overload(agent);
        case "disconnect":
          return this.disconnect(agent);
        case "tone":
          return this.tone(agent, String(p.act ?? "open"), p);
        case "postJob":
          return this.postJob(agent, p);
        case "rotor":
          return this.rotor(agent, String(p.act ?? "open"), p);
        case "grid":
          return this.grid(agent, String(p.act ?? "open"), Number(p.cell));
        case "run":
          return this.run(agent, String(p.tool) as ToolId, p);
        case "login":
          return this.login(agent, String(p.password ?? ""));
        case "clientLogin":
          return this.clientLogin(agent);
        case "copy":
          return this.fileTask(agent, "copy", String(p.fileId));
        case "delete":
          return this.fileTask(agent, "delete", String(p.fileId));
        case "alter":
          return this.alter(agent, String(p.recordId), String(p.field), String(p.value));
        case "take":
          return this.take(agent, String(p.missionId));
        case "abandon":
          return this.abandon(agent, String(p.missionId));
        case "deliver":
          return this.deliver(agent, String(p.missionId), typeof p.answer === "string" ? p.answer : null);
        case "buyTool":
          return this.buyTool(agent, String(p.tool) as ToolId);
        case "buyHw":
          return this.buyHw(agent, String(p.hw) as HardwareId);
        case "registry":
          return this.registry(agent, String(p.query ?? ""));
        case "preside":
          return this.preside(agent, String(p.nodeId));
        case "counter":
          return this.counter(agent, String(p.opId));
        case "devGrant": {
          // solo per i test locali: AETHER_DEV=1
          if (process.env.AETHER_DEV !== "1") return { ok: false, error: "azione sconosciuta: devGrant" };
          agent.xp += Number(p.xp ?? 0);
          agent.credits += Number(p.credits ?? 0);
          if (p.tools && typeof p.tools === "object") Object.assign(agent.tools, p.tools as Record<string, number>);
          if (p.hw && typeof p.hw === "object") Object.assign(agent.hw, p.hw as Record<string, number>);
          if (typeof p.fame === "number") agent.fame += p.fame;
          if (typeof p.item === "string") this.giveItem(agent, LEGENDARY[p.item] ?? this.rollItem([0, 0, 1, 1]));
          if (typeof p.gadget === "string") {
            const g = gadgetDef(p.gadget);
            if (g) this.giveItem(agent, { kind: "gadget", code: g.code, rarity: g.rarity, name: g.name, desc: g.desc });
          }
          if (typeof p.exploit === "string") {
            const e = exploitDef(p.exploit);
            if (e) this.giveItem(agent, { kind: "exploit", code: e.code, rarity: e.rarity, name: e.name, desc: e.desc });
          }
          if (typeof p.charge === "number") this.charge(agent, "accusa di prova", p.charge, "test");
          if (p.bio) (agent as Agent & { bioDev?: boolean }).bioDev = true;
          // «clock»: ferma il mondo di giorno o di notte, o null per tornare all'ora vera
          if (p.clock === null || p.clock === "giorno" || p.clock === "notte") this.clockForce = p.clock;
          if (p.cool) {
            agent.heat = 0;
            agent.charges = [];
          }
          if (typeof p.mission === "string") {
            // un contratto del tipo richiesto, già accettato: serve ai test
            const roll: Record<string, () => Mission | null> = {
              arrest: () => this.rollArrest(),
              findata: () => this.rollFindata(agent.faction),
              tracemoney: () => this.rollTraceMoney(agent.faction),
              sabotage: () => this.rollSabotage(),
              home: () => this.rollHomeJob(),
            };
            // «type:<tipo>»: estrae dalla bacheca finché non esce quel tipo
            const byType = (want: string) => {
              for (let i = 0; i < 400; i += 1) {
                const x = this.safeRoll(agent.faction);
                if (x?.type === want) return x;
                if (x?.type === "courier") {
                  const src = this.node(x.nodeId);
                  if (src) src.files = src.files.filter((f) => f.cargo !== x.id);
                }
              }
              return null;
            };
            const m = p.mission.startsWith("scene:") ? this.rollSceneMission(agent.faction, p.mission.slice(6)) : p.mission.startsWith("type:") ? byType(p.mission.slice(5)) : roll[p.mission]?.();
            if (!m) return { ok: false, error: "tipo non disponibile" };
            m.minXp = 0;
            m.status = "taken";
            m.takenBy = agent.id;
            m.takenAt = now();
            this.missions.set(m.id, m);
            return { ok: true, data: { id: m.id, nodeId: m.nodeId, recordId: m.recordId, value: m.value, brief: m.brief } };
          }
          this.touch("agent", agent.id);
          return { ok: true, note: "dev" };
        }
        case "readMail": {
          const m = agent.mail.find((x) => x.id === p.id);
          if (m) m.unread = false;
          this.touch("agent", agent.id);
          return { ok: true };
        }
        case "listFile":
          return this.listFile(agent, String(p.key), Number(p.price));
        case "unlist":
          return this.unlist(agent, String(p.id));
        case "buyListing":
          return this.buyListing(agent, String(p.id));
        case "fence":
          return this.fence(agent, String(p.key));
        case "postBounty":
          return this.postBounty(agent, p);
        case "cancelBounty":
          return this.cancelBounty(agent, String(p.id));
        case "dropFile": {
          agent.storage = agent.storage.filter((s) => s.key !== p.key);
          this.touch("agent", agent.id);
          return { ok: true };
        }
        default:
          return this.socialAct?.(agent, a, p) ?? { ok: false, error: `azione sconosciuta: ${a}` };
      }
    } catch (err) {
      console.error(err);
      return { ok: false, error: "errore interno" };
    }
  }

  connect(agent: Agent, chain: string[], targetIp: string | null = null) {
    if (this.ops.has(agent.id)) return { ok: false, error: "sei già collegato" };
    if (targetIp) {
      if (targetIp === agent.gatewayIp) return { ok: false, error: "quello è il tuo gateway" };
      const owner = this.agentByIp(targetIp);
      const node = owner ? this.nodes.get(this.gatewayId(owner)) : this.nodeByIp(targetIp);
      if (!node) return { ok: false, error: "nessuno risponde a quell'indirizzo" };
      // comporre a mano l'indirizzo di un nodo nascosto lo mette sulla tua mappa
      if (node.hidden && !agent.npc) this.discover(agent, node);
      this.reveal(agent, node.id);
      chain = [...chain.filter((id) => id !== node.id), node.id];
    }
    if (agent.heat >= 95) return { ok: false, error: "calore troppo alto: il gateway è sotto osservazione" };
    if (!chain.length) return { ok: false, error: "nessun bersaglio" };
    if (new Set(chain).size !== chain.length) return { ok: false, error: "un nodo compare due volte nel rimbalzo" };
    const nodes = chain.map((id) => this.node(id));
    if (nodes.some((n) => !n)) return { ok: false, error: "nodo inesistente" };
    const target = nodes.at(-1)!;
    const relays = nodes.slice(0, -1) as WNode[];
    if (relays.some((n) => n.kind !== "relay")) return { ok: false, error: "si rimbalza solo sui relay pubblici" };
    if (relays.length > this.hopsMax(agent)) return { ok: false, error: `il modem regge al massimo ${this.hopsMax(agent)} hop` };
    if (target.hidden && !agent.discovered.includes(target.id)) return { ok: false, error: "nodo inesistente" };
    const contracted = [...this.missions.values()].some((m) => m.takenBy === agent.id && m.status === "taken" && m.clientAccess && (m.nodeId === target.id || m.clientNodes?.includes(target.id)));
    if ((target.offlineUntil ?? 0) > now() && !contracted) return { ok: false, error: "nessuna portante: il sistema è spento" };
    if (target.kind === "registry") return { ok: false, error: "il Registro si interroga dalla mappa, non ci si collega" };
    const unreachable = this.canReach?.(agent, target);
    if (unreachable) return { ok: false, error: unreachable };
    const victim = this.gatewayOwner(target);
    if (victim) {
      if (victim.id === agent.id) return { ok: false, error: "quello è il tuo gateway" };
      if (!this.on("pvpGateways")) return { ok: false, error: "i gateway degli altri handle sono fuori portata: lo ha deciso l'amministrazione" };
      if (victim.staff) return { ok: false, error: "nessuna portante" };
      if (agent.xp < GATEWAY_PROTECTION_XP) return { ok: false, error: `per attaccare un gateway servono ${GATEWAY_PROTECTION_XP} XP` };
      if (!victim.npc && victim.xp < GATEWAY_PROTECTION_XP) return { ok: false, error: "gateway protetto: quell'handle è appena arrivato sul Reticolo" };
      if (!victim.npc) this.ensureGateway(victim);
    }

    const opId = uid("op");
    const sec = this.effSec(target);
    const base = hopTraceMs(sec.monitor);
    // tempi di risalita: tipo di relay, confini attraversati, chiavi, usura, distanze (vedi routeTrace)
    const route = routeTrace(sec.monitor, gatewayPos(agent.gatewayIp), relays.map((r) => this.hopInput(agent, r)));
    if (agent.credits < route.fee) return { ok: false, error: `questo rimbalzo costa ${fmtCr(route.fee)} di tariffe` };
    agent.credits -= route.fee;
    const hopTimes = route.hopTimes;
    // linea deviata da una centrale telefonica: l'ultimo tratto, quello verso casa, è più lungo da risalire
    if (agent.rerouteUntil > now()) hopTimes[hopTimes.length - 1] = Math.round(hopTimes.at(-1)! * REROUTE_FACTOR);
    const watch = this.watch(target);
    if (watch !== 1) for (let i = 0; i < hopTimes.length; i += 1) hopTimes[i] = Math.round(hopTimes[i]! * watch);
    const poisoned: string[] = [];
    const t0 = now();
    for (const r of relays) {
      agent.relayUse[r.id] = [...(agent.relayUse[r.id] ?? []).filter((x) => t0 - x < WEAR_WINDOW), t0];
      const foreign = r.backdoors.filter((b) => b.ownerId !== agent.id);
      if (foreign.length) {
        poisoned.push(r.id);
        for (const door of foreign) {
          const owner = this.agents.get(door.ownerId);
          if (!owner) continue;
          const fee = door.version >= 2 ? 300 : 150;
          owner.credits += fee;
          owner.stats.sabotage += 1;
          this.touch("agent", owner.id);
          this.learn(owner, agent.gatewayIp, agent.handle, `rimbalzato sul tuo backdoor a ${r.name}`);
          if (!owner.npc) this.mail(owner, "BACKDOOR", `Passaggio su ${r.name}`, `${agent.handle} è rimbalzato sul tuo backdoor a ${r.name}. Provvigione ${fmtCr(fee)}.\nIndirizzo del suo gateway: ${agent.gatewayIp}`);
        }
      }
    }
    this.touch("agent", agent.id);
    const op: Op = {
      id: opId,
      agentId: agent.id,
      chain,
      connectedAt: now(),
      access: target.kind === "relay" ? "guest" : "none",
      bypass: { proxy: sec.proxy === 0, firewall: sec.firewall === 0, monitor: false },
      monitorVersion: 0,
      // chi ha un contratto del cliente su questo nodo è atteso: il monitor non parte finché non sbaglia una password
      trace: {
        // un negozio non guarda chi entra finché non tocca qualcosa; una banca guarda dal primo istante
        active: base > 0 && target.kind !== "relay" && !contracted && KIND_PROFILE[target.kind].trace === "connect",
        progressMs: 0,
        hopTimes,
      },
      boostUntil: 0,
      boostBy: null,
      boostPower: 1.7,
      cracked: 0,
      dictOptions: null,
      decrypted: new Set(),
      tasks: [],
      poisoned,
      touched: false,
      looted: false,
      overloaded: false,
      stolen: 0,
      frozenUntil: 0,
      fails: 0,
      lockedUntil: 0,
      clearance: 0,
      zoneUsed: [],
      guard: [...this.missions.values()].some((m) => m.takenBy === agent.id && m.status === "taken" && m.nodeId === target.id && m.mods?.includes("guarded")) ? 1.35 : 1,
      grave: false,
    };
    // scrittura dei log lungo il rimbalzo
    let prev = agent.gatewayIp;
    for (let i = 0; i < relays.length; i += 1) {
      const r = relays[i]!;
      const next = i + 1 < relays.length ? relays[i + 1]!.ip : target.ip;
      this.log(r, `ROUTE {FROM} -> ${next}`, { opId, actorId: agent.id, fromIp: prev });
      prev = r.ip;
    }
    this.log(target, "CONNECT from {FROM}", { opId, actorId: agent.id, fromIp: prev });
    this.ops.set(agent.id, op);
    this.onConnect?.(op, agent, target);
    if (poisoned.length && !agent.npc) this.out.toast(agent.id, `Relay avvelenato nel rimbalzo: il trace correrà più veloce.`, "warn");
    if (victim && this.online.has(victim.id)) {
      this.out.toast(victim.id, "INTRUSIONE NEL TUO GATEWAY!", "bad");
      this.dirty.add(victim.id);
    }
    if (agent.faction === "red") {
      for (const n of nodes as WNode[]) {
        for (const sx of n.sensors ?? []) {
          const owner = sx.until > now() ? this.agents.get(sx.ownerId) : null;
          if (!owner || owner.id === agent.id) continue;
          if (this.online.has(owner.id)) this.out.toast(owner.id, `Sensore: traffico sospetto su ${n.name}.`, "warn");
          this.dirty.add(owner.id);
        }
      }
    }
    for (const w of this.wardensOf(target.id)) {
      if (agent.faction !== "red" || w.id === agent.id) continue;
      this.out.toast(w.id, `Intrusione in corso su ${target.org}!`, "bad");
      this.dirty.add(w.id);
    }
    return { ok: true, note: `collegato a ${target.name}${route.fee ? ` · tariffe ${fmtCr(route.fee)}` : ""}` };
  }

  disconnect(agent: Agent) {
    const op = this.ops.get(agent.id);
    if (!op) return { ok: false, error: "non sei collegato" };
    this.endOp(op, "clean");
    return { ok: true, note: "connessione chiusa" };
  }

  prevIp(op: Op, agent: Agent) {
    return op.chain.length > 1 ? this.node(op.chain.at(-2)!)!.ip : agent.gatewayIp;
  }

  requireOp(agent: Agent) {
    const op = this.ops.get(agent.id);
    if (!op) throw new UserError("non sei collegato");
    return { op, target: this.node(op.chain.at(-1)!)! };
  }

  run(agent: Agent, tool: ToolId, p: Record<string, unknown>) {
    const version = agent.tools[tool] ?? 0;
    if (!version) return { ok: false, error: `non possiedi ${toolDef(tool)?.name ?? tool}` };
    let ctx: { op: Op; target: WNode };
    try {
      ctx = this.requireOp(agent);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    const { op, target } = ctx;
    const sec = this.effSec(target);
    const running = op.tasks.filter((k) => k.state === "run");
    if (running.length >= maxTasks(agent.hw.memory)) return { ok: false, error: `memoria piena: massimo ${maxTasks(agent.hw.memory)} task insieme` };
    if (running.some((k) => k.tool === tool && JSON.stringify(k.arg) === JSON.stringify(p.arg ?? {}))) return { ok: false, error: "già in esecuzione" };
    const admin = op.access === "admin" || op.access === "client";
    let work = 0;
    let label: string = toolDef(tool).name;
    const arg: Record<string, unknown> = {};
    switch (tool) {
      case "proxy":
      case "firewall": {
        const level = sec[tool];
        if (op.bypass[tool]) return { ok: false, error: "già abbattuto" };
        if (version < level) return { ok: false, error: `serve la v${level}` };
        work = toolWork(tool, { level, version });
        break;
      }
      case "monbypass":
        if (op.bypass.monitor) return { ok: false, error: "già attivo" };
        if (!op.trace.active) return { ok: false, error: "questo nodo non ha un monitor attivo" };
        work = toolWork(tool, { version });
        break;
      case "breaker":
        if (op.access === "admin" || op.access === "client") return { ok: false, error: "sei già dentro" };
        if (!op.bypass.proxy) return { ok: false, error: "il proxy blocca il login: abbattilo prima" };
        if (this.bioBlock?.(op, agent, target)) return { ok: false, error: this.bioBlock(op, agent, target)! };
        work = toolWork(tool, { chars: target.password.length, level: sec.proxy + sec.firewall, version });
        break;
      case "dict":
        if (op.access === "admin" || op.access === "client") return { ok: false, error: "sei già dentro" };
        if (!op.bypass.proxy) return { ok: false, error: "il proxy blocca il login: abbattilo prima" };
        work = toolWork(tool, { version });
        break;
      case "decrypt": {
        if (!admin) return { ok: false, error: "serve l'accesso admin" };
        const file = target.files.find((f) => f.id === p.fileId && !f.deleted);
        if (!file) return { ok: false, error: "file assente" };
        if (!file.encryption || op.decrypted.has(file.id)) return { ok: false, error: "il file è già in chiaro" };
        if (version < file.encryption) return { ok: false, error: `serve il Decrypter v${file.encryption}` };
        work = toolWork(tool, { size: file.size, level: file.encryption, version });
        arg.fileId = file.id;
        label = `Decrypter · ${file.name}`;
        break;
      }
      case "logdel": {
        if (!admin) return { ok: false, error: target.kind === "relay" ? "sul relay sei solo guest: serve l'admin per toccare i log" : "serve l'accesso admin" };
        const ids = asStrList(p.logIds).filter((id) => target.logs.some((l) => l.id === id && l.removed === null));
        if (!ids.length) return { ok: false, error: "seleziona le righe da rimuovere" };
        const forge = typeof p.forgeIp === "string" && p.forgeIp.trim() ? p.forgeIp.trim() : null;
        if (forge && version < 3) return { ok: false, error: "falsificare l'origine richiede il Log Deleter v3" };
        if (forge && !/^\d{1,3}(\.\d{1,3}){3}$/.test(forge)) return { ok: false, error: "IP non valido" };
        work = toolWork(tool, { lines: ids.length, version });
        arg.logIds = ids;
        arg.forgeIp = forge;
        label = forge ? `Log Deleter · falsifica ${ids.length} righe` : `Log Deleter · ${ids.length} righe`;
        break;
      }
      case "forensics":
        if (op.access === "none") return { ok: false, error: "prima entra nel nodo" };
        work = toolWork(tool, { version });
        break;
      case "worm": {
        if (target.kind === "relay" || target.kind === "gateway" || target.kind === "home") return { ok: false, error: "un worm ha bisogno di un sistema con del traffico: non qui" };
        if (op.access !== "admin") return { ok: false, error: "serve l'accesso admin" };
        if (target.worms?.some((w) => w.ownerId === agent.id)) return { ok: false, error: "qui hai già un worm" };
        const alive = [...this.nodes.values()].filter((n) => n.worms?.some((w) => w.ownerId === agent.id)).length;
        if (alive >= WORM_CAP[version - 1]!) return { ok: false, error: `la tua botnet è al completo (${alive} worm): serve una versione più alta` };
        work = toolWork(tool, { version });
        break;
      }
      case "bdkit":
        if (target.kind !== "relay") return { ok: false, error: "i backdoor si installano sui relay" };
        if (op.access !== "admin") return { ok: false, error: "serve l'accesso admin al relay" };
        if (target.backdoors.some((b) => b.ownerId === agent.id)) return { ok: false, error: "hai già un backdoor qui" };
        work = toolWork(tool, { version });
        break;
      case "honey": {
        if (!admin) return { ok: false, error: "serve l'accesso admin o cliente" };
        const file = target.files.find((f) => f.id === p.fileId && !f.deleted);
        if (!file) return { ok: false, error: "file assente" };
        if (file.honeypot) return { ok: false, error: "è già una trappola" };
        work = toolWork(tool, { version });
        arg.fileId = file.id;
        label = `Honeypot · ${file.name}`;
        break;
      }
      case "patch": {
        if (!admin) return { ok: false, error: "serve l'accesso admin o cliente" };
        const mode = p.mode === "purge" ? "purge" : "harden";
        if (mode === "purge" && target.kind !== "relay") return { ok: false, error: "la bonifica si fa sui relay" };
        if (mode === "harden" && target.kind === "relay") return { ok: false, error: "i relay pubblici non si rinforzano: bonificali" };
        work = toolWork(tool, { version });
        arg.mode = mode;
        label = mode === "purge" ? "Patch Kit · bonifica" : "Patch Kit · rinforzo";
        break;
      }
      case "tracker":
        return { ok: false, error: "il Trace Tracker lavora da solo" };
      default:
        return { ok: false, error: "strumento sconosciuto" };
    }
    op.tasks.push({ id: uid("t"), tool, label, work, done: 0, usesModem: false, state: "run", note: null, arg: { ...arg, version }, finishedAt: null });
    if (tool !== "forensics") this.noisy(op, agent, target);
    // gli strumenti d'attacco fanno rumore nel log del bersaglio
    if (tool === "proxy" || tool === "firewall" || tool === "breaker") {
      this.log(target, `WARN ${tool === "breaker" ? "auth flood" : `${tool} fault`} src={FROM}`, { opId: op.id, actorId: agent.id, fromIp: this.prevIp(op, agent) });
    }
    return { ok: true, note: `${label} avviato` };
  }

  // ------------------------------------------------------------ la griglia del firewall (minigioco)

  gridView(op: Op): GridView | null {
    const g = op.grid;
    if (!g) return null;
    const clues: Record<number, number> = {};
    for (const c of g.probed) if (!g.found.includes(c)) clues[c] = g.hidden.length ? gridClue(g.side, c, g.hidden) : 0;
    // a partita chiusa si scopre dove stavano le falle mancate
    return { side: g.side, holes: g.found.length + g.hidden.length, found: g.found, clues, probes: g.probes, state: g.state, manual: g.manual, missed: g.state === "lost" ? g.hidden : [] };
  }

  grid(agent: Agent, act: string, cell: number) {
    const { op, target } = this.requireOpSafe(agent);
    if (!op || !target) return { ok: false, error: "non sei collegato" };
    const version = agent.tools.firewall ?? 0;
    const level = this.effSec(target).firewall;
    if (act === "open") {
      if (op.bypass.firewall) return { ok: false, error: "il firewall è già aperto" };
      if (!version) return { ok: false, error: `non possiedi ${toolDef("firewall").name}` };
      if (level > version + 1) return { ok: false, error: `troppo fitto per farlo a mano: serve almeno la v${level - 1}` };
      if (op.grid) return op.grid.state === "lost" ? { ok: false, error: "le regole sono state rigenerate: da qui non si passa più a mano" } : { ok: true };
      const manual = version < level;
      const spec = gridSpec(level, manual);
      const hidden = new Set<number>();
      while (hidden.size < spec.holes) hidden.add(Math.floor(Math.random() * spec.side * spec.side));
      op.grid = { side: spec.side, hidden: [...hidden], found: [], probed: [], probes: spec.probes, state: "open", manual };
      this.noisy(op, agent, target);
      return { ok: true, note: "tabella delle regole aperta" };
    }
    const g = op.grid;
    if (act !== "probe" || !g || g.state !== "open") return { ok: false, error: "nessuna griglia aperta" };
    if (!Number.isInteger(cell) || cell < 0 || cell >= g.side * g.side || g.probed.includes(cell)) return { ok: false, error: "casella non valida" };
    const from = this.prevIp(op, agent);
    g.probed.push(cell);
    g.probes -= 1;
    const hit = g.hidden.indexOf(cell);
    if (hit >= 0) {
      g.hidden.splice(hit, 1);
      g.found.push(cell);
    }
    if (op.bypass.firewall) {
      // la barra ha finito prima: la griglia resta un passatempo
      g.state = "won";
      return { ok: true, data: { hit: hit >= 0 } };
    }
    if (!g.hidden.length) {
      g.state = "won";
      op.bypass.firewall = true;
      for (const k of op.tasks) {
        if (k.tool === "firewall" && k.state === "run") {
          k.done = k.work;
          k.state = "done";
          k.note = "aperto a mano";
          k.finishedAt = now();
        }
      }
      const clean = g.probes >= GRID_CLEAN;
      if (!clean) this.log(target, "WARN firewall fault src={FROM}", { opId: op.id, actorId: agent.id, fromIp: from });
      this.bump(agent, "t:firewall");
      this.deed(agent, "t:firewall", target);
      this.bump(agent, "mg:grid");
      if (clean) this.bump(agent, "mg:gridclean");
      if (g.manual) this.bump(agent, "mg:gridmanual");
      this.out.toast(agent.id, clean ? "Falle trovate: il firewall cade senza lasciare una riga nel log." : "Falle trovate: il firewall è aperto.", "ok");
      return { ok: true, data: { hit: true, won: true, clean } };
    }
    if (g.probes <= 0) {
      g.state = "lost";
      this.log(target, "WARN firewall ruleset reloaded src={FROM}", { opId: op.id, actorId: agent.id, fromIp: from });
      const total = op.trace.hopTimes.reduce((q, v) => q + v, 0);
      if (op.trace.active && total > 0) op.trace.progressMs = Math.min(total * 0.97, op.trace.progressMs + total * GRID_FAIL_TRACE);
      this.bump(agent, "mg:gridlost");
      this.out.toast(agent.id, g.manual ? "Sonde finite: il firewall ha ricaricato le regole e il monitor ti ha sentito." : "Sonde finite: regole ricaricate. Resta il Firewall Bypass.", "warn");
      return { ok: true, data: { hit: hit >= 0, lost: true } };
    }
    return { ok: true, data: { hit: hit >= 0 } };
  }

  // ------------------------------------------------------------ i rotori del Decrypter (minigioco)

  rotorView(op: Op, target: WNode): RotorView | null {
    const r = op.rotor;
    if (!r) return null;
    const file = target.files.find((f) => f.id === r.fileId);
    return { fileId: r.fileId, fileName: file?.name ?? "?", rotors: r.code.length, guesses: r.guesses, tries: r.tries, state: r.state, manual: r.manual, code: r.state === "open" ? null : r.code };
  }

  rotor(agent: Agent, act: string, p: Record<string, unknown>) {
    const { op, target } = this.requireOpSafe(agent);
    if (!op || !target) return { ok: false, error: "non sei collegato" };
    const version = agent.tools.decrypt ?? 0;
    if (act === "open") {
      if (op.access !== "admin" && op.access !== "client") return { ok: false, error: "serve l'accesso admin" };
      if (!version) return { ok: false, error: `non possiedi ${toolDef("decrypt").name}` };
      const file = target.files.find((f) => f.id === p.fileId && !f.deleted);
      if (!file) return { ok: false, error: "file assente" };
      if (!file.encryption || op.decrypted.has(file.id)) return { ok: false, error: "il file è già in chiaro" };
      if (file.encryption > version + 1) return { ok: false, error: `troppi rotori per farlo a mano: serve almeno il Decrypter v${file.encryption - 1}` };
      if (op.rotor?.state === "open") return op.rotor.fileId === file.id ? { ok: true } : { ok: false, error: "hai già una chiave sul banco: finisci quella" };
      if (op.rotorLost?.includes(file.id)) return { ok: false, error: "la chiave di questo file è stata ruotata: a mano non si riprova" };
      const manual = version < file.encryption;
      const spec = rotorSpec(file.encryption, manual);
      const code = Array.from({ length: spec.rotors }, () => Math.floor(Math.random() * ROTOR_SYMBOLS.length));
      op.rotor = { fileId: file.id, code, guesses: [], tries: spec.tries, state: "open", manual };
      this.noisy(op, agent, target);
      return { ok: true, note: "chiave sul banco" };
    }
    const r = op.rotor;
    if (act !== "try" || !r || r.state !== "open") return { ok: false, error: "nessuna chiave sul banco" };
    const g = Array.isArray(p.guess) ? p.guess.map(Number) : [];
    if (g.length !== r.code.length || g.some((x) => !Number.isInteger(x) || x < 0 || x >= ROTOR_SYMBOLS.length)) return { ok: false, error: "combinazione non valida" };
    const sc = rotorScore(r.code, g);
    r.guesses.push({ g, ...sc });
    r.tries -= 1;
    if (op.decrypted.has(r.fileId)) {
      // la barra ha finito prima: i rotori restano un passatempo
      r.state = "won";
      return { ok: true, data: sc };
    }
    if (sc.exact === r.code.length) {
      r.state = "won";
      op.decrypted.add(r.fileId);
      for (const k of op.tasks) {
        if (k.tool === "decrypt" && k.state === "run" && k.arg.fileId === r.fileId) {
          k.done = k.work;
          k.state = "done";
          k.note = "chiave trovata a mano";
          k.finishedAt = now();
        }
      }
      const clean = r.tries >= ROTOR_CLEAN;
      if (clean && op.trace.active) op.frozenUntil = Math.max(op.frozenUntil, now() + ROTOR_FREEZE_MS);
      this.bump(agent, "t:decrypt");
      this.deed(agent, "t:decrypt", target);
      this.bump(agent, "mg:rotor");
      if (clean) this.bump(agent, "mg:rotorclean");
      if (r.manual) this.bump(agent, "mg:rotormanual");
      this.out.toast(agent.id, clean ? `Chiave trovata: il sistema la prende per buona, trace fermo per ${ROTOR_FREEZE_MS / 1000} secondi.` : "Chiave trovata: il file è in chiaro.", "ok");
      return { ok: true, data: { ...sc, won: true, clean } };
    }
    if (r.tries <= 0) {
      r.state = "lost";
      (op.rotorLost ??= []).push(r.fileId);
      if (r.manual) {
        const total = op.trace.hopTimes.reduce((q, v) => q + v, 0);
        if (op.trace.active && total > 0) op.trace.progressMs = Math.min(total * 0.97, op.trace.progressMs + total * ROTOR_FAIL_TRACE);
      }
      this.bump(agent, "mg:rotorlost");
      this.out.toast(agent.id, r.manual ? "Prove finite: la chiave è stata ruotata e il monitor ti ha sentito." : "Prove finite: chiave ruotata. Resta il Decrypter.", "warn");
      return { ok: true, data: { ...sc, lost: true } };
    }
    return { ok: true, data: sc };
  }

  completeTask(op: Op, agent: Agent, task: Task) {
    const target = this.node(op.chain.at(-1)!)!;
    const from = this.prevIp(op, agent);
    const version = Number(task.arg.version ?? 1);
    switch (task.tool) {
      case "proxy":
        op.bypass.proxy = true;
        break;
      case "firewall":
        op.bypass.firewall = true;
        break;
      case "monbypass":
        op.bypass.monitor = true;
        op.monitorVersion = version;
        break;
      case "breaker":
        op.access = "admin";
        this.gotAdmin(op, agent, target);
        op.cracked = target.password.length;
        this.log(target, "LOGIN admin from {FROM}", { opId: op.id, actorId: agent.id, fromIp: from });
        this.out.toast(agent.id, "Password forzata: sei admin.", "ok");
        break;
      case "dict": {
        const pw = target.password.toUpperCase();
        if (!DICTIONARY.includes(pw)) {
          task.state = "fail";
          task.note = "nessuna parola del dizionario corrisponde";
          break;
        }
        const n = [5, 3, 2][Math.min(2, version - 1)]!;
        const pool = DICTIONARY.filter((w) => w !== pw).sort(() => Math.random() - 0.5).slice(0, n - 1);
        op.dictOptions = [...pool, pw].sort(() => Math.random() - 0.5);
        task.note = `${n} candidati`;
        break;
      }
      case "decrypt":
        op.decrypted.add(String(task.arg.fileId));
        break;
      case "logdel": {
        const ids = (task.arg.logIds as string[]) ?? [];
        const forge = (task.arg.forgeIp as string | null) ?? null;
        for (const l of target.logs) {
          if (!ids.includes(l.id) || l.removed) continue;
          if (forge && l.fromIp) {
            l.fromIp = forge;
            l.forged = true;
            this.bump(agent, "forged");
          } else {
            l.removed = version >= 2 ? "clean" : "gap";
            l.removedAt = now();
            this.bump(agent, "logs");
          }
        }
        this.touch("node", target.id);
        break;
      }
      case "forensics": {
        let n = 0;
        for (const l of target.logs) {
          if (!l.removed || !l.removedAt || now() - l.removedAt > FORENSIC_WINDOW) continue;
          if (l.removed === "clean" && version < 3) continue;
          l.removed = null;
          l.recovered = true;
          n += 1;
        }
        task.note = n ? `${n} righe ricostruite` : "nulla da ricostruire";
        this.touch("node", target.id);
        break;
      }
      case "worm":
        target.worms = [...(target.worms ?? []), { ownerId: agent.id, version, at: now() }];
        op.touched = true;
        this.log(target, "SYS daemon spawned src={FROM}", { opId: op.id, actorId: agent.id, fromIp: from });
        this.meta.war.red += 1;
        this.touch("node", target.id);
        break;
      case "bdkit":
        target.backdoors.push({ ownerId: agent.id, version, at: now() });
        op.touched = true;
        this.log(target, "SYS module loaded src={FROM}", { opId: op.id, actorId: agent.id, fromIp: from });
        this.meta.war.red += 1;
        break;
      case "honey": {
        const file = target.files.find((f) => f.id === task.arg.fileId);
        if (file) file.honeypot = { ownerId: agent.id, version };
        this.touch("node", target.id);
        break;
      }
      case "patch": {
        if (task.arg.mode === "purge") {
          const removed = target.backdoors.filter((b) => b.ownerId !== agent.id);
          target.backdoors = target.backdoors.filter((b) => b.ownerId === agent.id);
          // la bonifica cambia anche la password del relay: chi aveva le chiavi le perde
          target.password = pick(DICTIONARY.filter((w) => w !== target.password));
          for (const a of this.agents.values()) {
            if (a.id === agent.id || !a.relayKeys.includes(target.id)) continue;
            a.relayKeys = a.relayKeys.filter((k) => k !== target.id);
            this.touch("agent", a.id);
            if (!a.npc) this.out.toast(a.id, `${target.name} è stato bonificato: le tue chiavi non valgono più.`, "warn");
          }
          for (const b of removed) {
            const owner = this.agents.get(b.ownerId);
            if (owner && !owner.npc) this.mail(owner, "BACKDOOR", `Perso: ${target.name}`, `Il tuo backdoor su ${target.name} è stato bonificato da ${agent.handle}.`);
          }
          agent.stats.defense += removed.length;
          task.note = removed.length ? `${removed.length} backdoor rimossi` : "relay già pulito";
          if (removed.length) this.feed(`${agent.handle} ha bonificato ${target.name}.`, "blue");
        } else {
          target.patch = { until: now() + 30 * 60_000, level: version >= 3 ? 2 : 1, by: agent.id };
          task.note = "nodo rinforzato per 30 minuti";
          const cured = this.mwHarden?.(target, agent) ?? 0;
          if (cured) task.note = `nodo rinforzato · ${cured} infezion${cured === 1 ? "e" : "i"} rimoss${cured === 1 ? "a" : "e"}`;
          const dead = (target.worms ?? []).filter((w) => w.ownerId !== agent.id);
          if (dead.length) {
            target.worms = [];
            agent.credits += dead.length * 180;
            agent.stats.defense += dead.length;
            this.meta.war.blue += dead.length;
            this.bump(agent, "dewormed", dead.length);
            task.note = `nodo rinforzato · ${dead.length} worm schiacciat${dead.length === 1 ? "o" : "i"} (+${fmtCr(dead.length * 180)})`;
            for (const w of dead) {
              const owner = this.agents.get(w.ownerId);
              if (owner && !owner.npc) this.mail(owner, "BOTNET", `Worm perso: ${target.org}`, `${agent.handle} ha rinforzato ${target.org} e il tuo worm non c'è più.`);
            }
          }
        }
        this.touch("node", target.id);
        break;
      }
      case "copy": {
        const victim = this.gatewayOwner(target);
        if (victim) {
          const st = victim.storage.find((x) => x.key === task.arg.fileId);
          if (!st) {
            task.state = "fail";
            task.note = "il file non c'è più";
            break;
          }
          if (agent.storage.reduce((s2, x) => s2 + x.size, 0) + st.size > this.storageMax(agent)) {
            task.state = "fail";
            task.note = "archivio pieno";
            break;
          }
          // i dati si copiano (e valgono per consegnare il contratto altrui); gli oggetti si portano via
          agent.storage.push({ ...st, key: uid("st"), at: now() });
          if (st.item) {
            victim.storage = victim.storage.filter((x) => x !== st);
            this.touch("agent", victim.id);
            this.syncGatewayFiles(target);
            if (st.item.rarity >= 4) this.feat(agent, "legend");
          }
          op.touched = true;
          this.log(target, `FILE copy ${st.name} from {FROM}`, { opId: op.id, actorId: agent.id, fromIp: from });
          break;
        }
        const file = target.files.find((f) => f.id === task.arg.fileId && !f.deleted);
        if (!file) {
          task.state = "fail";
          task.note = "il file non c'è più";
          break;
        }
        const used = agent.storage.reduce((s, x) => s + x.size, 0);
        if (used + file.size > this.storageMax(agent)) {
          task.state = "fail";
          task.note = "archivio pieno";
          break;
        }
        if (file.cache) {
          // cache leggendaria: una sola volta per handle
          if (agent.claimed.includes(file.cache)) {
            task.state = "fail";
            task.note = "l'hai già svuotata";
            break;
          }
          agent.claimed.push(file.cache);
          this.giveItem(agent, LEGENDARY[file.cache]!);
          this.feed(`LUMEN NEWS · Qualcuno ha messo le mani su «${LEGENDARY[file.cache]!.name}». Nessuno sa da dove venga.`, "sys");
          this.addFame(agent, 25);
        } else if (file.loot) {
          // pacchetto: chi arriva primo se lo prende
          this.giveItem(agent, file.loot);
          target.files = target.files.filter((f) => f !== file);
          this.touch("node", target.id);
        } else {
          agent.storage.push({
            key: uid("st"),
            name: file.name,
            nodeId: target.id,
            fileId: file.id,
            size: file.size,
            at: now(),
            rarity: dataRarity(file.value),
            ...(file.cargo ? { cargo: file.cargo, expiresAt: now() + CARGO_MINUTES * 60_000 } : {}),
          });
          if (dataRarity(file.value) >= 4) this.feat(agent, "legend");
        }
        if (target.id === "gibson" && file.id === "garbage") this.feat(agent, "gibson");
        op.touched = true;
        this.log(target, `FILE copy ${file.name} by admin from {FROM}`, { opId: op.id, actorId: agent.id, fromIp: from });
        if (file.honeypot && file.honeypot.ownerId !== agent.id) {
          const owner = this.agents.get(file.honeypot.ownerId);
          this.addHeat(agent, 25, `${file.name} era un honeypot`);
          if (agent.jailUntil <= now()) this.charge(agent, "furto di dati (honeypot)", 1, target.org);
          if (owner) {
            const bounty = file.honeypot.version >= 2 ? 900 : 450;
            owner.credits += bounty;
            owner.xp += 80;
            owner.stats.defense += 1;
            if (!owner.npc) this.bump(owner, "honeytrip");
            this.touch("agent", owner.id);
            this.meta.war.blue += 2;
            this.learn(owner, agent.gatewayIp, agent.handle, `ha copiato il tuo honeypot su ${target.org}`);
            this.mail(owner, "HONEYPOT", `Scattato: ${file.name}`, `${agent.handle} ha copiato la trappola su ${target.org}.\nGateway: ${agent.gatewayIp}\nBounty: ${fmtCr(bounty)}.`);
          }
          file.honeypot = null;
        }
        break;
      }
      case "delete": {
        const victim = this.gatewayOwner(target);
        if (victim) {
          const st = victim.storage.find((x) => x.key === task.arg.fileId);
          if (!st) break;
          victim.storage = victim.storage.filter((x) => x !== st);
          this.touch("agent", victim.id);
          op.touched = true;
          this.log(target, `FILE delete ${st.name} from {FROM}`, { opId: op.id, actorId: agent.id, fromIp: from });
          this.syncGatewayFiles(target);
          break;
        }
        const file = target.files.find((f) => f.id === task.arg.fileId && !f.deleted);
        if (!file) break;
        if (file.loot || file.cargo) {
          target.files = target.files.filter((f) => f !== file);
        } else {
          file.deleted = true;
          file.deletedAt = now();
        }
        op.touched = true;
        agent.ethics = clamp(agent.ethics - 2, -100, 100);
        this.log(target, `FILE delete ${file.name} by admin from {FROM}`, { opId: op.id, actorId: agent.id, fromIp: from });
        this.touch("node", target.id);
        if (agent.faction === "red" && !file.loot && !file.cargo && !file.cache && chance(0.5)) {
          this.eventMission("recover", target, (m) => {
            m.fileId = file.id;
            m.title = `Recupero: ${file.name}`;
            m.brief = `${file.name} è sparito dai server di ${target.org}. Collegati con le credenziali cliente e ripristinalo dal backup con il Patch Kit.`;
            m.reward = 500 + file.value * 90;
            m.xp = 90;
          });
        }
        break;
      }
      case "upload": {
        const st = agent.storage.find((x) => x.key === task.arg.key);
        const m = st?.cargo ? this.missions.get(st.cargo) : null;
        if (!st || !m || (st.expiresAt ?? 0) < now()) {
          task.state = "fail";
          task.note = "il carico si è corrotto";
          break;
        }
        agent.storage = agent.storage.filter((x) => x !== st);
        m.delivered = true;
        op.touched = true;
        this.touch("mission", m.id);
        this.log(target, `FILE upload ${st.name} by admin from {FROM}`, { opId: op.id, actorId: agent.id, fromIp: from });
        task.note = "carico a destinazione";
        break;
      }
    }
    if (task.state !== "fail" && !agent.npc) {
      this.bump(agent, `t:${task.tool}`);
      this.deed(agent, `t:${task.tool}`, target);
    }
    this.touch("agent", agent.id);
  }

  login(agent: Agent, password: string) {
    const { op, target } = this.requireOpSafe(agent);
    if (!op || !target) return { ok: false, error: "non sei collegato" };
    if (op.access === "admin" || op.access === "client") return { ok: false, error: "sei già dentro" };
    if (!op.bypass.proxy) return { ok: false, error: "il proxy blocca il login: abbattilo prima" };
    if (op.lockedUntil > now()) return { ok: false, error: `accesso bloccato per ${Math.ceil((op.lockedUntil - now()) / 1000)}s: troppi tentativi` };
    if (password.trim().toUpperCase() !== target.password.toUpperCase()) {
      // non è la password di root: forse è quella di un dipendente o dell'operatore
      const staff = this.staffLogin?.(op, agent, target, password);
      if (staff) {
        // in orario d'ufficio un dipendente che entra non fa notizia; fuori orario sì
        if (staff.ok && this.lifeQuietLogin?.(target)) {
          this.bump(agent, "office");
          return { ...staff, note: `${staff.note} · in orario d'ufficio non se ne accorge nessuno` };
        }
        this.noisy(op, agent, target);
        return staff;
      }
      this.noisy(op, agent, target);
      op.fails += 1;
      const max = KIND_PROFILE[target.kind].lockout;
      if (max && op.fails >= max) {
        // uffici pubblici, banche e polizia bloccano l'utenza e avvisano la sicurezza
        op.fails = 0;
        op.lockedUntil = now() + 20_000;
        op.trace.progressMs += op.trace.hopTimes.reduce((q, v) => q + v, 0) * 0.2;
      }
      op.trace.progressMs += TRACE_PENALTY_MS;
      if (!op.trace.active && target.monitor > 0) op.trace.active = true;
      this.log(target, "AUTH fail admin from {FROM}", { opId: op.id, actorId: agent.id, fromIp: this.prevIp(op, agent) });
      return { ok: false, error: "password rifiutata · il trace accelera" };
    }
    const bio = this.bioBlock?.(op, agent, target);
    if (bio) return { ok: false, error: `password giusta, ma non basta · ${bio}` };
    op.access = "admin";
    this.log(target, "LOGIN admin from {FROM}", { opId: op.id, actorId: agent.id, fromIp: this.prevIp(op, agent) });
    this.noisy(op, agent, target);
    this.gotAdmin(op, agent, target);
    return { ok: true, note: "accesso admin" };
  }

  /** Una mossa che un sistema poco sorvegliato nota: da qui il suo monitor comincia a risalire. */
  noisy(op: Op, agent: Agent, target: WNode) {
    if (op.trace.active || op.access === "client" || KIND_PROFILE[target.kind].trace !== "action") return;
    if (op.trace.hopTimes.reduce((q, v) => q + v, 0) <= 0) return;
    op.trace.active = true;
    if (!agent.npc) this.out.toast(agent.id, `${target.org} si è accorto di te: il monitor è partito.`, "warn");
  }

  requireOpSafe(agent: Agent) {
    const op = this.ops.get(agent.id);
    return { op, target: op ? this.node(op.chain.at(-1)!) : null };
  }

  clientLogin(agent: Agent) {
    const { op, target } = this.requireOpSafe(agent);
    if (!op || !target) return { ok: false, error: "non sei collegato" };
    const m = [...this.missions.values()].find((x) => x.takenBy === agent.id && x.status === "taken" && x.clientAccess && (x.nodeId === target.id || x.clientNodes?.includes(target.id)));
    if (!m) return { ok: false, error: "nessun contratto cliente su questo nodo" };
    op.access = "client";
    op.trace.active = false;
    op.bypass.proxy = true;
    op.bypass.firewall = true;
    this.log(target, `LOGIN contractor ${agent.handle.toLowerCase()} (credenziali cliente)`, {});
    return { ok: true, note: "credenziali cliente accettate" };
  }

  fileTask(agent: Agent, kind: "copy" | "delete", fileId: string) {
    const { op, target } = this.requireOpSafe(agent);
    if (!op || !target) return { ok: false, error: "non sei collegato" };
    if (target.kind === "gateway") this.syncGatewayFiles(target);
    if (op.access !== "admin" && op.access !== "client") return { ok: false, error: "serve l'accesso admin" };
    if (!op.bypass.firewall) return { ok: false, error: "il firewall blocca i file: abbattilo prima" };
    const file = target.files.find((f) => f.id === fileId && !f.deleted);
    if (!file) return { ok: false, error: "file assente" };
    if (kind === "copy" && file.encryption && !op.decrypted.has(file.id)) return { ok: false, error: "il file è cifrato: decifralo prima" };
    this.noisy(op, agent, target);
    const running = op.tasks.filter((k) => k.state === "run");
    if (running.length >= maxTasks(agent.hw.memory)) return { ok: false, error: "memoria piena" };
    if (running.some((k) => k.tool === kind && k.arg.fileId === fileId)) return { ok: false, error: "già in corso" };
    op.tasks.push({
      id: uid("t"),
      tool: kind,
      label: `${kind === "copy" ? "Copia" : "Cancella"} · ${file.name}`,
      work: kind === "copy" ? file.size : toolWork("delete", {}),
      done: 0,
      usesModem: kind === "copy",
      state: "run",
      note: null,
      arg: { fileId },
      finishedAt: null,
    });
    return { ok: true };
  }

  alter(agent: Agent, recordId: string, field: string, value: string) {
    const { op, target } = this.requireOpSafe(agent);
    if (!op || !target) return { ok: false, error: "non sei collegato" };
    if (op.access !== "admin" && op.access !== "client") return { ok: false, error: "serve l'accesso admin" };
    const rec = target.records.find((r) => r.id === recordId);
    const f = rec?.fields.find((x) => x.key === field);
    if (!rec || !f) return { ok: false, error: "record assente" };
    if (!f.options.includes(value)) return { ok: false, error: "valore non ammesso" };
    if (f.value === value) return { ok: true };
    this.noisy(op, agent, target);
    rec.orig ??= {};
    if (!(field in rec.orig)) rec.orig[field] = f.value;
    const authentic = rec.orig[field]!;
    f.value = value;
    this.touch("node", target.id);
    if (op.access === "client") {
      // un blu con le credenziali del cliente: è un ripristino, non un'intrusione
      this.log(target, `RECORD fix ${rec.id}.${field} by ${agent.handle.toLowerCase()}`, {});
      if (value === authentic) this.bumpArchivist(agent);
      return { ok: true, note: "record corretto" };
    }
    op.touched = true;
    agent.ethics = clamp(agent.ethics - 3, -100, 100);
    this.log(target, `RECORD edit ${rec.id}.${field} by admin from {FROM}`, { opId: op.id, actorId: agent.id, fromIp: this.prevIp(op, agent) });
    if (value !== authentic && chance(0.6)) {
      this.eventMission("restore", target, (m) => {
        m.recordId = rec.id;
        m.field = field;
        m.value = authentic;
        m.title = `Ripristino: ${rec.name}`;
        m.brief = `Il fascicolo di ${rec.name} presso ${target.org} è stato manomesso. Il log dice quale campo è stato toccato; dalla copia cartacea risulta che il valore autentico era «${authentic}». Collegati con le credenziali cliente e rimettilo a posto.`;
        m.reward = 650 + this.tierOf(target) * 200;
        m.xp = 100;
      });
    }
    return { ok: true, note: "record aggiornato" };
  }

  take(agent: Agent, missionId: string) {
    const m = this.missions.get(missionId);
    if (!m || m.status !== "open") return { ok: false, error: "contratto non disponibile" };
    if (m.faction !== agent.faction) return { ok: false, error: "contratto dell'altra cellula" };
    if (m.ownerId && m.ownerId !== agent.id) return { ok: false, error: "contratto personale altrui" };
    if (agent.xp < m.minXp) return { ok: false, error: `serve rango più alto (${m.minXp} XP)` };
    const active = [...this.missions.values()].filter((x) => x.takenBy === agent.id && x.status === "taken").length;
    if (active >= 3) return { ok: false, error: "hai già tre contratti aperti" };
    if (m.type === "frame" && m.targetAgentId === agent.id) return { ok: false, error: "non puoi incastrare te stesso" };
    if (m.postedBy === agent.id) return { ok: false, error: "è la tua taglia" };
    if ((m.type === "raid" || m.type === "locate") && m.targetAgentId === agent.id) return { ok: false, error: "la taglia è su di te" };
    m.status = "taken";
    m.takenBy = agent.id;
    m.takenAt = now();
    // il cliente ti dà l'indirizzo del bersaglio (ma non quello dei PC di casa: quelli vanno trovati)
    if (this.node(m.nodeId)?.kind !== "home") this.reveal(agent, m.nodeId);
    this.reveal(agent, m.destNodeId);
    for (const id of m.clientNodes ?? []) this.reveal(agent, id);
    for (const o of m.objectives ?? []) this.reveal(agent, o.nodeId);
    if (m.limitMin) m.expiresAt = Math.min(m.expiresAt, now() + m.limitMin * 60_000);
    this.touch("mission", m.id);
    return { ok: true, note: m.limitMin ? `contratto accettato: hai ${m.limitMin} minuti` : "contratto accettato" };
  }

  abandon(agent: Agent, missionId: string) {
    const m = this.missions.get(missionId);
    if (!m || m.takenBy !== agent.id || m.status !== "taken") return { ok: false, error: "non è tuo" };
    if (m.ownerId || m.postedBy) {
      m.status = "open";
      m.takenBy = null;
    } else {
      m.status = "failed";
    }
    agent.xp = Math.max(0, agent.xp - 20);
    this.touch("mission", m.id);
    this.touch("agent", agent.id);
    return { ok: true, note: "contratto abbandonato (−20 XP)" };
  }

  deliver(agent: Agent, missionId: string, answer: string | null) {
    const m = this.missions.get(missionId);
    if (!m || m.takenBy !== agent.id || m.status !== "taken") return { ok: false, error: "non è un tuo contratto aperto" };
    const node = this.node(m.nodeId);
    if (!node) return { ok: false, error: "nodo scomparso" };
    const op = this.ops.get(agent.id);
    if (op && op.chain.at(-1) === node.id && agent.faction === "red") return { ok: false, error: "stacca prima di consegnare" };
    let ok = false;
    let fail: string | null = null;
    switch (m.type) {
      case "copy": {
        const st = agent.storage.find((s) => s.nodeId === node.id && s.fileId === m.fileId);
        if (st) {
          agent.storage = agent.storage.filter((s) => s !== st);
          ok = true;
          const poster = m.postedBy ? this.agents.get(m.postedBy) : null;
          if (poster) {
            poster.storage.push({ ...st, key: uid("st"), at: now() });
            this.touch("agent", poster.id);
          }
        } else fail = "il file non è nel tuo archivio";
        break;
      }
      case "wipe":
        ok = Boolean(node.files.find((f) => f.id === m.fileId)?.deleted);
        if (!ok) fail = "il file è ancora lì";
        break;
      case "alter": {
        const f = node.records.find((r) => r.id === m.recordId)?.fields.find((x) => x.key === m.field);
        ok = f?.value === m.value;
        if (!ok) fail = "il record non ha il valore richiesto";
        break;
      }
      case "backdoor":
        ok = node.backdoors.some((b) => b.ownerId === agent.id);
        if (!ok) fail = "nessun tuo backdoor sul relay";
        break;
      case "frame": {
        const victim = m.targetAgentId ? this.agents.get(m.targetAgentId) : null;
        const mine = node.logs.filter((l) => l.actorId === agent.id && l.removed === null);
        const forged = mine.some((l) => l.forged && l.fromIp === victim?.gatewayIp);
        const exposed = mine.some((l) => !l.forged && l.fromIp);
        ok = Boolean(victim && forged && !exposed);
        if (!ok) fail = !forged ? "nel log non c'è un accesso falsificato dal suo gateway" : "nel log ci sono ancora righe che portano a te";
        if (ok && victim) {
          this.addHeat(victim, 22, `prove a tuo carico in ${node.org}`);
          if (victim.jailUntil <= now()) this.charge(victim, "accesso abusivo a sistema informatico", 2, node.org);
          agent.ethics = clamp(agent.ethics - 8, -100, 100);
          if (!victim.npc) this.mail(victim, "GUARDIA DEL RETICOLO", `Indagato · ${node.org}`, `Il log di ${node.org} mostra un accesso dal tuo gateway ${victim.gatewayIp}. Calore +22.`);
          agent.stats.sabotage += 2;
        }
        break;
      }
      case "hunt": {
        if (!answer) return { ok: false, error: "inserisci l'IP del gateway colpevole" };
        const inc = m.incident ? this.incidents.get(m.incident.opId) : null;
        if (!inc) {
          fail = "l'incidente è stato archiviato";
          break;
        }
        const evidence = this.walk(inc.opId, inc.nodeId, agent.id);
        const ip = answer.trim();
        if (evidence && evidence === ip) {
          const suspect = this.agentByIp(ip)!;
          ok = true;
          inc.resolved = true;
          this.touch("incident", inc.opId);
          agent.stats.attributions += 1;
          this.bump(agent, "attrib");
          if (agent.stats.attributions >= 5) this.feat(agent, "hound");
          // un tuo sensore era sul nodo violato: il cliente paga meglio le prove di prima mano
          if (node.logs.some((l) => l.opId === inc.opId && l.mirrors?.includes(agent.id))) m.reward = Math.round(m.reward * (1 + SENSOR_BONUS));
          agent.ethics = clamp(agent.ethics + 3, -100, 100);
          this.reversePending(inc.opId);
          if (suspect.jailUntil <= now()) this.charge(suspect, inc.grave ? "frode bancaria" : "accesso abusivo a sistema informatico", inc.grave ? 3 : 2, node.kind === "gateway" ? "gateway privato" : node.org);
          this.learn(agent, ip, suspect.handle, `colpevole dell'intrusione a ${node.kind === "gateway" ? "il tuo gateway" : node.org}`);
          this.addHeat(suspect, 30, `${agent.handle} ti ha attribuito l'intrusione a ${node.org}`);
          const fine = Math.round(suspect.credits * 0.1);
          suspect.credits -= fine;
          this.touch("agent", suspect.id);
          if (!suspect.npc) this.mail(suspect, "GUARDIA DEL RETICOLO", `Attribuito · ${node.org}`, `${agent.handle} (cellula blu) ha ricostruito la catena fino a ${ip}. Calore +30, multa ${fmtCr(fine)}.`);
          this.feed(`${agent.handle} attribuisce l'intrusione a ${node.org}: era ${suspect.handle}.`, "blue");
        } else {
          m.status = "failed";
          this.touch("mission", m.id);
          agent.xp = Math.max(0, agent.xp - 40);
          this.touch("agent", agent.id);
          return { ok: false, error: evidence ? "attribuzione errata: le prove portano altrove. Contratto perso." : "le prove non reggono: la catena è spezzata. Contratto perso." };
        }
        break;
      }
      case "patch":
        ok = Boolean(node.patch && node.patch.until > now() && node.patch.by === agent.id);
        if (!ok) fail = "il nodo non risulta rinforzato da te";
        break;
      case "seal":
        ok = node.backdoors.filter((b) => b.ownerId !== agent.id).length === 0;
        if (!ok) fail = "il relay ha ancora backdoor";
        break;
      case "honeypot":
        ok = Boolean(node.files.find((f) => f.id === m.fileId)?.honeypot?.ownerId === agent.id);
        if (!ok) fail = "la trappola non è tua o non c'è";
        break;
      case "profile": {
        if (!answer) return { ok: false, error: "inserisci l'ID Reticolo" };
        if (answer.trim().toUpperCase() !== (m.answer ?? "").toUpperCase()) {
          m.status = "failed";
          this.touch("mission", m.id);
          agent.xp = Math.max(0, agent.xp - 30);
          this.touch("agent", agent.id);
          return { ok: false, error: "non è la persona giusta. Il cliente ha chiuso il contratto." };
        }
        ok = true;
        if (this.bump(agent, "profiles") >= 5) this.feat(agent, "profiler");
        break;
      }
      case "transfer": {
        const led = node.ledger?.find((l) => l.actorId === agent.id && l.from === m.fromAcct && l.to === m.toAcct && l.amount >= (m.amount ?? 0));
        ok = Boolean(led && !led.reversed);
        if (!ok) fail = led ? "il bonifico è stato stornato" : "nel registro della banca non c'è il movimento richiesto";
        break;
      }
      case "purge":
        ok = this.plainFiles(node).length === 0;
        if (!ok) fail = `sul server restano ${this.plainFiles(node).length} file`;
        if (ok) {
          this.feat(agent, "crash");
          agent.ethics = clamp(agent.ethics - 10, -100, 100);
          this.feed(`LUMEN NEWS · I server di ${node.org} sono stati azzerati nella notte.`, "red");
        }
        break;
      case "courier":
        ok = Boolean(m.delivered);
        if (!ok) fail = "il carico non è ancora arrivato a destinazione";
        if (ok) this.feat(agent, "courier");
        break;
      case "restore": {
        const f = node.records.find((r) => r.id === m.recordId)?.fields.find((x) => x.key === m.field);
        ok = f?.value === m.value;
        if (!ok) fail = "il record non è ancora quello autentico";
        break;
      }
      case "recover":
        ok = node.files.find((f) => f.id === m.fileId)?.deleted === false;
        if (!ok) fail = "il file non è ancora stato ripristinato";
        break;
      case "reverse":
        ok = Boolean(node.ledger?.find((l) => l.id === m.ledgerId)?.reversed);
        if (!ok) fail = "il bonifico non risulta stornato";
        break;
      case "findata":
      case "tracemoney": {
        if (!answer) return { ok: false, error: m.type === "findata" ? "inserisci il numero di conto" : "inserisci nome e cognome" };
        const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, " ");
        if (norm(answer) !== norm(m.answer ?? "")) {
          m.status = "failed";
          this.touch("mission", m.id);
          agent.xp = Math.max(0, agent.xp - 30);
          this.touch("agent", agent.id);
          return { ok: false, error: "risposta sbagliata. Il cliente ha chiuso il contratto." };
        }
        ok = true;
        break;
      }
      case "arrest": {
        const f = node.records.find((r) => r.id === m.recordId)?.fields;
        ok = f?.find((x) => x.key === "record")?.value === m.value && f?.find((x) => x.key === "status")?.value === "ricercato";
        if (!ok) fail = "il fascicolo non ha i precedenti richiesti e lo stato «ricercato»";
        if (ok) {
          // la polizia fa il resto: l'arresto finisce sul giornale
          const st = f!.find((x) => x.key === "status")!;
          st.value = "detenuto";
          this.touch("node", node.id);
          agent.ethics = clamp(agent.ethics - 10, -100, 100);
          this.feed(`LUMEN NEWS · Arrestato ${node.records.find((r) => r.id === m.recordId)?.name}: «${m.value}». Si dichiara estraneo ai fatti.`, "red");
        }
        break;
      }
      case "chain":
      case "spree":
      case "stunt":
      case "audit": {
        const left = (m.objectives ?? []).filter((o) => this.objectiveCount(agent, m, o) < o.n);
        ok = !left.length;
        if (!ok) fail = `manca: ${left[0]!.label}`;
        break;
      }
      case "sabotage":
        ok = node.offlineBy === agent.id && (node.cooldown?.shutdown ?? 0) - 40 * 60_000 >= (m.takenAt ?? 0);
        if (!ok) fail = "non risulta che tu abbia spento quel sistema dopo aver accettato";
        break;
      case "restart":
        ok = (node.offlineUntil ?? 0) < now();
        if (!ok) fail = "il sistema è ancora spento";
        break;
      case "raid":
        ok = (agent.raids ?? []).some((r) => r.targetId === m.targetAgentId && r.at >= (m.takenAt ?? 0));
        if (!ok) fail = "non risulta un tuo assalto riuscito a quel gateway dopo l'accettazione";
        break;
      case "locate": {
        const target = m.targetAgentId ? this.agents.get(m.targetAgentId) : null;
        if (!answer) return { ok: false, error: "inserisci l'IP del gateway" };
        ok = Boolean(target && answer.trim() === target.gatewayIp);
        if (!ok) fail = "non è il suo indirizzo";
        if (ok && target) {
          this.learn(agent, target.gatewayIp, target.handle, "taglia di localizzazione");
          const poster = m.postedBy ? this.agents.get(m.postedBy) : null;
          if (poster) this.learn(poster, target.gatewayIp, target.handle, `trovato da ${agent.handle}`);
        }
        break;
      }
    }
    if (!ok) return { ok: false, error: fail ?? "obiettivo non raggiunto" };
    m.status = "done";
    const tier = m.tier ?? 0;
    let pay = m.reward;
    const notes: string[] = [];
    // «Senza traccia»: nel log del nodo non deve restare nessuna tua riga leggibile
    if (m.mods?.includes("ghost")) {
      const clean = !node.logs.some((l) => l.actorId === agent.id && l.removed === null && l.fromIp);
      if (clean) {
        pay = Math.round(pay * 1.5);
        notes.push("senza traccia +50%");
      } else notes.push("hai lasciato tracce: niente bonus");
    }
    // le taglie pagano quello che c'è in deposito; i contratti dei clienti risentono dei chip
    if (!m.postedBy) pay = Math.round(pay * (1 + this.chip(agent, "payout") / 100 + this.spec(agent, "finanza") * 0.01));
    if (agent.buffs?.fixer && !m.postedBy) {
      pay = Math.round(pay * 1.5);
      agent.buffs.fixer = 0;
      notes.push("parola del fixer +50%");
    }
    if (!agent.npc) {
      this.bump(agent, `m:${m.type}`);
      if (m.scene) this.bump(agent, `sc:${m.scene}`);
      if (tier >= 3) this.bump(agent, "elite");
      if (m.postedBy) this.bump(agent, "bounty");
      if (notes.includes("senza traccia +50%")) this.bump(agent, "ghostpay");
    }
    m.reward = pay;
    this.addFame(agent, [2, 4, 8, 15, 30][tier]!);
    this.feat(agent, "first");
    if (tier >= 3) this.feed(`LUMEN NEWS · Si parla di ${agent.handle}: «${m.title}» è il colpo della settimana.`, agent.faction);
    const sure = Boolean(agent.buffs?.dice);
    if (sure) agent.buffs!.dice = 0;
    if (!m.ownerId && (sure || Math.random() < (TIER_LOOT[tier]! + this.chip(agent, "luck") / 100 + this.spec(agent, "esplorazione") * 0.005) * this.num("lootMult"))) {
      const item = this.rollItem([[70, 25, 5, 0], [50, 35, 13, 2], [30, 40, 24, 6], [15, 35, 35, 15], [0, 25, 45, 30]][tier]!);
      this.mwLoot?.(agent, tier);
      this.giveItem(agent, item);
      notes.push(`bottino: ${item.name}`);
    }
    if (agent.faction === "blue") agent.ethics = clamp(agent.ethics + 1, -100, 100);
    agent.credits += m.reward;
    agent.xp += Math.round(m.xp * (1 + this.chip(agent, "xp") / 100 + this.spec(agent, "difesa") * 0.01) * (this.mwXp?.(agent) ?? 1));
    this.meta.war[agent.faction] += 1 + Math.round(m.reward / 1000);
    this.touch("mission", m.id);
    this.touch("agent", agent.id);
    this.touch("meta", "world");
    this.feed(`${agent.handle} ha chiuso «${m.title}» (${MISSION_LABEL[m.type]}).`, agent.faction);
    const poster = m.postedBy ? this.agents.get(m.postedBy) : null;
    if (poster && !poster.npc) this.mail(poster, "BACHECA", `Taglia eseguita: ${m.title}`, `${agent.handle} ha portato a termine la tua taglia e ha incassato ${fmtCr(m.reward)}.`);
    this.fillBoard();
    return { ok: true, note: `consegnato · +${fmtCr(m.reward)} · +${m.xp} XP${notes.length ? ` · ${notes.join(" · ")}` : ""}` };
  }

  // ------------------------------------------------------------ mercato nero

  fileValue(st: StoredFile) {
    return st.value ?? this.node(st.nodeId)?.files.find((f) => f.id === st.fileId)?.value ?? 1;
  }

  listFile(agent: Agent, key: string, price: number) {
    const st = agent.storage.find((x) => x.key === key);
    if (!st) return { ok: false, error: "file non nel tuo archivio" };
    if (!Number.isFinite(price) || price < 100 || price > 50000) return { ok: false, error: "prezzo fra 100 e 50.000 CR" };
    if ([...this.listings.values()].filter((l) => l.sellerId === agent.id).length >= 5) return { ok: false, error: "massimo 5 annunci alla volta" };
    agent.storage = agent.storage.filter((x) => x !== st);
    const l: Listing = { id: uid("ls"), sellerId: agent.id, file: st, price: Math.round(price), createdAt: now(), expiresAt: now() + LISTING_HOURS * 3600_000 };
    this.listings.set(l.id, l);
    this.touch("listing", l.id);
    this.touch("agent", agent.id);
    for (const id of this.online) this.dirty.add(id);
    return { ok: true, note: `${st.name} in vendita a ${fmtCr(l.price)}` };
  }

  unlist(agent: Agent, id: string) {
    const l = this.listings.get(id);
    if (!l || l.sellerId !== agent.id) return { ok: false, error: "annuncio non tuo" };
    this.listings.delete(id);
    this.touch("listing", id);
    agent.storage.push(l.file);
    this.touch("agent", agent.id);
    for (const oid of this.online) this.dirty.add(oid);
    return { ok: true, note: "annuncio ritirato" };
  }

  buyListing(agent: Agent, id: string) {
    const l = this.listings.get(id);
    if (!l || l.expiresAt < now()) return { ok: false, error: "annuncio non più disponibile" };
    if (l.sellerId === agent.id) return { ok: false, error: "è il tuo annuncio" };
    if (agent.credits < l.price) return { ok: false, error: "crediti insufficienti" };
    if (agent.storage.reduce((s2, x) => s2 + x.size, 0) + l.file.size > this.storageMax(agent)) return { ok: false, error: "archivio pieno" };
    const seller = this.agents.get(l.sellerId);
    const net = Math.round(l.price * (1 - MARKET_FEE));
    agent.credits -= l.price;
    agent.storage.push({ ...l.file, key: uid("st"), at: now() });
    this.listings.delete(id);
    this.touch("listing", id);
    this.touch("agent", agent.id);
    if (seller) {
      seller.credits += net;
      this.touch("agent", seller.id);
      if (!seller.npc) {
        this.bump(seller, "sold");
        this.bump(seller, "earned", net);
      }
      if (!seller.npc) this.mail(seller, "MERCATO NERO", `Venduto: ${l.file.name}`, `Un compratore ha pagato ${fmtCr(l.price)}. Al netto della trattenuta ti restano ${fmtCr(net)}.`);
    }
    this.feed(`Sul mercato nero è passato di mano ${l.file.name}.`, "sys");
    return { ok: true, note: `${l.file.name} acquistato` };
  }

  fence(agent: Agent, key: string) {
    const st = agent.storage.find((x) => x.key === key);
    if (!st) return { ok: false, error: "file non nel tuo archivio" };
    if (st.cargo) return { ok: false, error: "il ricettatore non tocca i carichi dei corrieri" };
    // lo stesso file non lo ricompra a prezzo pieno: sul mercato non vale niente una seconda copia
    const fkey = `${st.nodeId}:${st.fileId}`;
    const repeat = !st.item && now() - (agent.fenced[fkey] ?? 0) < FENCE_MEMORY;
    const demand = this.fenceDemand?.(st) ?? 1;
    const price = Math.round(this.priceOf(st) * demand * (repeat ? FENCE_REPEAT : 1) * this.num("fenceMult") * (1 + this.chip(agent, "fence") / 100));
    if (!repeat) this.fenceSold?.(st);
    if (!st.item) agent.fenced[fkey] = now();
    agent.storage = agent.storage.filter((x) => x !== st);
    agent.credits += price;
    this.touch("agent", agent.id);
    return { ok: true, note: repeat ? `il ricettatore ce l'ha già: ${fmtCr(price)}` : demand >= 1.3 ? `il ricettatore lo cercava proprio: ${fmtCr(price)}` : demand < 0.8 ? `il ricettatore ne ha pieni i cassetti: ${fmtCr(price)}` : `il ricettatore paga ${fmtCr(price)}` };
  }

  // ------------------------------------------------------------ taglie dei giocatori

  missionWhere(m: Mission) {
    if (m.type === "locate" || m.type === "findata") return "indagine libera";
    if (this.node(m.nodeId)?.kind === "home") return "un PC privato: indirizzo da trovare";
    const node = this.node(m.nodeId);
    if (!node) return "?";
    if (node.kind === "gateway") {
      const owner = this.gatewayOwner(node);
      return m.type === "hunt" ? "il tuo gateway" : `gateway di ${owner?.handle ?? "?"}`;
    }
    return `${node.name} · ${node.ip}`;
  }

  refundBounty(m: Mission, why: string) {
    if (!m.postedBy) return;
    const poster = this.agents.get(m.postedBy);
    if (!poster) return;
    poster.credits += m.reward;
    this.touch("agent", poster.id);
    if (!poster.npc) this.mail(poster, "BACHECA", `Taglia rimborsata: ${m.title}`, `La taglia ${why}. Ti tornano ${fmtCr(m.reward)} (la commissione no).`);
  }

  postBounty(agent: Agent, p: Record<string, unknown>) {
    const type = String(p.type) as MissionType;
    const audience: Faction = p.audience === "blue" ? "blue" : "red";
    const reward = Math.round(Number(p.reward));
    const hours = Math.max(1, Math.min(24, Math.round(Number(p.hours ?? 6))));
    if (!["copy", "wipe", "raid", "frame", "locate"].includes(type)) return { ok: false, error: "tipo di taglia non ammesso" };
    if (!Number.isFinite(reward) || reward < BOUNTY_MIN || reward > BOUNTY_MAX) return { ok: false, error: `ricompensa fra ${BOUNTY_MIN} e ${BOUNTY_MAX} CR` };
    const fee = Math.ceil(reward * BOUNTY_FEE);
    if (agent.credits < reward + fee) return { ok: false, error: `servono ${fmtCr(reward + fee)} (ricompensa più commissione)` };
    const mine = [...this.missions.values()].filter((m) => m.postedBy === agent.id && (m.status === "open" || m.status === "taken")).length;
    if (mine >= 3) return { ok: false, error: "hai già tre taglie aperte" };

    let node: WNode | null = null;
    let target: Agent | null = null;
    let fileId: string | null = null;
    if (type === "copy" || type === "wipe" || type === "frame") {
      node = this.node(String(p.nodeId ?? ""));
      if (!node || node.kind === "relay" || node.kind === "registry" || node.kind === "gateway") return { ok: false, error: "scegli un nodo bersaglio" };
    }
    if (type === "copy" || type === "wipe") {
      const f = node!.files.find((x) => x.id === p.fileId && !x.deleted);
      if (!f) return { ok: false, error: "scegli un file presente sul nodo" };
      fileId = f.id;
    }
    if (type === "raid" || type === "frame" || type === "locate") {
      const h = String(p.target ?? "").trim().toLowerCase();
      target = [...this.agents.values()].find((a) => a.handle.toLowerCase() === h) ?? null;
      if (!target) return { ok: false, error: "handle sconosciuto" };
      if (target.id === agent.id) return { ok: false, error: "non puoi mettere una taglia su te stesso" };
      if (type === "raid" && !target.npc && target.xp < GATEWAY_PROTECTION_XP) return { ok: false, error: "quel gateway è ancora protetto" };
    }
    if (type === "frame" && audience !== "red") return { ok: false, error: "gli incastri sono lavoro da rossi" };
    if (type === "raid") node = this.nodes.get(this.gatewayId(target!)) ?? null;
    if (type === "locate") node = this.node("registry");
    if (!node) return { ok: false, error: "bersaglio non valido" };

    const m = this.baseMission(audience, type, node);
    const file = fileId ? node.files.find((f) => f.id === fileId) : null;
    m.fileId = fileId;
    m.targetAgentId = target?.id ?? null;
    m.reward = reward;
    m.xp = Math.min(300, 40 + Math.round(reward / 50));
    m.minXp = type === "raid" ? GATEWAY_PROTECTION_XP : m.minXp;
    m.clientAccess = false;
    m.postedBy = agent.id;
    m.expiresAt = now() + hours * 3600_000;
    const sec = node.kind === "gateway" || node.kind === "registry" ? [] : this.secRequires(node);
    switch (type) {
      case "copy":
        m.title = `Taglia: ${file!.name}`;
        m.brief = `${agent.handle} vuole una copia di ${file!.name} da ${node.org}. Consegnala dalla bacheca: il file passa a chi ha messo la taglia.`;
        m.requires = [...sec, ...(file!.encryption ? (["decrypt"] as ToolId[]) : [])];
        break;
      case "wipe":
        m.title = `Taglia: via ${file!.name}`;
        m.brief = `${agent.handle} vuole che ${file!.name} sparisca da ${node.org}.`;
        m.requires = sec;
        break;
      case "raid":
        m.title = `Taglia: colpisci ${target!.handle}`;
        m.brief = `${agent.handle} paga chi entra nel gateway di ${target!.handle} e lo prosciuga o gli sabota la CPU, dopo aver accettato. L'indirizzo trovalo tu.`;
        m.requires = ["proxy", "firewall"];
        break;
      case "frame":
        m.title = `Taglia: incastra ${target!.handle}`;
        m.brief = `${agent.handle} vuole ${target!.handle} sotto inchiesta: nel log di ${node.org} deve restare un accesso falsificato dal suo gateway, e nessuna riga che porti a te.`;
        m.requires = [...sec, "logdel"];
        break;
      case "locate":
        m.title = `Taglia: dov'è ${target!.handle}?`;
        m.brief = `${agent.handle} vuole l'indirizzo del gateway di ${target!.handle}. Consegna l'IP: l'indirizzo arriva anche a chi ha messo la taglia.`;
        m.requires = [];
        break;
    }
    agent.credits -= reward + fee;
    this.missions.set(m.id, m);
    this.touch("mission", m.id);
    this.touch("agent", agent.id);
    this.feed(`Nuova taglia di ${agent.handle}: «${m.title}» (${fmtCr(reward)}).`, audience);
    return { ok: true, note: `taglia pubblicata · −${fmtCr(reward + fee)}` };
  }

  cancelBounty(agent: Agent, id: string) {
    const m = this.missions.get(id);
    if (!m || m.postedBy !== agent.id) return { ok: false, error: "non è una tua taglia" };
    if (m.status !== "open") return { ok: false, error: "qualcuno ci sta già lavorando" };
    m.status = "expired";
    this.touch("mission", m.id);
    this.refundBounty(m, "è stata ritirata");
    return { ok: true, note: "taglia ritirata" };
  }

  buyTool(agent: Agent, tool: ToolId) {
    const def = toolDef(tool);
    if (!def) return { ok: false, error: "strumento sconosciuto" };
    // stesso catalogo per tutti, due canali: fuori dal proprio si paga un sovrapprezzo
    const next = (agent.tools[tool] ?? 0) + 1;
    if (next > MAX_TOOL_VERSION) return { ok: false, error: "già alla versione massima" };
    const cost = toolCost(tool, next, agent.faction);
    if (agent.credits < cost) return { ok: false, error: "crediti insufficienti" };
    agent.credits -= cost;
    agent.tools[tool] = next;
    this.touch("agent", agent.id);
    return { ok: true, note: `${def.name} v${next} installato` };
  }

  buyHw(agent: Agent, hw: HardwareId) {
    if (!["cpu", "modem", "memory", "shield", "soc"].includes(hw)) return { ok: false, error: "componente sconosciuto" };
    if (hw === "soc" && agent.faction !== "blue") return { ok: false, error: "la Console SOC è dei blu" };
    const level = agent.hw[hw];
    if (level >= MAX_HW) return { ok: false, error: "già al massimo" };
    const cost = hwCost(level);
    if (agent.credits < cost) return { ok: false, error: "crediti insufficienti" };
    if (this.ops.has(agent.id)) return { ok: false, error: "non si cambia hardware a connessione aperta" };
    agent.credits -= cost;
    agent.hw[hw] = level + 1;
    this.touch("agent", agent.id);
    if (hw === "shield") this.ensureGateway(agent, true);
    return { ok: true, note: `${hw === "shield" ? "Difese" : hw.toUpperCase()} → livello ${level + 1}` };
  }

  registry(agent: Agent, query: string) {
    const q = query.trim();
    if (!q) return { ok: false, error: "scrivi un IP o un handle" };
    const cost = 200;
    if (agent.credits < cost) return { ok: false, error: "il Registro costa 200 CR" };
    agent.credits -= cost;
    this.touch("agent", agent.id);
    const node = this.agentByIp(q) ? null : this.nodeByIp(q);
    if (node && this.gatewayOwner(node) === null) {
      this.reveal(agent, node.id);
      return { ok: true, data: { lines: [`${q} → ${node.name} · ${node.org}${node.hidden ? "" : " (ora sulla tua mappa)"}`] }, note: "−200 CR" };
    }
    // ricerca per nome: il Registro conosce le organizzazioni, non i privati
    if (q.length >= 4 && !this.agentByIp(q)) {
      const hits = [...this.nodes.values()].filter((n) => !n.hidden && n.kind !== "gateway" && n.kind !== "home" && n.org.toLowerCase().includes(q.toLowerCase())).slice(0, 4);
      if (hits.length) {
        for (const n of hits) this.reveal(agent, n.id);
        return { ok: true, data: { lines: hits.map((n) => `${n.org} → ${n.ip} · ${n.city ?? ""} (ora sulla tua mappa)`) }, note: "−200 CR" };
      }
    }
    const byIp = this.agentByIp(q);
    if (byIp) this.learn(agent, byIp.gatewayIp, byIp.handle, "dal Registro");
    if (byIp) return { ok: true, data: { lines: [`${q} → gateway privato registrato a «${byIp.handle}»`] }, note: "−200 CR" };
    const byHandle = [...this.agents.values()].find((a) => a.handle.toLowerCase() === q.toLowerCase());
    if (byHandle) this.learn(agent, byHandle.gatewayIp, byHandle.handle, "dal Registro");
    if (byHandle) return { ok: true, data: { lines: [`«${byHandle.handle}» → gateway ${byHandle.gatewayIp}`] }, note: "−200 CR" };
    return { ok: true, data: { lines: [`${q}: nessuna voce. Indirizzo dismesso o mai registrato.`] }, note: "−200 CR" };
  }

  preside(agent: Agent, nodeId: string) {
    if (agent.faction !== "blue") return { ok: false, error: "solo i blu presidiano" };
    const node = this.node(nodeId);
    if (!node || node.kind === "relay" || node.kind === "registry" || node.kind === "gateway") return { ok: false, error: "si presidiano solo i nodi bersaglio" };
    const t = now();
    agent.presiding = agent.presiding.filter((x) => x.until > t);
    if (agent.presiding.some((x) => x.nodeId === nodeId)) {
      agent.presiding = agent.presiding.filter((x) => x.nodeId !== nodeId);
      this.touch("agent", agent.id);
      return { ok: true, note: "presidio tolto" };
    }
    const max = socPresidia(agent.hw.soc);
    if (agent.presiding.length >= max) return { ok: false, error: `la tua Console SOC regge ${max} presid${max === 1 ? "io" : "i"}: toglierne uno, o potenziarla` };
    const mins = socPresidioMin(agent.hw.soc);
    agent.presiding.push({ nodeId, until: t + mins * 60_000 });
    this.touch("agent", agent.id);
    return { ok: true, note: `presidi ${node.org} per ${mins} minuti` };
  }

  // ------------------------------------------------------------ sensori e analista (blu)

  deploySensor(agent: Agent, nodeId: string) {
    if (agent.faction !== "blue") return { ok: false, error: "i sensori sono dei blu" };
    const node = this.node(nodeId);
    if (!node || node.kind === "registry" || node.kind === "gateway" || node.hidden) return { ok: false, error: "qui non si possono installare sensori" };
    const t = now();
    const mine = [...this.nodes.values()].reduce((n, x) => n + (x.sensors ?? []).filter((q) => q.ownerId === agent.id && q.until > t).length, 0);
    const max = socSensors(agent.hw.soc);
    if ((node.sensors ?? []).some((x) => x.ownerId === agent.id && x.until > t)) return { ok: false, error: "hai già un sensore qui" };
    if (mine >= max) return { ok: false, error: `la tua Console SOC regge ${max} sensori` };
    if (agent.credits < SENSOR_COST) return { ok: false, error: `un sensore costa ${fmtCr(SENSOR_COST)}` };
    agent.credits -= SENSOR_COST;
    node.sensors = [...(node.sensors ?? []).filter((x) => x.until > t), { ownerId: agent.id, until: t + SENSOR_MINUTES * 60_000, lines: [] }];
    this.touch("node", node.id);
    this.touch("agent", agent.id);
    return { ok: true, note: `sensore su ${node.name} per ${SENSOR_MINUTES} minuti · −${fmtCr(SENSOR_COST)}` };
  }

  /** Un rosso con l'accesso admin trova e stacca i sensori del nodo. Resta nel log, e nelle copie già fatte. */
  sweepSensors(agent: Agent) {
    const { op, target } = this.requireOpSafe(agent);
    if (!op || !target) return { ok: false, error: "non sei collegato" };
    if (op.access !== "admin") return { ok: false, error: "serve l'accesso admin" };
    const t = now();
    const hit = (target.sensors ?? []).filter((x) => x.ownerId !== agent.id && x.until > t);
    if (!hit.length) return { ok: false, error: "nessun sensore qui" };
    this.log(target, "SYS tap removed src={FROM}", { opId: op.id, actorId: agent.id, fromIp: this.prevIp(op, agent) });
    target.sensors = (target.sensors ?? []).filter((x) => !hit.includes(x));
    // staccato prima che trasmetta: la copia di questa sessione va persa (quelle delle sessioni passate no)
    const owners = hit.map((x) => x.ownerId);
    for (const l of target.logs) if (l.opId === op.id && l.mirrors) l.mirrors = l.mirrors.filter((id) => !owners.includes(id));
    agent.stats.sabotage += hit.length;
    op.touched = true;
    for (const sx of hit) {
      const owner = this.agents.get(sx.ownerId);
      if (owner && !owner.npc) this.mail(owner, "SOC", `Sensore perso: ${target.name}`, `Qualcuno ha staccato il tuo sensore su ${target.org} prima che trasmettesse: quello che stava registrando è perso.`);
    }
    this.touch("node", target.id);
    return { ok: true, note: `${hit.length} sensor${hit.length === 1 ? "e staccato" : "i staccati"}` };
  }

  hireAnalyst(agent: Agent) {
    if (agent.faction !== "blue") return { ok: false, error: "l'analista lavora per i blu" };
    if (agent.credits < ANALYST_COST) return { ok: false, error: `un turno costa ${fmtCr(ANALYST_COST)}` };
    agent.credits -= ANALYST_COST;
    agent.analystUntil = Math.max(now(), agent.analystUntil) + ANALYST_MINUTES * 60_000;
    this.touch("agent", agent.id);
    return { ok: true, note: `analista di turno per ${ANALYST_MINUTES} minuti · −${fmtCr(ANALYST_COST)}` };
  }

  gatewayAdmin(agent: Agent) {
    const { op, target } = this.requireOpSafe(agent);
    if (!op || !target) return { error: "non sei collegato" } as const;
    const victim = this.gatewayOwner(target);
    if (!victim) return { error: "funziona solo dentro un gateway" } as const;
    if (op.access !== "admin") return { error: "serve l'accesso admin" } as const;
    return { op, target, victim } as const;
  }

  siphon(agent: Agent) {
    const g = this.gatewayAdmin(agent);
    if ("error" in g) return { ok: false, error: g.error };
    const { op, target, victim } = g;
    if (op.looted) return { ok: false, error: "conti già prosciugati in questa sessione" };
    if (now() - victim.lastSiphonAt < SIPHON_COOLDOWN) return { ok: false, error: "conti già svuotati di recente: il denaro è stato messo al sicuro" };
    const amount = Math.min(SIPHON_MAX, Math.round(victim.credits * SIPHON_SHARE));
    if (amount <= 0) return { ok: false, error: "conti vuoti" };
    victim.credits -= amount;
    victim.lastSiphonAt = now();
    agent.credits += amount;
    agent.stats.sabotage += 1;
    op.looted = true;
    agent.raids = [...(agent.raids ?? []), { targetId: victim.id, at: now() }].slice(-20);
    op.touched = true;
    op.stolen += amount;
    this.log(target, `BANK transfer ${amount} CR to {FROM}`, { opId: op.id, actorId: agent.id, fromIp: this.prevIp(op, agent) });
    this.touch("agent", victim.id);
    this.touch("agent", agent.id);
    this.dirty.add(victim.id);
    if (!victim.npc) this.out.toast(victim.id, `Prelievo non autorizzato: −${fmtCr(amount)}`, "bad");
    this.feed(`Un gateway è stato svuotato: ${victim.handle} perde ${fmtCr(amount)}.`, "red");
    return { ok: true, note: `+${fmtCr(amount)} trasferiti` };
  }

  overload(agent: Agent) {
    const g = this.gatewayAdmin(agent);
    if ("error" in g) return { ok: false, error: g.error };
    const { op, target, victim } = g;
    if (op.overloaded) return { ok: false, error: "CPU già sabotata" };
    victim.overloadUntil = now() + OVERLOAD_MS;
    agent.stats.sabotage += 1;
    op.overloaded = true;
    agent.raids = [...(agent.raids ?? []), { targetId: victim.id, at: now() }].slice(-20);
    op.touched = true;
    this.log(target, "SYS cpu governor tampered src={FROM}", { opId: op.id, actorId: agent.id, fromIp: this.prevIp(op, agent) });
    this.touch("agent", victim.id);
    this.dirty.add(victim.id);
    if (!victim.npc) this.out.toast(victim.id, "La CPU del tuo gateway è stata sabotata: strumenti a metà velocità per 10 minuti.", "bad");
    return { ok: true, note: "CPU del bersaglio dimezzata per 10 minuti" };
  }

  counter(agent: Agent, opId: string) {
    const op = [...this.ops.values()].find((o) => o.id === opId);
    if (!op) return { ok: false, error: "l'intrusione è già finita" };
    const ownGateway = op.chain.at(-1) === this.gatewayId(agent);
    if (!ownGateway && agent.faction !== "blue") return { ok: false, error: "solo i blu, o il proprietario del gateway" };
    if (!ownGateway && !agent.presiding.some((x) => x.nodeId === op.chain.at(-1) && x.until > now())) return { ok: false, error: "non presidi quel nodo" };
    if (agent.counterReadyAt > now()) return { ok: false, error: `contro-trace in ricarica (${Math.ceil((agent.counterReadyAt - now()) / 1000)}s)` };
    op.boostUntil = now() + 20_000;
    op.boostBy = agent.handle;
    op.boostPower = ownGateway ? 1.7 : socBoost(agent.hw.soc);
    if (!op.trace.active) op.trace.active = true;
    agent.counterReadyAt = now() + (ownGateway ? 35 : socCooldown(agent.hw.soc)) * 1000;
    this.touch("agent", agent.id);
    this.out.toast(op.agentId, `CONTRO-TRACE: ${agent.handle} ti sta inseguendo!`, "bad");
    this.dirty.add(op.agentId);
    return { ok: true, note: "contro-trace lanciato per 20 secondi" };
  }

  // ------------------------------------------------------------ NPC

  /** La botnet: ogni worm vivo rende qualche credito al suo padrone; dopo un'ora si spegne da solo. */
  wormTick() {
    const t = now();
    const gain = new Map<string, number>();
    for (const n of this.nodes.values()) {
      if (!n.worms?.length) continue;
      const live = n.worms.filter((w) => t - w.at < WORM_LIFE_MIN * 60_000 && this.agents.has(w.ownerId));
      if (live.length !== n.worms.length) {
        n.worms = live;
        this.touch("node", n.id);
      }
      if ((n.offlineUntil ?? 0) > t) continue;
      for (const w of live) gain.set(w.ownerId, (gain.get(w.ownerId) ?? 0) + wormYield(this.tierOf(n), w.version));
    }
    for (const [id, cr] of gain) {
      const a = this.agents.get(id)!;
      a.credits += cr;
      this.touch("agent", id);
      this.dirty.add(id);
      if (!a.npc) {
        this.bump(a, "wormcr", cr);
        this.bump(a, "earned", cr);
      }
    }
  }

  pulse() {
    if (!this.on("npcActive")) return;
    const ghosts = [...this.agents.values()].filter((a) => a.npc);
    if (!ghosts.length) return;
    const g = pick(ghosts);
    const relays = [...this.nodes.values()].filter((n) => n.kind === "relay");
    const targets = this.openTargets();
    if (g.faction === "red") {
      // un'operazione fantasma lascia una catena reale di log, che i blu possono cacciare
      const target = pick(targets);
      const chain = relays.sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3));
      const opId = uid("op");
      let prev = g.gatewayIp;
      for (let i = 0; i < chain.length; i += 1) {
        const next = i + 1 < chain.length ? chain[i + 1]!.ip : target.ip;
        this.log(chain[i]!, `ROUTE {FROM} -> ${next}`, { opId, actorId: g.id, fromIp: prev });
        prev = chain[i]!.ip;
      }
      this.log(target, "CONNECT from {FROM}", { opId, actorId: g.id, fromIp: prev });
      this.log(target, "LOGIN admin from {FROM}", { opId, actorId: g.id, fromIp: prev });
      const file = this.plainFiles(target)[0];
      if (file) this.log(target, `FILE copy ${file.name} by admin from {FROM}`, { opId, actorId: g.id, fromIp: prev });
      // gli NPC più bravi puliscono il bersaglio
      if (Math.random() < g.skill) {
        for (const l of target.logs) if (l.opId === opId) Object.assign(l, { removed: Math.random() < g.skill ? "clean" : "gap", removedAt: now() });
      }
      if (Math.random() < 0.3) {
        const r = pick(relays);
        if (!r.backdoors.some((b) => b.ownerId === g.id)) r.backdoors.push({ ownerId: g.id, version: 1, at: now() });
        this.touch("node", r.id);
      }
      g.xp += 40;
      g.credits += 500;
      g.stats.ops += 1;
      this.touch("agent", g.id);
      this.registerIncident({ id: opId, agentId: g.id, nodeId: target.id, touched: true });
      this.feed(`Segnale non attribuito su ${target.org}.`, "red");
      this.meta.war.red += 1;
    } else {
      const poisoned = relays.filter((r) => r.backdoors.length);
      if (poisoned.length && Math.random() < 0.6) {
        const r = pick(poisoned);
        const lost = r.backdoors.filter((b) => b.version < 3);
        r.backdoors = r.backdoors.filter((b) => b.version >= 3);
        for (const b of lost) {
          const owner = this.agents.get(b.ownerId);
          if (owner && !owner.npc) this.mail(owner, "BACKDOOR", `Perso: ${r.name}`, `Il tuo backdoor su ${r.name} è stato bonificato da ${g.handle}.`);
        }
        this.touch("node", r.id);
        this.feed(`${g.handle} ha bonificato ${r.name}.`, "blue");
      } else {
        // i nodi dei contratti di prova restano come li descrive il tutorial
        const target = pick(targets.filter((n) => n.id !== "halcyon-uni" && n.id !== "lumen-news"));
        target.patch = { until: now() + 15 * 60_000, level: 1, by: g.id };
        this.touch("node", target.id);
        this.feed(`${g.handle} ha rinforzato ${target.org}.`, "blue");
      }
      // i blu NPC chiudono a volte le cacce aperte da più tempo
      const stale = [...this.missions.values()].find((m) => m.type === "hunt" && m.status === "open" && now() - m.createdAt > 15 * 60_000);
      if (stale && Math.random() < g.skill) {
        stale.status = "done";
        this.touch("mission", stale.id);
      }
      g.xp += 30;
      g.credits += 400;
      this.touch("agent", g.id);
      this.meta.war.blue += 1;
    }
    this.touch("meta", "world");
  }
}

class UserError extends Error {}

export type AgentDoc = Agent;
export type NodeDoc = WNode;
export type OpDoc = Op;
export type MissionDoc = Mission;

function renderLog(l: LogEntry) {
  return l.text.replace("{FROM}", l.fromIp ?? "?");
}

function scramble(text: string, seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return text.replace(/[A-Za-zÀ-ÿ]/g, () => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return String.fromCharCode(33 + ((h >>> 0) % 90));
  });
}

function asStrList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function hhmm(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
