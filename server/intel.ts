// Informazioni come merce (regole in shared/intel.ts). Il modulo tiene quello che ogni giocatore sa e che il resto
// del gioco non conserva (la password di root com'era quando l'ha presa, le mappe delle reti interne), la bancarella
// degli annunci, il Mediatore, le segnalazioni alle aziende e le soffiate alla Guardia. Gli abitanti vendono e comprano
// come i giocatori: chi compra una password la usa davvero, e la Cronaca lo racconta.
import type { Game, AgentDoc, NodeDoc } from "./game.ts";
import { PEOPLE } from "./people.ts";
import { fmtCr } from "../shared/rules.ts";
import { warrantLevel } from "../shared/depth.ts";
import { TRUST_DELTA } from "../shared/law.ts";
import {
  BROKER_DAILY,
  BROKER_HEAT,
  BROKER_RISK,
  BROKER_SHARE,
  COPY_DECAY,
  DISCLOSE_BLUE,
  DISCLOSE_SHARE,
  INNER_BOUGHT_H,
  INNER_SELL_H,
  INTEL_FEE,
  INTEL_LISTING_H,
  INTEL_MAX_LISTINGS,
  INTEL_MAX_PRICE,
  INTEL_MIN_PRICE,
  INTEL_NAME,
  NPC_BUYS_DAILY,
  intelValue,
  snitchPay,
  type IntelKind,
  type IntelListing,
  type IntelPiece,
  type IntelView,
} from "../shared/intel.ts";

type R = { ok: boolean; error?: string; note?: string; data?: unknown };
type Listing = {
  id: string;
  key: string;
  kind: IntelKind;
  title: string;
  sellerId: string | null; // null: un abitante
  seller: string;
  price: number;
  at: number;
  until: number;
  buyers: string[]; // id dei giocatori e handle degli abitanti che l'hanno comprata
  pw?: string; // per le password: com'era quando è stata messa in vendita
  ip?: string; // per gli indirizzi
};
type Know = {
  cred: Record<string, { pw: string; at: number }>;
  inner: Record<string, number>;
  bought: string[];
  broker: Record<string, number>;
  brokerDay: { day: number; n: number };
  npcDay: { day: number; n: number };
  snitched: Record<string, number>;
  disclosed: Record<string, number>;
};
type State = { know: Record<string, Know>; listings: Listing[]; holders: Record<string, number>; maps: Record<string, Record<string, number>>; seq: number; log: Record<string, { at: number; text: string }[]>; npcAt: number };
type Orgs = { news: (kind: "difesa" | "legge" | "gente" | "economia" | "intrusione", text: string, n: NodeDoc | null, feed?: boolean) => void; isOrg: (n: NodeDoc) => boolean };
type Citizens = { facts: (pid: string) => { debt: number; affair: string | null; fired: string | null; admin: boolean; employer: string | null } | null; learn: (a: AgentDoc, pid: string) => void };

const now = () => Date.now();
const H = 3600_000;
const DAY = 24 * H;
const today = () => Math.floor(now() / DAY);
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;
const dev = () => process.env.AETHER_DEV === "1";

