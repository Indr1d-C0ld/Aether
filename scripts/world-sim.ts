// Il mondo senza giocatori, a orologio accelerato: quante retate, scandali, aiuti da fuori, stati d'emergenza,
// città al buio, traslochi e aperture produce da solo in qualche giorno, e quanto rende vendere informazioni.
// Serve a controllare che le soglie dei sistemi di mondo non scattino sempre (o mai) sul server in linea.
// Uso: node scripts/world-sim.ts [giorni]   (motore in memoria, orologio finto: un battito ogni 45 s simulati)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const days = Number(process.argv[2] ?? 3);
// i comandi di prova dei moduli (conoscenze, rischio del Mediatore) servono alla misura delle informazioni
process.env.AETHER_DEV = "1";
const realNow = Date.now.bind(Date);
let fake = realNow();
Date.now = () => fake;

const { Store } = await import("../server/db.ts");
const { Game } = await import("../server/game.ts");
const { installSocial } = await import("../server/social.ts");
const { installIrc } = await import("../server/irc.ts");
const { installZones } = await import("../server/zones.ts");
const { installBio } = await import("../server/bio.ts");
const { installBbs } = await import("../server/bbs.ts");
const { installMalware } = await import("../server/malware.ts");
const { installOrgs } = await import("../server/orgs.ts");
const { installLife } = await import("../server/life.ts");
const { installCitizens } = await import("../server/citizens.ts");
const { installStocks } = await import("../server/stocks.ts");
const { installFence } = await import("../server/fence.ts");
const { installStartups } = await import("../server/startups.ts");
const { installFronts } = await import("../server/fronts.ts");
const { installIntel } = await import("../server/intel.ts");
const { installLaw } = await import("../server/law.ts");
const { installBlackMarket } = await import("../server/blackmarket.ts");
const { installScars } = await import("../server/scars.ts");
const { installSurprises } = await import("../server/surprises.ts");
const { installDomino } = await import("../server/domino.ts");
const { installNemesis } = await import("../server/nemesis.ts");
const { installTurf } = await import("../server/turf.ts");
const { installLeaks } = await import("../server/leaks.ts");
const { installLongOps } = await import("../server/longops.ts");
const { INTEL_FEE } = await import("../shared/intel.ts");

const NEWS_RE: Record<string, RegExp> = { buio: /al buio dopo il sabotaggio/, traslochi: /dopo l'ennesimo colpo/, aperture: /^Apre /, domino: /^Effetto domino/, retate: /Retata della Guardia/, scandali: /^Scandalo alla Guardia/, conquiste: /passa a /, contese: /Guerra di territorio/, aiuti: /rinforzi alla Guardia|Soldi e attrezzi dall'estero/, nemesi: /prende un caso tutto suo/ };
const dir = mkdtempSync(join(tmpdir(), "aether-sim-"));
const game = new Game(new Store(join(dir, "s.db")), { toast() {} });
const social = installSocial(game);
installIrc(game, social, () => {});
const zones = installZones(game);
installBio(game, zones);
const bbs = installBbs(game);
installMalware(game, bbs);
const orgs = installOrgs(game);
// le notizie si contano mentre escono (la Cronaca ne mostra solo le ultime)
const newsCount: Record<string, number> = {};
const origNews = orgs.news;
orgs.news = ((kind: Parameters<typeof origNews>[0], text: string, n: Parameters<typeof origNews>[2], feed?: boolean) => {
  for (const [k, re] of Object.entries(NEWS_RE)) if (re.test(text)) newsCount[k] = (newsCount[k] ?? 0) + 1;
  return origNews(kind, text, n, feed);
}) as typeof origNews;
installLife(game, bbs);
const citizens = installCitizens(game, zones, orgs);
installStocks(game, orgs);
installFence(game);
installStartups(game, orgs, citizens);
installFronts(game, orgs);
installIntel(game, orgs, citizens);
installLaw(game, orgs);
installBlackMarket(game, orgs);
installScars(game, orgs);
installSurprises(game, orgs);
installDomino(game, orgs);
installNemesis(game, orgs);
installTurf(game, orgs, social);
installLeaks(game, orgs);
installLongOps(game, orgs, zones, citizens);

// contatori
const count: Record<string, number> = {};
const bump = (k: string) => (count[k] = (count[k] ?? 0) + 1);
const prevBust = game.lifeBust;
game.lifeBust = () => (bump("abitanti in custodia"), prevBust?.());
const prevEm = game.onEmergency;
game.onEmergency = () => (bump("stati d'emergenza"), prevEm?.());
const prevOrgEvent = game.orgEvent;
game.orgEvent = (n, kind, who) => (bump(`evento ${kind}${who && [...game.agents.values()].some((x) => x.handle === who) ? "" : " (abitanti)"}`), prevOrgEvent?.(n, kind, who));
const prevArrest = game.arrest.bind(game);
game.arrest = (a, r) => (bump(a.npc ? "arresti di NPC" : "arresti di giocatori"), prevArrest(a, r));

