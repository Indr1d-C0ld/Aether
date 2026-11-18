// Playtest automatico per il bilanciamento: un bot gioca la stessa operazione completa
// (bypass → password → decifra → copia → pulizia dei log → stacco) a diversi livelli di equipaggiamento,
// con un rimbalzo ingenuo e con uno ottimizzato, e misura quanta parte del trace consuma ogni fase.
// Uso: AETHER_DEV=1 AETHER_DB=/tmp/x.db AETHER_PORT=7099 node server/main.ts & node scripts/playtest.ts 7099 [reazione_ms]
import WebSocket from "ws";
import type { GameState, NodeView, ServerMsg } from "../shared/types.ts";
import { routeTrace, type HopInput } from "../shared/rules.ts";
import { WORLD } from "../server/worldgen.ts";

const port = process.argv[2] ?? "7077";
const REACTION = Number(process.argv[3] ?? 1800); // quanto ci mette una persona a leggere e cliccare
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Bot {
  ws: WebSocket;
  state: GameState | null = null;
  seq = 0;
  pending = new Map<number, (m: Extract<ServerMsg, { t: "res" }>) => void>();
  ready: Promise<void>;
  constructor() {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ready = new Promise((r) => this.ws.on("open", () => r()));
    this.ws.on("message", (raw) => {
      const m = JSON.parse(String(raw)) as ServerMsg;
      if (m.t === "state") this.state = m.s;
      if (m.t === "res") this.pending.get(m.id)?.(m);
    });
  }
  auth(handle: string) {
    return new Promise<void>((r) => {
      this.ws.once("message", () => r());
      this.ws.send(JSON.stringify({ t: "auth", mode: "register", handle, pass: "segreto123", faction: "red" }));
    });
  }
  async do(a: string, p: Record<string, unknown> = {}) {
    const id = ++this.seq;
    const res = await new Promise<Extract<ServerMsg, { t: "res" }>>((r) => {
      this.pending.set(id, r);
      this.ws.send(JSON.stringify({ t: "do", id, a, p }));
    });
    await sleep(60);
    return res;
  }
  async idle() {
    for (let i = 0; i < 600; i += 1) {
      await sleep(200);
      const op = this.state?.op;
      if (!op || !op.tasks.some((t) => t.state === "run")) return;
    }
  }
  frac() {
    const tr = this.state?.op?.trace;
    return tr && tr.totalMs ? (tr.progressMs ?? 0) / tr.totalMs : null;
  }
}

type Gear = { name: string; tools: Record<string, number>; hw: Record<string, number>; hops: number; targets: string[] };

const GEARS: Gear[] = [
  { name: "1 Esordiente", tools: { breaker: 1, firewall: 1, logdel: 1, tracker: 3 }, hw: { cpu: 1, modem: 1, memory: 1 }, hops: 3, targets: ["halcyon-uni", "lumen-news"] },
  {
    name: "2 Primi acquisti",
    tools: { breaker: 1, firewall: 1, proxy: 1, decrypt: 1, logdel: 1, tracker: 3 },
    hw: { cpu: 2, modem: 2, memory: 2 },
    hops: 4,
    targets: ["karsk-poly", "vesper-civic", "nord-transit", "pale-market"],
  },
  {
    name: "3 Metà carriera",
    tools: { breaker: 2, firewall: 2, proxy: 2, decrypt: 2, logdel: 2, monbypass: 1, tracker: 3 },
    hw: { cpu: 3, modem: 3, memory: 3 },
    hops: 5,
    targets: ["ion-court", "cobalt-dyn", "helix-lab", "meridia-credit"],
  },
  {
    name: "4 Avanzato",
    tools: { breaker: 3, firewall: 3, proxy: 3, decrypt: 3, logdel: 2, monbypass: 2, tracker: 3 },
    hw: { cpu: 4, modem: 4, memory: 4 },
    hops: 6,
    targets: ["meridia-pd", "gibson"],
  },
  {
    name: "5 Fine gioco",
    tools: { breaker: 3, firewall: 3, proxy: 3, decrypt: 3, logdel: 3, monbypass: 3, tracker: 3 },
    hw: { cpu: 5, modem: 5, memory: 5 },
    hops: 7,
    targets: ["orsini-bank", "crystal-palace"],
  },
];

