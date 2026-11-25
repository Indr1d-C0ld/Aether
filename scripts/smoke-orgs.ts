// Organizzazioni vive e cronaca: le gesta cambiano cassa, paura e reputazione; le organizzazioni reagiscono
// (difese, tagli, scioperi, crisi, acquisizioni, guerre commerciali); le soglie di mondo scattano.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";
import type { OrgView, WorldView } from "../shared/orgs.ts";
import { EMERGENCY_AT } from "../shared/orgs.ts";
import { WORLD } from "../server/worldgen.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = Extract<ServerMsg, { t: "res" }>;
let state: GameState | null = null;
let seq = 0;
const pending = new Map<number, (m: Res) => void>();
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
await new Promise<void>((r) => {
  ws.on("open", () => ws.send(JSON.stringify({ t: "auth", mode: "register", handle: `org_${Math.random().toString(36).slice(2, 6)}`, pass: "segreto123", faction: "red" })));
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
const world = async (p: Record<string, unknown> = {}) => (await act("world", p)).data as WorldView;
const orgOf = async (id: string) => (await act("world", { cmd: "org", id })).data as OrgView;
const dev = async (id: string | null, p: Record<string, unknown>) => (await act("world", { cmd: "dev", id, ...p })).data as OrgView;

await sleep(400);
const corp = WORLD.nodes.find((n) => n.kind === "corp" && !n.inner && n.proxy + n.firewall + n.monitor <= 5)!;
let o = await orgOf(corp.id);
check("ogni organizzazione ha cassa, reputazione, morale e due concorrenti", o.cash > 3000 && o.rep > 40 && o.morale > 40 && o.fear === 0 && o.rivals.length === 2 && o.status === "attiva");
const cash0 = o.cash;

// le gesta vere dei giocatori arrivano all'organizzazione
await act("devGrant", { xp: 3000, credits: 20000, tools: { proxy: 3, firewall: 3, breaker: 3, monbypass: 3, decrypt: 3 }, hw: { cpu: 5, modem: 4, memory: 4 } });
await act("connect", { chain: ["r-sable", "r-kiln", "r-lantern", corp.id] });
await sleep(300);
if (state!.op!.target.sec.monitor > 0) await act("run", { tool: "monbypass" });
if (!state!.op!.bypass.proxy) await act("run", { tool: "proxy" });
if (!state!.op!.bypass.firewall) await act("run", { tool: "firewall" });
for (let i = 0; i < 100 && state!.op!.tasks.some((k) => k.state === "run"); i += 1) await sleep(250);
await act("run", { tool: "breaker" });
await sleep(600);
for (let i = 0; i < 100 && state!.op!.tasks.some((k) => k.state === "run"); i += 1) await sleep(250);
await sleep(400);
o = await orgOf(corp.id);
check("un'intrusione vera mette paura e costa reputazione", state!.op!.access === "admin" && o.fear >= 12);
await act("disconnect");

// furti e sabotaggi
o = await dev(corp.id, { event: "furto", times: 2 });
check("i furti svuotano la cassa", o.cash < cash0 && o.fear > 20);
o = await dev(corp.id, { event: "sabotaggio" });
let w = await world();
check("un sabotaggio finisce in cronaca", w.news.some((x) => x.kind === "sabotaggio" && x.org === corp.id) && o.history.length >= 1);
check("le più colpite sono in evidenza", w.hit.some((x) => x.id === corp.id));

// paura e soldi: compra difese (e i contratti su quel nodo pagano di più)
const sum0 = o.sec.proxy + o.sec.firewall + o.sec.monitor;
const job0 = (await act("world", { cmd: "dev", id: corp.id, mkJob: true })).data as { jobId: string; jobReward: number };
o = await dev(corp.id, { set: { fear: 90, cash: 50000 }, pulses: 6 });
check("con paura e soldi rafforza le difese", o.sec.proxy + o.sec.firewall + o.sec.monitor === sum0 + 1 && o.fear < 60);
const job1 = (await act("world", { cmd: "dev", id: corp.id, jobId: job0.jobId })).data as { jobReward: number };
check("e il contratto già in bacheca su quel nodo paga di più", job1.jobReward > job0.jobReward);
check("e le difese di serie restano annotate", o.base.proxy + o.base.firewall + o.base.monitor === sum0);

// conti in rosso: tagli, crisi, acquisizione
o = await dev(corp.id, { set: { cash: -100 }, pulses: 6 });
check("in rosso taglia il turno di notte", o.cuts);
o = await dev(corp.id, { set: { cash: -99999 }, pulses: 6 });
check("crisi di liquidità", o.status === "in crisi");
o = await dev(corp.id, { set: { crisisSince: Date.now() - 13 * 3600_000 }, pulses: 6 });
check("dopo dodici ore di crisi viene comprata, non chiude", o.group !== null && o.cash > 0 && o.status !== "in crisi");
o = await dev(corp.id, { set: { morale: 5 }, pulses: 120 });
check("morale a terra: sciopero", o.status === "in sciopero" || o.history.some((h) => /Sciopero/.test(h.text)));

// sospetti e guerra commerciale
const rival = o.rivals[0]!.id;
o = await dev(corp.id, { set: { rivals: { [rival]: 4 }, strikeUntil: 0 }, event: "furto", times: 30 });
w = await world();
check("troppi furti: guerra commerciale col concorrente", w.wars.some((x) => (x.a === corp.id && x.b === rival) || (x.b === corp.id && x.a === rival)));
await dev(null, { pulses: 1 });
await sleep(1500);
check("la guerra mette contratti in bacheca", state!.missions.some((m) => /Guerra commerciale/.test(m.title)));

// soglie di mondo
await dev(null, { intrusions: EMERGENCY_AT, pulses: 1 });
w = await world();
check("troppe intrusioni in un giorno: stato d'emergenza", w.emergencyUntil > Date.now() && w.news.some((x) => x.kind === "legge"));

// ---- aperture: chi resta a casa si mette in proprio
await sleep(1200);
const born = (await act("world", { cmd: "found" })).data as { id: string; org: string; ip: string; adminId: string; password: string };
w = await world();
check("nasce un'organizzazione nuova, in cronaca e fra le aperture", Boolean(born?.id) && w.news.some((x) => x.org === born.id && /Apre/.test(x.text)) && ((w as unknown as { startups?: { id: string }[] }).startups ?? []).some((x) => x.id === born.id));
o = await orgOf(born.id);
check("nasce debole e con poca cassa", o.sec.proxy <= 1 && o.sec.firewall === 1 && o.cash === 2500 && o.status === "attiva");
await act("devGrant", { cool: true });
const c2 = await act("connect", { chain: ["r-sable", "r-kiln", born.id] });
check("risponde come ogni altro sistema", c2.ok);
await sleep(300);
if (!state!.op!.bypass.proxy) await act("run", { tool: "proxy" });
await sleep(600);
for (let i = 0; i < 60 && !state!.op!.bypass.proxy; i += 1) await sleep(250);
const lg = await act("login", { password: born.password });
if (!lg.ok) console.log("  login:", lg.error, JSON.stringify(state!.op?.bypass), state!.op?.target.id);
check("e la password di root è una parola da dizionario", lg.ok);
await act("disconnect");

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
