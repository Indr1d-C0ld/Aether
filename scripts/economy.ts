// Economia: campiona i contratti generati (ricompense, XP, grado, requisiti) e stima crediti/ora e tempi di crescita.
// Uso: node scripts/economy.ts   (non serve un server: usa il motore di gioco in memoria)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/db.ts";
import { Game } from "../server/game.ts";
import { FENCE_MEMORY, FENCE_REPEAT, HEIST_COOLDOWN, MISSION_LABEL, SHOP_CASH, TOOLS, fencePrice, heistCap, hwCost, toolCost } from "../shared/rules.ts";
import { TIER_LOOT, ITEM_FENCE } from "../shared/depth.ts";
import type { Faction, ToolId } from "../shared/types.ts";

const dir = mkdtempSync(join(tmpdir(), "aether-eco-"));
const game = new Game(new Store(join(dir, "eco.db")), { toast() {} });
type M = NonNullable<ReturnType<Game["rollRed"]>>;

function sample(faction: Faction, n: number) {
  const out: M[] = [];
  for (let i = 0; i < n; i += 1) {
    const m = game.priced(faction === "red" ? game.rollRed() : game.rollBlue());
    if (!m) continue;
    // i trasporti lasciano un carico sul nodo: in un campionamento va tolto
    if (m.type === "courier") {
      const src = game.nodes.get(m.nodeId);
      if (src) src.files = src.files.filter((f) => f.cargo !== m.id);
    }
    out.push(m);
  }
  return out;
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);

export function table(faction: Faction) {
  const ms = sample(faction, 4000);
  const rows: Record<string, string | number>[] = [];
  for (const type of [...new Set(ms.map((m) => m.type))]) {
    for (const tier of [0, 1, 2, 3, 4]) {
      const g = ms.filter((m) => m.type === type && (m.tier ?? 0) === tier);
      if (!g.length) continue;
      rows.push({ tipo: MISSION_LABEL[type], grado: tier, quota: `${((g.length / ms.length) * 100).toFixed(1)}%`, paga: avg(g.map((m) => m.reward)), xp: avg(g.map((m) => m.xp)) });
    }
  }
  return { rows, ms };
}