// Bersagli fra i nodi generati: per ogni livello, un paio di nodi dei tipi che un giocatore di quel livello affronta.
const sec = (n: (typeof WORLD.nodes)[number]) => n.proxy + n.firewall + n.monitor;
const gen = (kind: string, lo: number, hi: number, count = 1) =>
  WORLD.nodes
    .filter((n) => n.kind === kind && n.monitor > 0 && sec(n) >= lo && sec(n) <= hi)
    .slice(0, count)
    .map((n) => n.id);
const GEN_IP: Record<string, string> = Object.fromEntries(WORLD.nodes.map((n) => [n.id, n.ip]));
const GEN_KIND: Record<string, string> = Object.fromEntries(WORLD.nodes.map((n) => [n.id, n.sub]));
const EXTRA: string[][] = [
  [...gen("shop", 1, 2, 2), ...gen("edu", 2, 3), ...gen("news", 2, 3)],
  [...gen("gov", 4, 5), ...gen("med", 4, 5), ...gen("edu", 3, 4)],
  [...gen("corp", 5, 7), ...gen("util", 5, 7), ...gen("telco", 6, 7), ...gen("lab", 5, 7)],
  [...gen("law", 7, 8), ...gen("bank", 7, 8), ...gen("corp", 8, 9)],
  [...gen("bank", 9, 11, 2)],
];

const HIDDEN_IP: Record<string, string> = { gibson: "17.5.19.95", "crystal-palace": "6.6.19.83", pharmakom: "20.21.5.26", vsi: "22.19.9.92" };

const toHop = (n: NodeView): HopInput => ({ cls: n.cls ?? "public", x: n.x, y: n.y, hasKey: n.myKey, recentUses: n.myWear, poisoned: false });

/** Il rimbalzo migliore fra molti campioni casuali: quello che un giocatore attento finisce per trovare. */
function bestRoute(s: GameState, k: number, budget: number) {
  const relays = s.nodes.filter((n) => n.kind === "relay");
  let best: NodeView[] = [];
  let bestScore = -1;
  for (let i = 0; i < 4000; i += 1) {
    const pickd = [...relays].sort(() => Math.random() - 0.5).slice(0, k);
    const r = routeTrace(3, s.me.home, pickd.map(toHop));
    if (r.fee > budget) continue;
    if (r.total > bestScore) {
      bestScore = r.total;
      best = pickd;
    }
  }
  return best;
}

type Row = Record<string, string | number>;
const rows: Row[] = [];

