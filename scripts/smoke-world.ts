// Smoke test del mondo vivo: esplorazione, nodi che reagiscono secondo la loro natura, comandi di sistema,
// missioni di Uplink aggiunte, mercato a due canali.
// Uso: AETHER_DEV=1 AETHER_FAST=1 AETHER_DB=/tmp/x.db AETHER_PORT=7099 node server/main.ts & node scripts/smoke-world.ts 7099
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Client {
  name: string;
  ws: WebSocket;
  state: GameState | null = null;
  seq = 0;
  toasts: string[] = [];
  pending = new Map<number, (m: Extract<ServerMsg, { t: "res" }>) => void>();
  ready: Promise<void>;
  constructor(name: string) {
    this.name = name;
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ready = new Promise((r) => this.ws.on("open", () => r()));
    this.ws.on("message", (raw) => {
      const m = JSON.parse(String(raw)) as ServerMsg;
      if (m.t === "state") this.state = { ...m.s, nodes: m.s.nodes ?? this.state?.nodes ?? [] } as GameState; // la lista dei nodi arriva solo ogni tanto
      if (m.t === "res") this.pending.get(m.id)?.(m);
      if (m.t === "toast") this.toasts.push(m.text);
    });
  }
  auth(handle: string, faction: "red" | "blue") {
    return new Promise<void>((r) => {
      this.ws.once("message", () => r());
      this.ws.send(JSON.stringify({ t: "auth", mode: "register", handle, pass: "segreto123", faction }));
    });
  }
  async do(a: string, p: Record<string, unknown> = {}) {
    const id = ++this.seq;
    const res = await new Promise<Extract<ServerMsg, { t: "res" }>>((r) => {
      this.pending.set(id, r);
      this.ws.send(JSON.stringify({ t: "do", id, a, p }));
    });
    console.log(`${this.name} ${a} → ${res.ok ? "ok" : "ERR"} ${res.error ?? res.note ?? ""}`);
    await sleep(80);
    return res;
  }
  async waitTasks() {
    for (let i = 0; i < 200; i += 1) {
      await sleep(250);
      const op = this.state?.op;
      if (!op || !op.tasks.some((t) => t.state === "run")) return;
    }
  }
}

import { WORLD } from "../server/worldgen.ts";
import { PEOPLE } from "../server/people.ts";

const tag = Math.random().toString(36).slice(2, 6);
const red = new Client("RED");
const blue = new Client("BLUE");
await Promise.all([red.ready, blue.ready]);
await red.auth(`free_${tag}`, "red");
await blue.auth(`cert_${tag}`, "blue");
await sleep(400);
const GEAR = { proxy: 3, firewall: 3, breaker: 3, decrypt: 3, monbypass: 3, wardialer: 3 };
await red.do("devGrant", { xp: 3000, credits: 40000, tools: GEAR, hw: { cpu: 5, modem: 5, memory: 4 } });
await blue.do("devGrant", { xp: 3000, credits: 20000, fame: 300 });
await sleep(1300);
const results: string[] = [];
const check = (name: string, ok: boolean) => {
  results.push(`${ok ? "OK  " : "FAIL"} ${name}`);
  console.log(`  >> ${ok ? "OK" : "FAIL"}: ${name}`);
};
const me = () => red.state!.me;
const gen = (kind: string, pred: (n: (typeof WORLD.nodes)[number]) => boolean = () => true) => WORLD.nodes.find((n) => n.kind === kind && pred(n))!;
const ROUTE = ["r-kiln", "r-quartz", "r-lantern", "r-kaiju", "r-coral"];
const dial = async (ip: string) => {
  await red.do("connect", { chain: ROUTE, targetIp: ip });
  await sleep(300);
};
const crack = async () => {
  // qui si provano i sistemi, non il trace: i bersagli sono scelti a caso e uno militare, lento da forzare,
  // ogni tanto faceva cadere la connessione a metà. Il trace resta attivo, ma non avanza durante lo scasso.
  await red.do("devGrant", { freeze: 120_000 });
  // lo stesso rimbalzo usato venti volte si consuma: il Monitor Bypass tiene il test lontano dal trace
  if (red.state!.op && red.state!.op.target.sec.monitor > 0) await red.do("run", { tool: "monbypass" });
  if (!red.state!.op!.bypass.proxy) await red.do("run", { tool: "proxy" });
  if (red.state!.op && !red.state!.op.bypass.firewall) await red.do("run", { tool: "firewall" });
  await red.waitTasks();
  await red.do("run", { tool: "breaker" });
  await red.waitTasks();
  await sleep(300);
};
const off = async () => {
  if (red.state!.op) await red.do("disconnect");
  await sleep(300);
};

