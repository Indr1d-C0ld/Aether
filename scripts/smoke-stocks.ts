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

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
