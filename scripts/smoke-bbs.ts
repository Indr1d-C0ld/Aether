// I BBS: rubrica, chiamata a tempo, bacheche, livelli, area file con il rapporto, porte, e il sistema
// che risponde solo al War Dialer.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";
import type { BbsFiles, BbsHome, BbsInfo, BbsThread, BbsThreadRow, GtwState, TradeState, TrisState } from "../shared/bbs.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = Extract<ServerMsg, { t: "res" }>;
let state: GameState | null = null;
let seq = 0;
const pending = new Map<number, (m: Res) => void>();
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
await new Promise<void>((r) => {
  ws.on("open", () => ws.send(JSON.stringify({ t: "auth", mode: "register", handle: `bbs_${Math.random().toString(36).slice(2, 6)}`, pass: "segreto123", faction: "red" })));
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
const idle = async () => {
  await sleep(400);
  for (let i = 0; i < 200 && state!.op?.tasks.some((k) => k.state === "run"); i += 1) await sleep(200);
  await sleep(300);
};
const bbs = (cmd: string, p: Record<string, unknown> = {}) => act("bbs", { cmd, ...p });
const S = "sottosuolo";

await sleep(400);
let list = ((await bbs("list")).data as { list: BbsInfo[] }).list;
check("in rubrica: il Sottosuolo e il BBS della propria cellula", list.some((b) => b.id === S) && list.some((b) => b.id === "corvo" && !b.locked));
check("il BBS dell'altra cellula non risponde", list.find((b) => b.id === "torre")?.locked != null && !(await bbs("call", { bbs: "torre" })).ok);
check("Falken non è in rubrica prima di una scansione", !list.some((b) => b.id === "falken"));
check("senza chiamare non si legge niente", !(await bbs("threads", { bbs: S, area: "generale" })).ok);

// prima chiamata
let home = (await bbs("call", { bbs: S })).data as BbsHome;
check("prima chiamata: nuovo utente, venti minuti", home.level === 0 && home.minutesLeft === 20 && home.stats.days === 1 && home.banner.length > 50);
check("sei fra gli ultimi chiamanti", home.callers[0]!.handle === state!.me.handle);
check("aree aperte e chiuse secondo il livello", home.areas.find((a) => a.id === "generale")!.open && !home.areas.find((a) => a.id === "tecnica")!.open && !home.areas.find((a) => a.id === "retrobottega")!.open);
check("le aree riservate non si leggono", !(await bbs("threads", { bbs: S, area: "tecnica" })).ok);
const rows = ((await bbs("threads", { bbs: S, area: "presentazioni" })).data as { rows: BbsThreadRow[] }).rows;
check("discussioni di partenza, con quella in evidenza in cima", rows.length >= 3 && rows[0]!.pinned);
const th = (await bbs("thread", { bbs: S, thread: rows[1]!.id })).data as BbsThread;
check("una discussione con le risposte", th.posts.length >= 2 && th.posts[0]!.sig.length > 0);
check("messaggio vuoto rifiutato", !(await bbs("post", { bbs: S, area: "presentazioni", title: "Ciao", body: " " })).ok);
const mine = await bbs("post", { bbs: S, area: "presentazioni", title: "Mi presento", body: "Chiamo da un test automatico.\nSaluti a tutti." });
check("mi presento in bacheca", mine.ok);
const tid = (mine.data as { thread: string }).thread;
check("risposta alla propria discussione", (await bbs("reply", { bbs: S, thread: tid, body: "E aggiungo una riga." })).ok);
await sleep(2500);
const back = (await bbs("thread", { bbs: S, thread: tid })).data as BbsThread;
check("un habitué risponde", back.posts.length === 3 && back.posts[2]!.by !== state!.me.handle);
home = (await bbs("oneliner", { bbs: S, text: "NO CARRIER dal test" })).data as BbsHome;
check("una riga sul muro", home.oneliners[0]!.text === "NO CARRIER dal test");
check("il sysop non è quasi mai alla tastiera", ((await bbs("page", { bbs: S })).data as { line: string }).line.length > 5);
check("il Mercante di Chip chiede il livello validato", !(await bbs("door", { bbs: S, door: "mercante" })).ok);

// file di testo e rapporto
let files = (await bbs("files", { bbs: S })).data as BbsFiles;
check("area file: testi leggibili, pacchetti riservati", files.philes.some((p) => p.open) && files.packs.length === 3 && files.packs.every((p) => !p.open));
check("un file di testo si legge", ((await bbs("read", { bbs: S, id: "galateo" })).data as { body: string }).body.includes("Presentati"));
check("senza livello il pacchetto non si scarica", !(await bbs("download", { bbs: S, n: 1 })).ok);

// secondo giorno e contributi: validato, poi fidato (con la scorciatoia dei test)
await bbs("dev", { bbs: S, days: 2 });
home = (await bbs("home", { bbs: S })).data as BbsHome;
check("chi si presenta e richiama è validato", home.level === 1 && home.areas.find((a) => a.id === "tecnica")!.open && home.next !== null);
const tr = (await bbs("door", { bbs: S, door: "mercante" })).data as TradeState;
check("Mercante di Chip: mille crediti finti, dodici mosse", tr.cash === 1000 && tr.turns === 12 && tr.goods.length === 5);
const cr = state!.me.credits;
let t = tr;
for (let i = 0; i < 12 && !t.over; i += 1) {
  // compra la merce più cara che ci si può permettere, viaggia, rivendi
  const g = t.goods.map((x, n) => ({ ...x, n })).filter((x) => x.price <= t.cash).sort((x, y) => y.price - x.price)[0];
  await sleep(250); // il server chiude chi manda più di 30 messaggi al secondo
  if (g) await bbs("door", { bbs: S, door: "mercante", act: "buy", good: g.n });
  t = (await bbs("door", { bbs: S, door: "mercante", act: "go", city: (t.city + 1) % 6 })).data as TradeState;
  for (let n = 0; n < 5; n += 1) if (t.goods[n]!.have && !t.over) t = (await bbs("door", { bbs: S, door: "mercante", act: "sell", good: n })).data as TradeState;
}
await sleep(1200);
check("giornata chiusa: classifica e premio entro il tetto", t.over && t.today.some((r) => r.handle === state!.me.handle) && t.payout >= 0 && t.payout <= 300 && state!.me.credits === cr + t.payout);
check("finite le mosse, si torna domani", !(await bbs("door", { bbs: S, door: "mercante", act: "go", city: 0 })).ok);

// caricare un file dell'archivio dà credito; con il credito si scarica un pacchetto al giorno
await act("devGrant", { tools: { proxy: 3, firewall: 3, monbypass: 3, decrypt: 3 }, hw: { cpu: 5, modem: 3, memory: 3 } });
await bbs("bye");
await act("connect", { chain: ["r-sable", "r-kiln", "lumen-news"] });
await sleep(200);
if (!state!.op!.bypass.firewall) await act("run", { tool: "firewall" });
if (!state!.op!.bypass.proxy) await act("run", { tool: "proxy" });
await idle();
await act("login", { password: "SIGNAL" });
await sleep(300);
check("col modem occupato il BBS non si chiama", !(await bbs("call", { bbs: S })).ok);
const encF = state!.op!.files!.find((x) => x.encryption === 1)!;
await act("run", { tool: "decrypt", fileId: encF.id });
await idle();
await act("copy", { fileId: encF.id });
await sleep(300);
await idle();
await act("disconnect");
await sleep(600);
await bbs("call", { bbs: S });
files = (await bbs("files", { bbs: S })).data as BbsFiles;
check("i file rubati si possono caricare", files.mine.length >= 1 && files.mine[0]!.gain > 20);
const had = state!.me.storage.length;
files = (await bbs("upload", { bbs: S, key: files.mine[0]!.key })).data as BbsFiles;
await sleep(1200);
check("caricato: credito in KB, file fuori dall'archivio", files.kb > 20 && state!.me.storage.length === had - 1 && files.recent[0]!.by === state!.me.handle);
await bbs("dev", { bbs: S, kb: 500 });
files = (await bbs("files", { bbs: S })).data as BbsFiles;
const pk = files.packs.find((p) => p.open)!;
const dl = await bbs("download", { bbs: S, n: pk.n });
await sleep(1200);
check("pacchetto scaricato: exploit in archivio, credito scalato", dl.ok && (dl.data as BbsFiles).kb === 500 - pk.cost && state!.me.storage.some((x) => x.item?.kind === "exploit"));
check("un pacchetto al giorno", !(await bbs("download", { bbs: S, n: pk.n })).ok);
check("riattaccato: NO CARRIER", (await bbs("bye")).ok && !(await bbs("home", { bbs: S })).ok);

// il sistema che risponde solo al War Dialer
await act("devGrant", { credits: 2000 });
await act("wardial", { region: "na" });
await sleep(2500);
list = ((await bbs("list")).data as { list: BbsInfo[] }).list;
check("dopo una scansione compare un numero in più", list.some((b) => b.id === "falken" && b.gate));
const no = await bbs("call", { bbs: "falken", pass: "PENCIL" });
check("LOGON: la parola sbagliata non passa", !no.ok && (no.data as { gate: boolean }).gate);
check("la parola giusta sì", (await bbs("call", { bbs: "falken", pass: "joshua" })).ok);
let ts = (await bbs("door", { bbs: "falken", door: "tris" })).data as TrisState;
// tre partite giocate bene: sempre pari
const best = [4, 0, 2, 6, 8, 1, 3, 5, 7];
for (let g = 0; g < 3; g += 1) {
  if (g) ts = (await bbs("door", { bbs: "falken", door: "tris", act: "again" })).data as TrisState;
  while (!ts.over) {
    // blocca se serve, altrimenti la casella libera migliore
    const L = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    const two = (who: string) => L.map((l) => (l.filter((i) => ts.board[i] === who).length === 2 ? l.find((i) => !ts.board[i]) : undefined)).find((x) => x !== undefined);
    const cell = two("X") ?? two("O") ?? best.find((i) => !ts.board[i])!;
    ts = (await bbs("door", { bbs: "falken", door: "tris", act: "move", cell })).data as TrisState;
  }
}
await sleep(1200);
check("a tris il sistema non perde mai", ts.over !== "you" && ts.games === 3);
check("tre pari: la conclusione del sistema", ts.over !== "draw" || /NON GIOCARE/.test(ts.line));
let gw = (await bbs("door", { bbs: "falken", door: "gtw", act: "side", side: "usa" })).data as GtwState;
await bbs("door", { bbs: "falken", door: "gtw", act: "target", target: "Las Vegas" });
gw = (await bbs("door", { bbs: "falken", door: "gtw", act: "launch" })).data as GtwState;
await sleep(1200);
check("Guerra Termonucleare Globale: vincitore nessuno", gw.stage === "run" && gw.defcon === 1 && gw.log.some((l) => /VINCITORE: NESSUNO/.test(l)) && (state!.me.counters["bbs:gtw"] ?? 0) === 1);

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
