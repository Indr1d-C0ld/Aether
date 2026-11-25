// Vetrine per il README: prepara un mondo di prova pieno di cose e fotografa le viste con Chromium senza finestra.
// Uso: npm run build, poi
//   AETHER_DEV=1 AETHER_FAST=1 AETHER_DB=/tmp/vetrina.db AETHER_PORT=7480 node server/main.ts &
//   node scripts/showcase.ts 7480 [cartella]        (predefinita: docs/img)
// Le immagini escono in JPEG a 2160×1350 (1440×900 a densità 1,5).
import WebSocket from "ws";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GameState, ServerMsg } from "../shared/types.ts";
import type { BbsHome } from "../shared/bbs.ts";
import type { LabView } from "../shared/malware.ts";
import { WORLD } from "../server/worldgen.ts";
import { PEOPLE } from "../server/people.ts";

const port = process.argv[2] ?? "7480";
const out = process.argv[3] ?? "docs/img";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = Extract<ServerMsg, { t: "res" }>;

// ---------------------------------------------------------------- il giocatore della vetrina
let state: GameState | null = null;
let token = "";
let seq = 0;
const pending = new Map<number, (m: Res) => void>();
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
await new Promise<void>((r) => {
  ws.on("open", () => ws.send(JSON.stringify({ t: "auth", mode: "register", handle: "Morgana", pass: "vetrina1234", faction: "red" })));
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw)) as ServerMsg;
    if (m.t === "state") state = { ...m.s, nodes: m.s.nodes ?? state?.nodes ?? [] } as GameState;
    if (m.t === "res") pending.get(m.id)?.(m);
    if (m.t === "auth_ok") (token = m.token), r();
    if (m.t === "auth_err") throw new Error(m.error);
  });
});
const act = (a: string, p: Record<string, unknown> = {}) =>
  new Promise<Res>((r) => {
    const id = ++seq;
    pending.set(id, r);
    ws.send(JSON.stringify({ t: "do", id, a, p }));
  });
/** Il server chiude chi manda più di 30 messaggi al secondo: qui si va piano. */
const slow = async (a: string, p: Record<string, unknown> = {}) => {
  await sleep(60);
  return act(a, p);
};
const idle = async () => {
  await sleep(500);
  for (let i = 0; i < 200 && state!.op?.tasks.some((k) => k.state === "run"); i += 1) await sleep(200);
  await sleep(300);
};
const log = (s: string) => console.log(`· ${s}`);

log("attrezzatura");
await act("devGrant", { xp: 9000, credits: 120000, fame: 30, tools: { proxy: 3, firewall: 3, breaker: 3, monbypass: 3, decrypt: 3, logdel: 3, tracker: 3, wardialer: 3, dict: 3, worm: 3, bdkit: 3 }, hw: { cpu: 5, modem: 5, memory: 5, shield: 4 }, gadget: "microcassette", clock: null });
await sleep(800);

log("mappa: scansioni col War Dialer");
for (let round = 0; round < 3; round += 1)
  for (const region of ["eu", "na", "as", "sa", "af", "oc"]) {
    await slow("wardial", { region });
    await sleep(1700);
  }

