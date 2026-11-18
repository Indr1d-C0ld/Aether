// Smoke test del lato blu: un rosso fa danni, un blu chiude tutti i contratti che ne nascono.
// Uso: AETHER_DEV=1 AETHER_FAST=1 AETHER_DB=/tmp/x.db AETHER_PORT=7099 node server/main.ts & node scripts/smoke-blue.ts 7099
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Client {
  name: string;
  ws: WebSocket;
  state: GameState | null = null;
  seq = 0;
  pending = new Map<number, (m: Extract<ServerMsg, { t: "res" }>) => void>();
  ready: Promise<void>;
  constructor(name: string) {
    this.name = name;
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ready = new Promise((r) => this.ws.on("open", () => r()));
    this.ws.on("message", (raw) => {
      const m = JSON.parse(String(raw)) as ServerMsg;
      if (m.t === "state") this.state = { ...m.s, nodes: m.s.nodes ?? this.state?.nodes ?? [] } as GameState; // la lista dei nodi arriva solo ogni tanto
      if (m.t === "res") this.pending.get(m.id)?.(m);
      if (m.t === "toast") console.log(`  [${this.name} toast] ${m.text}`);
    });
  }
  auth(handle: string, faction: "red" | "blue") {
    return new Promise<void>((r) => {
      this.ws.once("message", () => r());
      this.ws.send(JSON.stringify({ t: "auth", mode: "register", handle, pass: "segreto123", faction }));
    });
  }
  async do(a: string, p: Record<string, unknown> = {}) {
    const id = ++this.seq;
    const res = await new Promise<Extract<ServerMsg, { t: "res" }>>((r) => {
      this.pending.set(id, r);
      this.ws.send(JSON.stringify({ t: "do", id, a, p }));
    });
    console.log(`${this.name} ${a} → ${res.ok ? "ok" : "ERR"} ${res.error ?? res.note ?? ""}`);
    await sleep(80);
    return res;
  }
  async waitTasks() {
    for (let i = 0; i < 200; i += 1) {
      await sleep(250);
      const op = this.state?.op;
      if (!op || !op.tasks.some((t) => t.state === "run")) return;
    }
  }
}

const tag = Math.random().toString(36).slice(2, 6);
const red = new Client("RED");
const blue = new Client("BLUE");
await Promise.all([red.ready, blue.ready]);
await red.auth(`dmg_${tag}`, "red");
await blue.auth(`soc_${tag}`, "blue");
await sleep(400);
await red.do("devGrant", { xp: 3000, credits: 30000, tools: { proxy: 3, firewall: 3, decrypt: 3, breaker: 3, bdkit: 1 }, hw: { cpu: 5, modem: 4, memory: 4 } });
await blue.do("devGrant", { xp: 3000, credits: 5000, fame: 300, tools: { honey: 1 }, hw: { cpu: 3 } });
type Rec = { id: string; name: string; fields: { key: string; value: string; options: string[] }[]; account: { number: string; balance: number } | null };
const search = async (c: Client, q: string) => ((await c.do("searchRecords", { q })).data as { records: Rec[] }).records;
const ROUTE = ["r-kiln", "r-lantern", "r-quartz"];
const results: string[] = [];
const check = (name: string, ok: boolean) => {
  results.push(`${ok ? "OK  " : "FAIL"} ${name}`);
  console.log(`  >> ${ok ? "OK" : "FAIL"}: ${name}`);
};

const redIn = async (target: string) => {
  await red.do("connect", { chain: [...ROUTE.filter((r) => r !== target), target] });
  if (!red.state!.op!.bypass.proxy) await red.do("run", { tool: "proxy" });
  if (!red.state!.op!.bypass.firewall) await red.do("run", { tool: "firewall" });
  await red.waitTasks();
  await red.do("run", { tool: "breaker" });
  await red.waitTasks();
  await sleep(300);
};

console.log("== IL ROSSO FA DANNI (senza pulire)");
await redIn("karsk-poly");
const victim = (await search(red, ""))[0]!;
const deg = victim.fields.find((f) => f.key === "degree")!;
await red.do("alter", { recordId: victim.id, field: "degree", value: deg.options.find((o) => o !== deg.value)! });
await red.do("disconnect");
await redIn("lumen-news");
await red.do("delete", { fileId: "scoop" });
await red.waitTasks();
await red.do("disconnect");
await redIn("meridia-credit");
const accts = (await search(red, "")).filter((r) => r.account);
const rich = accts.find((r) => r.account!.balance > 4000)!;
const other = accts.find((r) => r.id !== rich.id)!;
await red.do("transfer", { from: rich.account!.number, to: other.account!.number, amount: 500 });
await red.do("disconnect");
await red.do("connect", { chain: ["r-kiln", "r-velvet"] });
await red.do("run", { tool: "breaker" });
await red.waitTasks();
await red.do("run", { tool: "bdkit" });
await red.waitTasks();
await red.do("disconnect");
await sleep(1500);

