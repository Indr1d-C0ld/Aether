// I rotori del Decrypter: la chiave si apre sul banco, risponde come un Mastermind, decifra il file
// se la trovi e si ruota se finisci le prove.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";
import { ROTOR_SYMBOLS, rotorScore, rotorSpec } from "../shared/rotors.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = Extract<ServerMsg, { t: "res" }>;
let state: GameState | null = null;
let seq = 0;
const pending = new Map<number, (m: Res) => void>();
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
await new Promise<void>((r) => {
  ws.on("open", () => ws.send(JSON.stringify({ t: "auth", mode: "register", handle: `rot_${Math.random().toString(36).slice(2, 6)}`, pass: "segreto123", faction: "red" })));
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
const rotor = () => state!.op!.rotor!;
const K = ROTOR_SYMBOLS.length;
const every = (n: number) => {
  const out: number[][] = [];
  const rec = (p: number[]) => {
    if (p.length === n) return void out.push(p);
    for (let s = 0; s < K; s += 1) rec([...p, s]);
  };
  rec([]);
  return out;
};

/** Giocatore attento: prova solo chiavi compatibili con tutti i riscontri. «wrong»: prove buttate apposta. */
async function solve(wrong = false) {
  for (;;) {
    await sleep(120);
    const r = rotor();
    if (r.state !== "open") return r.state;
    const cand = every(r.rotors).filter((c) => r.guesses.every((x) => {
      const sc = rotorScore(c, x.g);
      return sc.exact === x.exact && sc.near === x.near;
    }));
    const bad = every(r.rotors).filter((c) => !cand.includes(c) && !r.guesses.some((x) => x.g.join() === c.join()));
    const pool = wrong && bad.length ? bad : cand;
    await act("rotor", { act: "try", guess: pool[Math.floor(Math.random() * pool.length)] });
  }
}

const enter = async (id: string, pw: string) => {
  await act("devGrant", { cool: true });
  const c = await act("connect", { chain: ["r-sable", "r-kiln", "r-lantern", id] });
  if (!c.ok) console.log("  connect:", c.error);
  await sleep(200);
  if (state!.op!.target.sec.monitor > 0) await act("run", { tool: "monbypass" });
  if (!state!.op!.bypass.proxy) await act("run", { tool: "proxy" });
  for (let i = 0; i < 60 && state!.op!.tasks.some((k) => k.state === "run"); i += 1) await sleep(250);
  const l = await act("login", { password: pw });
  await sleep(300);
  return l.ok;
};
const enc = () => state!.op!.files!.find((f) => f.encryption === 2)!;

await sleep(400);
await act("devGrant", { tools: { decrypt: 1, proxy: 3, firewall: 3, monbypass: 3 }, hw: { cpu: 5, modem: 3, memory: 3 }, credits: 50000 });

// 1. file L2 con il Decrypter v1: a mano
check("dentro Lumen News", await enter("lumen-news", "SIGNAL"));
const f = enc();
check("c'è un file cifrato L2", f.encryption === 2 && !f.decrypted);
check("il Decrypter v1 non basta", !(await act("run", { tool: "decrypt", fileId: f.id })).ok);
check("ma la chiave si apre a mano", (await act("rotor", { act: "open", fileId: f.id })).ok);
await sleep(200);
const spec = rotorSpec(2, true);
check("rotori e prove del livello 2 a mano", rotor().rotors === spec.rotors && rotor().tries === spec.tries && rotor().manual && rotor().code === null);
check("combinazione sbagliata di lunghezza rifiutata", !(await act("rotor", { act: "try", guess: [0, 1] })).ok);
const end = await solve();
await sleep(300);
console.log("  esito:", end, "in", rotor().guesses.length, "prove");
if (end === "won") {
  check("chiave trovata: file in chiaro", state!.op!.files!.find((x) => x.id === f.id)!.decrypted);
  check("contatori dei file decifrati a mano", (state!.me.counters["mg:rotor"] ?? 0) === 1 && (state!.me.counters["mg:rotormanual"] ?? 0) === 1);
} else {
  check("prove finite: file ancora cifrato, chiave mostrata", !state!.op!.files!.find((x) => x.id === f.id)!.decrypted && rotor().code !== null);
  check("persa: a mano non si riprova", !(await act("rotor", { act: "open", fileId: f.id })).ok);
}
await act("disconnect");

// 2. stesso file, prove buttate: deve finire male
check("di nuovo dentro", await enter("lumen-news", "SIGNAL"));
await act("rotor", { act: "open", fileId: f.id });
await sleep(200);
const before = state!.op!.trace.progressMs ?? 0;
const r2 = await solve(true);
await sleep(300);
check("prove finite: chiave ruotata", r2 === "lost" && rotor().code !== null && !state!.op!.files!.find((x) => x.id === f.id)!.decrypted);
check("il trace fa un balzo", !state!.op!.trace.active || (state!.op!.trace.progressMs ?? 0) > before);
check("persa: non si riapre", !(await act("rotor", { act: "open", fileId: f.id })).ok);
await act("disconnect");

// 3. due livelli sopra: nemmeno a mano
check("dentro la polizia di Meridia", await enter("meridia-pd", "K7R-NOVA-21"));
const f3 = state!.op!.files!.find((x) => x.encryption === 3)!;
check("file L3 con il Decrypter v1: troppi rotori", Boolean(f3) && !(await act("rotor", { act: "open", fileId: f3.id })).ok);
await act("disconnect");

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
