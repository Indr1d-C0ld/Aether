// Smoke test dei sistemi di profondità: archivi, banca, oggetti, giustizia, War Dialer.
// Uso: AETHER_DEV=1 AETHER_FAST=1 AETHER_DB=/tmp/x.db AETHER_PORT=7099 node server/main.ts & node scripts/smoke-depth.ts 7099
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
await red.auth(`deep_${tag}`, "red");
await blue.auth(`soc_${tag}`, "blue");
await sleep(400);
await red.do("devGrant", { xp: 600, credits: 20000, tools: { proxy: 3, firewall: 3, decrypt: 3, wardialer: 3, breaker: 3 }, hw: { cpu: 5, modem: 3, memory: 3 } });
const me = () => red.state!.me;
type Rec = { id: string; name: string; sub: string; fields: { key: string; value: string; options: string[] }[]; account: { number: string; balance: number } | null };
const search = async (c: Client, q: string) => ((await c.do("searchRecords", { q })).data as { records: Rec[]; total: number });
const breakIn = async (chain: string[], ip?: string) => {
  await red.do("connect", ip ? { chain, targetIp: ip } : { chain });
  if (!red.state!.op!.bypass.proxy) await red.do("run", { tool: "proxy" });
  if (!red.state!.op!.bypass.firewall) await red.do("run", { tool: "firewall" });
  await red.waitTasks();
  await red.do("run", { tool: "breaker" });
  await red.waitTasks();
  await sleep(300);
};

console.log("== ARCHIVI: anagrafe");
await breakIn(["r-sable", "r-kiln", "r-lantern", "vesper-civic"]);
const all = await search(red, "");
console.log("  totale", all.total, "primo:", all.records[0]!.name, "|", all.records[0]!.sub);
const one = all.records[0]!;
const f0 = one.fields.find((f) => f.key === "civil")!;
await red.do("alter", { recordId: one.id, field: "civil", value: "deceduto" });
const again = await search(red, one.name);
console.log("  dopo alter:", again.records[0]!.fields.find((f) => f.key === "civil")!.value, "(era", f0.value + ")");
await red.do("disconnect");
await sleep(1200);
console.log("  indagini aperte:", me().investigations.length, "etica", me().ethics);

console.log("== OGGETTI");
await red.do("devGrant", { item: "joshua" });
await red.do("devGrant", { exploit: "scrub" });
await red.do("devGrant", { exploit: "alibi" });
await sleep(1200);
const chipSt = me().storage.find((s) => s.item?.kind === "chip")!;
await red.do("equip", { key: chipSt.key });
await sleep(1200);
console.log("  chip montati:", me().chips.map((c) => c.name), "slot", me().chipSlots, "imprese", me().feats);

console.log("== BANCA: bonifico verso il proprio conto");
await breakIn(["r-sable", "r-kiln", "r-lantern", "meridia-credit"]);
const accts = (await search(red, "")).records.filter((r) => r.account && r.account.balance > 4000);
const a = accts[0]!;
const amount = Math.floor(a.account!.balance * 0.25);
const before = me().credits;
await red.do("transfer", { from: a.account!.number, to: me().account, amount: amount + 1 });
await red.do("transfer", { from: a.account!.number, to: me().account, amount });
await sleep(600);
console.log("  in transito:", me().pending.map((p) => p.amount), "ledger", red.state!.op!.ledger!.length);
const scrub = me().storage.find((s) => s.item?.code === "scrub")!;
await red.do("useItem", { key: scrub.key });
await red.do("disconnect");
await sleep(9000);
console.log("  accreditati:", me().credits - before, "(attesi", amount + ") pending", me().pending.length);

console.log("== GIUSTIZIA");
await red.do("devGrant", { charge: 3 });
await red.do("devGrant", { charge: 3 });
await red.do("devGrant", { charge: 3 });
await sleep(1200);
console.log("  mandato:", me().warrant, "capi:", me().charges.length);
// il casellario: cancello il mio fascicolo
await breakIn(["r-sable", "r-kiln", "r-lantern"], "10.200.1.1");
const alias = (await search(red, "alias")).records;
console.log("  fascicoli nel casellario:", alias.map((r) => r.name));
await red.do("clearCharges", { recordId: alias[0]!.id });
await red.do("disconnect");
await sleep(1200);
console.log("  dopo la pulizia: mandato", me().warrant, "imprese", me().feats);
await red.do("devGrant", { charge: 3 });
await red.do("devGrant", { charge: 3 });
await red.do("devGrant", { charge: 3 });
await red.do("devGrant", { charge: 1 });
await sleep(1200);
console.log("  arrestato:", me().jailUntil > Date.now(), "arresti", me().arrests, "cauzione", me().bail, "chip rimasti", me().chips.length);
await red.do("connect", { chain: ["halcyon-uni"] });
await red.do("payBail");
await sleep(1200);
console.log("  fuori:", me().jailUntil === 0);

console.log("== WAR DIALER");
for (let i = 0; i < 6 && me().hiddenFound === 0; i += 1) {
  await red.do("wardial", { region: "na" });
  await sleep(2600);
}
console.log("  nodi nascosti trovati:", me().hiddenFound, "/", me().hiddenTotal, red.state!.nodes.filter((n) => n.hidden).map((n) => n.name));

console.log("== BLU: contratti nati dalle azioni del rosso");
await sleep(1200);
console.log("  ", blue.state!.missions.map((m) => `${m.type}:${m.title}`).filter((t) => /restore|reverse|recover|profile|hunt/.test(t)));
console.log("  bacheca rossa:", [...new Set(red.state!.missions.map((m) => m.type))], "complicazioni:", red.state!.missions.flatMap((m) => m.mods));
process.exit(0);
