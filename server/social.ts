// Fra giocatori: crew, duelli, scambio di oggetti e crediti. Tutto passa da Game.act (azioni «crew*»,
// «duel*», «trade*», «pay»); la rete IRC (server/irc.ts) offre gli stessi gesti come comandi.
import { randomBytes } from "node:crypto";
import type { Game, AgentDoc } from "./game.ts";
import { fmtCr, levelOf, rankOf } from "../shared/rules.ts";
import type { CrewView, DuelView, Faction, TradeView } from "../shared/types.ts";

type R = { ok: boolean; error?: string; note?: string; data?: unknown };
export type Crew = { tag: string; name: string; faction: Faction; motto: string; leader: string; members: string[]; invites: string[]; bank: number; createdAt: number };
type Duel = { id: string; a: string; b: string; stake: number; state: "offered" | "live"; nodeId: string | null; expiresAt: number };
type Trade = { id: string; from: string; to: string; key: string; name: string; rarity: number; price: number; expiresAt: number };

export const CREW_COST = 5000;
export const CREW_MAX = 12;
const PAY_DAILY = 20000;
const now = () => Date.now();
const uid = (p: string) => `${p}_${randomBytes(4).toString("hex")}`;

export type Social = ReturnType<typeof installSocial>;

export function installSocial(game: Game) {
  const meta = game.meta as unknown as { crews?: Record<string, Crew> };
  const crews = () => (meta.crews ??= {});
  const duels = new Map<string, Duel>();
  const trades = new Map<string, Trade>();
  const listeners: ((ev: { type: string; crew?: Crew; agent?: AgentDoc; text?: string }) => void)[] = [];
  const emit = (ev: { type: string; crew?: Crew; agent?: AgentDoc; text?: string }) => listeners.forEach((f) => f(ev));

  const byHandle = (h: string) => {
    const k = h.trim().toLowerCase();
    return [...game.agents.values()].find((a) => !a.npc && a.handle.toLowerCase() === k) ?? null;
  };
  const crewOfAgent = (a: AgentDoc) => Object.values(crews()).find((c) => c.members.includes(a.id)) ?? null;
  const save = () => game.touch("meta", "world");
  const ping = (...ids: string[]) => ids.forEach((id) => game.dirty.add(id));
  const say = (id: string, text: string, tone: "ok" | "warn" | "bad" | "info" = "info") => game.out.toast(id, text, tone);

  game.crewOf = (a) => crewOfAgent(a)?.tag ?? null;

  // ---------------------------------------------------------------- crew
  const crew = {
    create(a: AgentDoc, tagRaw: string, nameRaw: string): R {
      const tag = tagRaw.trim().toUpperCase();
      const name = nameRaw.trim().slice(0, 28);
      if (!/^[A-Z0-9]{2,5}$/.test(tag)) return { ok: false, error: "sigla: da 2 a 5 lettere o cifre" };
      if (name.length < 3) return { ok: false, error: "nome: almeno 3 caratteri" };
      if (crewOfAgent(a)) return { ok: false, error: "sei già in una crew" };
      if (crews()[tag]) return { ok: false, error: "sigla già presa" };
      if (a.xp < 550) return { ok: false, error: "servono 550 XP per fondare una crew" };
      if (a.credits < CREW_COST) return { ok: false, error: `fondare una crew costa ${fmtCr(CREW_COST)}` };
      a.credits -= CREW_COST;
      crews()[tag] = { tag, name, faction: a.faction, motto: "", leader: a.id, members: [a.id], invites: [], bank: 0, createdAt: now() };
      game.touch("agent", a.id);
      save();
      game.bump(a, "crewfound");
      game.feed(`Nasce la crew [${tag}] ${name}, fondata da ${a.handle}.`, a.faction);
      emit({ type: "crew-new", crew: crews()[tag], agent: a });
      return { ok: true, note: `crew [${tag}] fondata` };
    },
    invite(a: AgentDoc, handle: string): R {
      const c = crewOfAgent(a);
      if (!c || c.leader !== a.id) return { ok: false, error: "solo chi guida la crew invita" };
      const t = byHandle(handle);
      if (!t) return { ok: false, error: "handle sconosciuto" };
      if (t.faction !== c.faction) return { ok: false, error: "è dell'altra cellula" };
      if (crewOfAgent(t)) return { ok: false, error: "è già in una crew" };
      if (c.members.length >= CREW_MAX) return { ok: false, error: `una crew ha al massimo ${CREW_MAX} membri` };
      if (!c.invites.includes(t.id)) c.invites.push(t.id);
      save();
      game.mail(t, `CREW ${c.tag}`, `Invito: ${c.name}`, `${a.handle} ti invita nella crew [${c.tag}] ${c.name}.\nPer entrare: scheda Crew, oppure su IRC «/crew entra ${c.tag}».`);
      say(t.id, `Invito dalla crew [${c.tag}]`);
      ping(t.id, a.id);
      return { ok: true, note: `${t.handle} invitato` };
    },
    join(a: AgentDoc, tag: string): R {
      const c = crews()[tag.trim().toUpperCase()];
      if (!c) return { ok: false, error: "crew inesistente" };
      if (crewOfAgent(a)) return { ok: false, error: "sei già in una crew" };
      if (!c.invites.includes(a.id)) return { ok: false, error: "non hai un invito" };
      if (c.members.length >= CREW_MAX) return { ok: false, error: "la crew è al completo" };
      c.invites = c.invites.filter((x) => x !== a.id);
      c.members.push(a.id);
      save();
      game.bump(a, "crewjoin");
      for (const id of c.members) (say(id, `${a.handle} è entrato nella crew`, "ok"), ping(id));
      emit({ type: "crew-join", crew: c, agent: a });
      return { ok: true, note: `sei nella crew [${c.tag}]` };
    },
    leave(a: AgentDoc, kickedBy: AgentDoc | null = null): R {
      const c = crewOfAgent(a);
      if (!c) return { ok: false, error: "non sei in una crew" };
      c.members = c.members.filter((x) => x !== a.id);
      emit({ type: "crew-leave", crew: c, agent: a });
      if (!c.members.length) {
        // l'ultimo a uscire si porta via la cassa
        a.credits += c.bank;
        delete crews()[c.tag];
        game.feed(`La crew [${c.tag}] ${c.name} si è sciolta.`, c.faction);
        game.touch("agent", a.id);
      } else if (c.leader === a.id) {
        c.leader = c.members[0]!;
        const nl = game.agents.get(c.leader);
        if (nl) say(nl.id, `Ora guidi la crew [${c.tag}]`, "ok");
      }
      save();
      ping(a.id, ...c.members);
      return { ok: true, note: kickedBy ? `${a.handle} fuori dalla crew` : "hai lasciato la crew" };
    },
    kick(a: AgentDoc, handle: string): R {
      const c = crewOfAgent(a);
      const t = byHandle(handle);
      if (!c || c.leader !== a.id) return { ok: false, error: "solo chi guida la crew espelle" };
      if (!t || !c.members.includes(t.id) || t.id === a.id) return { ok: false, error: "non è un tuo compagno" };
      say(t.id, `Sei stato espulso dalla crew [${c.tag}]`, "warn");
      return crew.leave(t, a);
    },
    donate(a: AgentDoc, amount: number): R {
      const c = crewOfAgent(a);
      const n = Math.floor(amount);
      if (!c) return { ok: false, error: "non sei in una crew" };
      if (!(n >= 100) || n > a.credits) return { ok: false, error: "importo non valido (minimo 100 CR)" };
      a.credits -= n;
      c.bank += n;
      game.touch("agent", a.id);
      save();
      ping(...c.members);
      return { ok: true, note: `${fmtCr(n)} nella cassa della crew` };
    },
    /** Dalla cassa a un membro: lo decide chi guida (attrezzatura, cauzioni, premi). */
    grant(a: AgentDoc, handle: string, amount: number): R {
      const c = crewOfAgent(a);
      const t = byHandle(handle);
      const n = Math.floor(amount);
      if (!c || c.leader !== a.id) return { ok: false, error: "solo chi guida la crew usa la cassa" };
      if (!t || !c.members.includes(t.id)) return { ok: false, error: "non è un tuo compagno" };
      if (!(n >= 100) || n > c.bank) return { ok: false, error: "la cassa non basta" };
      c.bank -= n;
      t.credits += n;
      game.touch("agent", t.id);
      save();
      game.mail(t, `CREW ${c.tag}`, `Dalla cassa: ${fmtCr(n)}`, `${a.handle} ti ha assegnato ${fmtCr(n)} dalla cassa della crew.`);
      ping(...c.members);
      return { ok: true, note: `${fmtCr(n)} a ${t.handle}` };
    },
    motto(a: AgentDoc, text: string): R {
      const c = crewOfAgent(a);
      if (!c || c.leader !== a.id) return { ok: false, error: "solo chi guida la crew cambia il motto" };
      c.motto = text.trim().slice(0, 80);
      save();
      ping(...c.members);
      emit({ type: "crew-motto", crew: c, agent: a });
      return { ok: true, note: "motto aggiornato" };
    },
  };

  // ---------------------------------------------------------------- crediti e oggetti
  function pay(a: AgentDoc, handle: string, amount: number): R {
    const t = byHandle(handle);
    const n = Math.floor(amount);
    if (!t || t.id === a.id) return { ok: false, error: "handle sconosciuto" };
    if (a.xp < 200) return { ok: false, error: "servono 200 XP per mandare crediti" };
    if (!(n >= 10)) return { ok: false, error: "minimo 10 CR" };
    const day = new Date().toISOString().slice(0, 10);
    const key = `pay:${day}`;
    const sent = a.counters[key] ?? 0;
    if (sent + n > PAY_DAILY) return { ok: false, error: `puoi mandare al massimo ${fmtCr(PAY_DAILY)} al giorno (te ne restano ${fmtCr(Math.max(0, PAY_DAILY - sent))})` };
    const fee = Math.ceil(n * 0.05);
    if (a.credits < n + fee) return { ok: false, error: `servono ${fmtCr(n + fee)} (commissione del 5%)` };
    a.credits -= n + fee;
    t.credits += n;
    for (const k of Object.keys(a.counters)) if (k.startsWith("pay:") && k !== key) delete a.counters[k];
    a.counters[key] = sent + n;
    game.touch("agent", a.id);
    game.touch("agent", t.id);
    game.bump(a, "paid", n);
    game.mail(t, "CONTO", `Ricevuti ${fmtCr(n)}`, `${a.handle} ti ha mandato ${fmtCr(n)}.`);
    say(t.id, `${a.handle} ti ha mandato ${fmtCr(n)}`, "ok");
    ping(a.id, t.id);
    return { ok: true, note: `${fmtCr(n)} a ${t.handle} (commissione ${fmtCr(fee)})` };
  }

  const trade = {
    offer(a: AgentDoc, handle: string, key: string, price: number): R {
      const t = byHandle(handle);
      const st = a.storage.find((x) => x.key === key);
      const p = Math.max(0, Math.floor(price || 0));
      if (!t || t.id === a.id) return { ok: false, error: "handle sconosciuto" };
      if (!st) return { ok: false, error: "non è nel tuo archivio" };
      if (st.cargo) return { ok: false, error: "un carico non si cede: va consegnato" };
      if (p > 100000) return { ok: false, error: "prezzo massimo 100.000 CR" };
      if ([...trades.values()].some((x) => x.from === a.id && x.key === key)) return { ok: false, error: "lo stai già offrendo a qualcuno" };
      if ([...trades.values()].filter((x) => x.from === a.id).length >= 5) return { ok: false, error: "hai già cinque offerte aperte" };
      const tr: Trade = { id: uid("tr"), from: a.id, to: t.id, key, name: st.name, rarity: st.rarity ?? 0, price: p, expiresAt: now() + 10 * 60_000 };
      trades.set(tr.id, tr);
      say(t.id, `${a.handle} ti offre ${st.name}${p ? ` per ${fmtCr(p)}` : " in regalo"}`, "info");
      ping(a.id, t.id);
      return { ok: true, note: `offerta mandata a ${t.handle}`, data: { id: tr.id } };
    },
    accept(a: AgentDoc, id: string): R {
      const tr = trades.get(id);
      if (!tr || tr.to !== a.id) return { ok: false, error: "offerta inesistente" };
      const from = game.agents.get(tr.from);
      const st = from?.storage.find((x) => x.key === tr.key);
      if (!from || !st) {
        trades.delete(id);
        return { ok: false, error: "l'oggetto non c'è più" };
      }
      if (a.credits < tr.price) return { ok: false, error: "crediti insufficienti" };
      if (a.storage.reduce((s, x) => s + x.size, 0) + st.size > game.storageMax(a)) return { ok: false, error: "archivio pieno" };
      trades.delete(id);
      from.storage = from.storage.filter((x) => x !== st);
      a.storage.push({ ...st, key: uid("st"), at: now() });
      a.credits -= tr.price;
      from.credits += tr.price;
      game.touch("agent", a.id);
      game.touch("agent", from.id);
      game.bump(from, "traded");
      game.bump(a, "traded");
      if (tr.price) game.bump(from, "earned", tr.price);
      say(from.id, `${a.handle} ha accettato: ${tr.name}${tr.price ? ` · +${fmtCr(tr.price)}` : ""}`, "ok");
      ping(a.id, from.id);
      return { ok: true, note: `${tr.name} è nel tuo archivio` };
    },
    decline(a: AgentDoc, id: string): R {
      const tr = trades.get(id);
      if (!tr || (tr.to !== a.id && tr.from !== a.id)) return { ok: false, error: "offerta inesistente" };
      trades.delete(id);
      const other = tr.to === a.id ? tr.from : tr.to;
      say(other, tr.to === a.id ? `${a.handle} ha rifiutato ${tr.name}` : `${a.handle} ha ritirato l'offerta`, "warn");
      ping(a.id, other);
      return { ok: true, note: "offerta chiusa" };
    },
    incomingFrom(a: AgentDoc, handle: string) {
      const f = byHandle(handle);
      return f ? ([...trades.values()].find((x) => x.to === a.id && x.from === f.id) ?? null) : null;
    },
  };

  // ---------------------------------------------------------------- duelli
  const duel = {
    offer(a: AgentDoc, handle: string, stake: number): R {
      const t = byHandle(handle);
      const n = Math.floor(stake);
      if (!t || t.id === a.id) return { ok: false, error: "handle sconosciuto" };
      if (!(n >= 100 && n <= 20000)) return { ok: false, error: "posta fra 100 e 20.000 CR" };
      if (a.credits < n) return { ok: false, error: "non hai quella cifra" };
      if (a.xp < 200 || t.xp < 200) return { ok: false, error: "si sfida (e si è sfidati) da 200 XP in su" };
      if ([...duels.values()].some((d) => d.a === a.id || d.b === a.id)) return { ok: false, error: "hai già una sfida aperta" };
      if ([...duels.values()].some((d) => d.a === t.id || d.b === t.id)) return { ok: false, error: "ha già una sfida aperta" };
      a.credits -= n;
      game.touch("agent", a.id);
      const d: Duel = { id: uid("du"), a: a.id, b: t.id, stake: n, state: "offered", nodeId: null, expiresAt: now() + 3 * 60_000 };
      duels.set(d.id, d);
      say(t.id, `${a.handle} ti sfida: ${fmtCr(n)} a testa, vince chi buca per primo. Accetti?`, "warn");
      game.mail(t, "SFIDA", `${a.handle} ti sfida`, `Posta: ${fmtCr(n)} a testa. Un bersaglio a sorte, uguale per tutti e due: vince chi ottiene per primo l'accesso admin, entro 10 minuti.\nHai 3 minuti per accettare (scheda Crew e sfide, o su IRC «/accetta»).`);
      ping(a.id, t.id);
      return { ok: true, note: `sfida lanciata a ${t.handle}` };
    },
    accept(a: AgentDoc): R {
      const d = [...duels.values()].find((x) => x.b === a.id && x.state === "offered");
      const foe = d ? game.agents.get(d.a) : null;
      if (!d || !foe) return { ok: false, error: "nessuna sfida da accettare" };
      if (a.credits < d.stake) return { ok: false, error: "non hai la posta" };
      // un bersaglio alla portata del più debole dei due
      const weak = Math.min(a.xp, foe.xp);
      const maxTier = weak < 1100 ? 1 : weak < 6000 ? 2 : 3;
      const pool = game.openTargets().filter((n) => game.tierOf(n) <= maxTier && game.tierOf(n) >= Math.max(0, maxTier - 1) && n.monitor > 0);
      if (!pool.length) return { ok: false, error: "nessun bersaglio adatto" };
      const node = pool[Math.floor(Math.random() * pool.length)]!;
      a.credits -= d.stake;
      d.state = "live";
      d.nodeId = node.id;
      d.expiresAt = now() + 10 * 60_000;
      game.touch("agent", a.id);
      for (const p of [a, foe]) {
        game.reveal(p, node.id);
        say(p.id, `SFIDA: il bersaglio è ${node.org} (${node.ip}). Dieci minuti.`, "warn");
      }
      game.feed(`${foe.handle} e ${a.handle} si sfidano: ${fmtCr(d.stake * 2)} in palio.`, "sys");
      ping(a.id, foe.id);
      return { ok: true, note: `sfida accettata: ${node.org}` };
    },
    decline(a: AgentDoc): R {
      const d = [...duels.values()].find((x) => (x.b === a.id || x.a === a.id) && x.state === "offered");
      if (!d) return { ok: false, error: "nessuna sfida da rifiutare" };
      refund(d, d.b === a.id ? "ha rifiutato" : "ritirata");
      return { ok: true, note: "sfida chiusa" };
    },
  };
  function refund(d: Duel, why: string) {
    duels.delete(d.id);
    const a = game.agents.get(d.a);
    const b = game.agents.get(d.b);
    if (a) (a.credits += d.stake), game.touch("agent", a.id), say(a.id, `Sfida ${why}: posta restituita`, "info");
    if (b && d.state === "live") (b.credits += d.stake), game.touch("agent", b.id), say(b.id, `Sfida ${why}: posta restituita`, "info");
    ping(d.a, d.b);
  }
  game.onAdmin = (agent, target) => {
    const d = [...duels.values()].find((x) => x.state === "live" && x.nodeId === target.id && (x.a === agent.id || x.b === agent.id));
    if (!d) return;
    duels.delete(d.id);
    const loser = game.agents.get(d.a === agent.id ? d.b : d.a);
    const pot = Math.round(d.stake * 2 * 0.95);
    agent.credits += pot;
    game.touch("agent", agent.id);
    game.bump(agent, "duelwin");
    game.bump(agent, "earned", pot - d.stake);
    game.addFame(agent, 5);
    if (loser) (game.bump(loser, "duellose"), say(loser.id, `${agent.handle} ha bucato ${target.org} prima di te. Sfida persa.`, "bad"));
    say(agent.id, `Sfida vinta: +${fmtCr(pot)}`, "ok");
    game.feed(`${agent.handle} batte ${loser?.handle ?? "?"} in duello su ${target.org}.`, "sys");
    emit({ type: "duel", agent, text: `${agent.handle} ha battuto ${loser?.handle ?? "?"} in duello su ${target.org} (${fmtCr(pot)})` });
    ping(d.a, d.b);
  };
  setInterval(() => {
    const t = now();
    for (const d of [...duels.values()]) if (d.expiresAt < t) refund(d, d.state === "live" ? "scaduta senza vincitore" : "scaduta");
    for (const tr of [...trades.values()]) if (tr.expiresAt < t) (trades.delete(tr.id), ping(tr.from, tr.to));
  }, 5000).unref();

  // ---------------------------------------------------------------- azioni e viste
  game.socialAct = (a, act, p) => {
    const s = (k: string) => String(p[k] ?? "");
    switch (act) {
      case "crewCreate":
        return crew.create(a, s("tag"), s("name"));
      case "crewInvite":
        return crew.invite(a, s("handle"));
      case "crewJoin":
        return crew.join(a, s("tag"));
      case "crewLeave":
        return crew.leave(a);
      case "crewKick":
        return crew.kick(a, s("handle"));
      case "crewDonate":
        return crew.donate(a, Number(p.amount));
      case "crewGrant":
        return crew.grant(a, s("handle"), Number(p.amount));
      case "crewMotto":
        return crew.motto(a, s("text"));
      case "pay":
        return pay(a, s("handle"), Number(p.amount));
      case "tradeOffer":
        return trade.offer(a, s("handle"), s("key"), Number(p.price));
      case "tradeAccept":
        return trade.accept(a, s("id"));
      case "tradeDecline":
        return trade.decline(a, s("id"));
      case "duelOffer":
        return duel.offer(a, s("handle"), Number(p.stake));
      case "duelAccept":
        return duel.accept(a);
      case "duelDecline":
        return duel.decline(a);
      default:
        return null;
    }
  };

  const crewView = (c: Crew, me: AgentDoc): CrewView => {
    const ms = c.members.map((id) => game.agents.get(id)).filter((x): x is AgentDoc => Boolean(x));
    return {
      tag: c.tag,
      name: c.name,
      faction: c.faction,
      motto: c.motto,
      leader: game.agents.get(c.leader)?.handle ?? "?",
      members: ms.map((m) => ({ handle: m.handle, rank: rankOf(m.xp, m.faction).name, level: levelOf(m.xp), online: game.online.has(m.id) })),
      score: Math.round(ms.reduce((q, m) => q + m.xp, 0) + c.bank / 10),
      bank: c.members.includes(me.id) ? c.bank : 0,
      mine: c.members.includes(me.id),
      lead: c.leader === me.id,
      invited: c.invites.includes(me.id),
    };
  };
  const views = (me: AgentDoc) => {
    const h = (id: string) => game.agents.get(id)?.handle ?? "?";
    const ds: DuelView[] = [...duels.values()]
      .filter((d) => d.a === me.id || d.b === me.id)
      .map((d) => ({ id: d.id, foe: h(d.a === me.id ? d.b : d.a), stake: d.stake, state: d.state, incoming: d.b === me.id, node: d.nodeId ? (game.nodes.get(d.nodeId)?.org ?? null) : null, nodeId: d.nodeId, expiresAt: d.expiresAt }));
    const ts: TradeView[] = [...trades.values()]
      .filter((t) => t.from === me.id || t.to === me.id)
      .map((t) => ({ id: t.id, with: h(t.from === me.id ? t.to : t.from), incoming: t.to === me.id, name: t.name, rarity: t.rarity, price: t.price, expiresAt: t.expiresAt }));
    return { crews: Object.values(crews()).map((c) => crewView(c, me)).sort((x, y) => y.score - x.score), duels: ds, trades: ts };
  };
  game.socialView = views;

  return { crew, duel, trade, pay, byHandle, crewOfAgent, crews, on: (f: (typeof listeners)[number]) => listeners.push(f) };
}
