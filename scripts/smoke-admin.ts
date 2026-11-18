// Pannello dell'amministratore: handle riservato, iscrizioni con approvazione, ban, posta, avviso,
// regolazioni, manutenzione, registro, e i traguardi che scattano giocando.
// Uso: scripts/test-all.sh (server e test condividono AETHER_DB)
import WebSocket from "ws";
import { Store } from "../server/db.ts";
import type { GameState, ServerMsg } from "../shared/types.ts";

const port = process.argv[2] ?? "7077";
const store = new Store(process.env.AETHER_DB!);
store.createAccount("admin_", "provadmin99", "ag_testadmin");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Res = Extract<ServerMsg, { t: "res" }>;
type Client = { x: Extract<ServerMsg, { t: "auth_ok" | "auth_err" }>; st: { s?: GameState }; do: (a: string, p?: Record<string, unknown>) => Promise<Res> };

function open(m: Record<string, unknown>): Promise<Client> {
  return new Promise((resolve) => {
    const w = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    let id = 0;
    const pend = new Map<number, (r: Res) => void>();
    const st: Client["st"] = {};
    w.on("open", () => w.send(JSON.stringify(m)));
    w.on("message", (d) => {
      const x = JSON.parse(String(d)) as ServerMsg;
      if (x.t === "state") st.s = { ...x.s, nodes: x.s.nodes ?? st.s?.nodes ?? [] } as GameState;
      if (x.t === "res") pend.get(x.id)?.(x);
      if (x.t === "auth_ok" || x.t === "auth_err")
        resolve({
          x,
          st,
          do: (a, p = {}) =>
            new Promise((rr) => {
              id += 1;
              pend.set(id, rr);
              w.send(JSON.stringify({ t: "do", id, a, p }));
            }),
        });
    });
  });
}

const fails: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};
const tag = Math.random().toString(36).slice(2, 6);

const adm = await open({ t: "auth", mode: "login", handle: "admin_", pass: "provadmin99" });
await sleep(600);
check("l'admin entra e ha il pannello", adm.x.t === "auth_ok" && adm.st.s?.me.admin === true);
const reserved = await open({ t: "auth", mode: "register", handle: "Admin_", pass: "qualcosa1", faction: "red" });
check("l'handle dell'admin non si registra dal gioco", reserved.x.t === "auth_err");

const p1 = await open({ t: "auth", mode: "register", handle: `uno_${tag}`, pass: "segreto123", faction: "blue" });
check("iscrizione aperta", p1.x.t === "auth_ok");
check("un giocatore non usa il pannello", (await p1.do("admin.overview")).ok === false);

let r = await adm.do("admin.setSettings", { values: { registrations: "approval", motd: "Prova di avviso", rewardMult: 2, nonEsiste: 3 } });
check("regolazioni salvate (le chiavi sconosciute si scartano)", r.ok && r.note === "3 impostazioni aggiornate");
const p2 = await open({ t: "auth", mode: "register", handle: `due_${tag}`, pass: "segreto123", faction: "red" });
check("con approvazione: l'iscrizione resta in attesa", p2.x.t === "auth_err" && /approv/.test(p2.x.error));
const list = (await adm.do("admin.accounts", { filter: "attesa" })).data as { list: { id: string; handle: string }[] };
const waiting = list.list.find((a) => a.handle === `due_${tag}`);
check("l'admin vede chi aspetta", Boolean(waiting));
check("approvazione", (await adm.do("admin.approve", { id: waiting!.id })).ok);
const p2b = await open({ t: "auth", mode: "login", handle: `due_${tag}`, pass: "segreto123" });
check("dopo l'approvazione si entra", p2b.x.t === "auth_ok");

r = await adm.do("admin.mail", { to: "all", subject: "Comunicazione", body: "Prova" });
await sleep(1500);
check("posta a tutti", r.ok && p1.st.s?.mail[0]?.subject === "Comunicazione");
check("avviso in alto", p1.st.s?.notice?.text === "Prova di avviso");

const id1 = ((await adm.do("admin.accounts", { q: `uno_${tag}` })).data as { list: { id: string }[] }).list[0]!.id;
check("ban", (await adm.do("admin.ban", { id: id1, minutes: 5, reason: "prova" })).ok);
const banned = await open({ t: "auth", mode: "login", handle: `uno_${tag}`, pass: "segreto123" });
check("un handle sospeso non entra", banned.x.t === "auth_err" && /sospeso/.test(banned.x.error));
check("fine del ban", (await adm.do("admin.unban", { id: id1 })).ok);
check("modifica dei crediti", (await adm.do("admin.edit", { id: id1, field: "credits", value: 12345 })).ok);
const det = (await adm.do("admin.account", { id: id1 })).data as { credits: number; logins: number };
check("scheda dell'account", det.credits === 12345 && det.logins >= 1);

const ov = (await adm.do("admin.overview")).data as { players: number; totals: Record<string, number> };
check("panoramica con le statistiche globali", ov.players >= 2 && (ov.totals.signups ?? 0) >= 2 && (ov.totals.logins ?? 0) >= 2);

// i traguardi scattano giocando (iscrizioni di nuovo aperte)
await adm.do("admin.setSettings", { values: { registrations: "open" } });
const p3 = await open({ t: "auth", mode: "register", handle: `tre_${tag}`, pass: "segreto123", faction: "red" });
await sleep(500);
const conn = await p3.do("connect", { chain: ["lumen-news"] });
if (!conn.ok) console.log("  connect:", conn.error);
await sleep(300);
await p3.do("disconnect");
await sleep(600);
check("primo traguardo: «Carrier»", p3.st.s?.me.feats.includes("a:connect#0") === true);
check("contatori personali nello stato", (p3.st.s?.me.counters["a:connect"] ?? 0) >= 1);

check("manutenzione", (await adm.do("admin.setSettings", { values: { maintenance: true } })).ok);
const closed = await open({ t: "auth", mode: "login", handle: `uno_${tag}`, pass: "segreto123" });
check("in manutenzione entra solo l'admin", closed.x.t === "auth_err");
await adm.do("admin.resetSettings");
const audit = (await adm.do("admin.auditLog")).data as { action: string }[];
check("registro delle azioni", audit.length >= 6);

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
