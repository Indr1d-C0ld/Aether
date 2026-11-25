// Commissioni: un giocatore scrive un lavoro con condizioni, un altro lo esegue; le condizioni contano davvero.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = Extract<ServerMsg, { t: "res" }>;
async function bot(faction: "red" | "blue") {
  let state: GameState | null = null;
  let seq = 0;
  const pending = new Map<number, (m: Res) => void>();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise<void>((r) => {
    ws.on("open", () => ws.send(JSON.stringify({ t: "auth", mode: "register", handle: `job${faction[0]}_${Math.random().toString(36).slice(2, 6)}`, pass: "segreto123", faction })));
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
  const idle = async () => {
    await sleep(400);
    for (let i = 0; i < 200 && state!.op?.tasks.some((k) => k.state === "run"); i += 1) await sleep(200);
    await sleep(300);
  };
  return { state: () => state!, act, idle };
}
const fails: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};

const boss = await bot("red");
const runner = await bot("red");
await sleep(400);
await boss.act("devGrant", { credits: 20000 });
await runner.act("devGrant", { xp: 3000, tools: { proxy: 3, firewall: 3, breaker: 3, monbypass: 3, logdel: 3 }, hw: { cpu: 5, modem: 4, memory: 4 } });
await sleep(1200);
const T = "halcyon-uni";
check("solo su sistemi che conosci", !(await boss.act("postJob", { goal: "admin", nodeId: "g-bank-3", conds: [], reward: 2000 })).ok);
check("o di notte o di giorno, non tutte e due", !(await boss.act("postJob", { goal: "admin", nodeId: T, conds: ["notte", "giorno"], reward: 3000 })).ok);
check("ogni condizione alza la paga minima", !(await boss.act("postJob", { goal: "admin", nodeId: T, conds: ["ghost", "notte"], reward: 1000 })).ok);
const cr0 = boss.state().me.credits;
const post = await boss.act("postJob", { goal: "admin", nodeId: T, conds: ["ghost", "notte"], reward: 2500, hours: 3 });
await sleep(1200);
check("commissione pubblicata: ricompensa e commissione in deposito", post.ok && boss.state().me.credits < cr0 - 2500);

const job = runner.state().missions.find((m) => m.title.startsWith("Commissione"))!;
check("chi la vede sa cosa va fatto e come", Boolean(job) && job.objectives.length === 2 && /di notte/.test(job.objectives[0]!.label) && /righe/.test(job.objectives[1]!.label));
check("accettata", (await runner.act("take", { missionId: job.id })).ok);

const run = async () => {
  const relay = runner.state().nodes.find((n) => n.id === "r-kiln")!;
  await runner.act("devGrant", { cool: true });
  await runner.act("connect", { chain: ["r-sable", "r-kiln", T] });
  await sleep(300);
  await runner.act("run", { tool: "firewall" });
  await runner.act("run", { tool: "breaker" });
  await runner.idle();
  const mine = runner.state().op!.logs!.filter((l) => l.text.includes(relay.ip));
  await runner.act("run", { tool: "logdel", logIds: mine.map((l) => l.id) });
  await runner.idle();
  await runner.act("disconnect");
  await sleep(600);
};
// di giorno: il lavoro è fatto, ma non come chiesto
await runner.act("devGrant", { clock: "giorno" });
await run();
const day = await runner.act("deliver", { missionId: job.id });
check("fatto di giorno: la condizione «di notte» non è rispettata", !day.ok && /notte/.test(day.error ?? ""));
await runner.act("devGrant", { clock: "notte" });
await run();
const cr1 = runner.state().me.credits;
const night = await runner.act("deliver", { missionId: job.id });
await sleep(1200);
check("di notte e senza tracce: consegnata e pagata", night.ok && runner.state().me.credits >= cr1 + 2500);
check("a chi l'ha scritta arriva la notizia", boss.state().mail.some((m) => /eseguita/.test(m.subject)));
await runner.act("devGrant", { clock: "giorno" });

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
