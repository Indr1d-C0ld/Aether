// Effetto domino: fornitori e clienti, il sabotaggio che si propaga, i costi, i sistemi distratti, la Cronaca,
// i contratti per rossi e blu.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";
import type { SupplyView } from "../shared/domino.ts";
import type { OrgView, WorldView } from "../shared/orgs.ts";
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
  return { state: () => state!, act };
}
const fails: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};

const red = await bot("domino", "red");
const blue = await bot("ripara", "blue");
await sleep(500);
await blue.act("devGrant", { fame: 1000, xp: 6000 });
await red.act("devGrant", { fame: 1000, xp: 6000 });

// una compagnia telefonica con dei clienti
let telco: { id: string; v: SupplyView } | null = null;
for (const n of WORLD.nodes.filter((x) => x.kind === "telco" && !x.inner && !x.hidden)) {
  const v = (await red.act("domino", { id: n.id })).data as SupplyView;
  if (v.clients.length >= 2) {
    telco = { id: n.id, v };
    break;
  }
}
check("una compagnia telefonica ha dei clienti, e a sua volta un fornitore di corrente", Boolean(telco) && telco!.v.suppliers.some((s) => s.kind === "util"));
const client = telco!.v.clients[0]!;
const cv = (await red.act("world", { cmd: "org", id: client.id })).data as OrgView;
check("nella scheda del cliente, in Cronaca, c'è il fornitore", Boolean(cv.supply?.suppliers.some((s) => s.id === telco!.id && s.what === "linee telefoniche e dati")));
const cash0 = cv.cash;

// il sabotaggio
await red.act("scars", { dev: true, reveal: [telco!.id, client.id] });
await red.act("domino", { id: telco!.id, dev: true, sabotage: true });
await sleep(900);
const after = (await red.act("domino", { id: telco!.id })).data as SupplyView;
check("sabotato il fornitore, i clienti restano in disservizio", after.clients.every((c) => c.down));
const cv2 = (await red.act("world", { cmd: "org", id: client.id })).data as OrgView;
check("il disservizio costa: cassa più bassa, e la scheda lo dice", cv2.cash < cash0 && cv2.supply?.outage?.byId === telco!.id && cv2.supply.outage.what === "linee telefoniche e dati");
await red.act("devGrant", { xp: 0 });
await sleep(900);
const node = red.state().nodes.find((n) => n.id === client.id)!;
check("sulla mappa: il cliente in disservizio guarda meno (trace più lento)", Boolean(node.outage) && node.watch > 1 && (node.suppliers ?? []).includes(telco!.id));
const news = ((await red.act("world")).data as WorldView).news;
check("in Cronaca", news.some((n) => /^Effetto domino/.test(n.text)));
check("contratti: per i rossi approfittare del disservizio", red.state().missions.some((m) => m.title.startsWith("Disservizio:")));
await blue.act("devGrant", { xp: 0 });
await sleep(900);
check("per i blu presidiare il fornitore", blue.state().missions.some((m) => m.title === `Ripristino: ${WORLD.nodes.find((n) => n.id === telco!.id)!.org}`));
check("e un traguardo per chi l'ha provocato", (red.state().me.counters["dom:cascade"] ?? 0) === 1);
const again = await red.act("domino", { id: telco!.id, dev: true, sabotage: true });
await sleep(500);
check("chi è già in disservizio non paga due volte", ((await red.act("world", { cmd: "org", id: client.id })).data as OrgView).cash === cv2.cash && again.ok);

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