log("mondo: colpi, guerre, aperture, abitanti");
const orgNodes = WORLD.nodes.filter((n) => ["corp", "bank", "telco", "lab", "news"].includes(n.kind) && !n.inner && !n.hidden);
for (const [i, n] of orgNodes.slice(0, 8).entries()) await slow("world", { cmd: "dev", id: n.id, event: i % 3 === 0 ? "sabotaggio" : "furto", times: 1 + (i % 3) });
await slow("world", { cmd: "dev", id: orgNodes[9]!.id, set: { fear: 90, cash: 90000 }, pulses: 6 });
await slow("world", { cmd: "dev", id: orgNodes[10]!.id, set: { cash: -300 }, pulses: 6 });
const warA = orgNodes[11]!;
const rival = (((await slow("world", { cmd: "org", id: warA.id })).data as { rivals: { id: string }[] }).rivals[0] ?? { id: orgNodes[12]!.id }).id;
await slow("world", { cmd: "dev", id: warA.id, set: { rivals: { [rival]: 4 } }, event: "furto", times: 30 });
for (let i = 0; i < 3; i += 1) await slow("world", { cmd: "found" });
for (const [h, w] of [["Vex", "red"], ["Mantis", "red"], ["Sentinel", "blue"], ["Ohm", "bbs"], ["Nyx_77", "bbs"], ["Kestrel", "bbs"], ["Halberd", "blue"], ["Tsuki", "red"], ["Pixel", "bbs"], ["Baud", "bbs"]] as const) await slow("life", { cmd: "force", handle: h, what: w, free: true, heat: 0 });

log("BBS: un utente fidato del Sottosuolo");
await slow("bbs", { cmd: "call", bbs: "sottosuolo" });
await slow("bbs", { cmd: "dev", bbs: "sottosuolo", days: 7, posts: 9, uploads: 4, kb: 420 });
await slow("bbs", { cmd: "post", bbs: "sottosuolo", area: "tecnica", title: "Seguire la notte, istruzioni per l'uso", body: "Asia nel nostro pomeriggio, Europa dopo cena, America all'alba. Guardate l'ombra sulla mappa e lavorate dove è buio.\nE dormite di giorno, che i blu fanno i turni." });
await slow("bbs", { cmd: "oneliner", bbs: "sottosuolo", text: "segui l'ombra" });
await slow("bbs", { cmd: "bye" });

log("il BBS di Morgana");
await slow("bbs", { cmd: "own:open", name: "Zona Franca", tagline: "Aperto la notte, chiuso di giorno.", banner: "  _______  _____  _   _    _\n |___  / |/ _ \\ \\| \\ | |  / \\\n    / /| | | | |  \\| | / _ \\\n   / /_| | |_| | |\\  |/ ___ \\\n  /____|_|\\___/|_| \\_/_/   \\_\\  F R A N C A\n\n  sysop Morgana  ·  14.400  ·  dalle 22 alle 6", motd: "Qui si parla di colpi, non di indirizzi. Chi scarica, carica. Il sysop legge tutto.", areas: ["generale", "tecnica", "colpi", "soffiate", "compravendita"], door: "mercante" });
for (let i = 0; i < 3; i += 1) await slow("bbs", { cmd: "own:dev", npc: true });
for (const h of ["Mantis", "Nyx_77", "Vex", "Tsuki", "Corax"]) await slow("life", { cmd: "force", handle: h, what: "bbs" });
const zf = ((await slow("bbs", { cmd: "own:view" })).data as { id: string }).id;
await slow("bbs", { cmd: "call", bbs: zf });
await slow("bbs", { cmd: "post", bbs: zf, area: "generale", title: "Benvenuti in Zona Franca", body: "Aperto la notte, chiuso di giorno. Presentatevi qui, poi fate quello che volete.\nChi carica roba buona in area file ha i minuti che vuole." });
await slow("bbs", { cmd: "post", bbs: zf, area: "colpi", title: "Lumen News, l'altra notte", body: "Due relay, proxy giù in otto secondi, password da dizionario. Il turno di notte guardava la tv.\nNiente nomi, niente orari. Come da regole." });
await slow("bbs", { cmd: "post", bbs: zf, area: "tecnica", title: "Griglia del firewall: si parte dal centro", body: "Sempre dal centro. E se vi avanzano due sonde, il log resta pulito." });
await slow("bbs", { cmd: "oneliner", bbs: zf, text: "aperti dalle 22. il caffè lo portate voi" });
await slow("bbs", { cmd: "bye" });
for (let i = 0; i < 12; i += 1) await slow("life", { cmd: "force", handle: ["Mantis", "Nyx_77", "Vex", "Tsuki", "Corax", "Blackbird"][i % 6], what: "bbs" });
await slow("bbs", { cmd: "own:dev", set: { fame: 23, heat: 31 } });

