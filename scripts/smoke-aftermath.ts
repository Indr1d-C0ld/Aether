// Cicatrici e mercato nero: 0-day che invecchiano e si bruciano, retate che svuotano il mercato,
// sabotaggi che segnano la mappa, città al buio, organizzazioni che traslocano.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";
import type { BlackView } from "../shared/blackmarket.ts";
import type { WorldView } from "../shared/orgs.ts";
import type { LabView } from "../shared/malware.ts";
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
  return { state: () => state!, act, black: async (p: Record<string, unknown> = {}) => (await act("black", p)).data as BlackView };
}
const fails: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};
const refresh = async (b: { act: (a: string, p?: Record<string, unknown>) => Promise<Res> }) => (await b.act("devGrant", { xp: 0 }), await sleep(900));

const red = await bot("scasso", "red");
await sleep(500);
await red.act("devGrant", { xp: 6000, credits: 30000, tools: { proxy: 3, firewall: 3, monbypass: 3, breaker: 3 }, hw: { cpu: 5, modem: 5, memory: 5 } });

// ---- 0-day che invecchiano
let v = await red.black({ dev: true, uses: {} });
check("otto 0-day, freschi all'inizio, nessuna retata", v.zerodays.length === 8 && v.zerodays.every((z) => z.fresh >= 0.9 && z.label === "fresco") && v.raid === null);
const bank = WORLD.nodes.find((n) => n.kind === "bank" && n.gen && !n.inner && !n.hidden)!;
await red.act("devGrant", { exploit: "zproxy" });
await red.act("devGrant", { exploit: "zfire" });
await red.act("connect", { chain: ["r-sable", "r-kiln", bank.id] });
await sleep(600);
v = await red.black({ dev: true, uses: { zproxy: 60 }, roll: 0 });
check("usato da tutti: patchato", v.zerodays.find((z) => z.code === "zproxy")!.label === "patchato");
const zp = red.state().me.storage.find((s) => s.item?.code === "zproxy")!;
const burnt = await red.act("useItem", { key: zp.key });
await sleep(800);
check("su una banca la falla è già chiusa: l'exploit si brucia", !burnt.ok && /patch/.test(burnt.error ?? "") && !red.state().me.storage.some((s) => s.item?.code === "zproxy") && !red.state().op!.bypass.proxy);
check("e conta come bruciato", (red.state().me.counters["bm:burned"] ?? 0) === 1);
await red.black({ dev: true, roll: 0.99 });
const zf = red.state().me.storage.find((s) => s.item?.code === "zfire")!;
const ok = await red.act("useItem", { key: zf.key });
await sleep(800);
check("uno 0-day fresco funziona", ok.ok && red.state().op!.bypass.firewall && (red.state().me.counters["bm:fresh"] ?? 0) === 1);
v = await red.black();
check("e chi lo usa lo rende un po' più noto", v.zerodays.find((z) => z.code === "zfire")!.fresh < 1);
await red.act("disconnect");
await red.black({ dev: true, roll: null });

// il ricettatore paga meno uno 0-day bruciato
await red.black({ dev: true, uses: { zmon: 0 } });
await red.act("devGrant", { exploit: "zmon" });
await refresh(red);
const fresh0 = red.state().me.storage.find((s) => s.item?.code === "zmon")!;
await red.black({ dev: true, uses: { zmon: 60 } });
await refresh(red);
const stale = red.state().me.storage.find((s) => s.item?.code === "zmon")!;
check("l'archivio dice quanto è fresco, e il ricettatore paga di conseguenza", (fresh0.fresh ?? 0) > 0.9 && (stale.fresh ?? 1) < 0.15 && (stale.fence ?? 0) < (fresh0.fence ?? 0));

