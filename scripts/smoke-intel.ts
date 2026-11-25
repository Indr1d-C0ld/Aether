// Informazioni come merce: quello che si impara giocando, il Mediatore, la bancarella fra giocatori, gli abitanti
// che comprano e usano, le copie che tolgono valore, le password che bruciano, l'azienda avvisata, la Guardia.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";
import type { IntelView } from "../shared/intel.ts";
import type { WorldView } from "../shared/orgs.ts";
import type { CitizenRow } from "../shared/citizens.ts";
import { WORLD } from "../server/worldgen.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = Extract<ServerMsg, { t: "res" }>;
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
  const intel = (cmd: string, p: Record<string, unknown> = {}) => act("intel", { cmd, ...p });
  return { state: () => state!, act, intel, view: async () => (await intel("view")).data as IntelView };
}
const tag = Math.random().toString(36).slice(2, 6);
const fails: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};

const red = await bot("spia", "red");
const buyer = await bot("cliente", "red");
const blue = await bot("agente", "blue");
await sleep(500);
await red.intel("dev", { risk: 0 });

// ---- un accesso admin vero insegna la password di root
const corp = WORLD.nodes.find((n) => n.kind === "corp" && n.gen && !n.inner && n.proxy + n.firewall + n.monitor <= 5)!;
await red.act("devGrant", { xp: 3000, credits: 5000, tools: { proxy: 3, firewall: 3, breaker: 3, monbypass: 3 }, hw: { cpu: 5, modem: 4, memory: 4 } });
await red.act("connect", { chain: ["r-sable", "r-kiln", "r-lantern", corp.id] });
await sleep(300);
if (red.state().op!.target.sec.monitor > 0) await red.act("run", { tool: "monbypass" });
if (!red.state().op!.bypass.proxy) await red.act("run", { tool: "proxy" });
if (!red.state().op!.bypass.firewall) await red.act("run", { tool: "firewall" });
for (let i = 0; i < 100 && red.state().op!.tasks.some((k) => k.state === "run"); i += 1) await sleep(250);
await red.act("run", { tool: "breaker" });
await sleep(600);
for (let i = 0; i < 100 && red.state().op!.tasks.some((k) => k.state === "run"); i += 1) await sleep(250);
await sleep(400);
const admin = red.state().op?.access === "admin";
await red.act("disconnect");
await sleep(400);
let v = await red.view();
let cred = v.pieces.find((p) => p.key === `cred:${corp.id}`);
check("da admin, la password di root diventa una cosa che sai e che vale", admin && Boolean(cred) && cred!.fresh && /root: \S+/.test(cred!.detail) && cred!.fair > 0 && cred!.quote > 0);
const fair0 = cred!.fair;

// ---- il Mediatore
const cr0 = red.state().me.credits;
const br = await red.intel("broker", { key: cred!.key });
await sleep(800);
check("il Mediatore paga subito", br.ok && red.state().me.credits === cr0 + cred!.quote);
check("ma la stessa cosa una volta sola", !(await red.intel("broker", { key: cred!.key })).ok);
v = (br.data as IntelView) ?? (await red.view());
cred = v.pieces.find((p) => p.key === `cred:${corp.id}`)!;
check("ogni copia in giro toglie valore", cred.fair < fair0 && /già venduta/.test(cred.quoteWhy ?? ""));

// ---- la bancarella
check("prezzi fuori misura no", !(await red.intel("list", { key: cred.key, price: 5 })).ok);
check("in bancarella", (await red.intel("list", { key: cred.key, price: 800 })).ok);
let board = (await buyer.view()).board;
const ad = board.find((l) => l.title === cred!.title && !l.npc);
check("gli altri vedono il titolo, non il contenuto", Boolean(ad) && ad!.seller === `spia_${tag}` && ad!.price === 800 && !ad!.owned && !JSON.stringify(board).includes(cred.detail));
await buyer.act("devGrant", { credits: 5000 });
await sleep(300);
const b0 = buyer.state().me.credits;
const s0 = red.state().me.credits;
const mail0 = buyer.state().mail.length;
check("comprata", (await buyer.intel("buy", { id: ad!.id })).ok);
await sleep(1200);
check("si paga, e il venditore incassa meno la commissione", buyer.state().me.credits === b0 - 800 && red.state().me.credits === s0 + 720);
check("la password arriva per posta", buyer.state().mail.length === mail0 + 1 && buyer.state().mail[0]!.body.includes(cred.detail.split("root: ")[1]!));
check("non si ricompra quello che si sa già", !(await buyer.intel("buy", { id: ad!.id })).ok);
const bp = (await buyer.view()).pieces.find((p) => p.key === cred!.key);
check("chi l'ha comprata la può rivendere, ma non al Mediatore", Boolean(bp) && bp!.bought && bp!.quote === 0 && /seconda mano/.test(bp!.quoteWhy ?? ""));

// ---- avvisare l'azienda brucia la password per tutti
const dc = await buyer.intel("disclose", { key: cred.key });
await sleep(800);
check("l'azienda paga la segnalazione", dc.ok && (buyer.state().me.counters["intel:disclose"] ?? 0) === 1);
v = await red.view();
cred = v.pieces.find((p) => p.key === `cred:${corp.id}`)!;
check("e la password non vale più niente, per nessuno: anche l'annuncio sparisce", !cred.fresh && cred.fair === 0 && !v.board.some((l) => l.id === ad!.id));
const news = ((await red.act("world")).data as WorldView).news;
check("in Cronaca", news.some((n) => /segnalazione anonima/.test(n.text)));

