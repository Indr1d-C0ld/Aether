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
const { PEOPLE } = await import("../server/people.ts");
const { WORLD } = await import("../server/worldgen.ts");
const { fencePrice } = await import("../shared/rules.ts");
const { rivalPay, pressPay, blackmailPay, BLACKMAIL_RISK } = await import("../shared/leaks.ts");
const { MOLE_COST } = await import("../shared/longops.ts");

const NEWS_RE: Record<string, RegExp> = { talpe: /passava informazioni a qualcuno di fuori/,  buio: /al buio dopo il sabotaggio/, traslochi: /dopo l'ennesimo colpo/, aperture: /^Apre /, domino: /^Effetto domino/, retate: /Retata della Guardia/, scandali: /^Scandalo alla Guardia/, conquiste: /passa a /, contese: /Guerra di territorio/, aiuti: /rinforzi alla Guardia|Soldi e attrezzi dall'estero/, nemesi: /prende un caso tutto suo/ };
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

// ---- bottino con un contenuto: usarlo, o venderlo al ricettatore (un file di valore 6, 2 GQ)
console.log("\n== BOTTINO CON UN CONTENUTO: quanto rende usarlo, rispetto al ricettatore (file di valore 6)");
for (const tier of [1, 2, 3, 4]) {
  const fence = fencePrice(6, 2);
  console.log(`  grado ${tier}: ricettatore ~${fence} CR · concorrenza ${rivalPay(tier)} · giornale ${pressPay(tier)} (+8 fama) · ricatto atteso ${Math.round(blackmailPay(tier) * (1 - BLACKMAIL_RISK))}`);
}

// ---- giocatori: due talpe a testa e qualche abitante amico, per cinque giorni simulati
console.log("\n== QUATTRO GIOCATORI ROSSI, 5 giorni simulati: due talpe a testa, tre abitanti amici ciascuno");
const askAs = (a: typeof agent, act: string, p: Record<string, unknown> = {}) => game.socialAct!(a, act, p)!;
const players = [0, 1, 2, 3].map((i) => game.createAgent(`talpa${i}`, "red"));
const staff = PEOPLE.filter((p) => {
  const n = WORLD.nodes.find((x) => x.id === WORLD.employer[p.id]);
  return n && n.files.some((f) => !f.encryption) && n.adminId !== p.id;
}).slice(0, 8);
const friends = ["Corax", "Vex", "Mantis", "Nyx_77", "Tsuki", "Ohm"];
for (const [i, pl] of players.entries()) {
  pl.credits = 30000;
  for (const pp of staff.slice(i * 2, i * 2 + 2)) {
    askAs(pl, "cit", { cmd: "dev", id: pp.id, meet: true, set: { debt: 6500, fired: null, warned: 0, cd: {} } });
    askAs(pl, "cit", { cmd: "investigate", id: pp.id });
    askAs(pl, "longop", { cmd: "mole", pid: pp.id });
  }
  for (const h of friends.slice(i % 3, (i % 3) + 3)) askAs(pl, "life", { cmd: "favor", handle: h, value: 60 });
}
const moles0 = players.reduce((s, pl) => s + ((askAs(pl, "longop").data as { ops: unknown[] }).ops.length), 0);
const store0 = players.map((pl) => pl.storage.length);
const mail0 = players.map((pl) => pl.mail.length);
for (let i = 0; i < Math.round((5 * 86400_000) / STEP); i += 1) {
  fake += STEP;
  game.tick(STEP);
}
let fileValue = 0;
let files = 0;
let contents = 0;
for (const [i, pl] of players.entries())
  for (const st of pl.storage.slice(store0[i])) {
    if (!st.key.startsWith("st_mole")) continue;
    files += 1;
    if (st.content) contents += 1;
    fileValue += Math.round(game.priceOf(st) * (game.fenceDemand?.(st) ?? 1));
  }
const mails = players.reduce((s, pl, i) => s + pl.mail.slice(0, pl.mail.length - mail0[i]!).length, 0);
const favorMails = players.reduce((sum, pl, i) => sum + pl.mail.slice(0, pl.mail.length - mail0[i]!).filter((m) => m.subject === "Un favore").length, 0);
const favors = [...game.missions.values()].filter((m) => m.title.startsWith("Favore per") && players.some((pl) => pl.id === m.ownerId));
console.log(`  talpe piazzate: ${moles0} (costo ${moles0 * MOLE_COST} CR) · scoperte: ${newsCount.talpe ?? 0}`);
console.log(`  file portati dalle talpe: ${files} (${contents} con un contenuto) · valore al ricettatore: ${fileValue} CR`);
console.log(`  lettere ricevute (password, avvisi, esiti): ${mails}`);
console.log(`  favori chiesti: ${favorMails} · paga media (degli ultimi ancora in bacheca) ${favors.length ? Math.round(favors.reduce((s, m) => s + m.reward, 0) / favors.length) : 0} CR, più un numero nascosto o 800 CR se fatti`);
process.exit(0);
