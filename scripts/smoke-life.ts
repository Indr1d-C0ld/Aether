// L'orologio del mondo e la sua gente: orari d'ufficio, notte, centralino, e gli habitué che agiscono
// davvero (colpi, ceppi, ronde, arresti) e lo raccontano.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";
import type { BbsHome, BbsThreadRow } from "../shared/bbs.ts";
import { darkness, dayPart, localHour, opensIn, staffed, statusLine } from "../shared/clock.ts";
import { PERSONAS, THREADS, CHAT_BY_PART, NEWS_BY_PART, REPLIES } from "../server/life-text.ts";
import { WORLD } from "../server/worldgen.ts";
import { PEOPLE } from "../server/people.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = Extract<ServerMsg, { t: "res" }>;
let state: GameState | null = null;
let seq = 0;
const pending = new Map<number, (m: Res) => void>();
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
await new Promise<void>((r) => {
  ws.on("open", () => ws.send(JSON.stringify({ t: "auth", mode: "register", handle: `life_${Math.random().toString(36).slice(2, 6)}`, pass: "segreto123", faction: "red" })));
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

// ---- l'orologio, senza server: mercoledì 25 novembre 2026
const at = (h: number, m = 0, day = 25) => Date.UTC(2026, 10, day, h, m);
const ROMA = 171;
const CHIBA = 284;
check("ora locale dalla longitudine", Math.abs(localHour(ROMA, at(12)) - 12.8) < 0.2 && Math.abs(localHour(CHIBA, at(12)) - 21.3) < 0.2);
check("le fasce della giornata", dayPart(ROMA, at(2)) === "notte" && dayPart(ROMA, at(6)) === "alba" && dayPart(ROMA, at(9)) === "mattina" && dayPart(ROMA, at(12)) === "pranzo" && dayPart(ROMA, at(15)) === "pomeriggio" && dayPart(ROMA, at(19)) === "sera");
check("uffici aperti di giorno, chiusi di notte e nel fine settimana", staffed("corp", ROMA, at(9)) && !staffed("corp", ROMA, at(22)) && !staffed("corp", ROMA, at(9, 0, 28)));
check("i negozi aprono anche il sabato, la polizia sempre", staffed("shop", ROMA, at(9, 0, 28)) && !staffed("shop", ROMA, at(9, 0, 29)) && staffed("law", ROMA, at(2)));
check("quanto manca all'apertura", opensIn("corp", ROMA, at(22)) > 8 && opensIn("corp", ROMA, at(22)) < 11 && opensIn("corp", ROMA, at(9)) === 0);
check("il cartello sulla porta", /apre fra/.test(statusLine("corp", ROMA, at(22))) && /pausa pranzo/.test(statusLine("corp", ROMA, at(12))) && /fine settimana/.test(statusLine("bank", ROMA, at(9, 0, 28))));
check("l'ombra: buio a mezzanotte, luce a mezzogiorno, sfumata al crepuscolo", darkness(ROMA, at(23)) === 1 && darkness(ROMA, at(11)) === 0 && darkness(ROMA, at(5)) > 0 && darkness(ROMA, at(5)) < 1);
check("mentre a Roma è giorno a Chiba è notte", darkness(ROMA, at(14)) === 0 && darkness(CHIBA, at(16)) === 1);

// ---- i testi: abbastanza da non ripetersi
check("trenta abitanti, ognuno con un orario", PERSONAS.length >= 30 && PERSONAS.every((p) => p.wake !== p.sleep && p.bbs.length > 0));
check("chiacchiere per ogni ora, notizie, discussioni, risposte", Object.values(CHAT_BY_PART).every((x) => x.length >= 6) && Object.values(NEWS_BY_PART).flat().length >= 25 && THREADS.length >= 30 && REPLIES.length >= 25);

// ---- regole di giorno e di notte sul server (i test partono col mondo fermo di giorno)
await sleep(400);
await act("devGrant", { xp: 6000, credits: 20000, tools: { proxy: 3, firewall: 3, breaker: 3, monbypass: 3 }, hw: { cpu: 5, modem: 5, memory: 4 } });
await sleep(1200);
const relays = state!.nodes.filter((n) => n.kind === "relay").slice(0, 4).map((n) => n.id);
const corp = WORLD.nodes.find((n) => n.kind === "corp" && n.adminId && !n.inner)!;
const boss = PEOPLE.find((p) => p.id === corp.adminId)!;
const personal = `${boss.name.split(" ")[0]!.toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "")}${String(boss.born).slice(2)}`;
const enter = async () => {
  if (state!.op) await act("disconnect");
  await act("devGrant", { cool: true });
  await act("connect", { chain: relays, targetIp: corp.ip });
  await sleep(300);
  await act("run", { tool: "monbypass" });
  if (!state!.op!.bypass.proxy) await act("run", { tool: "proxy" });
  await idle();
};
await act("devGrant", { clock: "giorno" });
await enter();
const day = await act("login", { password: personal });
await sleep(1200);
check("di giorno un impiegato che entra non fa notizia", day.ok && /orario d'ufficio/.test(day.note ?? "") && (state!.me.counters.office ?? 0) === 1);
check("in orario d'ufficio al centralino risponde l'amministratore", (await act("zone", { zone: "centralino", act: "voce" })).ok);
await act("devGrant", { clock: "notte" });
await enter();
const night = await act("login", { password: personal });
check("di notte lo stesso login passa, ma senza sconti", night.ok && !/orario d'ufficio/.test(night.note ?? ""));
const voice = await act("zone", { zone: "centralino", act: "voce" });
check("di notte al centralino risponde la segreteria", !voice.ok && /segreteria/.test(voice.error ?? ""));
await act("disconnect");

// ---- la gente: agisce, lascia tracce, racconta
const force = async (handle: string, what: string, extra: Record<string, unknown> = {}) => (await act("life", { cmd: "force", handle, what, ...extra })).data as { said: string | null; soul: { deeds: number; heat: number; jailUntil: number; lastDeed: string }; chat: string | null };
let who = ((await act("life")).data as { rows: { handle: string; status: string; city: string; clock: string }[]; awake: number });
check("l'elenco di chi c'è, con l'ora di casa sua", who.rows.length === PERSONAS.length && who.awake > 0 && /^\d\d:\d\d$/.test(who.rows[0]!.clock));
const r1 = await force("Vex", "red", { free: true, heat: 0 });
check("un rosso sveglio fa un colpo e lo racconta", r1.soul.deeds >= 1 && r1.soul.lastDeed.length > 5 && (r1.said ?? "").length > 5);
check("la chat ripete quello che è successo davvero", (r1.chat ?? "").length > 5);
const r2 = await force("Vex", "red", { heat: 99 });
check("troppo calore: finisce in custodia", r2.soul.jailUntil > Date.now() && r2.soul.lastDeed === "è stato arrestato");
who = (await act("life")).data as typeof who;
check("e nell'elenco risulta dentro", who.rows.find((x) => x.handle === "Vex")!.status === "custodia");
const r3 = await force("Sentinel", "blue");
check("un blu fa la ronda", /ronda|tolto/.test(r3.soul.lastDeed));
for (let i = 0; i < 12; i += 1) await force(PERSONAS[i % 6]!.handle, "bbs");
const home = (await act("bbs", { cmd: "call", bbs: "sottosuolo" })).data as BbsHome;
check("gli habitué chiamano i BBS: sono fra gli ultimi chiamanti", home.callers.some((c) => PERSONAS.some((p) => p.handle === c.handle && p.city === c.from)));
const rows = ((await act("bbs", { cmd: "threads", bbs: "sottosuolo", area: "generale" })).data as { rows: BbsThreadRow[] }).rows;
check("e in bacheca c'è movimento", rows.some((x) => x.replies > 0) && rows.length >= 3);
await act("bbs", { cmd: "bye" });
await act("devGrant", { clock: "giorno" });

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