const agent = game.createAgent("misura", "red", undefined, true);
const ask = (a: string, p: Record<string, unknown> = {}) => game.socialAct!(agent, a, p)!;
type Law = { trust: number; mood: string; rally: { side: string } | null; war24: { red: number; blue: number } };
type Black = { raid: unknown; zerodays: { fresh: number }[] };
const trust: number[] = [];
let rallyH = { red: 0, blue: 0 };
let raidH = 0;
let scandalH = 0;
const war0 = { ...game.meta.war };

const STEP = 45_000;
const steps = Math.round((days * 86400_000) / STEP);
for (let i = 0; i < steps; i += 1) {
  fake += STEP;
  game.tick(STEP);
  if (i % 80 === 0) {
    const l = ask("law").data as Law;
    trust.push(l.trust);
    if (l.rally) rallyH[l.rally.side as "red" | "blue"] += 1;
    if (l.mood === "scandalo") scandalH += 1;
    if ((ask("black").data as Black).raid) raidH += 1;
  }
}
const news = (ask("world").data as { news: { text: string }[] }).news;
const hits = (re: RegExp) => news.filter((n) => re.test(n.text)).length;
const black = ask("black").data as Black;
const turfView = ask("turf").data as { cities: { city: string; holder: { name: string } | null; contested: boolean }[] };

console.log(`== IL MONDO DA SOLO, ${days} giorni simulati (nessun giocatore attivo)`);
console.log(`  punti guerra: rossi +${game.meta.war.red - war0.red}, blu +${game.meta.war.blue - war0.blue}`);
for (const [k, v] of Object.entries(count)) console.log(`  ${k}: ${v}`);
console.log(`  abitanti finiti in custodia: ${count["abitanti in custodia"] ?? 0}`);
console.log(`  fiducia nella Guardia: min ${Math.min(...trust)}, max ${Math.max(...trust)}, fine ${trust.at(-1)} · ore di scandalo: ${scandalH}`);
console.log(`  ore con aiuto da fuori: ai rossi ${rallyH.red}, ai blu ${rallyH.blue} (su ${days * 24})`);
console.log(`  ore di retata: ${raidH} (su ${days * 24})`);
console.log(`  0-day: freschezza media a fine simulazione ${(black.zerodays.reduce((s, z) => s + z.fresh, 0) / black.zerodays.length).toFixed(2)}`);
console.log(`  città con presenza: ${turfView.cities.length} · tenute: ${turfView.cities.filter((c) => c.holder).length} (${[...new Set(turfView.cities.filter((c) => c.holder).map((c) => c.holder!.name))].join(", ")}) · contese: ${turfView.cities.filter((c) => c.contested).length}`);
console.log(`  notizie: ${Object.entries(newsCount).map(([k, v]) => `${k} ${v}`).join(" · ") || "nessuna di quelle contate"}`);

// ---- informazioni: quanto rende un giorno di vendite al massimo
console.log("\n== INFORMAZIONI: un giorno di vendite al massimo");
const orgNodes = [...game.nodes.values()].filter((n) => n.gen && !n.hidden && !n.inner && orgs.isOrg(n) && game.tierOf(n) >= 1 && game.tierOf(n) <= 3);
const sample = orgNodes.sort(() => Math.random() - 0.5).slice(0, 13);
for (const n of sample) ask("intel", { cmd: "dev", cred: n.id, risk: 0, reset: true });
const c0 = agent.credits;
for (const n of sample.slice(0, 8)) ask("intel", { cmd: "broker", key: `cred:${n.id}` });
const broker = agent.credits - c0;
type View = { pieces: { key: string; fair: number }[] };
const pieces = (ask("intel").data as View).pieces;
const c1 = agent.credits;
for (const n of sample.slice(8)) {
  const p = pieces.find((x) => x.key === `cred:${n.id}`);
  if (p) ask("intel", { cmd: "list", key: p.key, price: Math.round(p.fair * 1.25) });
}
for (let k = 0; k < 40; k += 1) ask("intel", { cmd: "dev", npcBuy: true });
const npc = agent.credits - c1;
console.log(`  Mediatore, 8 password di grado 1-3: ${broker} CR`);
console.log(`  bancarella agli abitanti, 5 password a 1,25 volte il valore (commissione ${INTEL_FEE * 100}%): ${npc} CR`);
console.log(`  totale del giorno: ${broker + npc} CR`);
process.exit(0);
