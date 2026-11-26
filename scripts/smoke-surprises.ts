// Imprevisti durante le intrusioni: ognuno dei sei, le scelte, il caso quando non si sceglie, l'altro intruso
// giocatore o abitante, la versione dei blu.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";
import { WORLD } from "../server/worldgen.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = Extract<ServerMsg, { t: "res" }>;
const tag = Math.random().toString(36).slice(2, 6);
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
  const force = async (kind: string, roll: number | null = null) => {
    await act("surprise", { dev: true, roll });
    const r = await act("surprise", { dev: true, force: kind });
    await sleep(700);
    return r;
  };
  const choose = async (choice: string) => {
    const r = await act("surprise", { choice });
    await sleep(900);
    return r;
  };
  return { state: () => state!, act, force, choose };
}
const fails: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};
const corp = WORLD.nodes.find((n) => n.kind === "corp" && n.gen && !n.inner && !n.hidden && n.adminId && n.proxy + n.firewall + n.monitor <= 5)!;
const chain = ["r-sable", "r-kiln", corp.id];

const red = await bot("scasso", "red");
const pal = await bot("socio", "red");
const blue = await bot("ronda", "blue");
await sleep(500);
const gear = { xp: 6000, credits: 30000, tools: { proxy: 3, firewall: 3, monbypass: 3, breaker: 3, logdel: 3 }, hw: { cpu: 5, modem: 5, memory: 5 } };
for (const b of [red, pal, blue]) await b.act("devGrant", gear);
const connect = async (b: typeof red) => {
  if (b.state().op) await b.act("disconnect");
  await b.act("devGrant", { cool: true });
  await b.act("connect", { chain });
  await sleep(500);
};
const crack = async (b: typeof red) => {
  for (const t of ["monbypass", "proxy", "firewall"]) await b.act("run", { tool: t });
  await sleep(500);
  for (let i = 0; i < 100 && b.state().op?.tasks.some((k) => k.state === "run"); i += 1) await sleep(200);
  await b.act("run", { tool: "breaker" });
  await sleep(500);
  for (let i = 0; i < 100 && b.state().op?.tasks.some((k) => k.state === "run"); i += 1) await sleep(200);
  await sleep(400);
};

// ---- l'amministratore
await connect(red);
let f = await red.force("admin", 0);
let s = red.state().op?.surprise;
check("in orario d'ufficio l'amministratore si collega: tre scelte e il tempo per scegliere", f.ok && s?.kind === "admin" && s.choices.map((c) => c.id).join() === "bluff,drop,silent" && s.until > Date.now());
await red.choose("bluff");
s = red.state().op?.surprise;
check("il bluff riesce: se ne va, e per un po' nessuno guarda", s?.result?.tone === "ok" && red.state().op!.frozenUntil > Date.now() + 5000 && (red.state().me.counters["sur:bluff"] ?? 0) === 1);
await red.force("admin", 0.99);
await red.choose("bluff");
const op1 = red.state().op!;
check("il bluff fallisce: il trace fa un balzo e il sistema va in allerta", red.state().op?.surprise?.result?.tone === "bad" && op1.trace.progressMs !== null && op1.trace.progressMs > 0 && op1.target.alert);
await connect(red);
const heat0 = red.state().me.heat;
await red.force("admin", 0.99);
await red.choose("silent");
check("resti zitto, e ti chiude la sessione: fuori, e calore in più", red.state().op === null && red.state().me.heat >= heat0 + 8);

// ---- il riavvio
await connect(red);
await red.force("reboot");
check("riavvio: rimandarlo serve l'accesso admin", !(await red.act("surprise", { choice: "postpone" })).ok);
await red.choose("rush");
s = red.state().op?.surprise;
check("finisci in fretta: resta solo la scelta di staccare", Boolean(s) && s!.choices.map((c) => c.id).join() === "drop" && Boolean(s!.deadline));
await red.act("surprise", { dev: true, expire: 300 });
await sleep(2500);
check("e al riavvio la linea cade", red.state().op === null);
await connect(red);
await crack(red);
check("(da admin per le prove che seguono)", red.state().op?.access === "admin");
await red.force("reboot", 0.99);
await red.choose("postpone");
await red.act("surprise", { dev: true, expire: 300 });
await sleep(2000);
check("da admin il riavvio si rimanda, e resti dentro", red.state().op !== null && red.state().op?.surprise?.result?.tone === "ok");

