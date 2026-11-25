// BBS dei giocatori: apertura, scheda del sysop, visite e fama, file degli abitanti, accesso su invito,
// segnalazioni e sequestro, sfregio dal gateway, ripristino, moderazione dell'amministratore.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import { Store } from "../server/db.ts";
import type { GameState, ServerMsg } from "../shared/types.ts";
import type { BbsFiles, BbsHome, BbsInfo, OwnedView } from "../shared/bbs.ts";

const port = process.argv[2] ?? "7077";
const store = new Store(process.env.AETHER_DB!);
store.createAccount("admin", "provadmin99", "ag_testadmin");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = Extract<ServerMsg, { t: "res" }>;
async function bot(auth: Record<string, unknown>) {
  let state: GameState | null = null;
  let seq = 0;
  const pending = new Map<number, (m: Res) => void>();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise<void>((r) => {
    ws.on("open", () => ws.send(JSON.stringify({ t: "auth", ...auth })));
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
  return { state: () => state!, act, bbs: (cmd: string, p: Record<string, unknown> = {}) => act("bbs", { cmd, ...p }) };
}
const tag = Math.random().toString(36).slice(2, 6);
const reg = (h: string, faction: string) => bot({ mode: "register", handle: `${h}_${tag}`, pass: "segreto123", faction });
const fails: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};
const view = (r: Res) => r.data as OwnedView;

const sysop = await reg("sys", "red");
const guest = await reg("ospite", "red");
const blue = await reg("guardia", "blue");
await sleep(500);

// ---- apertura
check("aprire costa: senza crediti non si apre", !(await sysop.bbs("own:open", { name: "Prova" })).ok);
await sysop.act("devGrant", { credits: 20000, xp: 6000, tools: { proxy: 3, firewall: 3, breaker: 3, monbypass: 3 }, hw: { cpu: 5, modem: 5, memory: 4 } });
check("un nome già usato da un BBS di serie non va", !(await sysop.bbs("own:open", { name: "Il Sottosuolo" })).ok);
const op = await sysop.bbs("own:open", { name: "La Cantina", tagline: "Si scende con la torcia." });
let mine = view(op);
check("BBS aperto, con un numero e due aree di partenza", op.ok && mine.name === "La Cantina" && /^0\d+-\d+-\d+$/.test(mine.number) && mine.areas.length === 2);
check("uno per handle", !(await sysop.bbs("own:open", { name: "Seconda" })).ok);
const banner = Array.from({ length: 14 }, (_, i) => `${"#".repeat(80)} riga ${i}`).join("\n");
mine = view(await sysop.bbs("own:edit", { banner, areas: ["generale", "tecnica", "colpi", "inventata"], door: "tris", motd: "Ciao.\u0007" }));
check("insegna tagliata a 10 righe da 64 colonne, aree inventate scartate", mine.banner.split("\n").length === 10 && mine.banner.split("\n").every((l) => l.length <= 64) && mine.areas.join() === "generale,tecnica,colpi" && mine.door === "tris" && mine.motd === "Ciao.");
check("senza aree no", !(await sysop.bbs("own:edit", { areas: [] })).ok);

// ---- in rubrica e in visita
let list = ((await guest.bbs("list")).data as { list: BbsInfo[] }).list;
const entry = list.find((b) => b.id === mine.id);
check("gli altri lo trovano in rubrica, col nome del sysop", Boolean(entry) && entry!.owner === `sys_${tag}` && !entry!.mine);
const home = (await guest.bbs("call", { bbs: mine.id })).data as BbsHome;
check("si chiama come gli altri: insegna, aree, porta e regole", home.banner.includes("####") && home.areas.length === 3 && home.doors.some((d) => d.id === "tris"));
check("un messaggio nella bacheca del giocatore", (await guest.bbs("post", { bbs: mine.id, area: "generale", title: "Primo!", body: "Bella cantina." })).ok);
await guest.bbs("bye");
mine = view(await sysop.bbs("own:view"));
check("la visita fa fama al sysop", mine.fame === 1 && mine.callsToday === 1 && mine.posts === 1);
const sysHome = (await sysop.bbs("call", { bbs: mine.id })).data as BbsHome;
check("sul proprio BBS il sysop è co-sysop", sysHome.level === 4);
await sysop.bbs("bye");

// ---- gli abitanti caricano file e scrivono al sysop
const st0 = sysop.state().me.storage.length;
const mail0 = sysop.state().mail.length;
await sysop.bbs("own:dev", { npc: true });
await sleep(1200);
check("un abitante carica un file: il sysop ne tiene una copia a metà valore", sysop.state().me.storage.length === st0 + 1);
check("e scrive al sysop una cosa vera", sysop.state().mail.length === mail0 + 1 && /sysop/.test(sysop.state().mail[0]!.subject));
await guest.bbs("call", { bbs: mine.id });
await guest.bbs("dev", { bbs: mine.id, kb: 300 });
const fl = (await guest.bbs("files", { bbs: mine.id })).data as BbsFiles;
check("in area file: il materiale caricato, niente pacchetti del giorno", (fl.stash ?? []).length === 1 && fl.packs.length === 0 && fl.philes.some((p) => p.name === "REGOLE.TXT"));
const g0 = guest.state().me.storage.length;
const tk = await guest.bbs("take", { bbs: mine.id, id: fl.stash![0]!.id });
await sleep(1200);
check("se ne scarica una copia, una volta", tk.ok && guest.state().me.storage.length === g0 + 1 && !(await guest.bbs("take", { bbs: mine.id, id: fl.stash![0]!.id })).ok);
await guest.bbs("bye");

// ---- su invito
await sysop.bbs("own:edit", { access: "riservato" });
list = ((await blue.bbs("list")).data as { list: BbsInfo[] }).list;
check("riservato: chi non è invitato non lo vede", !list.some((b) => b.id === mine.id) && !(await blue.bbs("call", { bbs: mine.id })).ok);
check("invitare un handle che non esiste no", !(await sysop.bbs("own:edit", { invited: ["nessuno_qui"] })).ok);
await sysop.bbs("own:edit", { invited: [`guardia_${tag}`] });
list = ((await blue.bbs("list")).data as { list: BbsInfo[] }).list;
check("invitato: lo vede", list.some((b) => b.id === mine.id));

// ---- segnalazioni e sequestro
await blue.bbs("call", { bbs: mine.id });
check("un blu lo segnala", (await blue.bbs("report", { bbs: mine.id })).ok);
check("una volta al giorno", !(await blue.bbs("report", { bbs: mine.id })).ok);
check("un rosso non segnala", !(await guest.bbs("report", { bbs: mine.id })).ok);
await blue.bbs("bye");
mine = view(await sysop.bbs("own:dev", { set: { heat: 120, access: "pubblico" }, pulse: true }));
check("troppo calore: sotto sequestro", mine.seizedUntil > Date.now());
const seized = await guest.bbs("call", { bbs: mine.id });
check("e nessuno lo può chiamare", !seized.ok && /sequestro/.test(seized.error ?? ""));
await sysop.bbs("own:dev", { set: { seizedUntil: 0, heat: 0, access: "pubblico" } });

// ---- sfregio dal gateway del sysop
await guest.act("devGrant", { xp: 6000, credits: 20000, tools: { proxy: 3, firewall: 3, breaker: 3, monbypass: 3 }, hw: { cpu: 5, modem: 5, memory: 4 }, cool: true });
await sleep(800);
await guest.act("connect", { chain: [], targetIp: sysop.state().me.gatewayIp });
await sleep(400);
for (const t of ["monbypass", "proxy", "firewall"]) await guest.act("run", { tool: t });
await sleep(600);
for (let i = 0; i < 200 && guest.state().op?.tasks.some((k) => k.state === "run"); i += 1) await sleep(200);
await guest.act("run", { tool: "breaker" });
await sleep(600);
for (let i = 0; i < 200 && guest.state().op?.tasks.some((k) => k.state === "run"); i += 1) await sleep(200);
await sleep(600);
check("da admin sul gateway del sysop, la Console offre lo sfregio", guest.state().op?.access === "admin" && guest.state().op?.bbsDeface?.name === "La Cantina");
const mails = sysop.state().mail.length;
check("insegna sfregiata", (await guest.bbs("own:deface", { text: "PASSAVO DI QUI" })).ok);
await guest.act("disconnect");
await sleep(1200);
const after = (await guest.bbs("call", { bbs: mine.id })).data as BbsHome;
check("chi chiama vede la firma dello sfregio, e il sysop riceve la notizia", after.banner.includes("HACKED BY") && after.banner.includes("PASSAVO DI QUI") && sysop.state().mail.length > mails);
await guest.bbs("bye");
mine = view(await sysop.bbs("own:restore"));
check("il sysop ripristina l'insegna dal backup", mine.deface === null);

// ---- moderazione
const adm = await bot({ mode: "login", handle: "admin", pass: "provadmin99" });
await sleep(500);
const al = await adm.act("admin.bbsList");
check("l'admin vede i BBS dei giocatori", al.ok && (al.data as OwnedView[]).some((b) => b.id === mine.id));
check("un giocatore no", !(await sysop.act("admin.bbsList")).ok);
check("azzera i testi", (await adm.act("admin.bbsReset", { id: mine.id })).ok && view(await sysop.bbs("own:view")).motd === "");
check("chiude il BBS, con una lettera al sysop", (await adm.act("admin.bbsClose", { id: mine.id, reason: "Prova di chiusura." })).ok && (await sysop.bbs("own:view")).data === null);
const audit = (await adm.act("admin.auditLog")).data as { action: string }[];
check("e resta nel registro", audit.some((r) => r.action === "bbsClose"));

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