log("laboratorio: antivirus e tre creature");
await slow("mw", { cmd: "dev", mods: { "v-rat": 1, "v-trojan": 1, "v-worm": 1, "c-spia": 1, "c-botnet": 1, "c-dialer": 1, "i-rootkit": 1, "i-poli": 1, "i-cripta": 1, "t-notte": 2, "t-venerdi": 1, "t-ritardo": 1, "v-macro": 1, "c-exfil": 1 }, av: 2, kit: 1 });
await slow("mw", { cmd: "dev", mods: { "i-rootkit": 2 } });
await slow("mw", { cmd: "build", name: "Lettera Rossa", mods: { vettore: "v-rat", carico: "c-spia", involucro: "i-rootkit", innesco: "t-notte" } });
await slow("mw", { cmd: "build", name: "Venerdi 17", mods: { vettore: "v-worm", carico: "c-botnet", involucro: "i-poli", innesco: "t-venerdi" } });
await slow("mw", { cmd: "build", name: "Regalo di Natale", mods: { vettore: "v-trojan", carico: "c-dialer", involucro: "i-cripta", innesco: "t-ritardo" } });

log("una creatura al lavoro in un sistema");
await act("devGrant", { cool: true });
await act("connect", { chain: ["r-sable", "r-kiln", "lumen-news"] });
await sleep(500);
await act("run", { tool: "proxy" });
await act("run", { tool: "monbypass" });
await idle();
await act("login", { password: "SIGNAL" });
await sleep(400);
const lab0 = (await act("mw", { cmd: "lab" })).data as LabView;
const rat = lab0.builds.find((b) => b.name === "Lettera Rossa");
if (rat) await act("mw", { cmd: "plant", build: rat.id });
await act("disconnect");
for (let i = 0; i < 6; i += 1) await slow("mw", { cmd: "dev", pulse: true });

log("persone, crew, copertura, Borsa, commissione");
const people = WORLD.nodes.filter((n) => n.kind === "corp" && n.adminId).slice(0, 6).map((n) => n.adminId!);
for (const [i, pid] of people.entries()) await slow("cit", { cmd: "dev", id: pid, meet: true, set: { debt: [6200, 300, 9100, 1200, 4400, 800][i], fired: i === 3 ? WORLD.nodes.find((n) => n.adminId === pid)!.id : null, firedAt: Date.now() } });
await slow("cit", { cmd: "investigate", id: people[0] });
await slow("cit", { cmd: "investigate", id: people[2] });
await slow("life", { cmd: "join", gang: "k2600" });
for (const h of ["Mantis", "Nyx_77", "Corax"]) await slow("life", { cmd: "gift", handle: h });
await slow("life", { cmd: "favor", handle: "Ohm", value: 64 });
await slow("front", { cmd: "found", kind: "arcade", name: "Sala Giochi Zenit" });
await slow("front", { cmd: "dev", set: { till: 2340, level: 1, earned: 18400 } });
await slow("stock", { cmd: "dev", pulses: 90 });
const listing = ((await slow("stock")).data as { rows: { id: string; open: boolean }[] }).rows.filter((r) => r.open);
if (listing[0]) await slow("stock", { cmd: "buy", id: listing[0].id, n: 100 });
if (listing[3]) await slow("stock", { cmd: "sell", id: listing[3].id, n: 50 });
const known = state!.nodes.filter((n) => ["corp", "bank"].includes(n.kind));
if (known[0]) await slow("postJob", { goal: "copy", nodeId: known[0].id, conds: ["ghost", "notte"], reward: 4200, hours: 12 });