// ---- una password bruciata da un'intrusione con danni
const shop = WORLD.nodes.find((n) => n.kind === "shop" && n.gen && !n.inner)!;
await red.intel("dev", { cred: shop.id });
v = await red.view();
check("un'altra password, fresca", v.pieces.some((p) => p.key === `cred:${shop.id}` && p.fresh));
await red.intel("list", { key: `cred:${shop.id}`, price: 400 });
await red.intel("dev", { rotate: shop.id });
v = await red.view();
check("cambiata dall'azienda: bruciata, annuncio ritirato", v.pieces.some((p) => p.key === `cred:${shop.id}` && !p.fresh) && !v.board.some((l) => l.title.includes(shop.org) && l.mine));

// ---- gli abitanti comprano, e usano
const bank = WORLD.nodes.find((n) => n.kind === "corp" && n.gen && !n.inner && n.id !== corp.id && n.id !== shop.id)!;
await red.intel("dev", { cred: bank.id, reset: true });
await red.intel("list", { key: `cred:${bank.id}`, price: 300 });
const s1 = red.state().me.credits;
await red.intel("dev", { npcBuy: true });
await sleep(1200);
v = await red.view();
check("un abitante compra dalla bancarella", red.state().me.credits === s1 + 270 && v.log.some((x) => /ha comprato/.test(x.text)));
check("e la password la usa davvero: lo scrive al venditore, e c'è in Cronaca", /Grazie per/.test(red.state().mail[0]?.subject ?? "") && ((await red.act("world")).data as WorldView).news.some((n) => n.text.includes(bank.org)));

// ---- gli abitanti vendono
await red.intel("dev", { npcList: true });
board = (await buyer.view()).board;
const npcAds = board.filter((l) => l.npc);
check("anche gli abitanti mettono in bancarella", npcAds.length >= 1);
const dial = npcAds.find((l) => l.kind === "dial");
const dossier = npcAds.find((l) => l.kind === "dossier");
if (dial) {
  const h0 = buyer.state().me.hiddenFound;
  await buyer.intel("buy", { id: dial.id });
  await sleep(1000);
  check("un numero nascosto comprato finisce sulla mappa", buyer.state().me.hiddenFound === h0 + 1);
}
if (dossier) {
  await buyer.intel("buy", { id: dossier.id });
  const rows = ((await buyer.act("cit", { cmd: "list" })).data as { rows: CitizenRow[] }).rows;
  check("un fascicolo comprato è completo, nella voce Persone", rows.some((r) => r.known));
}

// ---- mappe di rete interna
const inner = WORLD.nodes.find((n) => n.inner)!;
await buyer.act("connect", { chain: ["r-sable", "r-kiln", inner.id] });
await sleep(300);
check("senza mappa la macchina interna non risponde", !buyer.state().op);
await red.intel("dev", { inner: inner.id });
await red.intel("list", { key: `inner:${inner.id}`, price: 600 });
const mad = (await buyer.view()).board.find((l) => l.kind === "inner" && !l.npc)!;
check("la mappa si compra", (await buyer.intel("buy", { id: mad.id })).ok);
await buyer.act("connect", { chain: ["r-sable", "r-kiln", inner.id] });
await sleep(500);
check("e con la mappa ci si arriva dritti", buyer.state().op?.target.id === inner.id);
await buyer.act("disconnect");
check("una mappa comprata non si rivende", !(await buyer.intel("list", { key: `inner:${inner.id}`, price: 600 })).ok);

// ---- la Guardia
await red.intel("dev", { learnAddr: `cliente_${tag}` });
v = await red.view();
let addr = v.pieces.find((p) => p.kind === "addr" && p.title === `cliente_${tag}`);
check("un indirizzo in rubrica è una cosa che sai", Boolean(addr) && addr!.fresh && addr!.detail === buyer.state().me.gatewayIp);
check("chi non è ricercato la Guardia non lo paga", !addr!.snitch && !(await red.intel("snitch", { key: addr!.key })).ok);
await buyer.intel("dev", { heat: 60 });
addr = (await red.view()).pieces.find((p) => p.key === addr!.key)!;
const e0 = red.state().me.ethics;
const tm0 = buyer.state().mail.length;
const sn = await red.intel("snitch", { key: addr.key });
await sleep(1200);
check("con il calore addosso sì: la Guardia paga", sn.ok && addr.snitch > 0 && red.state().me.ethics < e0);
check("tutti i blu sanno dove trovarlo", blue.state().me.known.some((k) => k.ip === buyer.state().me.gatewayIp));
check("e a lui arriva un avvertimento", buyer.state().mail.length > tm0 && /venduto/.test(buyer.state().mail[0]!.subject));
check("una volta al giorno", !(await red.intel("snitch", { key: addr.key })).ok);

// ---- traguardi
check("traguardi: vendite e acquisti contati", (red.state().me.counters["intel:sold"] ?? 0) >= 3 && (buyer.state().me.counters["intel:bought"] ?? 0) >= 2 && (red.state().me.counters["intel:snitch"] ?? 0) === 1);

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
