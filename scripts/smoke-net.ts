// Le novità «di rete»: operazioni a tappe, worm e botnet, gadget, ReticoloNet (IRC), crew, DCC, crediti, duelli.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import type { GameState, IrcEvent, ServerMsg } from "../shared/types.ts";

const port = process.argv[2] ?? "7077";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Res = Extract<ServerMsg, { t: "res" }>;

class Bot {
  ws: WebSocket;
  state: GameState | null = null;
  irc: IrcEvent[] = [];
  seq = 0;
  pending = new Map<number, (m: Res) => void>();
  ready: Promise<void>;
  constructor(handle: string, faction: "red" | "blue") {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ready = new Promise((r) => {
      this.ws.on("open", () => this.ws.send(JSON.stringify({ t: "auth", mode: "register", handle, pass: "segreto123", faction })));
      this.ws.on("message", (raw) => {
        const m = JSON.parse(String(raw)) as ServerMsg;
        if (m.t === "state") this.state = { ...m.s, nodes: m.s.nodes ?? this.state?.nodes ?? [] } as GameState;
        if (m.t === "irc") this.irc.push(m.ev);
        if (m.t === "res") this.pending.get(m.id)?.(m);
        if (m.t === "auth_ok") r();
      });
    });
  }
  do(a: string, p: Record<string, unknown> = {}) {
    const id = ++this.seq;
    return new Promise<Res>((r) => {
      this.pending.set(id, r);
      this.ws.send(JSON.stringify({ t: "do", id, a, p }));
    });
  }
  say(text: string, where = "*") {
    return this.do("irc", { text, where });
  }
  async idle() {
    for (let i = 0; i < 400; i += 1) {
      await sleep(150);
      if (!this.state?.op?.tasks.some((t) => t.state === "run")) return;
    }
  }
  lines(chan: string) {
    return this.irc.flatMap((e) => (e.e === "line" && e.line.chan === chan ? [e.line] : []));
  }
}

const fails: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};
const tag = Math.random().toString(36).slice(2, 6);
const A = new Bot(`acid_${tag}`, "red");
const B = new Bot(`burn_${tag}`, "red");
await Promise.all([A.ready, B.ready]);
const GEAR = { proxy: 3, firewall: 3, breaker: 3, decrypt: 3, monbypass: 3, logdel: 3, worm: 1, tracker: 3 };
await A.do("devGrant", { xp: 3000, credits: 40000, tools: GEAR, hw: { cpu: 5, modem: 5, memory: 4 }, gadget: "walkman" });
await B.do("devGrant", { xp: 3000, credits: 40000, tools: GEAR, hw: { cpu: 5, modem: 5, memory: 4 } });
await sleep(1300);

console.log("== OPERAZIONE A TAPPE");
const sc = (await A.do("devGrant", { mission: "scene:endofline" })).data as { id: string; nodeId: string };
await sleep(1200);
const mv = () => A.state!.missions.find((m) => m.id === sc.id)!;
check("il copione arriva con i suoi obiettivi", mv().type === "chain" && mv().objectives.length === 2);
check("consegna rifiutata finché mancano le tappe", !(await A.do("deliver", { missionId: sc.id })).ok);
const relays = A.state!.nodes.filter((n) => n.kind === "relay").slice(0, 4).map((n) => n.id);
await A.do("connect", { chain: [...relays, sc.nodeId] });
await sleep(300);
if (A.state!.op!.target.sec.monitor) await A.do("run", { tool: "monbypass" });
if (!A.state!.op!.bypass.proxy) await A.do("run", { tool: "proxy" });
if (!A.state!.op!.bypass.firewall) await A.do("run", { tool: "firewall" });
await A.idle();
await A.do("run", { tool: "breaker" });
await A.idle();
await sleep(300);
const files = A.state!.op!.files!.filter((f) => !f.loot);
for (const f of files.slice(0, 2)) {
  if (f.encryption) (await A.do("run", { tool: "decrypt", fileId: f.id }), await A.idle());
  await A.do("copy", { fileId: f.id });
  await A.idle();
}
await A.do("delete", { fileId: files[0]!.id });
await A.idle();
const worm = await A.do("run", { tool: "worm" });
await A.idle();
await sleep(400);
check("worm piantato", worm.ok && A.state!.op!.target.myWorm === true);
await A.do("disconnect");
await sleep(1300);
check("obiettivi spuntati", mv().objectives.every((o) => o.have >= o.n));
const dl = await A.do("deliver", { missionId: sc.id });
await sleep(600);
check("operazione consegnata", dl.ok && (A.state!.me.counters["sc:endofline"] ?? 0) === 1);

