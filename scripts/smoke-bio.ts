// Barriere biometriche: la password non basta, i campioni si rubano dai sottosistemi, l'oscilloscopio
// li presenta al lettore; modelli impiantati dai rossi, ri-registrazione dei blu.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";
import { SCOPE_KNOBS, scopeMatch, scopeWave, type ScopeParams } from "../shared/bio.ts";
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
  ws.on("open", () => ws.send(JSON.stringify({ t: "auth", mode: "register", handle: `bio_${Math.random().toString(36).slice(2, 6)}`, pass: "segreto123", faction: "red" })));
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
const relays = state!.nodes.filter((n) => n.kind === "relay").slice(0, 4).map((n) => n.id);
const node = (id: string) => WORLD.nodes.find((n) => n.id === id)!;
const personalOf = (id: string) => {
  const p = PEOPLE.find((x) => x.id === node(id).adminId)!;
  return `${p.name.split(" ")[0]!.toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "")}${String(p.born).slice(2)}`;
};
const enter = async (id: string) => {
  if (state!.op) await act("disconnect");
  await act("devGrant", { cool: true });
  const c = await act("connect", { chain: relays, targetIp: node(id).ip });
  if (!c.ok) console.log("  connect:", c.error);
  await sleep(300);
  await act("run", { tool: "monbypass" });
  if (!state!.op!.bypass.proxy) await act("run", { tool: "proxy" });
  await idle();
  await sleep(300);
};
const bio = () => state!.op!.bio!;
/** Tutte le regolazioni possibili, dalla più simile alla traccia registrata. */
const ranked = () => {
  const all: ScopeParams[] = [];
  const rec = (i: number, p: Partial<ScopeParams>) => {
    if (i === SCOPE_KNOBS.length) return void all.push(p as ScopeParams);
    const k = SCOPE_KNOBS[i]!;
    for (let v = k.min; v <= k.max; v += 1) rec(i + 1, { ...p, [k.key]: v });
  };
  rec(0, {});
  const t = bio().scope!.target;
  return all.map((p) => ({ p, m: scopeMatch(t, scopeWave(p)) })).sort((a, b) => b.m - a.m);
};

// 1. impronta vocale: la password di root non basta
const A = "g-bank-3";
await enter(A);
check("il nodo ha un'impronta vocale", bio()?.kind === "voce" && !bio().passed && !bio().have);
const root = await act("login", { password: node(A).password });
check("la password di root da sola non basta", !root.ok && /non basta/.test(root.error ?? ""));
check("nemmeno il Password Breaker parte", !(await act("run", { tool: "breaker" })).ok);
check("senza campione l'oscilloscopio non si apre", !(await act("scope", { act: "open" })).ok);
check("dentro da impiegato", (await act("login", { password: personalOf(A) })).ok);
await sleep(300);
check("dal centralino si registra la voce", (await zone("centralino", "voce")).ok);
await sleep(1200);
check("campione in tasca", state!.me.samples.length === 1 && state!.me.samples[0]!.kind === "voce" && bio().have);
check("oscilloscopio aperto", (await act("scope", { act: "open" })).ok);
await sleep(300);
check("tre letture, traccia registrata a schermo", bio().scope!.tries === 3 && bio().scope!.target.length > 50);
check("regolazione fuori scala rifiutata", !(await act("scope", { act: "try", params: { freq: 99, amp: 1, phase: 0, harm: 0 } })).ok);
await act("scope", { act: "try", params: ranked()[0]!.p });
await sleep(400);
check("traccia sovrapposta: barriera aperta", bio().passed && (state!.me.counters.bio ?? 0) === 1 && (state!.me.counters["mg:scope"] ?? 0) === 1);
check("ora la password di root funziona", (await act("login", { password: node(A).password })).ok && state!.op === state!.op);
await sleep(400);
check("accesso admin", state!.op!.access === "admin");
check("modelli impiantati nel lettore", (await zone("personale", "modelli")).ok);
await enter(A);
check("al rientro la barriera riconosce i tuoi modelli", bio().passed);

