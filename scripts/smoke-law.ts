// Leggi e contrappesi: la fiducia nella Guardia che si muove con i fatti, lo scandalo che le toglie i poteri
// (e chiude lo stato d'emergenza), l'aiuto da fuori per la parte che perde la guerra delle ultime 24 ore.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";
import type { LawView } from "../shared/law.ts";
import type { WorldView } from "../shared/orgs.ts";
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
  return { state: () => state!, act, law: async (p: Record<string, unknown> = {}) => (await act("law", p)).data as LawView, world: async (p: Record<string, unknown> = {}) => (await act("world", p)).data as WorldView };
}
const fails: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};

const red = await bot("ladro", "red");
const blue = await bot("sbirro", "blue");
await sleep(500);

// ---- la fiducia e i suoi effetti
let v = await red.law();
check("si parte da una fiducia normale", v.trust === 60 && v.mood === "normale" && v.scandalUntil < Date.now() && v.effects.length === 0);
check("la vista sta anche in Cronaca", (await red.world()).law?.trust === 60);
v = await red.law({ dev: true, trust: 85 });
check("alta: indagini più rapide", v.mood === "alta" && /più rapide/.test(v.effects.join()));
v = await red.law({ dev: true, trust: 30 });
check("bassa: indagini più lente, e lo scandalo è vicino", v.mood === "bassa" && /più lente/.test(v.effects.join()));

// ---- i fatti la muovono: un furto in un sistema della Guardia, uno in un ufficio pubblico (metà)
const law = WORLD.nodes.find((n) => n.kind === "law" && !n.inner && !n.hidden)!;
const gov = WORLD.nodes.find((n) => n.kind === "gov" && !n.inner && !n.hidden)!;
v = await red.law({ dev: true, trust: 60 });
await red.world({ cmd: "dev", id: law.id, event: "furto" });
check("un furto alla Guardia: −4", (await red.law()).trust === 56);
await red.world({ cmd: "dev", id: gov.id, event: "sabotaggio" });
check("un sabotaggio a un ufficio pubblico conta la metà: −4", (await red.law()).trust === 52);
const corp = WORLD.nodes.find((n) => n.kind === "corp" && !n.inner && !n.hidden)!;
await red.world({ cmd: "dev", id: corp.id, event: "furto" });
check("un'azienda qualunque non c'entra", (await red.law()).trust === 52);

// ---- lo scandalo
await red.world({ cmd: "dev", intrusions: 60, pulses: 1 });
check("con troppe intrusioni scatta lo stato d'emergenza", (await red.world()).emergencyUntil > Date.now());
await red.law({ dev: true, trust: 30 });
await red.law({ dev: true, hit: -3 }); // il rosso fa scendere la fiducia: verrà ricordato
const mail0 = red.state().mail.length;
await red.world({ cmd: "dev", id: law.id, event: "sabotaggio" });
await sleep(1200);
v = await red.law();
const w = await red.world();
check("sotto 25: scandalo per dodici ore, fiducia che riparte da 45", v.mood === "scandalo" && v.scandalUntil > Date.now() + 11 * 3600_000 && v.trust === 45);
check("lo scandalo chiude lo stato d'emergenza, ed è in Cronaca", w.emergencyUntil < Date.now() && w.news.some((n) => /Scandalo alla Guardia/.test(n.text)));
check("chi ha contribuito riceve una lettera e un traguardo", red.state().mail.length > mail0 && /merito tuo/.test(red.state().mail[0]!.subject) && (red.state().me.counters["law:scandal"] ?? 0) === 1);
check("e lo scandalo si vede negli effetti", /più lente della metà/.test(v.effects.join()));
await red.world({ cmd: "dev", intrusions: 60, pulses: 1 });
check("durante lo scandalo lo stato d'emergenza non scatta", (await red.world()).emergencyUntil < Date.now());
await red.world({ cmd: "dev", id: law.id, event: "furto" });
check("e la fiducia resta ferma", (await red.law()).trust === 45);
await red.law({ dev: true, scandalOff: true, trust: 60 });

// ---- aiuto da fuori
const bm0 = blue.state().mail.length;
const rm0 = red.state().mail.length;
v = await red.law({ dev: true, war: { red: 200, blue: 30 } });
await sleep(1200);
check("i rossi stravincono: i blu ricevono rinforzi", v.rally?.side === "blue" && v.war24.red === 200 && v.war24.blue === 30 && /rinforzi/.test(v.rally.text));
check("i blu lo sanno per posta, i rossi no", blue.state().mail.length === bm0 + 1 && /Aiuto da fuori/.test(blue.state().mail[0]!.subject) && red.state().mail.length === rm0);
check("e la Cronaca lo racconta", (await red.world()).news.some((n) => /rinforzi alla Guardia/.test(n.text)));
await red.law({ dev: true, rallyOff: true });
v = await red.law({ dev: true, war: { red: 30, blue: 30 } });
check("partita pari: nessun aiuto", v.rally === null);
v = await red.law({ dev: true, war: { red: 10, blue: 120 } });
await sleep(1200);
check("i blu stravincono: aiuto ai rossi", v.rally?.side === "red" && /Aiuto da fuori/.test(red.state().mail[0]!.subject));
await red.act("intel", { cmd: "dev", heat: 50 });
for (let i = 0; i < 6; i += 1) await red.law({ dev: true, pulse: true });
await sleep(800);
check("ai rossi aiutati il calore scende prima", red.state().me.heat < 50);
v = await red.law({ dev: true, war: { red: 10, blue: 20 } });
check("sotto la soglia minima nessuno è davvero in testa, ma l'aiuto in corso resta fino a scadenza", v.rally?.side === "red");

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