const bs = () => blue.state!;
const mission = (type: string, pred: (m: GameState["missions"][number]) => boolean = () => true) => bs().missions.find((m) => m.type === type && !m.mine && pred(m));
const enter = async (nodeId: string) => {
  await blue.do("connect", { chain: [nodeId] });
  await blue.do("clientLogin");
  await sleep(300);
};
const done = async (id: string, answer?: string) => {
  const r = await blue.do("deliver", { missionId: id, answer });
  await sleep(1200);
  return r.ok;
};

console.log("== BLU: primo turno (rinforzo)");
const first = mission("patch", (m) => m.title === "Primo turno")!;
await blue.do("take", { missionId: first.id });
await enter("lumen-news");
check("credenziali cliente su un nodo", bs().op!.access === "client" && !bs().op!.trace.active);
await blue.do("run", { tool: "patch", mode: "harden" });
await blue.waitTasks();
await blue.do("disconnect");
check("rinforzo consegnato", await done(first.id));

console.log("== BLU: recupero di un file cancellato");
const rec = mission("recover");
check("contratto di recupero generato", Boolean(rec));
if (rec) {
  await blue.do("take", { missionId: rec.id });
  await enter(rec.nodeId);
  const gone = bs().op!.files!.find((f) => f.deleted);
  check("il blu vede il file cancellato", Boolean(gone));
  await blue.do("recoverFile", { fileId: gone!.id });
  await blue.do("disconnect");
  check("recupero consegnato", await done(rec.id));
}

console.log("== BLU: ripristino di un record manomesso");
const rst = mission("restore");
check("contratto di ripristino generato", Boolean(rst));
if (rst) {
  await blue.do("take", { missionId: rst.id });
  await enter(rst.nodeId);
  const line = bs().op!.logs!.find((l) => l.text.startsWith("RECORD edit"))!;
  const [recId, field] = line.text.split(" ")[2]!.split(".");
  const value = /«([^»]+)»/.exec(rst.brief)![1]!;
  await blue.do("alter", { recordId: recId, field, value });
  await blue.do("disconnect");
  check("ripristino consegnato", await done(rst.id));
}

console.log("== BLU: storno di un bonifico");
const rev = mission("reverse");
check("contratto di storno generato", Boolean(rev));
if (rev) {
  await blue.do("take", { missionId: rev.id });
  await enter(rev.nodeId);
  // sul registro possono esserci anche movimenti altrui: li storno tutti, quello del contratto è fra questi
  for (const led of bs().op!.ledger!.filter((l) => !l.reversed)) await blue.do("reverseTransfer", { id: led.id });
  await blue.do("disconnect");
  check("storno consegnato", await done(rev.id));
}

console.log("== BLU: bonifica di un relay (credenziali da ospite)");
const seal = mission("seal");
check("contratto di bonifica in bacheca", Boolean(seal));
if (seal) {
  await blue.do("take", { missionId: seal.id });
  await blue.do("connect", { chain: [seal.nodeId] });
  const guest = bs().op!.access;
  await blue.do("clientLogin");
  await sleep(300);
  check("da ospite a cliente sul relay", guest === "guest" && bs().op!.access === "client");
  await blue.do("run", { tool: "patch", mode: "purge" });
  await blue.waitTasks();
  await blue.do("disconnect");
  check("bonifica consegnata", await done(seal.id));
}

console.log("== BLU: caccia (segue i log fino al gateway)");
const hunt = mission("hunt", (m) => m.nodeId === "karsk-poly");
check("contratto di caccia generato", Boolean(hunt));
if (hunt) {
  await blue.do("take", { missionId: hunt.id });
  await enter("karsk-poly");
  let ip = /from (\S+)/.exec(bs().op!.logs!.find((l) => l.text.startsWith("RECORD edit"))!.text)![1]!;
  await blue.do("disconnect");
  let prevTarget = "130.88.19.2";
  for (let i = 0; i < 6; i += 1) {
    const node = bs().nodes.find((n) => n.ip === ip);
    if (!node) break;
    await blue.do("connect", { chain: [node.id] });
    await sleep(300);
    const route = bs().op!.logs!.filter((l) => l.text.startsWith("ROUTE") && l.text.endsWith(`-> ${prevTarget}`)).at(-1)!;
    prevTarget = ip;
    ip = route.text.split(" ")[1]!;
    await blue.do("disconnect");
  }
  console.log("  indirizzo trovato:", ip, "| vero:", red.state!.me.gatewayIp);
  check("caccia consegnata", ip === red.state!.me.gatewayIp && (await done(hunt.id, ip)));
}

console.log("== BLU: profilo con credenziali su tutti gli archivi");
const prof = mission("profile");
if (prof) {
  await blue.do("take", { missionId: prof.id });
  let all = true;
  for (const n of ["vesper-civic", "meridia-pd", "orsini-bank"]) {
    await enter(n);
    all &&= bs().op!.access === "client";
    await blue.do("disconnect");
  }
  check("credenziali su anagrafe, casellario e banca", all && prof.clientNodes.length >= 6);
} else console.log("  (nessun profilo in bacheca in questo momento)");

await sleep(1200);
console.log("\n" + results.join("\n"));
console.log(`\nblu: ${bs().me.credits} CR, ${bs().me.xp} XP, fama ${bs().me.fame}, etica ${bs().me.ethicsTitle}`);
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