// ---- un altro intruso: un abitante
await red.force("rival", 0.99);
s = red.state().op?.surprise;
check("non sei solo: un abitante è già dentro", s?.kind === "rival" && s.choices.map((c) => c.id).join() === "follow,kick,ignore");
const known0 = red.state().me.knownNodes;
await red.choose("follow");
check("seguirlo insegna dove va dopo", /Era /.test(red.state().op?.surprise?.result?.text ?? "") && red.state().me.knownNodes >= known0 + 1 && (red.state().me.counters["sur:rival"] ?? 0) === 1);
await red.force("rival", 0.99);
await red.choose("ignore");
check("ignorarlo costa un trace più rapido per un minuto", /trace corre/.test(red.state().op?.surprise?.result?.text ?? ""));

// ---- un altro intruso: un giocatore
await connect(pal);
await red.force("rival", 0.99);
s = red.state().op?.surprise;
check("con un giocatore sullo stesso sistema", s?.kind === "rival" && Boolean(pal.state().op));
await red.choose("kick");
check("chiudergli la porta lo butta fuori", pal.state().op === null && /Chiudi fuori socio_/.test(red.state().op?.surprise?.result?.text ?? ""));

// ---- i blu
await connect(blue);
await blue.force("rival", 0.99);
s = blue.state().op?.surprise;
check("anche un blu trova l'intruso, e può tracciarlo", s?.kind === "rival" && s.choices.map((c) => c.id).join() === "trace,ignore");
await blue.choose("trace");
check("tracciato: l'indirizzo del rosso finisce nella rubrica del blu", blue.state().me.known.some((k) => k.ip === red.state().me.gatewayIp));
await blue.act("disconnect");

// ---- controllo a campione, linea disturbata, segnalatore
// il blu ha appena accelerato il trace del rosso: se nel frattempo l'ha preso, si ricollega
if (!red.state().op) await connect(red);
await red.force("patrol", 0.99);
await red.choose("wait");
check("controllo a campione: fermarsi ferma anche il trace", red.state().op!.frozenUntil > Date.now() + 8000);
await red.force("patrol", 0.99);
await red.act("surprise", { dev: true, expire: 0 });
await sleep(2500);
check("se non scegli decide il caso: stavolta non nota niente", /Non nota niente/.test(red.state().op?.surprise?.result?.text ?? ""));
await red.force("static", 0);
await red.choose("push");
check("linea disturbata: tenere duro a volte la fa cadere", red.state().op === null);
await connect(red);
await red.force("canary", 0);
check("il file chiama casa: rimbalzarlo serve le chiavi di un relay", red.state().op?.surprise?.choices.find((c) => c.id === "bounce")?.why !== null);
await red.choose("cut");
check("tagliare la linea in tempo lo ferma", red.state().op === null && (red.state().me.counters["sur:canary"] ?? 0) === 1);
await connect(red);
const h1 = red.state().me.heat;
await red.force("canary", 0.99);
await red.choose("let");
await sleep(600);
check("lasciar correre: calore in più, e i blu sanno dove sei", red.state().me.heat >= h1 + 15 && blue.state().me.known.some((k) => k.ip === red.state().me.gatewayIp));
check("ogni imprevisto conta", (red.state().me.counters["sur:seen"] ?? 0) >= 12);

// ---- da soli: dopo i primi secondi di una connessione, uno fra quelli possibili lì e in quel momento
await red.act("surprise", { dev: true, auto: true, chance: 1, roll: null });
await connect(red);
for (let i = 0; i < 40 && !red.state().op?.surprise; i += 1) await sleep(500);
s = red.state().op?.surprise;
check("gli imprevisti arrivano anche da soli, scelti fra quelli possibili qui (di giorno: niente controllo notturno)", Boolean(s) && ["admin", "rival", "reboot", "static"].includes(s!.kind));
await red.act("surprise", { dev: true, auto: false });

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
