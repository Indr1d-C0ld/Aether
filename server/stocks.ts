// La Borsa (tipi in shared/stocks.ts). Il prezzo di un titolo insegue un valore calcolato dallo stato
// dell'organizzazione, con un po' di rumore. Chi sa cosa sta per succedere a un'azienda, perché sta per farlo lui,
// può guadagnarci: è il punto.
import type { Game, AgentDoc, NodeDoc } from "./game.ts";
import { fmtCr } from "../shared/rules.ts";
import { hoursOf, opensIn, staffed } from "../shared/clock.ts";
import { STOCK_FEE, STOCK_MARGIN, STOCK_MAX_LONG, STOCK_MAX_SHORT, type StockRow, type StocksView } from "../shared/stocks.ts";

type R = { ok: boolean; error?: string; note?: string; data?: unknown };
type Tick = { price: number; hist: number[]; n: number };
type State = { ticks: Record<string, Tick> };
type Pos = { n: number; avg: number; at: number };
type Orgs = { org: (n: NodeDoc) => { cash: number; rep: number; fear: number; morale: number; strikeUntil: number; crisisSince: number }; statusOf: (n: NodeDoc) => string };
const now = () => Date.now();
const hash = (s: string) => [...s].reduce((q, c) => (Math.imul(q, 33) ^ c.charCodeAt(0)) >>> 0, 5381);