console.log("== GADGET");
await A.do("devGrant", { charge: 1 });
const g = A.state!.me.storage.find((s) => s.item?.kind === "gadget")!;
// serve calore per usarlo: lo procura l'accusa di prova? no: si prova e basta
const use1 = await A.do("useItem", { key: g.key });
await sleep(500);
const still = A.state!.me.storage.some((s) => s.key === g.key);
check("un gadget non si consuma", still);
if (use1.ok) check("…e deve ricaricarsi", !(await A.do("useItem", { key: g.key })).ok);

console.log("== RETICOLONET");
await A.do("ircSync");
await B.do("ircSync");
await sleep(400);
const sync = A.irc.find((e) => e.e === "sync");
check("MOTD e canali all'ingresso", sync?.e === "sync" && sync.motd.length > 10 && sync.chans.some((c) => c.name === "#reticolo") && sync.chans.some((c) => c.name === "#rossi"));
await A.say("ciao a tutti", "#reticolo");
await sleep(300);
check("il messaggio arriva agli altri", B.lines("#reticolo").some((l) => l.nick === `acid_${tag}` && l.text === "ciao a tutti"));
check("il canale dell'altra cellula è chiuso", !(await A.say("/join #blu")).ok);
await A.say(`/msg burn_${tag} in privato`);
await sleep(300);
check("query fra giocatori", B.lines(`@acid_${tag}`).some((l) => l.text === "in privato"));
await A.say("/msg XDCC-Kestrel xdcc send #1");
await sleep(3200);
check("il bot XDCC consegna un pacchetto", A.state!.me.storage.some((s) => s.item?.kind === "exploit"));
await A.say("/whois Oracolo", "#reticolo");
await A.say("/topic prova", "#reticolo");
await sleep(300);
check("solo gli operatori cambiano il topic", A.lines("#reticolo").some((l) => /not channel operator/.test(l.text)));

console.log("== CREW, DCC, CREDITI");
check("crew fondata da IRC", (await A.say(`/crew crea T${tag.slice(0, 3)} Prova`, "#reticolo")).ok);
await A.say(`/crew invita burn_${tag}`);
check("ingresso su invito", (await B.say(`/crew entra T${tag.slice(0, 3)}`)).ok);
await sleep(1300);
check("la crew è in classifica con due membri", B.state!.crews.some((c) => c.mine && c.members.length === 2) && B.state!.me.crew !== null);
check("canale di crew", B.irc.some((e) => e.e === "chan" && e.chan.name === `#t${tag.slice(0, 3)}`));
const before = B.state!.me.credits;
check("crediti mandati", (await A.say(`/paga burn_${tag} 1000`)).ok);
const item = A.state!.me.storage.findIndex((s) => s.item?.kind === "exploit") + 1;
const nItems = B.state!.me.storage.length;
check("DCC SEND", (await A.say(`/dcc send burn_${tag} ${item} 200`)).ok);
check("DCC GET", (await B.say(`/dcc get acid_${tag}`)).ok);
await sleep(1300);
check("oggetto e crediti passati di mano", B.state!.me.storage.length === nItems + 1 && B.state!.me.credits === before + 1000 - 200);

console.log("== DUELLO");
check("sfida lanciata", (await A.say(`/sfida burn_${tag} 500`)).ok);
check("sfida accettata", (await B.say("/accetta")).ok);
await sleep(1300);
const duel = B.state!.duels[0]!;
check("stesso bersaglio per tutti e due", duel?.state === "live" && Boolean(duel.nodeId) && A.state!.duels[0]?.nodeId === duel.nodeId);
const cr0 = B.state!.me.credits;
await B.do("devGrant", { exploit: "skeleton" });
await B.do("connect", { chain: [...relays, duel.nodeId!] });
await sleep(300);
const sk = B.state!.me.storage.find((s) => s.item?.code === "skeleton")!;
await B.do("useItem", { key: sk.key });
await sleep(1300);
check("chi buca per primo incassa", B.state!.me.credits > cr0 && B.state!.duels.length === 0 && (B.state!.me.counters.duelwin ?? 0) === 1);
await B.do("disconnect");

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