// ---------------------------------------------------------------- Chromium senza finestra
const prof = mkdtempSync(join(tmpdir(), "aether-vetrina-"));
const W = 1440;
const H = 900;
const chrome = spawn("chromium", ["--headless=new", "--remote-debugging-port=9555", `--user-data-dir=${prof}`, `--window-size=${W},${H}`, "--hide-scrollbars", "--mute-audio", "--no-first-run", "about:blank"], { stdio: "ignore" });
let pageWs = "";
for (let i = 0; i < 50 && !pageWs; i += 1) {
  await sleep(200);
  try {
    const list = (await (await fetch("http://127.0.0.1:9555/json")).json()) as { type: string; webSocketDebuggerUrl: string }[];
    pageWs = list.find((x) => x.type === "page")?.webSocketDebuggerUrl ?? "";
  } catch {
    /* non ancora pronto */
  }
}
const cdp = new WebSocket(pageWs);
await new Promise((r) => cdp.on("open", r));
let cid = 0;
const waiting = new Map<number, (v: Record<string, unknown>) => void>();
cdp.on("message", (raw) => {
  const m = JSON.parse(String(raw)) as { id?: number; result?: Record<string, unknown> };
  if (m.id) waiting.get(m.id)?.(m.result ?? {});
});
const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise<Record<string, unknown>>((r) => {
    const id = ++cid;
    waiting.set(id, r);
    cdp.send(JSON.stringify({ id, method, params }));
  });
const js = async (expr: string) => ((await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result as { value?: unknown } | undefined)?.value;
const click = (label: string) => js(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(${JSON.stringify(label)})); if (b) b.click(); window.scrollTo(0, 0); document.querySelector("main")?.scrollTo?.(0, 0); return Boolean(b); })()`);
async function shot(name: string, scrollSel?: string, clip?: { width: number }, wait = 900) {
  if (scrollSel) await js(`document.querySelector(${JSON.stringify(scrollSel)})?.scrollIntoView({ block: "start" })`);
  await sleep(wait);
  const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 86, ...(clip ? { clip: { x: 0, y: 0, width: clip.width, height: H, scale: 1 } } : {}) });
  writeFileSync(join(out, `${name}.jpg`), Buffer.from(String(r.data), "base64"));
  log(`foto: ${name}.jpg`);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1.5, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
await sleep(1500);
await js(`localStorage.setItem("aether.cine", "off"); localStorage.setItem("aether.audio", "off"); true`);
await send("Page.reload");
await sleep(2500);
await shot("accesso");
await js(`document.querySelector(".devlog-head")?.closest("section, .panel, div")?.scrollIntoView({ block: "start" }); true`);
await shot("devlog");
await js(`localStorage.setItem("aether.token", ${JSON.stringify(token)}); localStorage.setItem("aether.cine", "off"); localStorage.setItem("aether.audio", "off"); true`);
await send("Page.reload");
await sleep(3500);
await js(`(() => { const st = document.createElement("style"); st.textContent = ".toasts { display: none !important; }"; document.head.appendChild(st); return true; })()`);

await click("Mappa");
await shot("notte");
await click("Cronaca");
await sleep(1200);
await js(`[...document.querySelectorAll(".linklike")].find((x) => x.textContent.trim() === "scheda")?.click(); true`);
await shot("cronaca");
await click("Persone");
await shot("persone");
await click("Affari");
await shot("affari");
await click("Laboratorio");
await sleep(800);
for (const label of ["Macro virus", "Esfiltratore", "Rootkit", "Turno di notte"]) await js(`[...document.querySelectorAll(".lab-mod-pick")].find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)}))?.click(); true`);
await js(`(() => { const i = document.querySelector('input[aria-label="Nome della creatura"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, "Cassandra"); i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
await shot("laboratorio", ".lab-slots");
await click("Mercato");
await sleep(500);
await click("Taglie");
await sleep(600);
for (const label of ["Senza lasciare tracce", "Solo di notte"]) await js(`[...document.querySelectorAll("label")].find((l) => l.textContent.includes(${JSON.stringify(label)}))?.querySelector("input")?.click(); true`);
await shot("commissioni", ".panel:last-of-type");
await click("Mercato nero");
await shot("ricettatore", ".fence-grid");
await click("BBS");
await sleep(800);
await click("Chiama");
await sleep(3500);
await shot("bbs");
await js(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "G" })); true`);
await sleep(1500);
await js(`[...document.querySelectorAll(".panel-head .label")].find((x) => x.textContent.startsWith("Il tuo BBS"))?.closest(".panel")?.scrollIntoView({ block: "start" }); true`);
await shot("sysop");
await js(`[...document.querySelectorAll(".panel-head button")].find((b) => b.textContent.trim() === "Chiama")?.click(); true`);
await sleep(3500);
await js(`window.scrollTo(0, 0); true`);
await shot("bbs-giocatore");
await js(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "G" })); true`);

