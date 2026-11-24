// Il pannello dell'amministratore: le regolazioni del mondo e i tipi dei dati che il server gli manda.
// Ogni impostazione ha un valore predefinito che riproduce il gioco «di serie»: a 1 i moltiplicatori non cambiano nulla.

export type SettingKind = "num" | "bool" | "text" | "choice";
export type SettingDef = {
  key: string;
  group: string;
  label: string;
  desc: string;
  kind: SettingKind;
  def: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
};

export const SETTING_GROUPS = ["Economia", "Trace e rischio", "Giustizia", "Mondo", "Iscrizioni e accessi", "Comunicazione"] as const;

const N = (group: string, key: string, label: string, desc: string, def: number, min: number, max: number, step: number): SettingDef => ({ key, group, label, desc, kind: "num", def, min, max, step });
const B = (group: string, key: string, label: string, desc: string, def: boolean): SettingDef => ({ key, group, label, desc, kind: "bool", def });

export const SETTINGS: SettingDef[] = [
  N("Economia", "rewardMult", "Paga dei contratti", "Moltiplica le ricompense dei contratti generati (non le taglie dei giocatori).", 1, 0.1, 5, 0.05),
  N("Economia", "xpMult", "Esperienza dei contratti", "Moltiplica gli XP dei contratti.", 1, 0.1, 5, 0.05),
  N("Economia", "startCredits", "Crediti iniziali", "Quanto ha un handle appena registrato.", 3000, 0, 100000, 100),
  N("Economia", "fenceMult", "Prezzi del ricettatore", "Moltiplica quanto paga il ricettatore.", 1, 0, 3, 0.05),
  N("Economia", "lootMult", "Probabilità di bottino", "Moltiplica la probabilità di trovare oggetti alla consegna.", 1, 0, 5, 0.1),
  N("Trace e rischio", "traceMult", "Durata del trace", "Oltre 1 il monitor ci mette di più a risalire il rimbalzo; sotto 1 è più rapido.", 1, 0.25, 4, 0.05),
  N("Trace e rischio", "toolSpeed", "Velocità degli strumenti", "Moltiplica la velocità di tutti i software.", 1, 0.25, 4, 0.05),
  N("Trace e rischio", "heatMult", "Calore guadagnato", "Moltiplica il calore che si accumula.", 1, 0, 3, 0.05),
  N("Trace e rischio", "heatDecay", "Calore che si raffredda", "Punti di calore persi ogni 30 secondi.", 1, 0, 10, 1),
  N("Trace e rischio", "sweepMult", "Tempo prima dell'indagine", "Moltiplica l'attesa prima che la Guardia del Reticolo segua i log.", 1, 0.1, 5, 0.05),
  B("Giustizia", "arrests", "Arresti attivi", "Se spento, il calore massimo non porta in custodia.", true),
  N("Giustizia", "jailMult", "Durata della custodia", "Moltiplica il tempo in custodia.", 1, 0, 5, 0.1),
  N("Giustizia", "bailMult", "Costo della cauzione", "Moltiplica la cauzione.", 1, 0, 5, 0.1),
  B("Mondo", "npcActive", "Handle NPC attivi", "Gli NPC lasciano operazioni nei log, bonificano relay e rinforzano nodi.", true),
  N("Mondo", "boardSize", "Contratti in bacheca", "Quanti contratti aperti tiene la bacheca per cellula.", 10, 2, 30, 1),
  N("Mondo", "eventChance", "Eventi dal mondo", "Probabilità che un danno generi un contratto per i blu (recupero, storno, riavvio).", 1, 0, 1, 0.05),
  B("Mondo", "pvpGateways", "Gateway attaccabili", "Se spento, nessuno può collegarsi al gateway di un altro handle.", true),
  B("Mondo", "sysBlackout", "Blackout permessi", "Il comando di blackout delle reti elettriche.", true),
  B("Mondo", "sysShutdown", "Spegnimenti permessi", "Il comando di spegnimento dei sistemi.", true),
  {
    key: "registrations",
    group: "Iscrizioni e accessi",
    label: "Iscrizioni",
    desc: "Aperte, con approvazione dell'admin, o chiuse.",
    kind: "choice",
    def: "open",
    options: [
      { value: "open", label: "aperte" },
      { value: "approval", label: "con approvazione" },
      { value: "closed", label: "chiuse" },
    ],
  },
  N("Iscrizioni e accessi", "signupsPerHour", "Iscrizioni per indirizzo", "Handle nuovi all'ora da uno stesso indirizzo.", 4, 1, 100, 1),
  N("Iscrizioni e accessi", "loginFails", "Chiavi sbagliate tollerate", "Tentativi falliti in 15 minuti prima del blocco dell'indirizzo.", 8, 3, 50, 1),
  B("Iscrizioni e accessi", "maintenance", "Manutenzione", "Solo l'admin può entrare; chi è collegato viene scollegato con il messaggio qui sotto.", false),
  { key: "maintenanceMsg", group: "Iscrizioni e accessi", label: "Messaggio di manutenzione", desc: "Mostrato a chi prova a entrare.", kind: "text", def: "Il Reticolo è in manutenzione. Torna fra poco." },
  B("Comunicazione", "chatEnabled", "Rete IRC attiva", "Se spento, ReticoloNet resta in sola lettura: nessuno può scrivere.", true),
  { key: "motd", group: "Comunicazione", label: "Avviso in alto", desc: "Una riga mostrata a tutti sopra il deck. Vuoto = nessun avviso.", kind: "text", def: "" },
  {
    key: "motdTone",
    group: "Comunicazione",
    label: "Tono dell'avviso",
    desc: "Colore della riga.",
    kind: "choice",
    def: "info",
    options: [
      { value: "info", label: "informazione" },
      { value: "warn", label: "attenzione" },
      { value: "bad", label: "allarme" },
    ],
  },
];

export type Settings = Record<string, number | boolean | string>;
export const DEFAULT_SETTINGS: Settings = Object.fromEntries(SETTINGS.map((s) => [s.key, s.def]));

/** Riporta un valore nei limiti della sua definizione; null se la chiave non esiste. */
export function sanitizeSetting(key: string, raw: unknown): number | boolean | string | null {
  const d = SETTINGS.find((s) => s.key === key);
  if (!d) return null;
  if (d.kind === "bool") return raw === true || raw === "true";
  if (d.kind === "text") return String(raw ?? "").slice(0, 300);
  if (d.kind === "choice") return d.options!.some((o) => o.value === raw) ? String(raw) : (d.def as string);
  const n = Number(raw);
  if (!Number.isFinite(n)) return d.def as number;
  return Math.min(d.max!, Math.max(d.min!, n));
}

// ------------------------------------------------------------ dati del pannello

export type AdminAccount = {
  id: string;
  handle: string;
  faction: "red" | "blue";
  staff: boolean;
  createdAt: number;
  lastSeen: number;
  lastIp: string;
  ips: string[];
  logins: number;
  online: boolean;
  status: "attivo" | "in attesa" | "bannato";
  ban: { until: number; reason: string } | null;
  credits: number;
  xp: number;
  heat: number;
  fame: number;
  rank: string;
  achievements: number;
  jailed: boolean;
  charges: number;
};

export type AdminSession = { agentId: string | null; handle: string | null; ip: string; since: number; msgs: number; op: string | null };
export type IpBan = { ip: string; until: number; reason: string; at: number; by: string };
export type AuditRow = { at: number; by: string; action: string; detail: string };
