// Nemesi e favori: le tracce nei log che fanno nascere una nemesi, le sue mosse (sorveglianza, esca, soffiata),
// il depistaggio e la corruzione, la nemesi che si stufa; il favore chiesto da un abitante amico, fatto o mancato.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";
import type { NemesisView } from "../shared/nemesis.ts";
import { WORLD } from "../server/worldgen.ts";

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
  const nem = async (cmd: string, p: Record<string, unknown> = {}) => act("nemesis", { cmd, ...p });
  return { state: () => state!, act, nem, view: async () => (await nem("view")).data as NemesisView };
}
const fails: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};
const refresh = async (b: { act: (a: string, p?: Record<string, unknown>) => Promise<Res> }) => (await b.act("devGrant", { xp: 0 }), await sleep(900));

const red = await bot("ricercato", "red");
const blue = await bot("amico", "blue");
await sleep(500);
await red.act("devGrant", { xp: 6000, credits: 30000, tools: { proxy: 3, firewall: 3, monbypass: 3, breaker: 3 }, hw: { cpu: 5, modem: 5, memory: 5 } });

// ---- una sessione che tocca qualcosa lascia tracce: qualcuno della Guardia di Notte comincia a seguirle
const corp = WORLD.nodes.find((n) => n.kind === "corp" && n.gen && !n.inner && !n.hidden && n.proxy + n.firewall + n.monitor <= 5 && n.files.length)!;
await red.act("connect", { chain: ["r-sable", "r-kiln", corp.id] });
await sleep(400);
for (const t of ["monbypass", "proxy", "firewall"]) await red.act("run", { tool: t });
await sleep(500);
for (let i = 0; i < 100 && red.state().op?.tasks.some((k) => k.state === "run"); i += 1) await sleep(200);
await red.act("run", { tool: "breaker" });
await sleep(500);
for (let i = 0; i < 100 && red.state().op?.tasks.some((k) => k.state === "run"); i += 1) await sleep(200);
const st0 = red.state().me.storage.length;
const cp = await red.act("copy", { fileId: corp.files.find((f) => !f.encryption)?.id ?? corp.files[0]!.id });

await sleep(500);
for (let i = 0; i < 100 && red.state().op?.tasks.some((k) => k.state === "run"); i += 1) await sleep(200);
check("(il colpo: un file copiato)", cp.ok && red.state().me.storage.length > st0);
await red.act("disconnect");
await sleep(600);
let v = await red.view();
check("una sessione che ha toccato qualcosa lascia tracce: un abitante blu comincia a seguirle", !v.nemesis && v.watchers.length === 1 && v.watchers[0]!.att >= 1);

// ---- la nemesi
const hunter = v.watchers[0]!.handle;
const mail0 = red.state().mail.length;
v = (await red.nem("dev", { start: hunter })).data as NemesisView;
await refresh(red);
check("a cinque tracce prende il caso, e te lo scrive", v.nemesis?.handle === hunter && red.state().mail.length > mail0 && /Il tuo caso/.test(red.state().mail[0]!.subject));
v = (await red.nem("dev", { move: true })).data as NemesisView;
await refresh(red);
await red.act("scars", { dev: true, reveal: [corp.id] });
for (let i = 0; i < 20 && !red.state().nodes.find((n) => n.id === corp.id)?.alert; i += 1) await sleep(500);
check("prima mossa: sorveglia l'organizzazione che colpisci di più, che va in allerta", v.nemesis?.level === 1 && v.nemesis.moves[0]!.text.includes(corp.org) && Boolean(red.state().nodes.find((n) => n.id === corp.id)?.alert));
v = (await red.nem("dev", { move: true })).data as NemesisView;
await refresh(red);
check("seconda: un'esca in bacheca, un lavoro troppo facile", v.nemesis?.level === 2 && /bacheca/.test(v.nemesis.moves[0]!.text) && red.state().missions.some((m) => m.title.startsWith("Lavoro facile:")));
for (let i = 0; i < 12 && !v.nemesis!.moves.some((m) => /segnalato/.test(m.text)); i += 1) v = (await red.nem("dev", { move: true })).data as NemesisView;
await refresh(red);
check("e prima o poi ti segnala alla Guardia: un capo d'accusa", v.nemesis?.level === 3 && v.nemesis.moves.some((m) => /segnalato/.test(m.text)) && red.state().me.charges.length >= 1);

// ---- depistare, comprare
await red.nem("dev", { roll: 0 });
const next0 = v.nemesis!.nextAt;
let r = await red.nem("decoy");
v = r.data as NemesisView;
check("depistarla rimanda la prossima mossa di dodici ore", r.ok && v.nemesis!.nextAt >= next0 + 11 * 3600_000);
await red.nem("dev", { roll: 0.99 });
const c0 = red.state().me.credits;
r = await red.nem("bribe");
await refresh(red);
check("comprarla può andare male: soldi persi e un'accusa in più", r.ok && Boolean((r.data as NemesisView).nemesis) && red.state().me.credits <= c0 - 4000);
await red.nem("dev", { roll: 0 });
r = await red.nem("bribe");
await refresh(red);
check("o bene: il caso si chiude", r.ok && (r.data as NemesisView).nemesis === null && (red.state().me.counters["nem:won"] ?? 0) === 1);

// ---- si stufa
await red.nem("dev", { start: hunter, roll: null });
await red.act("devGrant", { cool: true });
await red.nem("dev", { calm: 25, pulse: true });
v = await red.view();
check("dopo un giorno tranquillo si stufa", v.nemesis === null && (red.state().me.counters["nem:won"] ?? 0) === 2);

// ---- favori
v = (await blue.nem("dev", { favor: "Sentinel" })).data as NemesisView;
await refresh(blue);
check("un abitante amico chiede un favore: un contratto personale in bacheca, e una lettera", v.favor?.handle === "Sentinel" && blue.state().missions.some((m) => m.id === v.favor!.missionId && m.mine) && /favore/.test(blue.state().mail[0]!.subject));

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