console.log("== ESPLORAZIONE");
const known0 = me().knownNodes;
console.log("  nodi conosciuti all'inizio:", known0, "su", me().worldNodes);
check("il mondo ha centinaia di nodi e ne conosci una piccola parte", me().worldNodes > 250 && known0 < 50);
await red.do("wardial", { region: "eu" });
await sleep(2600);
check("la scansione di una regione mette nodi nuovi sulla mappa", me().knownNodes > known0 && me().knownNodes <= known0 + 6);
const hotel = gen("shop", (n) => n.sub === "hotel");
const k1 = me().knownNodes;
const reg = await red.do("registry", { query: hotel.org.slice(0, 12) });
await sleep(1300);
check("il Registro trova un'organizzazione per nome", reg.ok && me().knownNodes > k1);

console.log("== UN NEGOZIO NON GUARDA CHI ENTRA");
const shop = gen("shop", (n) => n.monitor > 0);
await dial(shop.ip);
check("monitor fermo finché non tocchi nulla", red.state!.op!.trace.active === false);
await crack();
// di notte, ora locale, un negozio può non avere proprio nessuno di guardia
check("il monitor parte alla prima mossa rumorosa (se c'è qualcuno di guardia)", red.state!.op!.trace.active === true || red.state!.op!.target.sec.monitor === 0);
const cr0 = me().credits;
await red.do("sys", { cmd: "cash" });
await sleep(1300);
check("cassa svuotata", me().credits > cr0);
const again = await red.do("sys", { cmd: "cash" });
check("la cassa non si svuota due volte di fila", !again.ok);
await off();

console.log("== LA PASSWORD È SUL PC DI CASA DELL'AMMINISTRATORE");
// un'azienda che compare negli appunti del suo amministratore (ne tiene al massimo tre)
const orgsOf = (id: string) => WORLD.nodes.filter((n) => n.kind !== "relay" && n.adminId === id).slice(0, 3);
const org = WORLD.nodes.find((n) => n.adminId && WORLD.home[n.adminId] && n.kind === "corp" && orgsOf(n.adminId).includes(n))!;
const admin = PEOPLE.find((p) => p.id === org.adminId)!;
const home = WORLD.nodes.find((n) => n.id === WORLD.home[admin.id])!;
await dial(home.ip);
check("un PC di casa non ha alcun monitor", red.state!.op!.trace.totalMs === 0 || red.state!.op!.trace.active === false);
const guess = `${admin.name.split(" ")[0]!.toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "")}${String(admin.born).slice(2)}`;
const lg = await red.do("login", { password: guess });
await sleep(300);
check("password indovinata da nome e anno di nascita", lg.ok);
const note = red.state!.op!.files!.find((f) => f.name.startsWith("appunti_lavoro") && f.preview?.includes(org.ip));
const pw = /servizio è (\S+)\./.exec(note?.preview ?? "")?.[1] ?? "";
check("negli appunti c'è la password dell'ufficio", Boolean(pw));
await off();
await dial(org.ip);
if (!red.state!.op!.bypass.proxy) await red.do("run", { tool: "proxy" });
await red.waitTasks();
const lg2 = await red.do("login", { password: pw });
check("accesso admin all'azienda senza forzare nulla", lg2.ok);
await off();

console.log("== COMPAGNIA TELEFONICA: intercettazione");
const telco = gen("telco");
await dial(telco.ip);
await crack();
const victim = PEOPLE.find((p) => WORLD.home[p.id] && p.id !== admin.id)!;
const tap = await red.do("sys", { cmd: "tap", handle: victim.name });
console.log("  ", (tap.data as { lines: string[] } | undefined)?.lines);
check("l'intercettazione dà l'indirizzo di casa di un cittadino", tap.ok && String((tap.data as { lines: string[] }).lines[0]).includes(WORLD.nodes.find((n) => n.id === WORLD.home[victim.id])!.ip));
const rr = await red.do("sys", { cmd: "reroute" });
await sleep(1300);
check("linea deviata", rr.ok && me().rerouteUntil > Date.now());
await off();

console.log("== UFFICIO PUBBLICO: blocco del login");
const gov = gen("gov");
await dial(gov.ip);
if (!red.state!.op!.bypass.proxy) await red.do("run", { tool: "proxy" });
await red.waitTasks();
for (let i = 0; i < 3; i += 1) await red.do("login", { password: "SBAGLIATA" });
const locked = await red.do("login", { password: "SBAGLIATA" });
check("login bloccato dopo tre password sbagliate", !locked.ok && /bloccato/.test(locked.error ?? ""));
await off();

