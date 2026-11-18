// Smoke test della sala operativa dei blu: presidi multipli, sensori come prova, analista di turno.
// Uso: AETHER_DEV=1 AETHER_FAST=1 AETHER_DB=/tmp/x.db AETHER_PORT=7099 node server/main.ts & node scripts/smoke-soc.ts 7099
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Client {
  name: string;
  ws: WebSocket;
  state: GameState | null = null;
  seq = 0;
  toasts: string[] = [];
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
      if (m.t === "toast") this.toasts.push(m.text);
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
await red.auth(`shade_${tag}`, "red");
await blue.auth(`watch_${tag}`, "blue");
await sleep(400);
await red.do("devGrant", { xp: 3000, credits: 30000, tools: { proxy: 3, firewall: 3, breaker: 3, monbypass: 2 }, hw: { cpu: 5, modem: 4, memory: 4 } });
await blue.do("devGrant", { xp: 3000, credits: 20000, fame: 300, hw: { soc: 2 } });
const results: string[] = [];
const check = (name: string, ok: boolean) => {
  results.push(`${ok ? "OK  " : "FAIL"} ${name}`);
  console.log(`  >> ${ok ? "OK" : "FAIL"}: ${name}`);
};
const ROUTE = ["r-kiln", "r-quartz", "r-lantern"];
const redIn = async () => {
  await red.do("connect", { chain: [...ROUTE, "karsk-poly"] });
  if (!red.state!.op!.bypass.proxy) await red.do("run", { tool: "proxy" });
  if (!red.state!.op!.bypass.firewall) await red.do("run", { tool: "firewall" });
  await red.waitTasks();
  await red.do("run", { tool: "breaker" });
  await red.waitTasks();
  await sleep(300);
};

console.log("== CONSOLE SOC: presidi e sensori");
await blue.do("preside", { nodeId: "karsk-poly" });
await blue.do("preside", { nodeId: "lumen-news" });
const third = await blue.do("preside", { nodeId: "ion-court" });
await sleep(1200);
check("due presidi con la Console SOC di livello 2, il terzo rifiutato", blue.state!.me.presiding.length === 2 && !third.ok);
const c0 = blue.state!.me.credits;
await blue.do("deploySensor", { nodeId: "karsk-poly" });
await blue.do("deploySensor", { nodeId: "r-lantern" });
await sleep(1200);
check("due sensori installati e pagati", blue.state!.me.sensors.length === 2 && c0 - blue.state!.me.credits === 2400);

console.log("== IL ROSSO ENTRA, ALTERA E CANCELLA OGNI TRACCIA");
await redIn();
check("il rosso con Monitor Bypass v2 vede il sensore da admin", red.state!.op!.sensors === 1);
type Rec = { id: string; fields: { key: string; value: string; options: string[] }[] };
const recs = ((await red.do("searchRecords", { q: "" })).data as { records: Rec[] }).records;
const f = recs[0]!.fields.find((x) => x.key === "grade")!;
await red.do("alter", { recordId: recs[0]!.id, field: "grade", value: f.options.find((o) => o !== f.value)! });
await red.do("devGrant", { exploit: "scrub" });
await sleep(1200);
await red.do("useItem", { key: red.state!.me.storage.find((s) => s.item?.code === "scrub")!.key });
await sleep(400);
check("log del bersaglio ripulito", !red.state!.op!.logs!.some((l) => l.at >= red.state!.op!.connectedAt && /from |src=/.test(l.text)));
await red.do("disconnect");
await sleep(8500); // l'indagine automatica (accelerata nei test) si chiude
check("per la Guardia del Reticolo il rosso è un fantasma", red.state!.me.stats.clean === 1 && red.state!.me.charges.length === 0);

console.log("== IL BLU HA LE COPIE DEI SENSORI");
const copies = blue.state!.me.sensors.find((s) => s.nodeId === "karsk-poly")!.lines.map((l) => l.text);
console.log("  copia del sensore:", copies);
check("il sensore ha copiato le righe cancellate", copies.some((t) => t.startsWith("RECORD edit")));
const hunt = blue.state!.missions.find((m) => m.type === "hunt" && m.nodeId === "karsk-poly")!;
await blue.do("take", { missionId: hunt.id });
const paid0 = blue.state!.me.credits;
const r = await blue.do("deliver", { missionId: hunt.id, answer: red.state!.me.gatewayIp });
await sleep(1200);
check("caccia chiusa con le prove dei sensori, anche a log cancellato", r.ok);
check("bonus del 25% per il sensore sul nodo", blue.state!.me.credits - paid0 === Math.round(hunt.reward * 1.25));
check("il rosso riceve il capo d'accusa", red.state!.me.charges.length === 1);

console.log("== IL ROSSO STACCA IL SENSORE");
await redIn();
await red.do("alter", { recordId: recs[0]!.id, field: "grade", value: f.value });
await red.do("sweepSensors");
await red.do("devGrant", { exploit: "scrub" });
await sleep(1200);
await red.do("useItem", { key: red.state!.me.storage.find((s) => s.item?.code === "scrub")!.key });
await red.do("disconnect");
await sleep(1500);
check("sensore perso", blue.state!.me.sensors.length === 1 && blue.state!.me.sensors[0]!.nodeId === "r-lantern");
const hunt2 = blue.state!.missions.find((m) => m.type === "hunt" && m.nodeId === "karsk-poly" && !m.mine)!;
await blue.do("take", { missionId: hunt2.id });
const r2 = await blue.do("deliver", { missionId: hunt2.id, answer: red.state!.me.gatewayIp });
check("senza la copia della sessione, la seconda caccia non regge", !r2.ok);

console.log("== ANALISTA DI TURNO: contro-trace a blu scollegato");
await blue.do("hireAnalyst");
await sleep(600);
blue.ws.close();
await sleep(600);
red.toasts.length = 0;
await red.do("connect", { chain: [...ROUTE, "karsk-poly"] });
await sleep(8000);
check("contro-trace automatico dell'analista", red.toasts.some((t) => t.startsWith("CONTRO-TRACE")) || red.state!.op === null);
if (red.state!.op) await red.do("disconnect");

console.log("\n" + results.join("\n"));
process.exit(results.some((x) => x.startsWith("FAIL")) ? 1 : 0);
