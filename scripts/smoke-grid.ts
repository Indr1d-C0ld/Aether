// La griglia del firewall: si apre, risponde con le distanze, apre il firewall se trovi le falle,
// e punisce chi finisce le sonde.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";
import { gridDist, gridSpec } from "../shared/grid.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = Extract<ServerMsg, { t: "res" }>;
let state: GameState | null = null;
let seq = 0;
const pending = new Map<number, (m: Res) => void>();
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
await new Promise<void>((r) => {
  ws.on("open", () => ws.send(JSON.stringify({ t: "auth", mode: "register", handle: `grid_${Math.random().toString(36).slice(2, 6)}`, pass: "segreto123", faction: "red" })));
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw)) as ServerMsg;
    if (m.t === "state") state = { ...m.s, nodes: m.s.nodes ?? state?.nodes ?? [] } as GameState;
    if (m.t === "res") pending.get(m.id)?.(m);
    if (m.t === "auth_ok") r();
  });
});
const act = (a: string, p: Record<string, unknown> = {}) =>
  new Promise<Res>((r) => {
    const id = ++seq;
    pending.set(id, r);
    ws.send(JSON.stringify({ t: "do", id, a, p }));
  });
const fails: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};
const grid = () => state!.op!.grid!;

/** Giocatore attento: sonda solo caselle compatibili con gli indizi, meglio se «indicate» da più indizi. */
async function solve(waste = 0) {
  for (;;) {
    await sleep(120);
    const g = grid();
    if (g.state !== "open") return g.state;
    const N = g.side * g.side;
    const clues = Object.entries(g.clues).map(([c, d]) => [Number(c), d] as const);
    let pool: number[] = [];
    let best = -1;
    for (let c = 0; c < N; c += 1) {
      if (g.found.includes(c) || c in g.clues) continue;
      const ok = clues.every(([m, d]) => gridDist(g.side, c, m) >= d);
      if (waste > 0 ? ok : !ok) continue;
      const sc = clues.filter(([m, d]) => gridDist(g.side, c, m) === d).length;
      if (sc > best) (best = sc), (pool = []);
      if (sc === best) pool.push(c);
    }
    // «waste»: sonde buttate apposta su caselle che gli indizi escludono
    if (waste > 0) waste -= 1;
    if (!pool.length) for (let c = 0; c < N; c += 1) if (!g.found.includes(c) && !(c in g.clues)) pool.push(c);
    await act("grid", { act: "probe", cell: pool[Math.floor(Math.random() * pool.length)] });
  }
}

await sleep(400);
await act("devGrant", { tools: { firewall: 1, proxy: 3, monbypass: 3 }, credits: 50000 });
const nodes = state!.nodes!;
const pick = (lvl: number) => nodes.find((n) => n.sec.firewall === lvl && n.kind !== "relay" && n.kind !== "gateway")!;

// 1. firewall del proprio livello: griglia normale
const n1 = pick(1);
check("collegamento", (await act("connect", { chain: [n1.id] })).ok);
check("la griglia si apre", (await act("grid", { act: "open" })).ok);
await sleep(200);
const spec = gridSpec(1, false);
check("lato, falle e sonde del livello 1", grid().side === spec.side && grid().holes === spec.holes && grid().probes === spec.probes && !grid().manual);
check("casella fuori dalla griglia rifiutata", !(await act("grid", { act: "probe", cell: 999 })).ok);
let wins = 0;
if ((await solve()) === "won") wins += 1;
await sleep(200);
check("falle trovate: firewall aperto", grid().state !== "won" || state!.op!.bypass.firewall);
check("contatore dei firewall aperti a mano", wins === 0 || (state!.me.counters["mg:grid"] ?? 0) === 1);
await act("disconnect");

// 2. firewall sopra la versione: a mano, con una sonda in meno
const n2 = pick(2);
await act("devGrant", { cool: true });
check("collegamento a un firewall L2 con la v1", (await act("connect", { chain: [n2.id] })).ok);
check("il Firewall Bypass v1 non basta", !(await act("run", { tool: "firewall" })).ok);
check("ma la griglia a mano si apre", (await act("grid", { act: "open" })).ok);
await sleep(200);
check("a mano: una sonda in meno", grid().manual && grid().probes === gridSpec(2, true).probes);
const before = state!.op!.trace.progressMs ?? 0;
// si buttano tutte le sonde su caselle escluse: deve finire male
const r = await solve(99);
await sleep(300);
check("sonde finite: griglia persa, firewall chiuso", r === "lost" && !state!.op!.bypass.firewall && grid().missed.length > 0);
check("il trace fa un balzo", !state!.op!.trace.active || (state!.op!.trace.progressMs ?? 0) > before);
check("persa: non si riapre", !(await act("grid", { act: "open" })).ok);
await act("disconnect");

// 3. due livelli sopra: nemmeno a mano
const n3 = pick(3);
await act("devGrant", { cool: true });
await act("connect", { chain: [n3.id] });
check("firewall L3 con la v1: troppo fitto", !(await act("grid", { act: "open" })).ok);
await act("disconnect");

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
