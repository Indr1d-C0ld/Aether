// Smoke test end-to-end: un rosso fa il contratto di prova, un blu caccia l'intrusione.
// Uso: AETHER_DB=/tmp/x.db AETHER_PORT=7099 node server/main.ts & node scripts/smoke.ts 7099
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Client {
  ws: WebSocket;
  state: GameState | null = null;
  seq = 0;
  pending = new Map<number, (m: Extract<ServerMsg, { t: "res" }>) => void>();
  ready: Promise<void>;
  name: string;
  constructor(name: string) {
    this.name = name;
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ready = new Promise((r) => this.ws.on("open", () => r()));
    this.ws.on("message", (raw) => {
      const m = JSON.parse(String(raw)) as ServerMsg;
      if (m.t === "state") this.state = { ...m.s, nodes: m.s.nodes ?? this.state?.nodes ?? [] } as GameState; // la lista dei nodi arriva solo ogni tanto
      if (m.t === "res") this.pending.get(m.id)?.(m);
      if (m.t === "toast") console.log(`  [${this.name} toast] ${m.text}`);
      if (m.t === "auth_err") console.log(`  [${this.name}] auth_err ${m.error}`);
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
      if (!op) return;
      if (!op.tasks.some((t) => t.state === "run")) return;
    }
  }
}

const tag = Math.random().toString(36).slice(2, 6);
const red = new Client("RED");
const blue = new Client("BLUE");
await Promise.all([red.ready, blue.ready]);
await red.auth(`ash_${tag}`, "red");
await blue.auth(`zero_${tag}`, "blue");
await sleep(400);

const tut = red.state!.missions.find((m) => m.title === "Prova di collegamento")!;
await red.do("take", { missionId: tut.id });
await red.do("connect", { chain: ["r-sable", "r-kiln", "halcyon-uni"] });
console.log("  trace", red.state!.op?.trace);
await red.do("run", { tool: "firewall" });
await red.do("run", { tool: "breaker" });
await red.waitTasks();
console.log("  access", red.state!.op?.access, "cracked", red.state!.op?.cracked);
await red.do("copy", { fileId: "syllabus" });
await red.waitTasks();
const mine = red.state!.op!.logs!.filter((l) => l.text.includes("61.14.200.3") || l.text.includes("92.7.33.120"));
console.log("  log lines pointing back:", mine.map((l) => l.text));
// pulisco solo metà: lascio una riga per far vincere la caccia
await red.do("run", { tool: "logdel", logIds: mine.slice(1).map((l) => l.id) });
await red.waitTasks();
console.log("  trace at exit", Math.round(red.state!.op?.trace.progressMs ?? 0), "/", red.state!.op?.trace.totalMs);
await red.do("disconnect");
await red.do("deliver", { missionId: tut.id });
console.log("  red credits", red.state!.me.credits, "xp", red.state!.me.xp, "heat", red.state!.me.heat);

// il blu: deve esserci una caccia su Halcyon (80%)
await sleep(600);
const hunt = blue.state!.missions.find((m) => m.type === "hunt" && m.nodeId === "halcyon-uni");
if (!hunt) {
  console.log("nessuna caccia generata (20% dei casi) — fine");
} else {
  await blue.do("take", { missionId: hunt.id });
  await blue.do("connect", { chain: ["halcyon-uni"] });
  await blue.do("clientLogin");
  const logs = blue.state!.op!.logs!;
  console.log("  blue sees:", logs.filter((l) => !l.text.startsWith("SYS") && !l.text.startsWith("NET")).map((l) => l.text));
  await blue.do("disconnect");
  // segue la catena: kiln → sable → gateway
  await blue.do("connect", { chain: ["r-kiln"] });
  console.log("  kiln:", blue.state!.op!.logs!.filter((l) => l.text.startsWith("ROUTE")).map((l) => l.text));
  await blue.do("disconnect");
  await blue.do("connect", { chain: ["r-sable"] });
  // la riga che porta al relay successivo della catena, non l'ultima passata di lì (ci transitano anche gli NPC)
  const route = blue.state!.op!.logs!.filter((l) => l.text.startsWith("ROUTE") && l.text.endsWith("-> 92.7.33.120")).map((l) => l.text);
  console.log("  sable:", route);
  await blue.do("disconnect");
  const gw = route.at(-1)!.split(" ")[1]!;
  await blue.do("registry", { query: gw });
  await blue.do("deliver", { missionId: hunt.id, answer: gw });
  await sleep(300);
  console.log("  red heat after", red.state!.me.heat, "blue credits", blue.state!.me.credits);
}
process.exit(0);
