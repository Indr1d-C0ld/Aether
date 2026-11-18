// Smoke test: mercato nero (vendita, acquisto, ricettatore) e taglie (localizzazione, ritiro con rimborso).
// Uso: AETHER_DEV=1 AETHER_DB=/tmp/x.db AETHER_PORT=7099 node server/main.ts & node scripts/smoke-market.ts 7099
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
const a = new Client("ALFA");
const b = new Client("BETA");
await Promise.all([a.ready, b.ready]);
await a.auth(`alfa_${tag}`, "red");
await b.auth(`beta_${tag}`, "red");
await sleep(400);
await b.do("devGrant", { credits: 5000 });
await a.do("devGrant", { tools: { proxy: 3, firewall: 3 } }); // il mondo vivo può aver rinforzato Halcyon

// ALFA ruba syllabus.dat col contratto di prova (senza consegnarlo)
await a.do("connect", { chain: ["r-sable", "r-kiln", "r-lantern", "halcyon-uni"] });
await a.do("run", { tool: "firewall" });
await a.do("run", { tool: "proxy" });
await a.waitTasks();
await a.do("run", { tool: "breaker" });
await a.waitTasks();
await a.do("copy", { fileId: "syllabus" });
await a.waitTasks();
await a.do("disconnect");
await sleep(1200);
const st = a.state!.me.storage[0]!;
console.log("  ALFA archive:", st.name, "fence", st.fence, "| credits", a.state!.me.credits);

await a.do("listFile", { key: st.key, price: 900 });
await sleep(1200);
const lst = b.state!.market.find((l) => l.name === st.name)!;
console.log("  BETA sees listing:", lst.name, lst.price, "seller", lst.seller, "wanted", lst.wanted);
await b.do("buyListing", { id: lst.id });
await sleep(1200);
console.log("  ALFA credits", a.state!.me.credits, "(+810 attesi) | BETA archive", b.state!.me.storage.map((s) => s.name));
const bst = b.state!.me.storage[0]!;
const before = b.state!.me.credits;
await b.do("fence", { key: bst.key });
await sleep(1200);
console.log("  BETA fence gain", b.state!.me.credits - before);

// taglia di localizzazione su un NPC: ALFA la esegue col Registro
const c0 = b.state!.me.credits;
await b.do("postBounty", { type: "locate", audience: "red", target: "NYX", reward: 1000, hours: 3 });
await sleep(1200);
console.log("  BETA paid", c0 - b.state!.me.credits, "(1050 attesi)");
const loc = a.state!.missions.find((m) => m.type === "locate")!;
console.log("  ALFA sees bounty:", loc.title, "postedBy", loc.postedBy, "where", loc.where);
await b.do("take", { missionId: loc.id });
await a.do("take", { missionId: loc.id });
const r = await a.do("registry", { query: "NYX" });
const ip = String((r.data as { lines: string[] }).lines[0]).split(" ").at(-1)!;
await a.do("deliver", { missionId: loc.id, answer: "1.2.3.4" });
await a.do("deliver", { missionId: loc.id, answer: ip });
await sleep(1200);
console.log("  BETA known:", b.state!.me.known.map((k) => `${k.ip}=${k.handle}`));

// taglia ritirata: rimborso della ricompensa
const c1 = b.state!.me.credits;
await b.do("postBounty", { type: "wipe", audience: "red", nodeId: "lumen-news", fileId: "scoop", reward: 800 });
await sleep(1200);
const wipe = b.state!.missions.find((m) => m.type === "wipe" && m.postedByMe)!;
await b.do("cancelBounty", { id: wipe.id });
await sleep(1200);
console.log("  BETA net after cancel", b.state!.me.credits - c1, "(−40 attesi: solo commissione)");
process.exit(0);
