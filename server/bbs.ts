// I BBS del Reticolo. Si chiamano uno alla volta e a tempo; i messaggi restano; i livelli si guadagnano
// chiamando, scrivendo e caricando; l'area file tiene il conto fra caricato e scaricato; le porte hanno i giochi.
// Tutto passa dall'azione «bbs» {cmd,…} e torna come dato: nessun messaggio spinto dal server.
import type { Game, AgentDoc } from "./game.ts";
import { BBS, NPC_ONELINERS, NPC_REPLIES, SYSOP_PAGE, type BbsDef } from "./bbs-text.ts";
import { EXPLOITS } from "../shared/depth.ts";
import { rankOf, fmtCr } from "../shared/rules.ts";
import { DEVLOG } from "../shared/devlog.ts";
import { BBS_LEVEL, BBS_LINE_MAX, BBS_MINUTES, BBS_POST_MAX, BBS_TITLE_MAX, type BbsArea, type BbsFiles, type BbsHome, type BbsInfo, type BbsThread, type BbsThreadRow, type BbsUserRow, type GtwState, type TradeState, type TrisState } from "../shared/bbs.ts";

type R = { ok: boolean; error?: string; note?: string; data?: unknown };
type Post = { by: string; at: number; body: string; npc?: boolean };
type Thread = { id: string; area: string; title: string; posts: Post[]; pinned?: boolean };
type User = { days: number; lastDay: number; lastAt: number; posts: number; uploads: number; downloads: number; kb: number; usedDay: number; usedMs: number; seen: number; packDay: number; gate?: boolean };
type Board = { threads: Thread[]; users: Record<string, User>; callers: { handle: string; at: number; from: string }[]; oneliners: { handle: string; text: string }[]; recent: { name: string; by: string; at: number }[]; pending: { thread: string; at: number }[]; seq: number };
type State = { boards: Record<string, Board>; trade: { best: { handle: string; score: number }[]; today: { day: number; rows: { handle: string; score: number }[] } } };
type Session = { bbs: string; at: number; last: number };

const now = () => Date.now();
const DAY = 86400_000;
const today = () => Math.floor(now() / DAY);
const hash = (s: string) => [...s].reduce((q, c) => (Math.imul(q, 33) ^ c.charCodeAt(0)) >>> 0, 5381);
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clean = (s: unknown, max: number) => String(s ?? "").replace(/\r/g, "").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max);

// ---------------------------------------------------------------- Mercante di Chip
const CITIES = ["Milano", "Chiba", "Berlino", "San Francisco", "Lagos", "San Paolo"];
const GOODS: [string, number][] = [["Floppy di warez", 12], ["Schede telefoniche", 40], ["Banchi di RAM", 110], ["Modem 14.4", 260], ["Chip neurali", 700]];
const TRADE_TURNS = 12;
const TRADE_START = 1000;
const TRADE_CAP = 40;
const TRADE_PAY_MAX = 300;
type Trade = { day: number; turn: number; cash: number; city: number; hold: number[]; news: string; over: boolean; payout: number };