// 2. tre letture sbagliate: lettore bloccato, trace in avanti
const B = "g-bank-6";
await enter(B);
await act("login", { password: personalOf(B) });
await sleep(300);
await zone("centralino", "voce");
await sleep(1200);
await act("scope", { act: "open" });
await sleep(300);
const before = state!.op!.trace.progressMs ?? 0;
const worst = ranked().reverse();
for (let i = 0; i < 3; i += 1) await act("scope", { act: "try", params: worst[i]!.p });
await sleep(400);
check("tre letture respinte: lettore bloccato", bio().locked && bio().scope!.state === "lost" && !bio().passed);
check("il trace è avanzato", (state!.op!.trace.progressMs ?? 0) > before);
check("bloccato: non si riapre", !(await act("scope", { act: "open" })).ok);

// 2b. il gadget giusto fabbrica il campione davanti alla barriera
await enter("g-bank-9");
await act("devGrant", { gadget: "microcassette" });
await act("devGrant", { gadget: "gummy" });
await sleep(1200);
const gad = (code: string) => state!.me.storage.find((x) => x.item?.code === code)!;
check("il dito di gelatina non serve davanti a un'impronta vocale", !(await act("useItem", { key: gad("gummy").key })).ok);
check("il registratore sì", (await act("useItem", { key: gad("microcassette").key })).ok);
await sleep(1200);
check("campione fabbricato sul posto", bio().have);

// 3. retina: lo scanner dice di chi, la cartella clinica sta in ospedale
const C = "g-bank-7";
await enter(C);
check("scanner della retina, campione mancante", bio()?.kind === "retina" && !bio().have);
const med = WORLD.nodes.find((n) => n.kind === "med" && !n.inner)!;
await enter(med.id);
await act("login", { password: med.password });
await sleep(300);
check("in clinica ci sono le cartelle", state!.op!.zones.some((z) => z.id === "cartelle"));
check("retina copiata dalla cartella clinica", (await zone("cartelle", "retina")).ok);
await enter(C);
check("tornati allo scanner: il campione c'è", bio().have);

// 4. un blu ri-registra il personale: modelli e campioni rubati non valgono più
const blue = new WebSocket(`ws://127.0.0.1:${port}/ws`);
let bseq = 0;
const bpend = new Map<number, (m: Res) => void>();
await new Promise<void>((r) => {
  blue.on("open", () => blue.send(JSON.stringify({ t: "auth", mode: "register", handle: `biob_${Math.random().toString(36).slice(2, 6)}`, pass: "segreto123", faction: "blue" })));
  blue.on("message", (raw) => {
    const m = JSON.parse(String(raw)) as ServerMsg;
    if (m.t === "res") bpend.get(m.id)?.(m);
    if (m.t === "auth_ok") r();
  });
});
const bact = (a: string, p: Record<string, unknown> = {}) =>
  new Promise<Res>((r) => {
    const id = ++bseq;
    bpend.set(id, r);
    blue.send(JSON.stringify({ t: "do", id, a, p }));
  });
await bact("devGrant", { xp: 6000, tools: { proxy: 3, monbypass: 3, breaker: 3 }, hw: { cpu: 5, modem: 5, memory: 4 }, bio: true });
await sleep(500);
const bc = await bact("connect", { chain: relays, targetIp: node(A).ip });
const bm = await bact("run", { tool: "monbypass" });
const bp = await bact("run", { tool: "proxy" });
await sleep(5000);
// dopo l'intrusione del rosso la banca ha cambiato la password di root: il blu la forza
const bl = await bact("run", { tool: "breaker" });
if (!bl.ok) console.log("  blu:", bc.error, bm.error, bp.error, bl.error);
await sleep(12000);
check("il blu entra da admin", bl.ok);
check("personale ri-registrato", (await bact("zone", { zone: "personale", act: "riregistra" })).ok);
await bact("disconnect");
await enter(A);
check("modelli e vecchio campione non valgono più", !bio().passed && !bio().have);
await act("disconnect");

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
