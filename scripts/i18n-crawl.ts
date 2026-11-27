// Giro del gioco in inglese con Chromium senza finestra: un rosso e un blu con un po' di mondo intorno, ogni scheda e
// ogni sottoscheda, una connessione aperta. Raccoglie le frasi italiane rimaste senza traduzione (aetherMissing()
// in client/src/i18n.ts) e, se si dà una cartella, fotografa ogni vista.
// Uso: npm run build, poi
//   AETHER_DEV=1 AETHER_FAST=1 AETHER_DB=/tmp/giro.db AETHER_PORT=7490 node server/main.ts &
//   node scripts/i18n-crawl.ts 7490 mancanti.json [cartella foto]
import WebSocket from "ws";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GameState, ServerMsg } from "../shared/types.ts";
import { WORLD } from "../server/worldgen.ts";

const port = process.argv[2] ?? "7490";
const outFile = process.argv[3] ?? "mancanti.json";
const shots = process.argv[4];
if (shots) mkdirSync(shots, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = Extract<ServerMsg, { t: "res" }>;
const log = (s: string) => console.log(`· ${s}`);

async function player(handle: string, faction: "red" | "blue") {
  let state: GameState | null = null;
  let token = "";
  let seq = 0;
  const pending = new Map<number, (m: Res) => void>();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise<void>((r) => {
    ws.on("open", () => ws.send(JSON.stringify({ t: "auth", mode: "register", handle, pass: "giro123456", faction, lang: "en" })));
    ws.on("message", (raw) => {
      const m = JSON.parse(String(raw)) as ServerMsg;
      if (m.t === "state") state = { ...m.s, nodes: m.s.nodes ?? state?.nodes ?? [] } as GameState;
      if (m.t === "res") pending.get(m.id)?.(m);
      if (m.t === "auth_ok") (token = m.token), r();
      if (m.t === "auth_err") throw new Error(m.error);
    });
  });
  const act = async (a: string, p: Record<string, unknown> = {}) => {
    await sleep(70);
    return new Promise<Res>((r) => {
      const id = ++seq;
      pending.set(id, r);
      ws.send(JSON.stringify({ t: "do", id, a, p }));
    });
  };
  return { act, token: () => token, state: () => state! };
}

const tag = Math.random().toString(36).slice(2, 5);
const red = await player(`Glossa_${tag}`, "red");
const blue = await player(`Lessico_${tag}`, "blue");
log("attrezzatura e un po' di mondo");
const gear = { xp: 9000, credits: 120000, fame: 30, tools: { proxy: 3, firewall: 3, breaker: 3, monbypass: 3, decrypt: 3, logdel: 3, tracker: 3, wardialer: 3, dict: 3, worm: 3, bdkit: 3 }, hw: { cpu: 5, modem: 5, memory: 5, shield: 4 }, gadget: "microcassette" };
for (const p of [red, blue]) await p.act("devGrant", gear);
for (const region of ["eu", "na", "as"]) {
  await red.act("wardial", { region });
  await sleep(1500);
}
const orgNodes = WORLD.nodes.filter((n) => ["corp", "bank", "telco", "lab", "news"].includes(n.kind) && !n.inner && !n.hidden);
for (const [i, n] of orgNodes.slice(0, 6).entries()) await red.act("world", { cmd: "dev", id: n.id, event: i % 2 ? "sabotaggio" : "furto", times: 2 });
for (const [h, w] of [["Vex", "red"], ["Sentinel", "blue"], ["Ohm", "bbs"]] as const) await red.act("life", { cmd: "force", handle: h, what: w, free: true, heat: 0 });
await red.act("bbs", { cmd: "call", bbs: "sottosuolo" });

// ---------------------------------------------------------------- Chromium
const prof = mkdtempSync(join(tmpdir(), "aether-giro-"));
const W = 1440;
const H = 900;
const chrome = spawn("chromium", ["--headless=new", "--remote-debugging-port=9556", `--user-data-dir=${prof}`, `--window-size=${W},${H}`, "--hide-scrollbars", "--mute-audio", "--no-first-run", "about:blank"], { stdio: "ignore" });
let pageWs = "";
for (let i = 0; i < 50 && !pageWs; i += 1) {
  await sleep(200);
  try {
    const list = (await (await fetch("http://127.0.0.1:9556/json")).json()) as { type: string; webSocketDebuggerUrl: string }[];
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
let n = 0;
async function shot(name: string) {
  if (!shots) return;
  await sleep(300);
  const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 70 });
  writeFileSync(join(shots, `${String(++n).padStart(3, "0")}-${name}.jpg`), Buffer.from(String(r.data), "base64"));
}
const missing = new Set<string>();
const collect = async () => {
  for (const s of ((await js(`window.aetherMissing ? window.aetherMissing() : []`)) as string[]) ?? []) missing.add(s);
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
await sleep(1500);
await js(`localStorage.setItem("aether.lang", "en"); localStorage.setItem("aether.cine", "off"); localStorage.setItem("aether.audio", "off"); true`);
await send("Page.reload");
await sleep(2500);
await shot("access");
await js(`[...document.querySelectorAll(".access .tabs button")].forEach((b) => b.click()); true`);
await collect();

/** Ogni scheda del deck, e dentro ogni gruppo di sottoschede. */
async function tour(who: string) {
  const tabs = Number(await js(`document.querySelectorAll(".nav button").length`));
  for (let i = 0; i < tabs; i += 1) {
    await js(`document.querySelectorAll(".nav button")[${i}].click(); window.scrollTo(0, 0); true`);
    await sleep(1100);
    const name = String(await js(`document.querySelectorAll(".nav button")[${i}].textContent.trim().split(/\\s/)[0]`));
    await shot(`${who}-${name}`);
    const groups = Number(await js(`document.querySelectorAll("main .tabs").length`));
    for (let g = 0; g < groups; g += 1) {
      const bs = Number(await js(`document.querySelectorAll("main .tabs")[${g}]?.querySelectorAll("button").length ?? 0`));
      for (let b = 1; b < bs; b += 1) {
        await js(`document.querySelectorAll("main .tabs")[${g}]?.querySelectorAll("button")[${b}]?.click(); true`);
        await sleep(800);
        await shot(`${who}-${name}-${g}${b}`);
        await collect();
      }
      await js(`document.querySelectorAll("main .tabs")[${g}]?.querySelectorAll("button")[0]?.click(); true`);
    }
    await collect();
  }
}

for (const [who, p] of [["red", red], ["blue", blue]] as const) {
  log(`giro: ${who}`);
  await js(`localStorage.setItem("aether.token", ${JSON.stringify(p.token())}); true`);
  await send("Page.reload");
  await sleep(3500);
  await tour(who);
  // ogni lettera della posta
  const mailTab = Number(await js(`[...document.querySelectorAll(".nav button")].findIndex((b) => b.textContent.trim().startsWith("Mail"))`));
  if (mailTab >= 0) {
    await js(`document.querySelectorAll(".nav button")[${mailTab}].click(); true`);
    await sleep(700);
    const mails = Number(await js(`document.querySelectorAll(".mail-item").length`));
    for (let i = 0; i < mails; i += 1) {
      await js(`document.querySelectorAll(".mail-item")[${i}].click(); true`);
      await sleep(250);
      if (i < 3) await shot(`${who}-mail-${i}`);
      await collect();
    }
  }
  // la mappa con alcune schede di nodi, poi una connessione nella console
  await js(`document.querySelectorAll(".nav button")[0].click(); true`);
  await sleep(700);
  const nodes = Math.min(25, Number(await js(`document.querySelectorAll("button.map-node").length`)));
  for (let i = 0; i < nodes; i += 1) {
    await js(`document.querySelectorAll("button.map-node")[${i}]?.click(); true`);
    await sleep(200);
    await collect();
  }
  await js(`document.querySelectorAll(".nav button")[0].click(); true`);
  await sleep(700);
  await js(`document.querySelector("button.map-node")?.click(); true`);
  await sleep(700);
  await shot(`${who}-nodo`);
  await collect();
  const corp = WORLD.nodes.find((x) => x.kind === "corp" && !x.inner && !x.hidden)!;
  await p.act("devGrant", { cool: true });
  await p.act("connect", { chain: ["r-sable", "r-kiln", corp.id] });
  await sleep(800);
  await js(`document.querySelectorAll(".nav button")[1].click(); true`);
  await sleep(1200);
  await shot(`${who}-console`);
  await collect();
  await p.act("disconnect");
}

chrome.kill();
const list = [...missing].sort();
writeFileSync(outFile, JSON.stringify(list, null, 1));
log(`${list.length} frasi senza traduzione in ${outFile}`);
process.exit(0);
