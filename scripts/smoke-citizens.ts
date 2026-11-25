// Le persone: si conoscono dagli organici, si indagano, si comprano, diventano fonti, si ricattano;
// i blu le mettono in guardia.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, ServerMsg } from "../shared/types.ts";
import type { CitizenRow } from "../shared/citizens.ts";
import { WORLD } from "../server/worldgen.ts";
import { PEOPLE } from "../server/people.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = Extract<ServerMsg, { t: "res" }>;
async function bot(faction: "red" | "blue") {
  let state: GameState | null = null;
  let seq = 0;
  const pending = new Map<number, (m: Res) => void>();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise<void>((r) => {
    ws.on("open", () => ws.send(JSON.stringify({ t: "auth", mode: "register", handle: `cit${faction[0]}_${Math.random().toString(36).slice(2, 6)}`, pass: "segreto123", faction })));
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
  return { state: () => state!, act, cit: (cmd: string, p: Record<string, unknown> = {}) => act("cit", { cmd, ...p }) };
}
const fails: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};
const rowOf = (r: Res) => (r.data as { row: CitizenRow }).row;

const red = await bot("red");
const blue = await bot("blue");
await sleep(400);
await red.act("devGrant", { credits: 30000 });
// un dipendente vero (non l'amministratore) di un'azienda
const emp = PEOPLE.find((p) => {
  const n = WORLD.nodes.find((x) => x.id === WORLD.employer[p.id]);
  return n && n.kind === "corp" && n.adminId !== p.id;
})!;
const firm = WORLD.nodes.find((x) => x.id === WORLD.employer[emp.id])!;

check("senza conoscerla non le si può fare niente", !(await red.cit("investigate", { id: emp.id })).ok);
let row = rowOf(await red.cit("dev", { id: emp.id, meet: true, set: { debt: 6000, loyalty: 10, fired: null, warned: 0, cd: {} } }));
const list = ((await red.cit("list")).data as { rows: CitizenRow[] }).rows;
check("conosciuta: è nell'elenco, con lavoro, datore e dove si trova adesso", list.length === 1 && row.employer === firm.org && row.role === "dipendente" && row.where === "in ufficio" && /^\d\d:\d\d$/.test(row.clock));
check("prima dell'indagine si intuisce solo che ha dei debiti", !row.known && row.debt === -1 && row.can.length === 1 && row.can[0]!.act === "investigate");
const cr0 = red.state().me.credits;
row = rowOf(await red.cit("investigate", { id: emp.id }));
await sleep(1200);
check("indagine: fascicolo completo, e si paga", row.known && row.debt === 6000 && red.state().me.credits === cr0 - 300);
const bribe = row.can.find((c) => c.act === "bribe")!;
check("chi è indebitato si compra", Boolean(bribe) && bribe.cost === 2000);
const br = await red.cit("bribe", { id: emp.id });
await sleep(1200);
check("comprata: un badge da operatore per il suo datore di lavoro", br.ok && /badge/.test(br.note ?? "") && (red.state().me.counters["cit:bribe"] ?? 0) === 1);
await red.act("connect", { chain: ["r-sable", "r-kiln", firm.id] });
await sleep(500);
check("e il badge funziona davvero", red.state().op?.clearance === 2);
await red.act("disconnect");
check("non due volte in un giorno", !(await red.cit("bribe", { id: emp.id })).ok);

// licenziata: diventa una fonte
row = rowOf(await red.cit("dev", { id: emp.id, set: { fired: firm.id, firedAt: Date.now() } }));
check("licenziata: ex dipendente, pronta a parlare", row.role === "ex dipendente" && row.fired === firm.org && row.can.some((c) => c.act === "source"));
const mail0 = red.state().mail.length;
check("la fonte parla", (await red.cit("source", { id: emp.id })).ok);
await sleep(1200);
check("e scrive quello che sa: operatore e mezza password di root", red.state().mail.length === mail0 + 1 && /utenza operatore/.test(red.state().mail[0]!.body) && red.state().mail[0]!.body.includes(firm.password.slice(0, 2)));

// i blu: mettere in guardia
const d = await blue.cit("dev", { id: emp.id, meet: true, set: { fired: null, debt: 6000, cd: {} } });
check("i blu vedono chi è a rischio", rowOf(d).can.some((c) => c.act === "warn"));
const wr = await blue.cit("warn", { id: emp.id });
check("messa in guardia: badge sospetti annullati, e un compenso", wr.ok && /annullati/.test(wr.note ?? ""));
await red.cit("dev", { id: emp.id, set: { cd: {} } });
const again = await red.cit("bribe", { id: emp.id });
check("chi è stato avvisato non si fa più comprare", again.ok && /rifiuta/.test(again.note ?? ""));

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