export function installStocks(game: Game, orgs: Orgs) {
  const state: State = game.store.get<State>("stocks", "state") ?? { ticks: {} };
  let dirty = false;
  // quotate: le trenta organizzazioni più grosse fra aziende, banche, telefoni, reti, laboratori e giornali
  const listed = [...game.nodes.values()]
    .filter((n) => !n.hidden && !n.inner && ["corp", "bank", "telco", "util", "lab", "news"].includes(n.kind) && game.tierOf(n) >= 2)
    .sort((a, b) => game.tierOf(b) - game.tierOf(a) || (hash(a.id) % 997) - (hash(b.id) % 997))
    .slice(0, 30);
  const used = new Set<string>();
  const tickers = new Map<string, string>();
  for (const n of listed) {
    const letters = n.org.toUpperCase().normalize("NFD").replace(/[^A-Z ]/g, "").split(" ").filter(Boolean);
    let t = (letters.length >= 3 ? letters.map((w) => w[0]).join("") : (letters[0] ?? "XXX")).slice(0, 4).padEnd(3, "X");
    for (let i = 2; used.has(t); i += 1) t = `${t.slice(0, 3)}${i}`;
    used.add(t);
    tickers.set(n.id, t);
  }
  const base = (n: NodeDoc) => 20 + game.tierOf(n) * 16 + (hash(n.id) % 24);
  const start = (n: NodeDoc) => (game.tierOf(n) + 1) * 4000 + (hash(n.id) % 3000);
  /** Quanto dovrebbe valere, guardando come sta. */
  function fair(n: NodeDoc) {
    const o = orgs.org(n);
    const cash = Math.max(-1, Math.min(2, o.cash / start(n)));
    return base(n) * (0.55 + o.rep / 110) * (1 + cash * 0.15) * (1 - o.fear / 350) * (0.9 + o.morale / 1000) * (o.strikeUntil > now() ? 0.92 : 1) * (o.crisisSince ? 0.75 : 1) * (orgs.statusOf(n) === "in guerra" ? 0.94 : 1);
  }
  const tick = (n: NodeDoc): Tick => (state.ticks[n.id] ??= { price: Math.round(fair(n) * 100) / 100, hist: [], n: 0 });
  const open = (n: NodeDoc) => (game.clockForce ? game.clockForce === "giorno" : staffed(n.kind, n.x, now()) || hoursOf(n.kind) === "sempre");
  const book = (a: AgentDoc) => ((a as unknown as { stocks?: Record<string, Pos> }).stocks ??= {});

  function pulse() {
    for (const n of listed) {
      const t = tick(n);
      // a mercato chiuso il prezzo non si muove: le notizie della notte si scontano tutte all'apertura
      if (!open(n)) continue;
      const f = fair(n);
      t.price = Math.max(1, Math.round((t.price + (f - t.price) * 0.12 + t.price * (Math.random() - 0.5) * 0.02) * 100) / 100);
      t.n += 1;
      if (t.n % 8 === 0 || !t.hist.length) {
        t.hist.push(t.price);
        if (t.hist.length > 48) t.hist.shift();
      }
    }
    dirty = true;
  }
  game.onPulse.push(pulse);

  function row(a: AgentDoc, n: NodeDoc): StockRow {
    const t = tick(n);
    const p = book(a)[n.id];
    const first = t.hist[0] ?? t.price;
    return { id: n.id, ticker: tickers.get(n.id)!, name: n.org, kind: n.kind, price: t.price, change: first ? Math.round(((t.price - first) / first) * 1000) / 10 : 0, history: [...t.hist, t.price], open: open(n), opensIn: game.clockForce ? 8 : opensIn(n.kind, n.x, now()), have: p?.n ?? 0, avg: p?.avg ?? 0, status: orgs.statusOf(n) };
  }
  function view(a: AgentDoc): StocksView {
    const rows = listed.map((n) => row(a, n));
    const value = rows.reduce((s, r) => s + r.have * r.price, 0);
    const pnl = rows.reduce((s, r) => s + r.have * (r.price - r.avg), 0);
    return { rows, value: Math.round(value), pnl: Math.round(pnl), fee: STOCK_FEE, maxLong: STOCK_MAX_LONG, maxShort: STOCK_MAX_SHORT };
  }
  /** Chiude (in tutto o in parte) una posizione e accredita il risultato. */
  function settle(a: AgentDoc, n: NodeDoc, p: Pos, qty: number, price: number) {
    const sign = Math.sign(p.n);
    const gain = (price - p.avg) * qty * sign;
    // per i titoli comprati torna anche il capitale; per quelli venduti allo scoperto solo la differenza
    const back = sign > 0 ? price * qty : gain;
    const fee = Math.round(price * qty * STOCK_FEE);
    a.credits += Math.round(back) - fee;
    p.n -= sign * qty;
    if (gain > 0) game.bump(a, "stock:profit", Math.round(gain));
    // insider: hai guadagnato su un titolo a cui hai fatto qualcosa tu, da poco
    const mine = (a.deeds ?? []).some((d) => d.node === n.id && now() - d.at < 2 * 3600_000 && /admin|sys:|mw:|t:copy|t:patch|preside/.test(d.d));
    if (gain > 0 && mine) game.bump(a, "stock:insider");
    return { gain: Math.round(gain), fee };
  }
  function act(a: AgentDoc, q: Record<string, unknown>): R {
    const cmd = String(q.cmd ?? "list");
    if (cmd === "list") return { ok: true, data: view(a) };
    if (cmd === "dev" && process.env.AETHER_DEV === "1") {
      const n = listed.find((x) => x.id === q.id) ?? listed[0]!;
      if (typeof q.price === "number") tick(n).price = q.price;
      for (let i = 0; i < Number(q.pulses ?? 0); i += 1) pulse();
      return { ok: true, data: { row: row(a, n), fair: fair(n) } };
    }
    const n = listed.find((x) => x.id === q.id);
    if (!n) return { ok: false, error: "titolo non quotato" };
    if (!open(n)) return { ok: false, error: `mercato chiuso: ${n.org} riapre le contrattazioni fra ${Math.max(1, Math.round(opensIn(n.kind, n.x, now())))} h` };
    const qty = Math.floor(Number(q.n));
    if (!Number.isFinite(qty) || qty <= 0 || qty > STOCK_MAX_LONG) return { ok: false, error: "quantità non valida" };
    const t = tick(n);
    const b = book(a);
    const p = (b[n.id] ??= { n: 0, avg: 0, at: now() });
    const done = (note: string): R => {
      if (!p.n) delete b[n.id];
      game.bump(a, "stock:trade");
      game.touch("agent", a.id);
      game.dirty.add(a.id);
      return { ok: true, note, data: view(a) };
    };
    const tk = tickers.get(n.id)!;
    if (cmd === "buy") {
      // prima si ricopre lo scoperto, poi si compra
      if (p.n < 0) {
        const k = Math.min(qty, -p.n);
        const s = settle(a, n, p, k, t.price);
        return done(`ricoperti ${k} ${tk}: ${s.gain >= 0 ? "+" : "−"}${fmtCr(Math.abs(s.gain))} (commissione ${fmtCr(s.fee)})`);
      }
      if (p.n + qty > STOCK_MAX_LONG) return { ok: false, error: `al massimo ${STOCK_MAX_LONG} titoli per società` };
      const cost = Math.round(t.price * qty * (1 + STOCK_FEE));
      if (a.credits < cost) return { ok: false, error: `servono ${fmtCr(cost)}` };
      a.credits -= cost;
      p.avg = (p.avg * p.n + t.price * qty) / (p.n + qty);
      p.n += qty;
      p.at = now();
      return done(`comprati ${qty} ${tk} a ${t.price.toFixed(2)}`);
    }
    if (cmd === "sell") {
      if (p.n > 0) {
        const k = Math.min(qty, p.n);
        const s = settle(a, n, p, k, t.price);
        return done(`venduti ${k} ${tk} a ${t.price.toFixed(2)}: ${s.gain >= 0 ? "+" : "−"}${fmtCr(Math.abs(s.gain))} (commissione ${fmtCr(s.fee)})`);
      }
      if (-p.n + qty > STOCK_MAX_SHORT) return { ok: false, error: `allo scoperto al massimo ${STOCK_MAX_SHORT} titoli per società` };
      const margin = Math.round(t.price * qty * STOCK_MARGIN);
      if (a.credits < margin) return { ok: false, error: `per vendere allo scoperto servono ${fmtCr(margin)} di margine in conto` };
      p.avg = (p.avg * -p.n + t.price * qty) / (-p.n + qty);
      p.n -= qty;
      p.at = now();
      return done(`venduti allo scoperto ${qty} ${tk} a ${t.price.toFixed(2)}: guadagni se scende`);
    }
    return { ok: false, error: "ordine sconosciuto" };
  }
  const prev = game.socialAct;
  game.socialAct = (agent, a, q) => (a === "stock" ? act(agent, q) : (prev?.(agent, a, q) ?? null));
  return {
    save() {
      if (!dirty) return;
      dirty = false;
      game.store.put("stocks", "state", state);
    },
  };
}