console.log("== POLIZIA: mandato d'ufficio su un altro handle");
const law = gen("law");
await dial(law.ip);
await crack();
const w = await red.do("sys", { cmd: "warrant", handle: blue.state!.me.handle });
await sleep(1300);
check("mandato emesso: l'altro handle ha un capo d'accusa", w.ok && blue.state!.me.charges.length === 1);
await off();

console.log("== RETE ELETTRICA: blackout");
await red.do("devGrant", { cool: true }); // il test fa molto rumore: senza raffreddare finirebbe in arresto per calore
const util = gen("util");
await dial(util.ip);
await crack();
const bo = await red.do("sys", { cmd: "blackout" });
check("blackout scatenato", bo.ok);
await off();

console.log("== SPEGNIMENTO E RIAVVIO");
await red.do("devGrant", { cool: true }); // il test fa molto rumore: senza raffreddare finirebbe in arresto per calore
// il sistema da sabotare è scelto a caso: se ha una barriera biometrica il rosso del test la salta,
// e se è di grado alto il blu deve avere la fama per vederne il contratto di riavvio in bacheca
await red.do("devGrant", { bio: true });
await blue.do("devGrant", { fame: 1000 }); // i contratti di grado 4 chiedono 700 di fama
const corp = gen("corp", (n) => n.id !== org.id);
const sab = await red.do("devGrant", { mission: "sabotage" });
const sabNode = WORLD.nodes.find((n) => n.id === (sab.data as { nodeId: string }).nodeId) ?? corp;
const sabIp = sabNode.ip ?? red.state!.nodes.find((n) => n.id === (sab.data as { nodeId: string }).nodeId)!.ip;
await dial(sabIp);
await crack();
const sd = await red.do("sys", { cmd: "shutdown" });
await sleep(1300);
if (!sd.ok) console.log("  spegnimento:", sd.error, "· accesso", red.state!.op?.access);
check("sistema spento: la connessione cade", sd.ok && red.state!.op === null);
const back = await red.do("connect", { chain: ROUTE, targetIp: sabIp });
check("un sistema spento non risponde", !back.ok);
check("contratto di sabotaggio consegnato", (await red.do("deliver", { missionId: (sab.data as { id: string }).id })).ok);
await sleep(1300);
const rs = blue.state!.missions.find((m) => m.type === "restart");
check("ai blu arriva il contratto di riavvio", Boolean(rs));
if (rs) {
  await blue.do("take", { missionId: rs.id });
  await blue.do("connect", { chain: [rs.nodeId] });
  await blue.do("clientLogin");
  const r2 = await blue.do("restart");
  await blue.do("disconnect");
  check("il blu rimette in linea il sistema e consegna", r2.ok && (await blue.do("deliver", { missionId: rs.id })).ok);
}

console.log("== MISSIONI DI UPLINK: arresto e dati finanziari");
console.log("  calore accumulato:", me().heat, "capi d'accusa:", me().charges.length);
await red.do("devGrant", { cool: true });
const ar = (await red.do("devGrant", { mission: "arrest" })).data as { id: string; recordId: string; value: string };
await dial("10.200.1.1");
await crack();
await red.do("alter", { recordId: ar.recordId, field: "record", value: ar.value });
await red.do("alter", { recordId: ar.recordId, field: "status", value: "ricercato" });
await off();
check("arresto consegnato", (await red.do("deliver", { missionId: ar.id })).ok);
const fd = (await red.do("devGrant", { mission: "findata" })).data as { id: string; recordId: string };
const target = PEOPLE.find((p) => p.id === fd.recordId)!;
await dial(target.bank === "orsini-bank" ? "88.1.0.77" : "88.40.12.200");
await crack();
const hit = ((await red.do("searchRecords", { q: target.name })).data as { records: { account: { number: string } | null }[] }).records[0];
await off();
check("dati finanziari: conto trovato e consegnato", (await red.do("deliver", { missionId: fd.id, answer: hit?.account?.number })).ok);

console.log("== MERCATO A DUE CANALI");
const b0 = blue.state!.me.credits;
await blue.do("buyTool", { tool: "bdkit" });
await sleep(1300);
check("un blu compra il Kit Backdoor fuori canale, a 1,75 volte il prezzo", b0 - blue.state!.me.credits === Math.round(2000 * 1.75));
const r0 = me().credits;
await red.do("buyTool", { tool: "logdel" });
await sleep(1300);
check("uno strumento comune costa uguale per tutti", r0 - me().credits === Math.round(1100 * 2.5));

console.log("\n" + results.join("\n"));
process.exit(results.some((x) => x.startsWith("FAIL")) ? 1 : 0);