// ---- retate
const mail0 = red.state().mail.length;
v = await red.black({ dev: true, arrests: 3 });
check("tre punti arresto non bastano", v.raid === null && v.arrests24 === 3);
v = await red.black({ dev: true, arrests: 1 });
await sleep(1200);
check("al quarto: retata", v.raid !== null && v.modMult === 3 && v.fenceMult === 1.6);
check("i rossi lo sanno dal ricettatore, e c'è in Cronaca", red.state().mail.length > mail0 && /Retata/.test(red.state().mail[0]!.subject) && ((await red.act("world")).data as WorldView).news.some((n) => /Retata della Guardia/.test(n.text)));
const lab = (await red.act("mw", { cmd: "lab" })).data as LabView;
check("il Laboratorio mostra i prezzi della retata", lab.priceMult === 3);
const c0 = red.state().me.credits;
await red.act("mw", { cmd: "buyMod", code: "v-virus" });
await sleep(900);
check("e un modulo da 300 costa 900", red.state().me.credits === c0 - 900);
await refresh(red);
const during = red.state().me.storage.find((s) => s.item?.code === "zmon")!;
check("il ricettatore paga di più exploit, chip e gadget", (during.fence ?? 0) > (stale.fence ?? 0) * 1.5);
await red.act("fence", { key: during.key });
await sleep(800);
check("e chi vende durante la retata se lo segna", (red.state().me.counters["bm:raid"] ?? 0) === 1);
v = await red.black({ dev: true, age: 36 });
check("a metà strada la retata pesa la metà", v.raid !== null && Math.abs(v.modMult - 2) < 0.05);
v = await red.black({ dev: true, age: 40 });
check("dopo tre giorni è finita", v.raid === null && v.modMult === 1);
await red.black({ dev: true, raidOff: true });
await red.act("world", { cmd: "dev", intrusions: 60, pulses: 1 });
check("anche lo stato d'emergenza porta una retata", (await red.black()).raid !== null);

// ---- cicatrici
const util = WORLD.nodes.find((n) => n.kind === "util" && n.gen && !n.inner && !n.hidden)!;
const neighbor = WORLD.nodes.find((n) => n.city === util.city && n.id !== util.id && !n.inner && !n.hidden && n.kind !== "home")!;
await red.act("scars", { dev: true, reveal: [util.id, neighbor.id] });
await red.act("world", { cmd: "dev", id: util.id, event: "sabotaggio" });
await refresh(red);
const u = red.state().nodes.find((n) => n.id === util.id)!;
const nb = red.state().nodes.find((n) => n.id === neighbor.id)!;
check("un sistema sabotato resta segnato e in allerta", (u.scar ?? 0) > 0.9 && u.alert);
check(`e se è una rete, ${util.city} resta al buio: anche i vicini, con il trace più lento`, Boolean(u.dark) && Boolean(nb.dark) && nb.watch > 1);
check("in Cronaca", ((await red.act("world")).data as WorldView).news.some((n) => n.text.includes(`${util.city} al buio`)));

// ---- traslochi
const corp = WORLD.nodes.find((n) => n.kind === "corp" && n.gen && !n.inner && !n.hidden && n.city !== util.city)!;
await red.act("scars", { dev: true, reveal: [corp.id] });
await red.act("world", { cmd: "dev", id: corp.id, event: "sabotaggio", times: 2 });
await refresh(red);
let c = red.state().nodes.find((n) => n.id === corp.id)!;
check("due sabotaggi non bastano a farla traslocare", c.city === corp.city && !c.moved);
await red.act("world", { cmd: "dev", id: corp.id, event: "sabotaggio" });
await refresh(red);
c = red.state().nodes.find((n) => n.id === corp.id)!;
check("al terzo trasloca: città e indirizzo nuovi, e la traccia del trasloco", c.city !== corp.city && c.ip !== corp.ip && c.moved?.city === corp.city && c.moved.x === corp.x);
check("anche il trasloco finisce in Cronaca", ((await red.act("world")).data as WorldView).news.some((n) => n.text.includes(`lascia ${corp.city}`)));

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
