// Territori: i punti delle imprese di una crew in una città, la città conquistata (e la Cronaca), la città contesa,
// il trace più lento a casa propria, il pedaggio sui relay, le bande degli abitanti che fanno lo stesso.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";
import type { TurfView } from "../shared/turf.ts";
import type { WorldView } from "../shared/orgs.ts";
import { WORLD } from "../server/worldgen.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = Extract<ServerMsg, { t: "res" }>;
const tag = Math.random().toString(36).slice(2, 5).toUpperCase();
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
  return { state: () => state!, act, turf: async (p: Record<string, unknown> = {}) => (await act("turf", p)).data as TurfView };
}
const fails: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};
const crack = async (b: Awaited<ReturnType<typeof bot>>) => {
  for (const t of ["monbypass", "proxy", "firewall"]) await b.act("run", { tool: t });
  await sleep(500);
  for (let i = 0; i < 100 && b.state().op?.tasks.some((k) => k.state === "run"); i += 1) await sleep(200);
  await b.act("run", { tool: "breaker" });
  await sleep(500);
  for (let i = 0; i < 100 && b.state().op?.tasks.some((k) => k.state === "run"); i += 1) await sleep(200);
  await sleep(400);
};

const boss = await bot("capo", "red");
const lone = await bot("solitario", "red");
await sleep(500);
const gear = { xp: 6000, credits: 30000, tools: { proxy: 3, firewall: 3, monbypass: 3, breaker: 3, tracker: 3 }, hw: { cpu: 5, modem: 5, memory: 5 } };
await boss.act("devGrant", gear);
await lone.act("devGrant", gear);
check("(una crew)", (await boss.act("crewCreate", { tag, name: `Banda ${tag}` })).ok);

// ---- un'impresa vera in una città porta punti alla crew
const corp = WORLD.nodes.find((n) => n.kind === "corp" && n.gen && !n.inner && !n.hidden && n.city && n.proxy + n.firewall + n.monitor <= 5)!;
await boss.act("connect", { chain: ["r-sable", "r-kiln", corp.id] });
await sleep(400);
await crack(boss);
let v = await boss.turf();
const here = v.cities.find((c) => c.city === corp.city);
check("un accesso admin dà punti di presenza alla crew in quella città", boss.state().op?.access === "admin" && Boolean(here?.top.some((t) => t.tag === tag && t.mine && t.pts >= 2)));
const r0 = boss.state().op!.trace.rate ?? 0;
await boss.act("disconnect");

// ---- la città conquistata
await boss.act("turf", { dev: true, city: corp.city, key: `crew:${tag}`, pts: 20 });
v = await boss.turf();
check("abbastanza punti: la città è della crew", v.held.includes(corp.city!) && v.cities.find((c) => c.city === corp.city)!.holder?.tag === tag);
check("e la Cronaca lo racconta", ((await boss.act("world")).data as WorldView).news.some((n) => n.text.startsWith(`${corp.city} passa a Banda ${tag}`)));
await boss.act("connect", { chain: ["r-sable", "r-kiln", corp.id] });
await sleep(400);
await crack(boss);
const r1 = boss.state().op!.trace.rate ?? 0;
check("a casa propria il trace è più lento", r0 > 0 && r1 > 0 && r1 < r0 * 0.95);
await boss.act("disconnect");

// ---- contesa
await boss.act("turf", { dev: true, city: corp.city, key: "gang:corvi", pts: 22 });
v = await boss.turf();
check("se un'altra banda arriva vicina, la città è contesa", v.cities.find((c) => c.city === corp.city)!.contested && !v.held.includes(corp.city!));

// ---- il pedaggio
const relay = WORLD.nodes.find((n) => n.kind === "relay" && n.cls === "public" && n.city && !n.hidden && n.city !== corp.city)!;
await boss.act("turf", { dev: true, city: relay.city, key: `crew:${tag}`, pts: 30 });
const c0 = lone.state().me.credits;
const cn = await lone.act("connect", { chain: [relay.id, "r-kiln", corp.id] });
await sleep(1200);
if (lone.state().me.credits !== c0 - 40) console.log("  collegamento:", cn.ok, cn.error ?? "", "· crediti", c0, "→", lone.state().me.credits, "· città del relay", relay.city, JSON.stringify((await boss.turf()).cities.find((c) => c.city === relay.city)?.holder));
await boss.act("devGrant", { xp: 0 });
await sleep(900);
check("chi rimbalza sui relay di una città tenuta da un'altra crew paga il pedaggio alla sua cassa", lone.state().me.credits === c0 - 40 && (boss.state().crews?.find((c: { mine: boolean; bank: number }) => c.mine)?.bank ?? 0) === 40);
await lone.act("disconnect");

// ---- gli abitanti fanno lo stesso, per la loro banda
const corvi = (t: TurfView) => t.cities.reduce((sum, c) => sum + c.top.filter((x) => x.name === "I Corvi").reduce((q, x) => q + x.pts, 0), 0);
const corvi0 = corvi(await boss.turf());
await boss.act("devGrant", { clock: "notte" }); // di giorno gli abitanti rossi non colpiscono
for (let i = 0; i < 8; i += 1) await boss.act("life", { cmd: "force", handle: "Corax", what: "red", free: true, heat: 0 });
await boss.act("devGrant", { clock: "giorno" });
v = await boss.turf();
check("le bande degli abitanti si prendono punti nelle città dove colpiscono", corvi(v) > corvi0);

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
