// Smoke test: un rosso assalta il gateway di un altro giocatore, la vittima risale a lui.
// Uso: AETHER_DEV=1 AETHER_DB=/tmp/x.db AETHER_PORT=7099 node server/main.ts & node scripts/smoke-gateway.ts 7099
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
const red = new Client("RAIDER");
const vic = new Client("VICTIM");
await Promise.all([red.ready, vic.ready]);
await red.auth(`raid_${tag}`, "red");
await vic.auth(`vic_${tag}`, "blue");
await sleep(400);

// la vittima è appena arrivata: il gateway è protetto
await red.do("devGrant", { xp: 300, credits: 3000 });
await red.do("connect", { chain: ["r-sable"], targetIp: vic.state!.me.gatewayIp });
await vic.do("devGrant", { xp: 300, credits: 5000 });
console.log("  victim credits before", vic.state!.me.credits);

await red.do("buyTool", { tool: "proxy" });
await red.do("connect", { chain: ["r-sable", "r-kiln", "r-lantern"], targetIp: vic.state!.me.gatewayIp });
console.log("  target", red.state!.op?.target.name, red.state!.op?.target.kind, "sec", red.state!.op?.target.sec, "trace", red.state!.op?.trace.totalMs);
await red.do("run", { tool: "proxy" });
await red.do("run", { tool: "firewall" });
await red.waitTasks();
await red.do("run", { tool: "breaker" });
await red.waitTasks();
console.log("  access", red.state!.op?.access);
await red.do("siphon");
await red.do("siphon");
await red.do("overload");
await red.do("disconnect");
await sleep(1300);
console.log("  red credits", red.state!.me.credits, "| victim credits", vic.state!.me.credits, "overload", vic.state!.me.overloadUntil > Date.now());
console.log("  victim gateway log:", vic.state!.me.gatewayLogs.filter((l) => !/^(SYS heartbeat|SYS clock|NET|CRON|AUTH fail user=guest)/.test(l.text)).map((l) => l.text));
const rev = vic.state!.missions.find((m) => m.title.startsWith("Rivalsa"));
console.log("  revenge mission:", rev?.title, rev?.reward);

// la vittima risale la catena: lantern → kiln → sable → gateway
const hops = ["r-lantern", "r-kiln", "r-sable"];
let ip = "";
for (const h of hops) {
  await vic.do("connect", { chain: [h] });
  const route = vic.state!.op!.logs!.filter((l) => l.text.startsWith("ROUTE")).map((l) => l.text);
  ip = route.at(-1)!.split(" ")[1]!;
  await vic.do("disconnect");
}
console.log("  traced back to", ip, "real", red.state!.me.gatewayIp);
await vic.do("take", { missionId: rev!.id });
await vic.do("deliver", { missionId: rev!.id, answer: ip });
await sleep(1300);
console.log("  victim known:", vic.state!.me.known.map((k) => `${k.ip}=${k.handle}`), "| red heat", red.state!.me.heat);
process.exit(0);