// ---------------------------------------------------------------- Tris
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
type Cell = "X" | "O" | "";
const winner = (b: Cell[]) => {
  for (const [a, c, d] of LINES) if (b[a!] && b[a!] === b[c!] && b[a!] === b[d!]) return b[a!] as "X" | "O";
  return b.every(Boolean) ? "draw" : null;
};
function minimax(b: Cell[], turn: "X" | "O"): number {
  const w = winner(b);
  if (w === "O") return 1;
  if (w === "X") return -1;
  if (w === "draw") return 0;
  let best = turn === "O" ? -2 : 2;
  for (let i = 0; i < 9; i += 1) {
    if (b[i]) continue;
    b[i] = turn;
    const v = minimax(b, turn === "O" ? "X" : "O");
    b[i] = "";
    best = turn === "O" ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}
const GTW_TARGETS = ["Las Vegas", "Seattle", "Mosca", "Leningrado", "Londra", "Pechino", "Parigi", "Roma"];

export function installBbs(game: Game) {
  const DEV = process.env.AETHER_DEV === "1";
  const state: State = game.store.get<State>("bbs", "state") ?? { boards: {}, trade: { best: [], today: { day: 0, rows: [] } } };
  state.trade ??= { best: [], today: { day: 0, rows: [] } };
  let dirty = false;
  const sessions = new Map<string, Session>();
  const tris = new Map<string, { board: Cell[]; over: TrisState["over"]; line: string; games: number }>();
  const gtw = new Map<string, GtwState>();
  const trades = new Map<string, Trade>();

  // le bacheche nascono con le discussioni di partenza, datate nei giorni scorsi
  for (const def of BBS) {
    const b = (state.boards[def.id] ??= { threads: [], users: {}, callers: [], oneliners: [], recent: [], pending: [], seq: 0 });
    b.pending ??= [];
    b.recent ??= [];
    let age = 1;
    for (const area of def.areas) {
      for (const s of area.seed) {
        const id = `s-${area.id}-${hash(s.title).toString(36)}`;
        if (b.threads.some((t) => t.id === id)) continue;
        const base = now() - (10 + age * 7) * 3600_000;
        age += 1;
        b.threads.push({ id, area: area.id, title: s.title, pinned: s.pinned, posts: [{ by: s.by, at: base, body: s.body, npc: true }, ...(s.replies ?? []).map(([by, body], i) => ({ by, at: base + (i + 1) * 4200_000, body, npc: true }))] });
        dirty = true;
      }
    }
    if (!b.oneliners.length) b.oneliners = NPC_ONELINERS.slice(0, 4).map(([handle, text]) => ({ handle, text }));
    if (!b.callers.length) b.callers = ["Ohm", "Mantis", "Nyx_77"].map((handle, i) => ({ handle, at: now() - (i + 2) * 5400_000, from: ["Bologna", "Torino", "Napoli"][i]! }));
  }

  const def = (id: string) => BBS.find((b) => b.id === id) ?? null;
  const board = (id: string) => state.boards[id]!;
  const userOf = (bbs: string, a: AgentDoc) => (board(bbs).users[a.id] ??= { days: 0, lastDay: 0, lastAt: 0, posts: 0, uploads: 0, downloads: 0, kb: 0, usedDay: 0, usedMs: 0, seen: 0, packDay: 0 });
  function levelOf(a: AgentDoc, u: User) {
    if (a.staff) return 4;
    if (u.days >= 12 && u.posts >= 15 && u.uploads >= 8) return 3;
    if (u.days >= 5 && u.posts >= 5 && u.uploads >= 2) return 2;
    if (u.days >= 2 && u.posts >= 1) return 1;
    return 0;
  }
  function nextStep(a: AgentDoc, u: User): string | null {
    const lv = levelOf(a, u);
    if (lv >= 3) return null;
    const want = [{ d: 2, p: 1, f: 0 }, { d: 5, p: 5, f: 2 }, { d: 12, p: 15, f: 8 }][lv]!;
    const miss: string[] = [];
    if (u.days < want.d) miss.push(`chiamare in ${want.d} giorni diversi (sei a ${u.days})`);
    if (u.posts < want.p) miss.push(`${want.p} messaggi scritti (sei a ${u.posts})`);
    if (u.uploads < want.f) miss.push(`${want.f} file caricati (sei a ${u.uploads})`);
    return `Per «${BBS_LEVEL[lv + 1]}»: ${miss.join(", ")}.`;
  }
  function lockOf(d: BbsDef, a: AgentDoc): string | null {
    if (a.staff) return null;
    if (d.only && d.only !== a.faction) return d.only === "red" ? "risponde solo alla cellula rossa" : "risponde solo alla cellula blu";
    return null;
  }
  const visible = (d: BbsDef, a: AgentDoc) => a.staff || !d.wardial || (a.counters["a:wardial"] ?? 0) > 0 || Boolean(board(d.id).users[a.id]);
  const info = (d: BbsDef, a: AgentDoc): BbsInfo => {
    const u = board(d.id).users[a.id];
    return { id: d.id, name: d.name, sysop: d.sysop, tagline: d.tagline, number: d.number, speed: d.speed, locked: lockOf(d, a), gate: Boolean(d.gate) && !u?.gate && !a.staff, days: u?.days ?? 0, level: u ? levelOf(a, u) : 0 };
  };

  // ---------------------------------------------------------------- la chiamata e il tempo
  function budgetLeft(a: AgentDoc, u: User, s: Session | null) {
    if (u.usedDay !== today()) (u.usedDay = today()), (u.usedMs = 0);
    const live = s ? Math.min(now() - s.at, 60 * 60_000) : 0;
    return BBS_MINUTES[levelOf(a, u)]! * 60_000 - u.usedMs - live;
  }
  function hangup(a: AgentDoc) {
    const s = sessions.get(a.id);
    if (!s) return;
    const u = userOf(s.bbs, a);
    if (u.usedDay !== today()) (u.usedDay = today()), (u.usedMs = 0);
    u.usedMs += Math.min(s.last - s.at + 15_000, 60 * 60_000);
    sessions.delete(a.id);
    dirty = true;
  }
  /** La sessione in corso su quel BBS, o l'errore da mostrare. */
  function online(a: AgentDoc, bbs: string): { d: BbsDef; u: User } | string {
    const s = sessions.get(a.id);
    const d = def(bbs);
    if (!d || !s || s.bbs !== bbs) return "NO CARRIER: non sei collegato a questo BBS";
    const u = userOf(bbs, a);
    if (budgetLeft(a, u, s) <= 0) {
      hangup(a);
      return "Tempo scaduto per oggi. NO CARRIER";
    }
    s.last = now();
    return { d, u };
  }

  function npcTick(b: Board) {
    const due = b.pending.filter((p) => p.at <= now());
    if (!due.length) return;
    b.pending = b.pending.filter((p) => p.at > now());
    for (const p of due) {
      const t = b.threads.find((x) => x.id === p.thread);
      if (!t) continue;
      const [by, body] = NPC_REPLIES[hash(t.id + t.posts.length) % NPC_REPLIES.length]!;
      t.posts.push({ by, at: p.at, body, npc: true });
    }
    dirty = true;
  }

  function home(d: BbsDef, a: AgentDoc): BbsHome {
    const b = board(d.id);
    const u = userOf(d.id, a);
    npcTick(b);
    const lv = levelOf(a, u);
    const areas: BbsArea[] = d.areas.map((ar) => {
      const ts = b.threads.filter((t) => t.area === ar.id);
      return { id: ar.id, name: ar.name, desc: ar.desc, need: ar.need, open: lv >= ar.need, threads: ts.length, fresh: ts.filter((t) => t.posts.at(-1)!.at > u.seen).length };
    });
    return {
      info: info(d, a),
      banner: d.banner,
      motd: d.motd,
      level: lv,
      next: nextStep(a, u),
      minutesLeft: Math.max(0, Math.ceil(budgetLeft(a, u, sessions.get(a.id) ?? null) / 60_000)),
      stats: { days: u.days, posts: u.posts, uploads: u.uploads, downloads: u.downloads, kb: u.kb },
      callers: b.callers.slice(0, 8),
      oneliners: b.oneliners.slice(0, 8),
      areas,
      doors: d.doors.map((x) => ({ ...x, open: lv >= x.need })),
      hasFiles: d.files,
      bulletins: DEVLOG.slice(0, 3).map((e) => ({ title: `v${e.v} · ${e.title}`, body: e.items.join("\n\n") })),
    };
  }

  // ---------------------------------------------------------------- area file
  /** I pacchetti del giorno: tre exploit, diversi per BBS e per data. */
  function packsOf(d: BbsDef) {
    const r = rng(hash(`${d.id}:${today()}`));
    const pool = EXPLOITS.filter((e) => e.rarity <= 2);
    const out: typeof pool = [];
    while (out.length < 3 && out.length < pool.length) {
      const e = pool[Math.floor(r() * pool.length)]!;
      if (!out.includes(e)) out.push(e);
    }
    return out.map((e, i) => ({ n: i + 1, e, cost: e.rarity >= 2 ? 160 : 80, need: e.rarity >= 2 ? 2 : 1 }));
  }
  const uploadable = (a: AgentDoc) => a.storage.filter((s) => !s.item && !s.cargo && (!s.expiresAt || s.expiresAt > now()));
  const gainOf = (a: AgentDoc, key: string) => {
    const s = a.storage.find((x) => x.key === key);
    return s ? Math.round((20 + game.fileValue(s) * 12) * (game.mwKb?.(a) ?? 1)) : 0;
  };
  function files(d: BbsDef, a: AgentDoc, u: User): BbsFiles {
    const lv = levelOf(a, u);
    return {
      kb: u.kb,
      philes: d.philes.map((p) => ({ id: p.id, name: p.name, size: p.size, desc: p.desc, need: p.need, open: lv >= p.need })),
      packs: packsOf(d).map((p) => ({ n: p.n, name: p.e.name, desc: p.e.desc, cost: p.cost, taken: u.packDay === today(), need: p.need, open: lv >= p.need })),
      mine: uploadable(a).map((s) => ({ key: s.key, name: s.name, gain: gainOf(a, s.key) })),
      recent: board(d.id).recent.slice(0, 8),
    };
  }

  // ---------------------------------------------------------------- porte
  const trisView = (a: AgentDoc): TrisState => {
    const g = tris.get(a.id) ?? { board: Array<Cell>(9).fill(""), over: null, line: "TOCCA A TE. TU SEI LA X.", games: 0 };
    tris.set(a.id, g);
    return { board: g.board, over: g.over, line: g.line, games: g.games };
  };
  function trisMove(a: AgentDoc, cell: number, restart: boolean): R {
    const g = tris.get(a.id) ?? (trisView(a), tris.get(a.id)!);
    if (restart) {
      g.board = Array<Cell>(9).fill("");
      g.over = null;
      g.line = "ALTRA PARTITA. TOCCA A TE.";
      return { ok: true, data: trisView(a) };
    }
    if (g.over || !Number.isInteger(cell) || cell < 0 || cell > 8 || g.board[cell]) return { ok: false, error: "mossa non valida" };
    g.board[cell] = "X";
    let w = winner(g.board);
    if (!w) {
      let best = -2;
      let pick = -1;
      for (let i = 0; i < 9; i += 1) {
        if (g.board[i]) continue;
        g.board[i] = "O";
        const v = minimax(g.board, "X");
        g.board[i] = "";
        if (v > best) (best = v), (pick = i);
      }
      g.board[pick] = "O";
      w = winner(g.board);
    }
    if (w) {
      g.games += 1;
      g.over = w === "draw" ? "draw" : w === "O" ? "wopr" : "you";
      if (w === "draw") {
        game.bump(a, "bbs:tris");
        g.line = g.games >= 3 ? "STRANO GIOCO. L'UNICA MOSSA VINCENTE È NON GIOCARE." : "PARI. NESSUN VINCITORE.";
      } else g.line = "HO VINTO IO. VUOI RIPROVARE?";
      game.dirty.add(a.id);
    } else g.line = "TOCCA A TE.";
    return { ok: true, data: trisView(a) };
  }
  const gtwView = (a: AgentDoc): GtwState => {
    const g = gtw.get(a.id) ?? { stage: "side", side: null, targets: [], pool: GTW_TARGETS, log: ["DA CHE PARTE VUOI STARE?"], defcon: 5 };
    gtw.set(a.id, g);
    return g;
  };
  function gtwAct(a: AgentDoc, p: Record<string, unknown>): R {
    const g = gtwView(a);
    const act = String(p.act ?? "");
    if (act === "reset") {
      gtw.delete(a.id);
      return { ok: true, data: gtwView(a) };
    }
    if (g.stage === "side" && act === "side") {
      g.side = p.side === "urss" ? "UNIONE SOVIETICA" : "STATI UNITI";
      g.stage = "targets";
      g.defcon = 4;
      g.log = [`GIOCHI CON: ${g.side}`, "", "ATTENDO LA SCELTA DEI PRIMI BERSAGLI.", "INDICANE FINO A TRE."];
      return { ok: true, data: g };
    }
    if (g.stage === "targets" && act === "target") {
      const t = String(p.target ?? "");
      if (!GTW_TARGETS.includes(t)) return { ok: false, error: "bersaglio sconosciuto" };
      g.targets = g.targets.includes(t) ? g.targets.filter((x) => x !== t) : [...g.targets, t].slice(-3);
      return { ok: true, data: g };
    }
    if (g.stage === "targets" && act === "launch") {
      if (!g.targets.length) return { ok: false, error: "scegli almeno un bersaglio" };
      g.stage = "run";
      g.defcon = 1;
      g.log = [
        `BERSAGLI: ${g.targets.join(", ").toUpperCase()}`,
        "",
        "TRAIETTORIE CALCOLATE …",
        "RISPOSTA AVVERSARIA RILEVATA: 2.400 TESTATE IN VOLO",
        "PERDITE STIMATE, PRIMA ORA: 72%",
        "PERDITE STIMATE, PRIMO MESE: 100%",
        "",
        `VINCITORE: NESSUNO`,
        "",
        "STRANO GIOCO.",
        "L'UNICA MOSSA VINCENTE È NON GIOCARE.",
        "",
        "CHE NE DICI DI UNA BELLA PARTITA A SCACCHI?",
      ];
      game.bump(a, "bbs:gtw");
      game.dirty.add(a.id);
      return { ok: true, data: g };
    }
    return { ok: false, error: "non ora" };
  }

  function prices(a: AgentDoc, t: Trade) {
    const r = rng(hash(`${a.id}:${t.day}:${t.turn}:${t.city}`));
    return GOODS.map(([, base]) => Math.max(1, Math.round(base * (0.55 + r() * 1.1))));
  }
  function tradeOf(a: AgentDoc): Trade {
    let t = trades.get(a.id);
    if (!t || t.day !== today()) {
      t = { day: today(), turn: 1, cash: TRADE_START, city: hash(a.id + today()) % CITIES.length, hold: GOODS.map(() => 0), news: "Hai mille crediti finti, uno zaino da quaranta pezzi e dodici mosse.", over: false, payout: 0 };
      trades.set(a.id, t);
    }
    return t;
  }
  function tradeView(a: AgentDoc, boost?: { good: number; mult: number }): TradeState {
    const t = tradeOf(a);
    const pr = prices(a, t).map((v, i) => (boost && boost.good === i ? Math.max(1, Math.round(v * boost.mult)) : v));
    if (state.trade.today.day !== today()) state.trade.today = { day: today(), rows: [] };
    return { day: t.day, turn: Math.min(t.turn, TRADE_TURNS), turns: TRADE_TURNS, cash: t.cash, city: t.city, cities: CITIES, cap: TRADE_CAP, goods: GOODS.map(([name], i) => ({ name, price: pr[i]!, have: t.hold[i]! })), news: t.news, over: t.over, payout: t.payout, best: state.trade.best.slice(0, 8), today: state.trade.today.rows.slice(0, 8) };
  }
  const boosts = new Map<string, { good: number; mult: number }>();
  function tradeAct(a: AgentDoc, p: Record<string, unknown>): R {
    const t = tradeOf(a);
    const act = String(p.act ?? "view");
    const cur = boosts.get(a.id);
    if (act === "view") return { ok: true, data: tradeView(a, cur) };
    if (t.over) return { ok: false, error: "per oggi hai finito le mosse: torna domani" };
    const pr = prices(a, t).map((v, i) => (cur && cur.good === i ? Math.max(1, Math.round(v * cur.mult)) : v));
    const g = Number(p.good);
    if (act === "buy" || act === "sell") {
      if (!Number.isInteger(g) || g < 0 || g >= GOODS.length) return { ok: false, error: "merce sconosciuta" };
      const room = TRADE_CAP - t.hold.reduce((s, v) => s + v, 0);
      if (act === "buy") {
        const n = Math.min(room, Math.floor(t.cash / pr[g]!));
        if (n <= 0) return { ok: false, error: room <= 0 ? "lo zaino è pieno" : "non te lo puoi permettere" };
        t.hold[g]! += n;
        t.cash -= n * pr[g]!;
        t.news = `Comprati ${n} × ${GOODS[g]![0]}.`;
      } else {
        if (!t.hold[g]) return { ok: false, error: "non ne hai" };
        t.cash += t.hold[g]! * pr[g]!;
        t.news = `Venduti ${t.hold[g]} × ${GOODS[g]![0]}.`;
        t.hold[g] = 0;
      }
      return { ok: true, data: tradeView(a, cur) };
    }
    if (act === "go") {
      const c = Number(p.city);
      if (!Number.isInteger(c) || c < 0 || c >= CITIES.length || c === t.city) return { ok: false, error: "destinazione non valida" };
      t.city = c;
      t.turn += 1;
      boosts.delete(a.id);
      t.news = `Sei a ${CITIES[c]}.`;
      const r = rng(hash(`${a.id}:${t.day}:${t.turn}:ev`));
      const roll = r();
      if (roll < 0.14) {
        const good = Math.floor(r() * GOODS.length);
        boosts.set(a.id, { good, mult: 2.6 });
        t.news = `Sei a ${CITIES[c]}. Retata al mercato nero: ${GOODS[good]![0]} introvabili, prezzi alle stelle.`;
      } else if (roll < 0.28) {
        const good = Math.floor(r() * GOODS.length);
        boosts.set(a.id, { good, mult: 0.4 });
        t.news = `Sei a ${CITIES[c]}. È caduto un camion: ${GOODS[good]![0]} a prezzo di saldo.`;
      } else if (roll < 0.34 && t.hold.some(Boolean)) {
        const good = t.hold.findIndex(Boolean);
        const lost = Math.ceil(t.hold[good]! / 2);
        t.hold[good]! -= lost;
        t.news = `Sei a ${CITIES[c]}. Dogana: ti hanno sequestrato ${lost} × ${GOODS[good]![0]}.`;
      }
      if (t.turn > TRADE_TURNS) {
        // fine giornata: la merce rimasta non conta, solo i contanti
        t.over = true;
        const score = t.cash;
        t.payout = Math.max(0, Math.min(TRADE_PAY_MAX, Math.round((score - TRADE_START) / 25)));
        a.credits += t.payout;
        game.touch("agent", a.id);
        game.bump(a, "bbs:door");
        if (state.trade.today.day !== today()) state.trade.today = { day: today(), rows: [] };
        const put = (rows: { handle: string; score: number }[]) => {
          rows.push({ handle: a.handle, score });
          rows.sort((x, y) => y.score - x.score);
          rows.splice(10);
        };
        put(state.trade.today.rows);
        put(state.trade.best);
        if (state.trade.best[0]?.handle === a.handle && state.trade.best[0].score === score) game.bump(a, "bbs:top");
        t.news = `Giornata chiusa con ${score} crediti finti.${t.payout ? ` Il sysop ti riconosce ${fmtCr(t.payout)} veri.` : " Niente premio: non hai guadagnato."}`;
        dirty = true;
        game.dirty.add(a.id);
      }
      return { ok: true, data: tradeView(a, boosts.get(a.id)) };
    }
    return { ok: false, error: "mossa sconosciuta" };
  }

  // ---------------------------------------------------------------- comandi
  function act(a: AgentDoc, p: Record<string, unknown>): R {
    const cmd = String(p.cmd ?? "");
    const id = String(p.bbs ?? "");
    if (cmd === "list") return { ok: true, data: { list: BBS.filter((d) => visible(d, a)).map((d) => info(d, a)), on: sessions.get(a.id)?.bbs ?? null } };
    if (cmd === "bye") {
      hangup(a);
      return { ok: true, note: "NO CARRIER" };
    }
    if (cmd === "dev" && DEV) {
      const u = userOf(id, a);
      Object.assign(u, { days: Number(p.days ?? u.days), posts: Number(p.posts ?? u.posts), uploads: Number(p.uploads ?? u.uploads), kb: Number(p.kb ?? u.kb) });
      return { ok: true };
    }
    if (cmd === "call") {
      const d = def(id);
      if (!d || !visible(d, a)) return { ok: false, error: "il numero non risponde" };
      const lock = lockOf(d, a);
      if (lock) return { ok: false, error: `${d.name}: ${lock}` };
      if (game.ops.has(a.id)) return { ok: false, error: "il modem è occupato: stacca prima la connessione" };
      if (a.jailUntil > now()) return { ok: false, error: "in custodia non ti lasciano il telefono" };
      const u = userOf(id, a);
      if (d.gate && !u.gate && !a.staff) {
        if (clean(p.pass, 30).toUpperCase() !== d.gate) return { ok: false, error: p.pass ? "IDENTIFICAZIONE NON RICONOSCIUTA DAL SISTEMA" : "LOGON:", data: { gate: true, hint: d.gateHint } };
        u.gate = true;
        game.bump(a, "bbs:gate");
      }
      hangup(a);
      if (budgetLeft(a, u, null) <= 0) return { ok: false, error: `hai finito i minuti di oggi su ${d.name}: richiama domani` };
      if (u.lastDay !== today()) {
        u.lastDay = today();
        u.days += 1;
        game.bump(a, "bbs:days");
      }
      sessions.set(a.id, { bbs: id, at: now(), last: now() });
      const b = board(id);
      b.callers = [{ handle: a.handle, at: now(), from: game.homeCity(a) }, ...b.callers.filter((c) => c.handle !== a.handle)].slice(0, 12);
      game.bump(a, "bbs:call");
      dirty = true;
      const h = home(d, a);
      u.lastAt = now();
      return { ok: true, data: h };
    }
    const on = online(a, id);
    if (typeof on === "string") return { ok: false, error: on, data: { dropped: true } };
    const { d, u } = on;
    const b = board(id);
    const lv = levelOf(a, u);
    const area = (aid: string) => d.areas.find((x) => x.id === aid) ?? null;
    switch (cmd) {
      case "home":
        return { ok: true, data: home(d, a) };
      case "threads": {
        const ar = area(String(p.area ?? ""));
        if (!ar) return { ok: false, error: "area inesistente" };
        if (lv < ar.need) return { ok: false, error: `area riservata al livello «${BBS_LEVEL[ar.need]}»` };
        npcTick(b);
        const rows: BbsThreadRow[] = b.threads
          .filter((t) => t.area === ar.id)
          .map((t) => ({ id: t.id, title: t.title, by: t.posts[0]!.by, at: t.posts[0]!.at, replies: t.posts.length - 1, lastBy: t.posts.at(-1)!.by, lastAt: t.posts.at(-1)!.at, fresh: t.posts.at(-1)!.at > u.seen, pinned: Boolean(t.pinned) }))
          .sort((x, y) => Number(y.pinned) - Number(x.pinned) || y.lastAt - x.lastAt);
        return { ok: true, data: { area: { id: ar.id, name: ar.name, desc: ar.desc }, rows } };
      }
      case "thread": {
        npcTick(b);
        const t = b.threads.find((x) => x.id === p.thread);
        const ar = t ? area(t.area) : null;
        if (!t || !ar) return { ok: false, error: "discussione inesistente" };
        if (lv < ar.need) return { ok: false, error: "area riservata" };
        u.seen = Math.max(u.seen, t.posts.at(-1)!.at);
        const sigOf = (by: string) => {
          const o = [...game.agents.values()].find((x) => !x.npc && x.handle === by);
          return o ? { level: BBS_LEVEL[levelOf(o, userOf(id, o))]!, sig: `${rankOf(o.xp, o.faction)} · cellula ${o.faction === "red" ? "rossa" : "blu"}` } : { level: by === d.sysop ? "sysop" : "fidato", sig: by === d.sysop ? `sysop di ${d.name}` : "habitué" };
        };
        const view: BbsThread = { id: t.id, area: t.area, title: t.title, canDelete: Boolean(a.staff), posts: t.posts.map((x, n) => ({ n: n + 1, by: x.by, at: x.at, body: x.body, ...sigOf(x.by) })) };
        return { ok: true, data: view };
      }
      case "post":
      case "reply": {
        const body = clean(p.body, BBS_POST_MAX);
        if (body.length < 3) return { ok: false, error: "messaggio vuoto" };
        if (now() - u.lastAt < 20_000 && u.posts > 0 && !DEV) return { ok: false, error: "piano: un messaggio ogni venti secondi" };
        let t: Thread | undefined;
        if (cmd === "post") {
          const ar = area(String(p.area ?? ""));
          const title = clean(p.title, BBS_TITLE_MAX).replace(/\n/g, " ");
          if (!ar) return { ok: false, error: "area inesistente" };
          if (lv < ar.need) return { ok: false, error: "area riservata" };
          if (title.length < 3) return { ok: false, error: "manca il titolo" };
          b.seq += 1;
          t = { id: `t${b.seq}-${now().toString(36)}`, area: ar.id, title, posts: [] };
          b.threads.push(t);
          // un habitué risponde, prima o poi
          b.pending.push({ thread: t.id, at: now() + (DEV ? 1500 : (3 + Math.floor(Math.random() * 12)) * 60_000) });
          const per = b.threads.filter((x) => x.area === ar.id && !x.pinned);
          if (per.length > 60) b.threads.splice(b.threads.indexOf(per.sort((x, y) => x.posts.at(-1)!.at - y.posts.at(-1)!.at)[0]!), 1);
        } else {
          t = b.threads.find((x) => x.id === p.thread);
          const ar = t ? area(t.area) : null;
          if (!t || !ar) return { ok: false, error: "discussione inesistente" };
          if (lv < ar.need) return { ok: false, error: "area riservata" };
          if (t.posts.length >= 80) return { ok: false, error: "discussione chiusa: troppo lunga" };
        }
        // rispondere a un habitué è il modo più semplice per farselo amico
        if (cmd === "reply" && t.posts[0]!.npc) game.lifeFavor?.(a, t.posts[0]!.by, 4);
        t.posts.push({ by: a.handle, at: now(), body });
        u.posts += 1;
        u.lastAt = now();
        u.seen = now();
        game.bump(a, "bbs:post");
        dirty = true;
        game.dirty.add(a.id);
        return { ok: true, note: cmd === "post" ? "messaggio in bacheca" : "risposta inviata", data: { thread: t.id } };
      }
      case "delete": {
        if (!a.staff) return { ok: false, error: "solo il co-sysop" };
        const t = b.threads.find((x) => x.id === p.thread);
        if (!t) return { ok: false, error: "discussione inesistente" };
        const n = Number(p.n);
        if (n > 1 && n <= t.posts.length) t.posts.splice(n - 1, 1);
        else b.threads.splice(b.threads.indexOf(t), 1);
        dirty = true;
        return { ok: true, note: "rimosso" };
      }
      case "oneliner": {
        const text = clean(p.text, BBS_LINE_MAX).replace(/\n/g, " ");
        if (text.length < 2) return { ok: false, error: "scrivi qualcosa" };
        b.oneliners = [{ handle: a.handle, text }, ...b.oneliners.filter((o) => o.handle !== a.handle)].slice(0, 12);
        game.bump(a, "bbs:line");
        dirty = true;
        return { ok: true, data: home(d, a) };
      }
      case "page":
        return { ok: true, data: { line: a.staff ? "Il sysop sei tu." : SYSOP_PAGE[Math.floor(Math.random() * SYSOP_PAGE.length)] } };
      case "users": {
        const rows: BbsUserRow[] = Object.entries(b.users)
          .map(([aid, x]) => ({ o: game.agents.get(aid), x }))
          .filter((r) => r.o && !r.o.npc && r.x.days > 0)
          .map(({ o, x }) => ({ handle: o!.handle, level: BBS_LEVEL[levelOf(o!, x)]!, days: x.days, posts: x.posts, uploads: x.uploads, last: x.lastAt }))
          .sort((x, y) => y.posts + y.uploads * 2 + y.days - (x.posts + x.uploads * 2 + x.days))
          .slice(0, 30);
        return { ok: true, data: { rows } };
      }
      case "files":
        if (!d.files) return { ok: false, error: "questo sistema non ha un'area file" };
        return { ok: true, data: files(d, a, u) };
      case "read": {
        const ph = d.philes.find((x) => x.id === p.id);
        if (!ph) return { ok: false, error: "file inesistente" };
        if (lv < ph.need) return { ok: false, error: `riservato al livello «${BBS_LEVEL[ph.need]}»` };
        game.bump(a, "bbs:read");
        return { ok: true, data: { name: ph.name, body: ph.body } };
      }
      case "upload": {
        if (!d.files) return { ok: false, error: "nessuna area file" };
        const s = uploadable(a).find((x) => x.key === p.key);
        if (!s) return { ok: false, error: "quel file non è nel tuo archivio" };
        const gain = gainOf(a, s.key);
        a.storage = a.storage.filter((x) => x.key !== s.key);
        u.kb += gain;
        u.uploads += 1;
        b.recent = [{ name: s.name, by: a.handle, at: now() }, ...b.recent].slice(0, 12);
        game.touch("agent", a.id);
        game.bump(a, "bbs:up");
        game.dirty.add(a.id);
        dirty = true;
        return { ok: true, note: `caricato: +${gain} KB di credito`, data: files(d, a, u) };
      }
      case "download": {
        if (!d.files) return { ok: false, error: "nessuna area file" };
        const pk = packsOf(d).find((x) => x.n === Number(p.n));
        if (!pk) return { ok: false, error: "pacchetto inesistente" };
        if (lv < pk.need) return { ok: false, error: `riservato al livello «${BBS_LEVEL[pk.need]}»` };
        if (u.packDay === today()) return { ok: false, error: "un pacchetto al giorno per BBS: c'è la fila" };
        if (u.kb < pk.cost) return { ok: false, error: `ti servono ${pk.cost} KB di credito: carica qualcosa` };
        u.kb -= pk.cost;
        u.packDay = today();
        u.downloads += 1;
        game.giveItem(a, { kind: "exploit", code: pk.e.code, rarity: pk.e.rarity, name: pk.e.name, desc: pk.e.desc });
        game.bump(a, "bbs:down");
        game.dirty.add(a.id);
        dirty = true;
        return { ok: true, note: `scaricato ${pk.e.name}: è nel tuo archivio`, data: files(d, a, u) };
      }
      case "door": {
        const door = d.doors.find((x) => x.id === p.door);
        if (!door) return { ok: false, error: "porta inesistente" };
        if (lv < door.need) return { ok: false, error: `porta riservata al livello «${BBS_LEVEL[door.need]}»` };
        if (door.id === "tris") return p.act === "move" || p.act === "again" ? trisMove(a, Number(p.cell), p.act === "again") : { ok: true, data: trisView(a) };
        if (door.id === "gtw") return p.act && p.act !== "view" ? gtwAct(a, p) : { ok: true, data: gtwView(a) };
        return tradeAct(a, p);
      }
      default:
        return { ok: false, error: "comando sconosciuto" };
    }
  }

  const prev = game.socialAct;
  game.socialAct = (agent, a, p) => (a === "bbs" ? act(agent, p) : (prev?.(agent, a, p) ?? null));

  function save() {
    if (!dirty) return;
    dirty = false;
    game.store.put("bbs", "state", state);
  }
  const api = {
    /** Il BBS a cui l'agente è collegato in questo momento, o null. */
    sessionOf: (a: AgentDoc) => {
      const s = sessions.get(a.id);
      return s && typeof online(a, s.bbs) !== "string" ? s.bbs : null;
    },
    level: (bbs: string, a: AgentDoc) => levelOf(a, userOf(bbs, a)),
    kb: (bbs: string, a: AgentDoc) => userOf(bbs, a).kb,
    addKb: (bbs: string, a: AgentDoc, n: number) => {
      userOf(bbs, a).kb = Math.max(0, userOf(bbs, a).kb + n);
      dirty = true;
    },
    hasFiles: (bbs: string) => Boolean(def(bbs)?.files),
    // ---- la vita della bacheca: gli habitué chiamano, scrivono, rispondono (server/life.ts)
    ids: () => BBS.map((d) => d.id),
    areasOf: (bbs: string) => def(bbs)?.areas.map((x) => x.id) ?? [],
    npcCall: (bbs: string, handle: string, from: string) => {
      const b = board(bbs);
      b.callers = [{ handle, at: now(), from }, ...b.callers.filter((c) => c.handle !== handle)].slice(0, 12);
      dirty = true;
    },
    npcLine: (bbs: string, handle: string, text: string) => {
      const b = board(bbs);
      b.oneliners = [{ handle, text }, ...b.oneliners.filter((o) => o.handle !== handle)].slice(0, 12);
      dirty = true;
    },
    npcPost: (bbs: string, area: string, by: string, title: string, body: string) => {
      const b = board(bbs);
      if (!def(bbs)?.areas.some((x) => x.id === area) || b.threads.some((t) => t.title === title)) return false;
      b.seq += 1;
      b.threads.push({ id: `n${b.seq}-${now().toString(36)}`, area, title, posts: [{ by, at: now(), body, npc: true }] });
      const per = b.threads.filter((x) => x.area === area && !x.pinned);
      if (per.length > 60) b.threads.splice(b.threads.indexOf(per.sort((x, y) => x.posts.at(-1)!.at - y.posts.at(-1)!.at)[0]!), 1);
      dirty = true;
      return true;
    },
    /** Una risposta a una discussione recente, mai due volte di fila dalla stessa mano. */
    npcReply: (bbs: string, by: string, body: string) => {
      const b = board(bbs);
      const pool = b.threads.filter((t) => !t.pinned && t.posts.length < 30 && t.posts.at(-1)!.by !== by && now() - t.posts.at(-1)!.at < 3 * DAY);
      const t = pool[Math.floor(Math.random() * pool.length)];
      if (!t) return false;
      t.posts.push({ by, at: now(), body, npc: true });
      dirty = true;
      return true;
    },
    name: (bbs: string) => def(bbs)?.name ?? bbs,
  };
  return { ...api, save, hangup, stats: () => ({ posts: Object.values(state.boards).reduce((s, b) => s + b.threads.reduce((q, t) => q + t.posts.filter((x) => !x.npc).length, 0), 0) }) };
}