if (process.argv[1]?.endsWith("economy.ts")) {
  for (const f of ["red", "blue"] as Faction[]) {
    const { rows, ms } = table(f);
    console.log(`\n== ${f === "red" ? "ROSSI" : "BLU"}: contratti generati (${ms.length} campioni)`);
    console.log("tipo | grado | quota | paga | xp");
    for (const r of rows.sort((a, b) => Number(a.grado) - Number(b.grado) || String(a.tipo).localeCompare(String(b.tipo)))) console.log(Object.values(r).join(" | "));
    for (const tier of [0, 1, 2, 3, 4]) {
      const g = ms.filter((m) => (m.tier ?? 0) === tier);
      if (g.length) console.log(`  grado ${tier}: paga media ${avg(g.map((m) => m.reward))}, xp ${avg(g.map((m) => m.xp))}, bottino atteso ~${Math.round(TIER_LOOT[tier]! * avg(ITEM_FENCE.slice(0, 3)))} CR`);
    }
  }
  // --- modello: quanto si guadagna all'ora e quanto ci vuole per salire di livello
  // Tempi a ritmo umano. Rossi: durata dell'operazione misurata da scripts/playtest.ts + 80 s fra leggere il contratto,
  // preparare il rimbalzo e consegnare. Blu: incarichi brevi e senza trace (25 s) o profili (120 s), + 60 s di contorno.
  const tools = (f: Faction) => TOOLS.filter((t) => t.faction === "any" || t.faction === f).map((t) => t.id as ToolId);
  const toolSum = (f: Faction, v: number) => tools(f).reduce((q, id) => q + [1, 2, 3].slice(0, v).reduce((z, k) => z + toolCost(id, k), 0), 0);
  const hwSum = (lvl: number) => 4 * [1, 2, 3, 4].slice(0, lvl - 1).reduce((q, l) => q + hwCost(l), 0);
  const stages: [string, number, number][] = [["1→2", 1, 2], ["2→3", 2, 3], ["3→4", 3, 4], ["4→5", 3, 5]];
  const RED_OP = [27, 36, 40, 37, 45];
  const NET = { red: 0.85, blue: 0.95 }; // tariffe dei relay, multe, contratti falliti
  for (const f of ["red", "blue"] as Faction[]) {
    const { ms } = table(f);
    console.log(`\n== ${f === "red" ? "ROSSI" : "BLU"}: guadagno e crescita (modello)`);
    console.log("grado | paga | s/contratto | contratti/ora | CR/ora | XP/ora");
    const perHour: number[] = [];
    for (const tier of [0, 1, 2, 3, 4]) {
      const g = ms.filter((m) => (m.tier ?? 0) === tier);
      if (!g.length) continue;
      const pay = avg(g.map((m) => m.reward));
      const secs = f === "red" ? RED_OP[tier]! + 80 : avg(g.map((m) => (m.type === "profile" ? 120 : 25))) + 60;
      const n = 3600 / secs;
      perHour[tier] = Math.round(pay * n * NET[f]);
      console.log(`${tier} | ${pay} | ${secs} | ${n.toFixed(0)} | ${perHour[tier]} | ${Math.round(avg(g.map((m) => m.xp)) * n)}`);
    }
    let prev = 0;
    let total = 0;
    stages.forEach(([name, v, l], k) => {
      const cum = toolSum(f, v) + hwSum(l);
      const h = (cum - prev) / (perHour[Math.min(k, perHour.length - 1)] ?? perHour.at(-1)!);
      total += h;
      console.log(`  livello ${name}: ${cum - prev} CR (tutto: strumenti v${v}, hardware ${l}) → ${h.toFixed(1)} ore`);
      prev = cum;
    });
    console.log(`  totale per avere tutto: ${total.toFixed(1)} ore di contratti`);
  }
  // --- gioco libero: quanto rende girare per il mondo senza contratti
  // Ricettazione: il file più prezioso di ogni nodo, una volta sola ogni FENCE_MEMORY (poi vale FENCE_REPEAT).
  // Colpi: un bonifico al tetto dell'antifrode ogni HEIST_COOLDOWN, ammesso che il log resti pulito. Casse: una ogni 30 min per negozio.
  console.log("\n== GIOCO LIBERO (rossi): resa per ora, a confronto con i contratti");
  console.log("grado | nodi | file migliore | ricettazione CR/ora | colpo (tetto) | colpi CR/ora | contratti CR/ora");
  const redHour: number[] = [];
  {
    const { ms } = table("red");
    for (const tier of [0, 1, 2, 3, 4]) {
      const g = ms.filter((m) => (m.tier ?? 0) === tier);
      redHour[tier] = g.length ? Math.round(avg(g.map((m) => m.reward)) * (3600 / (RED_OP[tier]! + 80)) * NET.red) : 0;
    }
  }
  const open = game.openTargets();
  for (const tier of [0, 1, 2, 3, 4]) {
    const ns = open.filter((n) => game.tierOf(n) === tier);
    const best = ns.map((n) => Math.max(0, ...n.files.filter((f) => !f.loot && !f.cargo).map((f) => fencePrice(f.value, f.size)))).filter((x) => x > 0);
    const secs = RED_OP[tier]! + 60; // niente contratto da leggere, ma il nodo va trovato e il rimbalzo preparato
    const opsHour = 3600 / secs;
    // in FENCE_MEMORY si possono visitare al più i nodi che esistono: oltre, si rivende a FENCE_REPEAT
    const fresh = Math.min(opsHour, best.length / (FENCE_MEMORY / 3600_000));
    const fenceHour = Math.round((fresh + (opsHour - fresh) * FENCE_REPEAT) * avg(best) * NET.red);
    const banks = ns.filter((n) => n.kind === "bank").length;
    const heistHour = banks ? Math.round(heistCap(tier) * (3600_000 / HEIST_COOLDOWN) * 0.8) : 0; // 0.8: storni quando la pulizia non riesce
    console.log(`${tier} | ${ns.length} | ${avg(best)} | ${fenceHour} | ${banks ? heistCap(tier) : "—"} | ${heistHour || "—"} | ${redHour[tier]}`);
  }
  const shops = open.filter((n) => n.kind === "shop").length;
  const cashAvg = (SHOP_CASH[0] + SHOP_CASH[1]) / 2;
  const shopSecs = 22 + 45; // operazione breve su un negozio + cambio di bersaglio
  console.log(`  casse: ${shops} negozi, ${cashAvg} CR a colpo, una ogni 30 min ciascuno → al più ${Math.round(Math.min(3600 / shopSecs, shops * 2) * cashAvg)} CR/ora`);
  process.exit(0);
}
