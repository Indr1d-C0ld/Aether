// Bottino con un contenuto: un file copiato può essere un progetto (si vende alla concorrenza) o la prova di uno
// scandalo (si porta a un giornale, o si usa per ricattare). Usarlo consuma il file e cambia il mondo.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";
import type { OrgView, WorldView } from "../shared/orgs.ts";
import { WORLD } from "../server/worldgen.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = Extract<ServerMsg, { t: "res" }>;
const tag = Math.random().toString(36).slice(2, 6);
let state: GameState | null = null;
let seq = 0;
const pending = new Map<number, (m: Res) => void>();
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
await new Promise<void>((r) => {
  ws.on("open", () => ws.send(JSON.stringify({ t: "auth", mode: "register", handle: `spia_${tag}`, pass: "segreto123", faction: "red" })));
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
const fails: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};
const idle = async () => {
  await sleep(500);
  for (let i = 0; i < 100 && state!.op?.tasks.some((k) => k.state === "run"); i += 1) await sleep(200);
  await sleep(300);
};

await sleep(400);
await act("devGrant", { xp: 6000, credits: 20000, tools: { proxy: 3, firewall: 3, monbypass: 3, breaker: 3 }, hw: { cpu: 5, modem: 5, memory: 5 } });
const corp = WORLD.nodes.find((n) => n.kind === "corp" && n.gen && !n.inner && !n.hidden && n.proxy + n.firewall + n.monitor <= 5 && n.files.filter((f) => !f.encryption).length >= 3)!;
const plain = corp.files.filter((f) => !f.encryption);
await act("connect", { chain: ["r-sable", "r-kiln", corp.id] });
await sleep(400);
for (const t of ["monbypass", "proxy", "firewall"]) await act("run", { tool: t });
await idle();
await act("run", { tool: "breaker" });
await idle();
const copy = async (i: number, kind: string) => {
  await act("leak", { dev: true, force: kind });
  await act("copy", { fileId: plain[i]!.id });
  await idle();
  return state!.me.storage.find((s) => s.fileId === plain[i]!.id)!;
};

// ---- un progetto: alla concorrenza
const research = await copy(0, "research");
check("un file copiato può essere un progetto riservato", research?.content?.kind === "research" && research.content.org === corp.org);
const before = (await act("world", { cmd: "org", id: corp.id })).data as OrgView;
const c0 = state!.me.credits;
const r1 = await act("leak", { key: research.key, use: "rival" });
await sleep(900);
const after = (await act("world", { cmd: "org", id: corp.id })).data as OrgView;
check("venduto alla concorrenza: soldi a te, la vittima perde e sospetta del concorrente", r1.ok && state!.me.credits > c0 && after.cash < before.cash && after.rivals.some((r) => r.heat >= 1) && !state!.me.storage.some((s) => s.key === research.key));
check("e la Cronaca lo racconta", ((await act("world")).data as WorldView).news.some((n) => /sospettamente simile/.test(n.text)));

// ---- uno scandalo: al giornale
const scandal = await copy(1, "scandal");
check("o la prova di uno scandalo", scandal?.content?.kind === "scandal");
check("un progetto e uno scandalo non si confondono", !(await act("leak", { key: scandal.key, use: "rival" })).ok);
const fame0 = state!.me.fame;
const rep0 = ((await act("world", { cmd: "org", id: corp.id })).data as OrgView).rep;
const r2 = await act("leak", { key: scandal.key, use: "press" });
await sleep(900);
check("portato a un giornale: fama a te, reputazione giù per la vittima", r2.ok && state!.me.fame >= fame0 + 8 && ((await act("world", { cmd: "org", id: corp.id })).data as OrgView).rep <= rep0 - 15);
check("in Cronaca: «Scandalo»", ((await act("world")).data as WorldView).news.some((n) => n.text.startsWith("Scandalo:")));

// ---- uno scandalo: il ricatto
const third = await copy(2, "scandal");
const c1 = state!.me.credits;
const ch0 = state!.me.charges.length;
const r3 = await act("leak", { key: third.key, use: "blackmail" });
await sleep(900);
check("il ricatto: o paga, o va alla polizia", r3.ok && (state!.me.credits > c1 || state!.me.charges.length > ch0));
await act("leak", { dev: true, force: null });

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
