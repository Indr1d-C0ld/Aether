// Sandbox: quanto rendono le fonti di reddito nuove, messe a confronto con i contratti (scripts/economy.ts).
// Uso: node scripts/sandbox-economy.ts   (motore in memoria, mondo fermo «di giorno»)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/db.ts";
import { Game } from "../server/game.ts";
import { installOrgs } from "../server/orgs.ts";
import { installStocks } from "../server/stocks.ts";
import { FRONT_CAP, FRONT_RATE } from "../shared/fronts.ts";
import { INSIDER_RISK, STOCK_FEE, STOCK_MAX_SHORT } from "../shared/stocks.ts";
import { wormYield, WORM_CAP } from "../shared/rules.ts";
import type { StocksView } from "../shared/stocks.ts";

const dir = mkdtempSync(join(tmpdir(), "aether-sbx-"));
const game = new Game(new Store(join(dir, "s.db")), { toast() {} });
game.clockForce = "giorno";
const orgs = installOrgs(game);
installStocks(game, orgs);
const PULSES_H = 80; // un battito ogni 45 s
const agent = game.createAgent("misura", "red", undefined, true);
const ask = (a: string, p: Record<string, unknown>) => game.socialAct!(agent, a, p)!;

// ---- copertura: livello massimo, due dipendenti, aperta 10 ore al giorno
const front = FRONT_RATE.map((r, i) => ({ lv: i + 1, h: Math.round(r * 1.5 * PULSES_H), day: Math.min(r * 1.5 * PULSES_H * 10, FRONT_CAP[i]! * 3) }));
console.log("== COPERTURA (due dipendenti, 10 ore di apertura, tre ritiri al giorno)");
for (const f of front) console.log(`  livello ${f.lv}: ${f.h} CR/ora aperta · al giorno ~${Math.round(f.day)}`);

// ---- botnet: worm v3 al completo e creature al tetto
const wormH = WORM_CAP[2]! * wormYield(2, 3) * PULSES_H;
console.log("\n== BOTNET (sempre attiva)");
console.log(`  worm v3 al completo su nodi di grado 2: ${wormH} CR/ora`);
console.log(`  creature al tetto, senza worm: ${64 * PULSES_H} CR/ora · con la botnet di worm al completo: 0 in più (tetto comune)`);

// ---- Borsa: quanto scende un titolo dopo uno, due, tre sabotaggi, e quanto rende lo scoperto
console.log(`\n== BORSA: scoperto da insider (${STOCK_MAX_SHORT} titoli, prezzo dopo 40 battiti; la vigilanza sequestra il ${INSIDER_RISK * 100}% delle volte)`);
const view = () => ask("stock", {}).data as StocksView;
const rows = view().rows;
const pulse = () => {
  for (const f of game.onPulse) f();
};
for (let i = 0; i < 20; i += 1) pulse();
for (const times of [1, 2, 3]) {
  const r = view().rows[times]!;
  const n = game.nodes.get(r.id)!;
  const p0 = view().rows.find((x) => x.id === r.id)!.price;
  for (let k = 0; k < times; k += 1) game.orgEvent!(n, "sabotaggio", "misura");
  for (let k = 0; k < 40; k += 1) pulse();
  const p1 = view().rows.find((x) => x.id === r.id)!.price;
  const gain = (p0 - p1) * STOCK_MAX_SHORT - (p0 + p1) * STOCK_MAX_SHORT * STOCK_FEE;
  console.log(`  ${times} sabotaggi su ${r.ticker}: ${p0.toFixed(1)} → ${p1.toFixed(1)} (${(((p1 - p0) / p0) * 100).toFixed(1)}%) · scoperto: ${Math.round(gain)} CR, atteso ${Math.round(gain * (1 - INSIDER_RISK))}`);
}
// quanto ci mette a risalire
const r = view().rows[1]!;
const low = r.price;
let hours = 0;
for (; hours < 48; hours += 1) {
  for (let k = 0; k < PULSES_H; k += 1) pulse();
  if (view().rows.find((x) => x.id === r.id)!.price > low * 1.08) break;
}
console.log(`  dopo il colpo il titolo recupera l'8% in circa ${hours + 1} ore`);
console.log(`  titoli quotati: ${rows.length}`);
process.exit(0);