export function installIntel(game: Game, orgs: Orgs, citizens: Citizens) {
  const state: State = game.store.get<State>("intel", "state") ?? { know: {}, listings: [], holders: {}, maps: {}, seq: 0, log: {}, npcAt: 0 };
  let dirty = false;
  const know = (id: string): Know => {
    const k = (state.know[id] ??= { cred: {}, inner: {}, bought: [], broker: {}, brokerDay: { day: 0, n: 0 }, npcDay: { day: 0, n: 0 }, snitched: {}, disclosed: {} });
    if (k.brokerDay.day !== today()) k.brokerDay = { day: today(), n: 0 };
    if (k.npcDay.day !== today()) k.npcDay = { day: today(), n: 0 };
    return k;
  };
  const note = (a: { id: string }, text: string) => {
    const l = (state.log[a.id] ??= []);
    l.unshift({ at: now(), text });
    l.splice(12);
    dirty = true;
  };
  const agentByHandle = (h: string) => [...game.agents.values()].find((x) => x.handle === h) ?? null;
  const innerBehind = (front: NodeDoc) => [...game.nodes.values()].find((x) => x.inner === front.id) ?? null;
  const decay = (key: string, extra = 0) => Math.pow(COPY_DECAY, (state.holders[key] ?? 0) + extra);
  const dialKnown = (id: string) => [...game.agents.values()].filter((x) => !x.npc && x.discovered.includes(id)).length;

  // ---------------------------------------------------------------- quello che si impara giocando
  const origDeed = game.deed.bind(game);
  game.deed = (agent, d, node) => {
    origDeed(agent, d, node);
    if (!node || agent.npc) return;
    if (d === "admin" && node.kind !== "gateway") {
      know(agent.id).cred[node.id] = { pw: node.password, at: now() };
      dirty = true;
    }
    if (d === "z:pivot") {
      const inner = innerBehind(node);
      if (inner) (know(agent.id).inner[inner.id] = now()), (dirty = true);
    }
  };
  // chi ha comprato una mappa raggiunge la macchina interna senza passare dal nodo davanti
  const prevReach = game.canReach;
  game.canReach = (agent, target) => ((state.maps[agent.id]?.[target.id] ?? 0) > now() ? null : (prevReach?.(agent, target) ?? null));

  // ---------------------------------------------------------------- che cosa vale
  type Raw = { key: string; kind: IntelKind; title: string; detail: string; fresh: boolean; note: string; fair: number; node?: NodeDoc; target?: AgentDoc; ip?: string; pw?: string };
  const ago = (t: number) => {
    const h = Math.floor((now() - t) / H);
    return h < 1 ? "da meno di un'ora" : h < 24 ? `da ${h} ore` : `da ${Math.floor(h / 24)} giorni`;
  };
  function rawOf(a: AgentDoc): Raw[] {
    const k = know(a.id);
    const out: Raw[] = [];
    for (const [id, c] of Object.entries(k.cred)) {
      const n = game.nodes.get(id);
      if (!n) continue;
      const fresh = n.password === c.pw;
      const key = `cred:${id}`;
      out.push({ key, kind: "cred", node: n, pw: c.pw, title: `${n.org} (${n.city ?? n.name})`, detail: `${n.ip} · root: ${c.pw}`, fresh, note: fresh ? `la sai ${ago(c.at)}` : "bruciata: l'hanno cambiata", fair: fresh ? Math.round(intelValue.cred(game.tierOf(n)) * decay(key)) : 0 });
    }
    const seen = new Set<string>();
    for (const kn of a.known) {
      if (!kn.handle || seen.has(kn.handle)) continue;
      seen.add(kn.handle);
      const t = agentByHandle(kn.handle);
      if (!t || t.id === a.id) continue;
      const fresh = t.gatewayIp === kn.ip;
      const key = `addr:${t.id}`;
      out.push({ key, kind: "addr", target: t, ip: kn.ip, title: t.handle, detail: kn.ip, fresh, note: fresh ? `lo sai ${ago(kn.at)}` : "bruciato: ha cambiato indirizzo", fair: fresh ? Math.round(intelValue.addr(t.fame, warrantLevel(t.charges)) * decay(key)) : 0 });
    }
    for (const id of a.discovered) {
      const n = game.nodes.get(id);
      if (!n) continue;
      const key = `dial:${id}`;
      const others = Math.max(0, dialKnown(id) - 1);
      out.push({ key, kind: "dial", node: n, title: `${n.org}`, detail: `${n.ip} · ${n.name}`, fresh: true, note: others ? `la conoscono altri ${others}` : "la conosci solo tu", fair: Math.round(intelValue.dial(game.tierOf(n)) * decay(key, others)) });
    }
    for (const [id, at] of Object.entries(k.inner)) {
      const n = game.nodes.get(id);
      const front = n?.inner ? game.nodes.get(n.inner) : null;
      if (!n || !front) continue;
      const fresh = now() - at < INNER_SELL_H * H;
      const key = `inner:${id}`;
      out.push({ key, kind: "inner", node: n, title: `${front.org}: ${n.name}`, detail: `${n.ip}, dietro ${front.ip}`, fresh, note: fresh ? `mappata ${ago(at)}` : "vecchia: va rimappata", fair: fresh ? Math.round(intelValue.inner(game.tierOf(n)) * decay(key)) : 0 });
    }
    for (const pid of (a as unknown as { dossiers?: string[] }).dossiers ?? []) {
      const p = PEOPLE.find((x) => x.id === pid);
      const f = citizens.facts(pid);
      if (!p || !f) continue;
      const key = `dossier:${pid}`;
      const bits = [f.debt > 3000 ? `debiti per ${fmtCr(f.debt)}` : null, f.affair ? `una relazione con ${f.affair}` : null, f.fired ? `licenziata da ${f.fired}` : null, f.admin && f.employer ? `amministra i sistemi di ${f.employer}` : null].filter(Boolean);
      out.push({ key, kind: "dossier", title: `${p.name}, ${p.job}`, detail: bits.length ? bits.join(", ") : "niente di interessante", fresh: true, note: p.city, fair: Math.round(intelValue.dossier({ debt: f.debt, affair: Boolean(f.affair), fired: Boolean(f.fired), admin: f.admin }) * decay(key)) });
    }
    return out;
  }
  /** Lo sa già? Per gli annunci: chi la sa non la ricompra. */
  function knows(a: AgentDoc, l: Listing) {
    const [kind, id] = [l.kind, l.key.slice(l.key.indexOf(":") + 1)];
    if (kind === "cred") return know(a.id).cred[id]?.pw === l.pw;
    if (kind === "addr") return a.id === id || a.known.some((k) => k.ip === l.ip);
    if (kind === "dial") return a.discovered.includes(id);
    if (kind === "inner") return (state.maps[a.id]?.[id] ?? 0) > now() || now() - (know(a.id).inner[id] ?? 0) < INNER_SELL_H * H;
    return ((a as unknown as { dossiers?: string[] }).dossiers ?? []).includes(id);
  }
  /** Un annuncio è ancora buono? Una password cambiata o un gateway spostato bruciano l'annuncio. */
  function valid(l: Listing) {
    const id = l.key.slice(l.key.indexOf(":") + 1);
    if (l.kind === "cred") return game.nodes.get(id)?.password === l.pw;
    if (l.kind === "addr") return game.agents.get(id)?.gatewayIp === l.ip;
    return true;
  }
  function piecesOf(a: AgentDoc): IntelPiece[] {
    const k = know(a.id);
    return rawOf(a).map((r) => {
      const bought = k.bought.includes(r.key);
      const listing = state.listings.find((l) => l.sellerId === a.id && l.key === r.key && l.until > now())?.id ?? null;
      let quoteWhy: string | null = null;
      if (!r.fresh) quoteWhy = "non vale più niente";
      else if (bought) quoteWhy = "il Mediatore non compra roba di seconda mano";
      else if (now() - (k.broker[r.key] ?? 0) < 7 * DAY) quoteWhy = "gliel'hai già venduta";
      else if (k.brokerDay.n >= BROKER_DAILY) quoteWhy = "per oggi il Mediatore ha comprato abbastanza da te";
      const quote = quoteWhy ? 0 : Math.max(20, Math.round(r.fair * BROKER_SHARE));
      let discloseWhy: string | null = null;
      let disclose = 0;
      if (r.kind === "cred" && r.node) {
        if (!r.fresh) discloseWhy = "è già cambiata";
        else if (!orgs.isOrg(r.node) || !r.node.gen) discloseWhy = "lì nessuno paga le segnalazioni";
        else if (now() - (k.disclosed[r.node.id] ?? 0) < DAY) discloseWhy = "li hai già avvisati oggi";
        else disclose = Math.round(intelValue.cred(game.tierOf(r.node)) * DISCLOSE_SHARE * (a.faction === "blue" ? DISCLOSE_BLUE : 1));
      }
      let snitchWhy: string | null = null;
      let snitch = 0;
      if (r.kind === "addr" && r.target) {
        const w = warrantLevel(r.target.charges);
        if (!r.fresh) snitchWhy = "quell'indirizzo non è più suo";
        else if (r.target.npc) snitchWhy = "la Guardia lo conosce già";
        else if (w < 1 && r.target.heat < 30) snitchWhy = "non è ricercato: alla Guardia non interessa";
        else if (now() - (k.snitched[r.target.id] ?? 0) < DAY) snitchWhy = "l'hai già venduto oggi";
        else snitch = snitchPay(w, r.target.heat);
      }
      return { key: r.key, kind: r.kind, title: r.title, detail: r.detail, fresh: r.fresh, note: r.note, bought, fair: r.fair, quote, quoteWhy, listing, disclose, discloseWhy, snitch, snitchWhy };
    });
  }
  function view(a: AgentDoc): IntelView {
    state.listings = state.listings.filter((l) => l.until > now());
    const board: IntelListing[] = state.listings
      .filter(valid)
      .map((l) => ({ id: l.id, kind: l.kind, title: l.title, seller: l.seller, npc: !l.sellerId, price: l.price, until: l.until, sold: l.buyers.length, mine: l.sellerId === a.id, owned: l.sellerId !== a.id && knows(a, l) }))
      .sort((x, y) => Number(y.mine) - Number(x.mine) || y.until - x.until);
    return { pieces: piecesOf(a).sort((x, y) => Number(y.fresh) - Number(x.fresh) || y.fair - x.fair), board, brokerLeft: Math.max(0, BROKER_DAILY - know(a.id).brokerDay.n), log: state.log[a.id] ?? [] };
  }

  // ---------------------------------------------------------------- consegna
  function deliver(b: AgentDoc, l: Listing) {
    const id = l.key.slice(l.key.indexOf(":") + 1);
    const k = know(b.id);
    if (!k.bought.includes(l.key)) k.bought.push(l.key);
    k.bought.splice(0, Math.max(0, k.bought.length - 200));
    if (l.kind === "cred") {
      const n = game.nodes.get(id)!;
      k.cred[id] = { pw: l.pw!, at: now() };
      game.reveal(b, id);
      game.mail(b, l.seller, `Quello che hai comprato: ${n.org}`, `${n.name} · ${n.ip}\nUtente: root\nPassword: ${l.pw}\n\nL'ho usata io, e funzionava. Se l'hanno cambiata nel frattempo, non è colpa mia.`);
    } else if (l.kind === "addr") {
      const t = game.agents.get(id)!;
      game.learn(b, l.ip!, t.handle, `comprato alla bancarella da ${l.seller}`);
      game.mail(b, l.seller, `Quello che hai comprato: ${t.handle}`, `Il gateway di ${t.handle} risponde al ${l.ip}. È nella tua rubrica.`);
    } else if (l.kind === "dial") {
      const n = game.nodes.get(id)!;
      if (!b.discovered.includes(id)) b.discovered.push(id);
      game.mail(b, l.seller, `Quello che hai comprato: un numero`, `${n.ip} · ${n.name} · ${n.org}\n${n.blurb}\n\nNon è su nessuna mappa. Ora è sulla tua.`);
    } else if (l.kind === "inner") {
      const n = game.nodes.get(id)!;
      (state.maps[b.id] ??= {})[id] = now() + INNER_BOUGHT_H * H;
      game.reveal(b, id);
      if (n.inner) game.reveal(b, n.inner);
      game.mail(b, l.seller, `Quello che hai comprato: una mappa`, `La rete interna di ${game.nodes.get(n.inner ?? "")?.org ?? "?"}: ${n.name} risponde al ${n.ip}.\nCon questa mappa ci arrivi dritto, senza passare dal nodo davanti, per ${INNER_BOUGHT_H} ore.`);
    } else {
      citizens.learn(b, id);
      const p = PEOPLE.find((x) => x.id === id);
      game.mail(b, l.seller, `Quello che hai comprato: ${p?.name ?? "un fascicolo"}`, `Il fascicolo è nella voce Persone, completo: debiti, relazioni, chi l'ha lasciata a casa.`);
    }
    state.holders[l.key] = (state.holders[l.key] ?? 0) + 1;
    game.touch("agent", b.id);
    game.dirty.add(b.id);
    dirty = true;
  }
  function paySeller(l: Listing, buyer: string) {
    if (!l.sellerId) return;
    const s = game.agents.get(l.sellerId);
    if (!s) return;
    const net = Math.round(l.price * (1 - INTEL_FEE));
    s.credits += net;
    game.bump(s, "intel:sold");
    game.bump(s, "intel:cr", net);
    note(s, `${buyer} ha comprato «${INTEL_NAME[l.kind]}: ${l.title}» · +${fmtCr(net)}`);
    game.touch("agent", s.id);
    game.dirty.add(s.id);
  }
  /** Una password cambiata brucia tutti gli annunci che la vendevano. */
  function burn(key: string, why: string) {
    for (const l of state.listings.filter((x) => x.key === key && !valid(x))) {
      const s = l.sellerId ? game.agents.get(l.sellerId) : null;
      if (s) note(s, `«${INTEL_NAME[l.kind]}: ${l.title}» è bruciata: ${why}`);
    }
    state.listings = state.listings.filter((x) => x.key !== key || valid(x));
    dirty = true;
  }

  // ---------------------------------------------------------------- azioni
  function act(a: AgentDoc, p: Record<string, unknown>): R {
    const cmd = String(p.cmd ?? "view");
    const ok = (text: string): R => (game.touch("agent", a.id), game.dirty.add(a.id), (dirty = true), { ok: true, note: text, data: view(a) });
    if (cmd === "view") return { ok: true, data: view(a) };
    if (cmd === "dev" && dev()) {
      if (p.cred) {
        const n = game.nodes.get(String(p.cred));
        if (n) know(a.id).cred[n.id] = { pw: n.password, at: now() };
      }
      if (p.inner) know(a.id).inner[String(p.inner)] = now();
      if (typeof p.heat === "number") a.heat = p.heat;
      if (typeof p.learnAddr === "string") {
        const t = agentByHandle(p.learnAddr);
        if (t) game.learn(a, t.gatewayIp, t.handle, "prova");
      }
      if (p.rotate) {
        const n = game.nodes.get(String(p.rotate));
        if (n) game.react(n, null), burn(`cred:${n.id}`, "l'hanno cambiata");
      }
      if (p.npcList) (state.npcAt = 0), stockNpc(true);
      if (p.npcBuy) npcBuy(true);
      if (p.reset) Object.assign(know(a.id), { brokerDay: { day: today(), n: 0 }, npcDay: { day: today(), n: 0 }, broker: {}, snitched: {}, disclosed: {} });
      if (p.risk !== undefined) riskOverride = Number(p.risk);
      dirty = true;
      return { ok: true, data: view(a) };
    }
    const key = String(p.key ?? "");
    const raw = cmd === "broker" || cmd === "list" || cmd === "disclose" || cmd === "snitch" ? piecesOf(a).find((x) => x.key === key) : null;
    switch (cmd) {
      case "broker": {
        if (!raw) return { ok: false, error: "non sai niente del genere" };
        if (raw.quoteWhy) return { ok: false, error: raw.quoteWhy };
        const k = know(a.id);
        k.broker[key] = now();
        k.brokerDay.n += 1;
        a.credits += raw.quote;
        state.holders[key] = (state.holders[key] ?? 0) + 1;
        game.bump(a, "intel:sold");
        game.bump(a, "intel:cr", raw.quote);
        note(a, `Mediatore: «${INTEL_NAME[raw.kind]}: ${raw.title}» · +${fmtCr(raw.quote)}`);
        if (Math.random() < (riskOverride ?? BROKER_RISK)) {
          a.heat = Math.min(100, a.heat + BROKER_HEAT);
          game.mail(a, "Il Mediatore", "Un problema", `Mi tenevano d'occhio. Non so quanto hanno visto. Per un po' non cercarmi.\n\nCalore +${BROKER_HEAT}.`);
          return ok(`venduta per ${fmtCr(raw.quote)}, ma il Mediatore era sorvegliato: calore +${BROKER_HEAT}`);
        }
        return ok(`il Mediatore paga ${fmtCr(raw.quote)}`);
      }
      case "list": {
        if (!raw) return { ok: false, error: "non sai niente del genere" };
        if (!raw.fresh) return { ok: false, error: "non vale più niente" };
        if (raw.kind === "inner" && raw.bought) return { ok: false, error: "una mappa comprata non si rivende" };
        if (raw.listing) return { ok: false, error: "è già in bancarella" };
        if (state.listings.filter((l) => l.sellerId === a.id && l.until > now()).length >= INTEL_MAX_LISTINGS) return { ok: false, error: `al massimo ${INTEL_MAX_LISTINGS} annunci` };
        const price = Math.round(Number(p.price));
        if (!Number.isFinite(price) || price < INTEL_MIN_PRICE || price > INTEL_MAX_PRICE) return { ok: false, error: `prezzo fra ${fmtCr(INTEL_MIN_PRICE)} e ${fmtCr(INTEL_MAX_PRICE)}` };
        const r = rawOf(a).find((x) => x.key === key)!;
        state.listings.push({ id: `i${++state.seq}`, key, kind: raw.kind, title: raw.title, sellerId: a.id, seller: a.handle, price, at: now(), until: now() + INTEL_LISTING_H * H, buyers: [], pw: r.pw, ip: r.ip });
        return ok(`in bancarella per ${INTEL_LISTING_H} ore a ${fmtCr(price)}`);
      }
      case "unlist": {
        const i = state.listings.findIndex((l) => l.id === p.id && l.sellerId === a.id);
        if (i < 0) return { ok: false, error: "annuncio sparito" };
        state.listings.splice(i, 1);
        return ok("annuncio ritirato");
      }
      case "buy": {
        const l = state.listings.find((x) => x.id === p.id && x.until > now());
        if (!l) return { ok: false, error: "annuncio sparito" };
        if (l.sellerId === a.id) return { ok: false, error: "è tuo" };
        if (!valid(l)) return burn(l.key, "non vale più"), { ok: false, error: "nel frattempo è bruciata: annuncio ritirato" };
        if (l.buyers.includes(a.id) || knows(a, l)) return { ok: false, error: "la sai già" };
        if (a.credits < l.price) return { ok: false, error: `ti servono ${fmtCr(l.price)}` };
        a.credits -= l.price;
        l.buyers.push(a.id);
        deliver(a, l);
        paySeller(l, a.handle);
        game.bump(a, "intel:bought");
        note(a, `comprato «${INTEL_NAME[l.kind]}: ${l.title}» da ${l.seller} · −${fmtCr(l.price)}`);
        return ok(`comprata: guarda la posta`);
      }
      case "disclose": {
        if (!raw) return { ok: false, error: "non sai niente del genere" };
        if (raw.discloseWhy || !raw.disclose) return { ok: false, error: raw.discloseWhy ?? "non si può" };
        const n = game.nodes.get(key.slice(5))!;
        know(a.id).disclosed[n.id] = now();
        a.credits += raw.disclose;
        a.ethics = Math.min(100, a.ethics + 4);
        game.react(n, null);
        burn(key, `${n.org} ha cambiato le password`);
        orgs.news("difesa", `${n.org} ringrazia una segnalazione anonima: «Qualcuno vendeva le nostre credenziali». Le password di root sono state cambiate nella notte.`, n);
        game.lawTrust?.(TRUST_DELTA.disclose, null);
        game.bump(a, "intel:disclose");
        game.bump(a, "intel:cr", raw.disclose);
        note(a, `segnalazione a ${n.org} · +${fmtCr(raw.disclose)}`);
        return ok(`${n.org} ti ringrazia e paga ${fmtCr(raw.disclose)}. Le loro password non valgono più niente, per nessuno.`);
      }
      case "snitch": {
        if (!raw) return { ok: false, error: "non sai niente del genere" };
        if (raw.snitchWhy || !raw.snitch) return { ok: false, error: raw.snitchWhy ?? "non si può" };
        const t = game.agents.get(key.slice(5))!;
        know(a.id).snitched[t.id] = now();
        a.credits += raw.snitch;
        if (a.faction === "red") a.ethics = Math.max(-100, a.ethics - 8);
        let n = 0;
        for (const b of game.agents.values()) if (!b.npc && b.faction === "blue" && b.id !== t.id && b.id !== a.id) (game.learn(b, t.gatewayIp, t.handle, "dalla Guardia: un informatore"), game.dirty.add(b.id), (n += 1));
        const named = Math.random() < 0.2;
        game.mail(t, "Un amico", "Ti hanno venduto", `Il tuo indirizzo gira fra i blu: qualcuno l'ha venduto alla Guardia.${named ? ` Il nome che si fa è ${a.handle}.` : ""}\n\nSe fossi in te cambierei gateway.`);
        game.dirty.add(t.id);
        orgs.news("legge", `La Guardia del Reticolo riceve una soffiata: l'indirizzo di ${t.handle} ora è sulle scrivanie degli agenti.`, null);
        game.lawTrust?.(TRUST_DELTA.snitch, null);
        game.bump(a, "intel:snitch");
        game.bump(a, "intel:cr", raw.snitch);
        note(a, `soffiata alla Guardia su ${t.handle} · +${fmtCr(raw.snitch)}`);
        return ok(`la Guardia paga ${fmtCr(raw.snitch)}${n ? `: ${n} agent${n === 1 ? "e" : "i"} ora sa${n === 1 ? "" : "nno"} dove trovarlo` : ""}`);
      }
    }
    return { ok: false, error: "comando sconosciuto" };
  }
  let riskOverride: number | null = null;
  const prev = game.socialAct;
  game.socialAct = (agent, a, p) => (a === "intel" ? act(agent, p) : (prev?.(agent, a, p) ?? null));

  // ---------------------------------------------------------------- gli abitanti
  /** Gli abitanti mettono in bancarella quello che sanno: roba vera, che scade come quella dei giocatori. */
  function stockNpc(force = false) {
    if (!force && now() - state.npcAt < 3 * H) return;
    state.npcAt = now();
    const sellers = game.lifeBuyers?.() ?? [];
    if (!sellers.length) return;
    const npcLive = () => state.listings.filter((l) => !l.sellerId && l.until > now() && valid(l));
    for (let tries = 0; npcLive().length < 4 && tries < 12; tries += 1) {
      const s = pick(sellers);
      const nodes = [...game.nodes.values()];
      let l: Omit<Listing, "id" | "sellerId" | "seller" | "at" | "until" | "buyers"> | null = null;
      const roll = Math.random();
      if (s.side !== "blue" && roll < 0.5) {
        const n = pick(nodes.filter((x) => x.gen && !x.hidden && !x.inner && orgs.isOrg(x) && game.tierOf(x) >= 1 && game.tierOf(x) <= 3));
        if (n) l = { key: `cred:${n.id}`, kind: "cred", title: `${n.org} (${n.city ?? n.name})`, price: Math.round(intelValue.cred(game.tierOf(n)) * (1.15 + Math.random() * 0.35)), pw: n.password };
      } else if (s.side !== "blue" && roll < 0.65) {
        const n = pick(nodes.filter((x) => x.inner));
        if (n) l = { key: `inner:${n.id}`, kind: "inner", title: `${game.nodes.get(n.inner!)?.org ?? "?"}: ${n.name}`, price: Math.round(intelValue.inner(game.tierOf(n)) * (1.15 + Math.random() * 0.35)) };
      } else if (roll < 0.8) {
        const n = pick(nodes.filter((x) => x.hidden));
        if (n) l = { key: `dial:${n.id}`, kind: "dial", title: `${n.org}`, price: Math.round(intelValue.dial(game.tierOf(n)) * (1.15 + Math.random() * 0.35)) };
      } else {
        const juicy = PEOPLE.filter((x) => {
          const f = citizens.facts(x.id);
          return f && (f.debt > 3000 || f.affair || f.admin);
        });
        const q = juicy.length ? pick(juicy) : null;
        const f = q ? citizens.facts(q.id)! : null;
        if (q && f) l = { key: `dossier:${q.id}`, kind: "dossier", title: `${q.name}, ${q.job}`, price: Math.round(intelValue.dossier({ debt: f.debt, affair: Boolean(f.affair), fired: Boolean(f.fired), admin: f.admin }) * (1.15 + Math.random() * 0.35)) };
      }
      if (!l || state.listings.some((x) => x.key === l!.key && !x.sellerId)) continue;
      state.listings.push({ ...l, id: `i${++state.seq}`, sellerId: null, seller: s.handle, at: now(), until: now() + INTEL_LISTING_H * H, buyers: [] });
    }
    dirty = true;
  }
  /** Gli abitanti comprano dai giocatori, se il prezzo è onesto. Chi compra una password la usa. */
  function npcBuy(force = false) {
    const buyers = game.lifeBuyers?.() ?? [];
    if (!buyers.length) return;
    for (const l of state.listings) {
      if (!l.sellerId || l.until < now() || !valid(l) || l.kind === "addr" || l.kind === "inner") continue;
      const seller = game.agents.get(l.sellerId);
      if (!seller) continue;
      const k = know(seller.id);
      if (k.npcDay.n >= NPC_BUYS_DAILY || l.buyers.filter((b) => !game.agents.has(b)).length >= 3) continue;
      if (!force && Math.random() > 0.04) continue;
      const id = l.key.slice(l.key.indexOf(":") + 1);
      const n = game.nodes.get(id);
      const f = l.kind === "dossier" ? citizens.facts(id) : null;
      const fair = l.kind === "cred" && n ? intelValue.cred(game.tierOf(n)) : l.kind === "dial" && n ? intelValue.dial(game.tierOf(n)) : f ? intelValue.dossier({ debt: f.debt, affair: Boolean(f.affair), fired: Boolean(f.fired), admin: f.admin }) : 0;
      if (l.price > fair * 1.3 * decay(l.key)) continue;
      const who = buyers.filter((b) => (l.kind === "dossier" || b.side !== "blue") && b.credits >= l.price && !l.buyers.includes(b.handle));
      if (!who.length) continue;
      const b = pick(who);
      if (!game.lifeBuy?.(b.handle, l.price, l.kind === "cred" ? id : null)) continue;
      l.buyers.push(b.handle);
      k.npcDay.n += 1;
      state.holders[l.key] = (state.holders[l.key] ?? 0) + 1;
      paySeller(l, b.handle);
      if (l.kind === "cred" && n) orgs.news("intrusione", `${n.org}: un accesso da amministratore, con la password giusta, da un indirizzo che nessuno conosce. «Qualcuno l'ha venduta», si dice in azienda.`, n, false);
      if (l.kind === "cred" && n) game.mail(seller, b.handle, `Grazie per ${n.org}`, `Ho comprato la tua password alla bancarella. Funzionava: sono entrato stanotte. Se ne hai altre, sai dove trovarmi.\n\n${b.handle}, da ${b.city}`);
      dirty = true;
    }
  }
  game.onPulse.push(() => {
    state.listings = state.listings.filter((l) => l.until > now());
    stockNpc();
    npcBuy();
    for (const m of Object.values(state.maps)) for (const [id, until] of Object.entries(m)) if (until < now()) delete m[id];
    dirty = true;
  });

  return {
    save() {
      if (!dirty) return;
      dirty = false;
      game.store.put("intel", "state", state);
    },
  };
}

export const INTEL_KINDS = Object.keys(INTEL_NAME) as IntelKind[];
