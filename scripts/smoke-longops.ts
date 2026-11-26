// Operazioni lunghe: la talpa (password dell'operatore, mezza root, un file, un badge; scoperta e licenziata),
// l'infiltrazione sotto copertura dei blu (avvisi, arresti, scoperta), la fine naturale.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";
import type { LongOpsView } from "../shared/longops.ts";
import type { WorldView } from "../shared/orgs.ts";
import { WORLD } from "../server/worldgen.ts";
import { PEOPLE } from "../server/people.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = Extract<ServerMsg, { t: "res" }>;
const tag = Math.random().toString(36).slice(2, 6);
async function bot(h: string, faction: "red" | "blue") {
  let state: GameState | null = null;
  let seq = 0;
  const pending = new Map<number, (m: Res) => void>();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise<void>((r) => {
    ws.on("open", () => ws.send(JSON.stringify({ t: "auth", mode: "register", handle: `${h}_${tag}`, pass: "segreto123", faction })));
    ws.on("message", (raw) => {
      const m = JSON.parse(String(raw)) as ServerMsg;
      if (m.t === "state") state = { ...m.s, nodes: m.s.nodes ?? state?.nodes ?? [] } as GameState;
      if (m.t === "res") pending.get(m.id)?.(m);
      if (m.t === "auth_ok") r();
    });
  });
  const act = async (a: string, p: Record<string, unknown> = {}) => {
    await sleep(60);
    return new Promise<Res>((r) => {
      const id = ++seq;
      pending.set(id, r);
      ws.send(JSON.stringify({ t: "do", id, a, p }));
    });
  };
  const op = async (cmd: string, p: Record<string, unknown> = {}) => act("longop", { cmd, ...p });
  const tick = async (roll: number) => {
    await op("dev", { roll, tick: true });
    await sleep(900);
    return (await op("view")).data as LongOpsView;
  };
  return { state: () => state!, act, op, tick };
}
const fails: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};

const red = await bot("burattinaio", "red");
const blue = await bot("infiltrato", "blue");
await sleep(500);
await red.act("devGrant", { credits: 30000 });
await blue.act("devGrant", { credits: 30000 });

// ---- la talpa
const emp = PEOPLE.find((p) => {
  const n = WORLD.nodes.find((x) => x.id === WORLD.employer[p.id]);
  return n && n.kind === "corp" && n.adminId !== p.id && n.files.some((f) => !f.encryption);
})!;
const firm = WORLD.nodes.find((x) => x.id === WORLD.employer[emp.id])!;
let v = (await red.op("view")).data as LongOpsView;
check("senza un fascicolo non c'è nessuna talpa possibile", v.moles.length === 0);
await red.act("cit", { cmd: "dev", id: emp.id, meet: true, set: { debt: 6500, fired: null, warned: 0, cd: {} } });
await red.act("cit", { cmd: "investigate", id: emp.id });
v = (await red.op("view")).data as LongOpsView;
check("un dipendente indebitato di cui hai il fascicolo può diventare una talpa", v.moles.some((m) => m.pid === emp.id && m.employer === firm.org));
const c0 = red.state().me.credits;
const st = await red.op("mole", { pid: emp.id });
await sleep(700);
check("la talpa costa, e l'operazione parte", st.ok && red.state().me.credits === c0 - 1500 && (st.data as LongOpsView).ops.length === 1);
const m0 = red.state().mail.length;
v = await red.tick(0.2);
check("primo esito: la password dell'operatore, per posta", red.state().mail.length > m0 && /l'operatore/.test(red.state().mail[0]!.subject));
v = await red.tick(0.4);
check("poi mezza password di root", /root/.test(red.state().mail[0]!.subject) && red.state().mail[0]!.body.includes(firm.password.slice(0, 2)));
const s0 = red.state().me.storage.length;
v = await red.tick(0.7);
check("poi una copia di un file", red.state().me.storage.length === s0 + 1 && red.state().me.storage.some((x) => x.nodeId === firm.id));
v = await red.tick(0.9);
check("poi il suo badge", /badge/.test(v.ops[0]!.log[0]!.text));
await red.act("connect", { chain: ["r-sable", "r-kiln", firm.id] });
await sleep(600);
check("e con il badge entri da operatore", red.state().op?.clearance === 2);
await red.act("disconnect");
const h0 = red.state().me.heat;
v = await red.tick(0.01);
check("finché non la scoprono: licenziata, operazione chiusa, calore in più", v.ops.length === 0 && red.state().me.heat >= h0 + 15 && ((await red.act("world")).data as WorldView).news.some((n) => n.text.includes(`licenzia ${emp.name}`)));
check("e senza lavoro non è più una candidata", !((await red.op("view")).data as LongOpsView).moles.some((m) => m.pid === emp.id));

// ---- sotto copertura
v = (await blue.op("view")).data as LongOpsView;
check("i blu possono infiltrarsi nelle bande rosse degli abitanti", v.gangs.some((g) => g.id === "corvi") && !v.gangs.some((g) => g.id === "notte"));
await blue.op("cover", { gang: "corvi" });
const bm = blue.state().mail.length;
v = await blue.tick(0.5);
check("ti avvisano del prossimo colpo, e il sistema va in allerta", blue.state().mail.length > bm && /punta/.test(v.ops[0]!.log[0]!.text));
v = await blue.tick(0.1);
check("a volte un nome finisce alla Guardia", /Guardia/.test(v.ops[0]!.log[0]!.text));
await blue.op("dev", { end: true });
await blue.act("nemesis", { cmd: "dev", pulse: true });
await sleep(600);
check("dopo tre giorni l'operazione finisce da sola", ((await blue.op("view")).data as LongOpsView).ops.length === 0);
await blue.op("cover", { gang: "carrier" });
v = await blue.tick(0.01);
check("oppure ti scoprono", v.ops.length === 0 && /Ti hanno scoperto/.test(blue.state().mail[0]?.subject ?? ""));
check("traguardi", (red.state().me.counters["op:mole"] ?? 0) === 1 && (red.state().me.counters["op:yield"] ?? 0) === 4 && (blue.state().me.counters["op:cover"] ?? 0) === 2);

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
