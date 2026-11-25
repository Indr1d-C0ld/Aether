// I toni della Blue Box: la linea si apre durante una scansione, tiene ferma la fine della scansione,
// premia chi ripete i tre giri e addebita chi sbaglia.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";
import { TONE_BONUS_FINDS, TONE_FAIL_COST, TONE_ROUNDS } from "../shared/tones.ts";
import { scanFinds } from "../shared/rules.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = Extract<ServerMsg, { t: "res" }>;
let state: GameState | null = null;
let seq = 0;
const pending = new Map<number, (m: Res) => void>();
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
await new Promise<void>((r) => {
  ws.on("open", () => ws.send(JSON.stringify({ t: "auth", mode: "register", handle: `tone_${Math.random().toString(36).slice(2, 6)}`, pass: "segreto123", faction: "red" })));
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
const me = () => state!.me;
const tone = () => state!.me.tone!;

await sleep(400);
await act("devGrant", { credits: 5000 });
check("senza scansione la Blue Box non serve", !(await act("tone", { act: "open" })).ok);

// 1. tre giri giusti: la linea tiene ferma la scansione, poi arrivano i nodi in più
const known = me().knownNodes;
check("scansione avviata", (await act("wardial", { region: "eu" })).ok);
check("linea aperta", (await act("tone", { act: "open" })).ok);
await sleep(300);
check("primo giro: quattro toni", tone().state === "open" && tone().round === 0 && tone().seq.length === TONE_ROUNDS[0]);
await sleep(3000);
check("la scansione aspetta che tu finisca", me().scanUntil > 0 && tone().state === "open");
check("sequenza incompleta rifiutata", !(await act("tone", { act: "dial", keys: [1] })).ok);
const first = tone().seq;
for (let r = 0; r < TONE_ROUNDS.length; r += 1) {
  await sleep(150);
  if (r === 1) check("secondo giro: stessa sequenza più un tono", tone().seq.length === TONE_ROUNDS[1] && first.every((k, i) => tone().seq[i] === k));
  await act("tone", { act: "dial", keys: tone().seq });
}
await sleep(400);
check("tre giri: centralino ingannato", tone()?.state === "won" && (me().counters["mg:tone"] ?? 0) === 1);
check("scansione chiusa subito", me().scanUntil === 0);
check("nodi in più sulla mappa", me().knownNodes - known >= scanFinds(1) + TONE_BONUS_FINDS);
check("a partita chiusa la linea non si riapre", !(await act("tone", { act: "open" })).ok);

// 2. un tono sbagliato: interurbana addebitata, la scansione finisce lo stesso
await sleep(500);
const known2 = me().knownNodes;
await act("wardial", { region: "eu" });
await act("tone", { act: "open" });
await sleep(300);
const cr = me().credits;
const wrong = tone().seq.map((k) => (k + 1) % 12);
await act("tone", { act: "dial", keys: wrong });
await sleep(400);
check("tono sbagliato: linea persa e interurbana", tone().state === "lost" && me().credits === cr - TONE_FAIL_COST);
check("persa: non si riapre", !(await act("tone", { act: "open" })).ok);
await sleep(2500);
check("la scansione finisce comunque, senza premio", me().scanUntil === 0 && me().knownNodes - known2 >= scanFinds(1) && me().knownNodes - known2 <= scanFinds(1) + 1);

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