async function playOnce(gear: Gear, targetId: string, mode: "ingenuo" | "ottimo", n: number) {
  const bot = new Bot();
  await bot.ready;
  await bot.auth(`pt${n}_${Math.random().toString(36).slice(2, 7)}`);
  await sleep(300);
  await bot.do("devGrant", { xp: 3000, credits: 30000, tools: gear.tools, hw: gear.hw });
  await sleep(1300);
  const s = bot.state!;
  const publics = s.nodes.filter((x) => x.kind === "relay" && x.cls === "public").slice(0, gear.hops);
  const relays = mode === "ingenuo" ? publics : bestRoute(s, gear.hops, 900);
  const chain = relays.map((r) => r.id);
  const ipOf = HIDDEN_IP[targetId] ?? GEN_IP[targetId];
  const res = await bot.do("connect", ipOf ? { chain, targetIp: ipOf } : { chain: [...chain, targetId] });
  const row: Row = { gear: gear.name, bersaglio: GEN_KIND[targetId] ? `${GEN_KIND[targetId]}` : targetId, percorso: mode, hop: relays.length };
  if (!res.ok) {
    rows.push({ ...row, esito: `non collegato: ${res.error}` });
    bot.ws.close();
    return;
  }
  await sleep(300);
  const op = () => bot.state!.op;
  const t0 = Date.now();
  const sec = op()!.target.sec;
  row.sic = `${sec.proxy}/${sec.firewall}/${sec.monitor}`;
  row.guardia = op()!.target.watch === 1 ? "" : `×${op()!.target.watch.toFixed(2)}`;
  row.trace_s = Math.round((op()!.trace.totalMs ?? 0) / 1000);
  const total0 = op()!.trace.totalMs ?? 1;
  // nei nodi dove il monitor parte alla prima mossa la percentuale è sul totale, non su zero
  const pct = () => `${Math.round(((op()?.trace.progressMs ?? 0) / total0) * 100)}%`;
  row.tariffe = routeTrace(3, s.me.home, relays.map(toHop)).fee;
  const step = async (a: string, p: Record<string, unknown> = {}) => {
    await sleep(REACTION);
    if (!op()) return { ok: false, error: "tracciato" };
    return bot.do(a, p);
  };
  let fail = "";
  if (gear.tools.monbypass) await step("run", { tool: "monbypass" });
  if (!op()?.bypass.proxy) {
    const r = await step("run", { tool: "proxy" });
    if (!r.ok) fail = String(r.error);
  }
  if (!fail && op() && !op()!.bypass.firewall) {
    const r = await step("run", { tool: "firewall" });
    if (!r.ok) fail = String(r.error);
  }
  await bot.idle();
  if (!fail && op()) {
    await step("run", { tool: "breaker" });
    await bot.idle();
  }
  row.admin_s = Math.round((Date.now() - t0) / 1000);
  row.admin = op() ? pct() : "—";
  if (!fail && op()?.access === "admin") {
    const files = (op()!.files ?? []).filter((f) => !f.loot && !f.deleted && f.size <= bot.state!.me.storageCap);
    // il file più impegnativo che l'equipaggiamento sa aprire
    const can = files.filter((f) => f.encryption <= (gear.tools.decrypt ?? 0));
    const file = can.sort((a, b) => b.encryption - a.encryption || b.size - a.size)[0];
    if (file) {
      if (file.encryption) {
        const r = await step("run", { tool: "decrypt", fileId: file.id });
        if (!r.ok) fail = String(r.error);
        await bot.idle();
      }
      if (!fail && op()) {
        await step("copy", { fileId: file.id });
        await bot.idle();
      }
      row.file = `${file.size}GQ c${file.encryption}`;
    }
    row.lavoro = op() ? pct() : "—";
    if (op()) {
      const mine = (op()!.logs ?? []).filter((l) => l.at >= op()!.connectedAt && !l.gap && /from |src=/.test(l.text));
      await step("run", { tool: "logdel", logIds: mine.map((l) => l.id) });
      await bot.idle();
    }
    row.pulizia = op() ? pct() : "—";
  }
  row.durata_s = Math.round((Date.now() - t0) / 1000);
  if (op()) {
    await bot.do("disconnect");
    row.esito = fail ? `incompleto: ${fail}` : "OK";
  } else row.esito = "TRACCIATO";
  rows.push(row);
  bot.ws.close();
}

const jobs: Promise<void>[] = [];
let n = 0;
const only = process.argv[4]; // "gen" = solo i nodi generati
GEARS.forEach((gear, gi) => {
  const targets = only === "gen" ? EXTRA[gi]! : [...gear.targets, ...EXTRA[gi]!];
  for (const target of targets) for (const mode of ["ingenuo", "ottimo"] as const) jobs.push(playOnce(gear, target, mode, (n += 1)));
});
await Promise.all(jobs);
rows.sort((a, b) => String(a.gear).localeCompare(String(b.gear)) || String(a.bersaglio).localeCompare(String(b.bersaglio)) || String(a.percorso).localeCompare(String(b.percorso)));
const cols = ["gear", "bersaglio", "sic", "guardia", "percorso", "hop", "tariffe", "trace_s", "admin_s", "admin", "lavoro", "pulizia", "durata_s", "esito"];
console.log(cols.join(" | "));
for (const r of rows) console.log(cols.map((c) => r[c] ?? "").join(" | "));
process.exit(0);
