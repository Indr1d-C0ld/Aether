// Sottosistemi: credenziali del personale, posta interna, telecamere, contabilità, badge, rete interna.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";
import type { MailMsg } from "../shared/zones.ts";
import { WORLD } from "../server/worldgen.ts";
import { PEOPLE } from "../server/people.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = Extract<ServerMsg, { t: "res" }>;
let state: GameState | null = null;
let seq = 0;
const pending = new Map<number, (m: Res) => void>();
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
await new Promise<void>((r) => {
  ws.on("open", () => ws.send(JSON.stringify({ t: "auth", mode: "register", handle: `zone_${Math.random().toString(36).slice(2, 6)}`, pass: "segreto123", faction: "red" })));
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
  for (let i = 0; i < 400; i += 1) {
    await sleep(150);
    if (!state?.op?.tasks.some((t) => t.state === "run")) return;
  }
};
const fails: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};
const zone = (z: string, a: string, arg = "") => act("zone", { zone: z, act: a, arg });

await act("devGrant", { xp: 6000, credits: 40000, tools: { proxy: 3, firewall: 3, breaker: 3, decrypt: 3, monbypass: 3, logdel: 3, tracker: 3 }, hw: { cpu: 5, modem: 5, memory: 4 } });
await sleep(1300);
const inner = WORLD.nodes.find((n) => n.inner && WORLD.nodes.find((p) => p.id === n.inner)!.kind === "corp")!;
const parent = WORLD.nodes.find((n) => n.id === inner.inner)!;
const admin = PEOPLE.find((p) => p.id === parent.adminId)!;
const personal = `${admin.name.split(" ")[0]!.toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "")}${String(admin.born).slice(2)}`;
const relays = state!.nodes.filter((n) => n.kind === "relay").slice(0, 4).map((n) => n.id);

check("la rete interna non risponde da fuori", !(await act("connect", { chain: relays, targetIp: inner.ip })).ok);
await act("connect", { chain: relays, targetIp: parent.ip });
await sleep(300);
await act("run", { tool: "monbypass" });
if (!state!.op!.bypass.proxy) await act("run", { tool: "proxy" });
await idle();
await sleep(300);
check("le stanze ci sono, e sono chiuse", state!.op!.zones.length >= 4 && state!.op!.zones.every((z) => !z.open) && state!.op!.clearance === 0);
check("la posta è chiusa a chi non ha credenziali", !(await zone("posta", "leggi")).ok);
check("nome e anno di nascita: dentro da impiegato", (await act("login", { password: personal })).ok);
await sleep(400);
check("livello impiegato", state!.op!.clearance === 1 && state!.op!.access === "none");
const box = (await zone("posta", "leggi")).data as { mail: MailMsg[] };
check("posta interna leggibile", box.mail.length >= 4);
const opPw = box.mail.map((m) => m.body.match(/utenza operatore è (\S+)\./)?.[1]).find(Boolean);
check("nella posta c'è la password dell'operatore", Boolean(opPw));
const lead = box.mail.find((m) => m.act?.kind === "lead" && !m.act.done);
const known = state!.me.knownNodes;
if (lead) {
  await zone("posta", "lead", lead.id);
  await sleep(1200);
  check("un indirizzo trovato nella posta finisce sulla mappa", state!.me.knownNodes === known + 1);
}
check("le telecamere chiedono l'operatore", !(await zone("telecamere", "guarda")).ok);
check("password dell'operatore", (await act("login", { password: opPw })).ok);
await sleep(400);
check("livello operatore", state!.op!.clearance === 2);
check("telecamere: guarda", (await zone("telecamere", "guarda")).ok);
const cr = state!.me.credits;
check("contabilità: fattura stornata", (await zone("contabilita", "fattura")).ok);
check("…una volta sola", !(await zone("contabilita", "fattura")).ok);
check("contabilità: libro mastro", (await zone("contabilita", "mastro")).ok);
check("badge stampato", (await zone("personale", "badge")).ok);
check("la rete interna chiede l'admin", !(await zone("rete", "mappa")).ok);
await sleep(1200);
check("crediti e file arrivati", state!.me.credits > cr && state!.me.storage.some((s) => s.name.startsWith("libro_mastro")));
if (!state!.op!.bypass.firewall) (await act("run", { tool: "firewall" }), await idle());
await act("run", { tool: "breaker" });
await idle();
await sleep(400);
check("admin: tutte le stanze aperte", state!.op!.clearance === 3 && state!.op!.zones.every((z) => z.open));
check("rete interna mappata", (await zone("rete", "mappa")).ok);
await act("disconnect");
await sleep(400);
check("ora la macchina interna risponde", (await act("connect", { chain: relays, targetIp: inner.ip })).ok);
await act("disconnect");
await sleep(400);
await act("connect", { chain: relays, targetIp: parent.ip });
await sleep(1200);
check("col badge si rientra da operatore", state!.op!.clearance === 2);
check("traguardi e contatori", (state!.me.counters["z:posta"] ?? 0) === 1 && (state!.me.counters.staff ?? 0) === 2 && state!.me.feats.includes("z:pivot#0"));
await act("disconnect");

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
