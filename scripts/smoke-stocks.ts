// La Borsa: quotazioni che seguono lo stato delle organizzazioni, acquisti, vendite, scoperto, orari.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";
import type { StockRow, StocksView } from "../shared/stocks.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = Extract<ServerMsg, { t: "res" }>;
let state: GameState | null = null;
let seq = 0;
const pending = new Map<number, (m: Res) => void>();
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
await new Promise<void>((r) => {
  ws.on("open", () => ws.send(JSON.stringify({ t: "auth", mode: "register", handle: `stk_${Math.random().toString(36).slice(2, 6)}`, pass: "segreto123", faction: "red" })));
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
const view = async () => (await act("stock")).data as StocksView;
const dev = async (p: Record<string, unknown>) => (await act("stock", { cmd: "dev", ...p })).data as { row: StockRow; fair: number };

await sleep(400);
await act("devGrant", { credits: 50000, clock: "giorno" });
await sleep(1200);
let v = await view();
check("una trentina di titoli quotati, ognuno con la sua sigla", v.rows.length >= 20 && new Set(v.rows.map((r) => r.ticker)).size === v.rows.length && v.rows.every((r) => r.price > 0 && r.open));
const s = v.rows[0]!;
const c0 = state!.me.credits;
const buy = await act("stock", { cmd: "buy", id: s.id, n: 100 });
await sleep(1200);
check("comprare: escono i crediti, commissione compresa", buy.ok && state!.me.credits === c0 - Math.round(s.price * 100 * 1.01));
v = buy.data as StocksView;
check("la posizione è in portafoglio", v.rows.find((r) => r.id === s.id)!.have === 100 && Math.abs(v.rows.find((r) => r.id === s.id)!.avg - s.price) < 0.01);
check("non oltre il tetto per società", !(await act("stock", { cmd: "buy", id: s.id, n: 450 })).ok);
await dev({ id: s.id, price: s.price * 1.2 });
const c1 = state!.me.credits;
const sell = await act("stock", { cmd: "sell", id: s.id, n: 100 });
await sleep(1200);
check("vendere in guadagno", sell.ok && state!.me.credits > c1 + s.price * 100 && (state!.me.counters["stock:profit"] ?? 0) > 0);

// allo scoperto: si guadagna se scende
const t = v.rows[1]!;
const sh = await act("stock", { cmd: "sell", id: t.id, n: 50 });
check("vendita allo scoperto", sh.ok && (sh.data as StocksView).rows.find((r) => r.id === t.id)!.have === -50);
await dev({ id: t.id, price: t.price * 0.8 });
const c2 = state!.me.credits;
const cover = await act("stock", { cmd: "buy", id: t.id, n: 50 });
await sleep(1200);
check("ricoperta più in basso: la differenza è tua", cover.ok && state!.me.credits > c2 && (cover.data as StocksView).rows.find((r) => r.id === t.id)!.have === 0);

// il prezzo segue quello che succede davvero all'organizzazione
const u = v.rows[2]!;
const before = (await dev({ id: u.id, pulses: 20 })).row.price;
await act("world", { cmd: "dev", id: u.id, event: "sabotaggio", times: 4 });
const after = (await dev({ id: u.id, pulses: 30 })).row.price;
check("quattro sabotaggi e il titolo scende", after < before * 0.9);

// di notte il mercato è chiuso
await act("devGrant", { clock: "notte" });
const closed = await act("stock", { cmd: "buy", id: s.id, n: 1 });
check("a mercato chiuso non si tratta", !closed.ok && /mercato chiuso/.test(closed.error ?? ""));
await act("devGrant", { clock: "giorno" });

// ---- la società di copertura
type FV = { has: boolean; till: number; cap: number; level: number; open: boolean; frozenUntil: number; alibiReady: boolean };
const front = async (cmd: string, p: Record<string, unknown> = {}) => act("front", { cmd, ...p });
await sleep(1200);
check("un'attività dell'altra cellula non si può aprire", !(await front("found", { kind: "agency", name: "Prova" })).ok);
const fd = await front("found", { kind: "arcade", name: "Sala Giochi Zenit" });
check("copertura aperta", fd.ok && (fd.data as FV).has && (fd.data as FV).open);
let fv = (await front("dev", { pulses: 20 })).data as FV;
check("in orario d'ufficio la cassa si riempie", fv.till === 100);
fv = (await front("dev", { pulses: 2000 })).data as FV;
check("ma non oltre il tetto: bisogna passare a ritirare", fv.till === fv.cap);
const c9 = state!.me.credits;
check("incasso", (await front("collect")).ok);
await sleep(1200);
check("crediti puliti in tasca", state!.me.credits === c9 + fv.cap);
await act("devGrant", { clock: "notte" });
fv = (await front("dev", { pulses: 20 })).data as FV;
check("di notte è chiusa e non incassa", fv.till === 0 && !fv.open);
await act("devGrant", { clock: "giorno", charge: 0 });
await front("dev", { set: { till: 500 } });
await act("devGrant", { xp: 0 });
const hot = await act("life", { cmd: "favor", handle: "Ohm", value: 0 });
void hot;
fv = (await front("dev", { pulses: 1 })).data as FV;
check("la fattura di comodo vuole qualcosa da giustificare", state!.me.heat > 0 ? (await front("alibi")).ok : !(await front("alibi")).ok);

// ---- il ricettatore: prezzi legati all'offerta
type FM = { cat: string; mult: number; wanted: boolean }[];
await sleep(1200);
const fm = async (p: Record<string, unknown> = {}) => (await act("fenceMarket", p)).data as FM;
let m0 = await fm({ dev: true, reset: true });
check("mercato del ricettatore: una richiesta del giorno, e a riposo la maggior parte delle merci al prezzo normale", m0.filter((x) => x.wanted).length === 1 && m0.filter((x) => !x.wanted && Math.abs(x.mult - 1) < 0.1).length >= 4 && !m0.every((x) => x.mult >= 1.2));
await act("devGrant", { item: "x" });
await sleep(1200);
const it = state!.me.storage.find((x) => x.item)!;
const cat = it.item!.kind;
await fm({ dev: true, cat, supply: 0 });
await act("devGrant", { xp: 1 });
await sleep(1200);
const pScarce = state!.me.storage.find((x) => x.key === it.key)!.fence ?? 0;
await fm({ dev: true, cat, supply: 12 });
await act("devGrant", { xp: 1 });
await sleep(1200);
const pFlood = state!.me.storage.find((x) => x.key === it.key)!.fence ?? 0;
check("se il ricettatore ne ha pieni i cassetti, paga meno della metà", pFlood > 0 && pFlood < pScarce * 0.5);
await fm({ dev: true, cat, supply: 0 });
const mBefore = (await fm()).find((x) => x.cat === cat)!.mult;
const sold = await act("fence", { key: it.key });
const mAfter = (await fm()).find((x) => x.cat === cat)!.mult;
check("ogni vendita satura un po' il mercato", sold.ok && mAfter < mBefore);

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