// la barriera biometrica: una banca con impronta vocale, il campione dal registratore, l'oscilloscopio aperto
log("console: barriera biometrica");
const bank = "g-bank-3";
await act("devGrant", { cool: true });
await act("connect", { chain: state!.nodes.filter((n) => n.kind === "relay").slice(0, 3).map((n) => n.id).concat(bank) });
await sleep(500);
await act("run", { tool: "monbypass" });
await act("run", { tool: "proxy" });
await idle();
const cassette = state!.me.storage.find((s) => s.item?.code === "microcassette");
if (cassette) await act("useItem", { key: cassette.key });
await act("scope", { act: "open" });
await click("Console");
await sleep(800);
await js(`[...document.querySelectorAll("button")].filter((b) => /Frequenza: più|Ampiezza: più/.test(b.getAttribute("aria-label") ?? "")).forEach((b) => b.click()); true`);
await shot("oscilloscopio", ".sec-grid", { width: 900 });
await act("disconnect");

// ---------------------------------------------------------------- le scene delle immagini più vecchie
const setInput = (sel: string, value: string) => js(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
const enter = async (chain: string[], login?: string) => {
  if (state!.op) await act("disconnect");
  await act("devGrant", { cool: true });
  await act("connect", { chain });
  await sleep(500);
  await act("run", { tool: "monbypass" });
  if (!state!.op?.bypass.proxy) await act("run", { tool: "proxy" });
  if (!state!.op?.bypass.firewall) await act("run", { tool: "firewall" });
  await idle();
  if (login) await act("login", { password: login });
  await sleep(500);
};
const relays = state!.nodes.filter((n) => n.kind === "relay").slice(0, 4).map((n) => n.id);

log("carriera");
await click("Carriera");
await shot("carriera");

log("ReticoloNet");
await click("IRC");
await sleep(2500);
for (const t of ["ciao a tutti", "qualcuno ha visto passare un worm su #2600?", "/me accende il modem e aspetta la portante", "X: chi presidia la Orsini stanotte?", "buonasera, c'è nessuno sveglio?"]) {
  await slow("irc", { text: t, where: "#reticolo" });
  await sleep(1800);
}
await sleep(4000);
await shot("irc");

log("crew, duello e scambio");
const pal = new WebSocket(`ws://127.0.0.1:${port}/ws`);
let palSeq = 0;
const palPending = new Map<number, (m: Res) => void>();
await new Promise<void>((r) => {
  pal.on("open", () => pal.send(JSON.stringify({ t: "auth", mode: "register", handle: "Nyxie", pass: "vetrina1234", faction: "red" })));
  pal.on("message", (raw) => {
    const m = JSON.parse(String(raw)) as ServerMsg;
    if (m.t === "res") palPending.get(m.id)?.(m);
    if (m.t === "auth_ok") r();
  });
});
const palAct = async (a: string, p: Record<string, unknown> = {}) => {
  await sleep(80);
  return new Promise<Res>((r) => {
    const id = ++palSeq;
    palPending.set(id, r);
    pal.send(JSON.stringify({ t: "do", id, a, p }));
  });
};
await palAct("devGrant", { xp: 3000, credits: 20000, item: "x" });
await slow("crewCreate", { tag: "ZDY", name: "Zero Day" });
await slow("crewMotto", { text: "entriamo di notte, usciamo puliti" });
await slow("crewInvite", { handle: "Nyxie" });
await palAct("crewJoin", { tag: "ZDY" });
await palAct("duelOffer", { handle: "Morgana", stake: 2000 });
await sleep(1000);
const palStore = (await palAct("devGrant", { xp: 0 })) && null;
void palStore;
await click("Crew");
await sleep(1200);
await shot("crew");

log("operazioni accettate");
await slow("devGrant", { mission: "scene:zerocool" });
await slow("devGrant", { mission: "scene:timeo" });
await click("Bacheca");
await sleep(1200);
await shot("operazioni");

log("mappa con il rimbalzo");
await enter([...relays, "orsini-bank"]);
await click("Mappa");
await sleep(1200);
await shot("mappa");

log("strumenti al lavoro");
await act("disconnect");
await act("devGrant", { cool: true, hw: { cpu: 1 } });
await act("connect", { chain: [...relays.slice(0, 2), "meridia-pd"] });
await sleep(400);
for (const t of ["monbypass", "proxy", "firewall"]) await act("run", { tool: t });
await click("cine");
await click("Console");
await shot("strumenti", undefined, undefined, 1800);

log("password breaker");
await act("devGrant", { hw: { cpu: 5 } });
await idle();
await act("devGrant", { hw: { cpu: 1 } });
await act("run", { tool: "breaker" });
await sleep(3500);
await js(`window.scrollTo(0, 0); true`);
await shot("password", ".sec-grid", undefined, 600);
await click("cine");
await act("devGrant", { hw: { cpu: 5 } });
await idle();
await act("disconnect");

log("anagrafe");
await enter([...relays.slice(0, 2), "vesper-civic"], "CIVIC");
await click("Console");
await sleep(1000);
await setInput('input[placeholder^="nome, anno di nascita"]', "19");
await js(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Cerca")?.click(); true`);
await sleep(1500);
await js(`document.querySelectorAll(".archive-row")[1]?.click(); true`);
await sleep(1500);
await js(`document.querySelector('input[placeholder^="nome, anno di nascita"]')?.closest(".panel")?.scrollIntoView({ block: "start" }); true`);
await shot("schedario");
await act("disconnect");

log("sottosistemi e posta interna");
const corpN = WORLD.nodes.find((n) => n.kind === "corp" && n.adminId && !n.inner && n.proxy + n.firewall + n.monitor <= 6)!;
const boss = PEOPLE.find((p) => p.id === corpN.adminId)!;
const personal = `${boss.name.split(" ")[0]!.toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "")}${String(boss.born).slice(2)}`;
await enter([...relays.slice(0, 2), corpN.id], personal);
await click("Console");
await sleep(1000);
await js(`[...document.querySelectorAll(".zone")].find((b) => b.textContent.includes("Posta interna"))?.click(); true`);
await sleep(1500);
await js(`document.querySelector(".zone-body button")?.click(); true`);
await sleep(1200);
await shot("sottosistemi", ".zones");
await act("disconnect");

log("trace al limite");
await act("devGrant", { cool: true });
await act("connect", { chain: [relays[0]!, "orsini-bank"] });
await sleep(400);
await act("run", { tool: "proxy" });
await click("Console");
for (let i = 0; i < 600; i += 1) {
  await sleep(100);
  const tr = state!.op?.trace;
  if (!state!.op) break;
  if (tr?.totalMs && tr.progressMs && tr.progressMs / tr.totalMs >= 0.8) break;
}
await js(`window.scrollTo(0, 0); true`);
await shot("trace", undefined, undefined, 150);
await act("disconnect");
pal.close();

void (null as unknown as LabView | BbsHome);
cdp.close();
chrome.kill();
ws.close();
log("fatto");
process.exit(0);
