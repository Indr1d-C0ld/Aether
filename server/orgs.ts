// Organizzazioni vive, cronaca ed eventi di mondo (tipi in shared/orgs.ts).
// Ascolta le gesta dei giocatori (Game.deed) e quelle degli abitanti (Game.orgEvent), tiene lo stato di ogni
// organizzazione, la fa reagire, e scrive la Cronaca. Niente sparisce per sempre: chi fallisce viene comprato.
import type { Game, NodeDoc, AgentDoc } from "./game.ts";
import { REGION_NAME, fmtCr, regionAt } from "../shared/rules.ts";
import { hoursOf, staffed, dayPart } from "../shared/clock.ts";
import { EMERGENCY_AT, type NewsKind, type NewsRow, type OrgStatus, type OrgView, type WorldView } from "../shared/orgs.ts";

type Sec = { proxy: number; firewall: number; monitor: number };
type Org = { cash: number; rep: number; morale: number; fear: number; cuts: boolean; crisisSince: number; strikeUntil: number; group: string | null; rivals: Record<string, number>; hist: { at: number; text: string }[]; base: Sec; invested: number; investedAt: number; hits: number[] };
type War = { a: string; b: string; until: number; lastJob: number; aLoss: number; bLoss: number };
type State = { orgs: Record<string, Org>; news: { id: number; at: number; kind: NewsKind; text: string; org: string | null }[]; seq: number; wars: War[]; emergencyUntil: number; alerts: Record<string, number>; intrusions: number[] };
type Kind = "intrusione" | "furto" | "sabotaggio" | "infezione" | "difesa";

const now = () => Date.now();
const H = 3600_000;
const hash = (s: string) => [...s].reduce((q, c) => (Math.imul(q, 33) ^ c.charCodeAt(0)) >>> 0, 5381);
const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;
const DEED_KIND: Record<string, Kind> = { admin: "intrusione", "t:copy": "furto", "z:mastro": "furto", "z:dossier": "furto", "z:fattura": "furto", "sys:cash": "furto", transfer: "furto", alter: "furto", "sys:shutdown": "sabotaggio", "sys:blackout": "sabotaggio", "mw:sabot": "sabotaggio", "mw:plant": "infezione", "t:patch": "difesa", "av:clean": "difesa", "z:riregistra": "difesa", "z:allerta": "difesa", "z:nastri": "difesa", preside: "difesa" };

export function installOrgs(game: Game) {
  const state: State = game.store.get<State>("world", "state") ?? { orgs: {}, news: [], seq: 0, wars: [], emergencyUntil: 0, alerts: {}, intrusions: [] };
  let dirty = false;
  const isOrg = (n: NodeDoc) => !n.hidden && !n.inner && hoursOf(n.kind) !== "nessuno";
  const tier = (n: NodeDoc) => game.tierOf(n);
  const start = (n: NodeDoc) => (tier(n) + 1) * 4000 + (hash(n.id) % 3000);
  function org(n: NodeDoc): Org {
    let o = state.orgs[n.id];
    if (!o) {
      // i concorrenti: i due dello stesso tipo più vicini
      const near = [...game.nodes.values()].filter((x) => x.id !== n.id && isOrg(x) && x.kind === n.kind).sort((a, b) => Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(b.x - n.x, b.y - n.y)).slice(0, 2);
      o = state.orgs[n.id] = { cash: start(n), rep: 55 + (hash(n.id + "r") % 25), morale: 55 + (hash(n.id + "m") % 25), fear: 0, cuts: false, crisisSince: 0, strikeUntil: 0, group: null, rivals: Object.fromEntries(near.map((x) => [x.id, 0])), hist: [], base: { proxy: n.proxy, firewall: n.firewall, monitor: n.monitor }, invested: 0, investedAt: 0, hits: [] };
    }
    return o;
  }
  const inWar = (id: string) => state.wars.find((w) => w.until > now() && (w.a === id || w.b === id)) ?? null;
  const statusOf = (n: NodeDoc, o: Org): OrgStatus => (o.strikeUntil > now() ? "in sciopero" : o.crisisSince ? "in crisi" : inWar(n.id) ? "in guerra" : "attiva");

  function news(kind: NewsKind, text: string, n: NodeDoc | null, feed = true) {
    state.seq += 1;
    state.news.push({ id: state.seq, at: now(), kind, text, org: n?.id ?? null });
    if (state.news.length > 500) state.news.splice(0, state.news.length - 500);
    if (n) {
      const o = org(n);
      o.hist.push({ at: now(), text });
      if (o.hist.length > 12) o.hist.shift();
    }
    if (feed) game.feed(text, kind === "difesa" || kind === "legge" ? "blue" : kind === "economia" || kind === "gente" ? "sys" : "red");
    dirty = true;
  }

  // ---------------------------------------------------------------- quello che succede
  function event(n: NodeDoc, kind: Kind, who: string | null) {
    if (!isOrg(n)) return;
    const o = org(n);
    const t = tier(n);
    const day = o.hits.filter((x) => now() - x < 24 * H);
    switch (kind) {
      case "intrusione":
        o.fear = clamp(o.fear + 12);
        o.rep = clamp(o.rep - 2);
        o.hits = [...day, now()];
        state.intrusions = [...state.intrusions.filter((x) => now() - x < 24 * H), now()];
        if (o.hits.length === 3) news("intrusione", `${n.org}: terza intrusione in ventiquattr'ore. Il consiglio convoca il responsabile dei sistemi.`, n);
        break;
      case "furto":
        o.cash -= 300 + t * 220;
        o.fear = clamp(o.fear + 8);
        o.rep = clamp(o.rep - 3);
        suspect(n, o);
        break;
      case "sabotaggio":
        o.cash -= 900 + t * 450;
        o.fear = clamp(o.fear + 22);
        o.rep = clamp(o.rep - 8);
        o.morale = clamp(o.morale - 10);
        news("sabotaggio", `${n.org} (${n.city ?? "sede ignota"}) colpita da un sabotaggio. Danni stimati: ${fmtCr(900 + t * 450)}. ${who && Math.random() < 0.3 ? `In certe bacheche si fa il nome di ${who}.` : "Gli autori sono ignoti."}`, n, false);
        suspect(n, o);
        break;
      case "infezione":
        o.fear = clamp(o.fear + 5);
        break;
      case "difesa":
        o.fear = clamp(o.fear - 12);
        o.morale = clamp(o.morale + 4);
        o.rep = clamp(o.rep + 2);
        break;
    }
    const w = inWar(n.id);
    if (w && kind !== "difesa" && kind !== "infezione") w.a === n.id ? (w.aLoss += 1) : (w.bLoss += 1);
    dirty = true;
  }
  /** Chi viene derubato pensa subito al concorrente. Alla quinta volta gli dichiara guerra. */
  function suspect(n: NodeDoc, o: Org) {
    const ids = Object.keys(o.rivals).filter((id) => game.nodes.get(id));
    if (!ids.length || Math.random() > 0.4) return;
    const id = pick(ids);
    const r = game.nodes.get(id)!;
    o.rivals[id] = (o.rivals[id] ?? 0) + 1;
    if (o.rivals[id] === 3) news("guerra", `${n.org} accusa ${r.org} di spionaggio industriale. ${r.org}: «Illazioni».`, n);
    if (o.rivals[id]! >= 5 && !inWar(n.id) && !inWar(id)) {
      o.rivals[id] = 2;
      state.wars.push({ a: n.id, b: id, until: now() + 6 * H, lastJob: 0, aLoss: 0, bLoss: 0 });
      news("guerra", `Guerra commerciale fra ${n.org} e ${r.org}. Entrambe cercano «consulenti esterni»: i contratti sono in bacheca.`, n);
      org(r).hist.push({ at: now(), text: `In guerra commerciale con ${n.org}.` });
    }
  }
  game.orgEvent = event;
  const origDeed = game.deed.bind(game);
  game.deed = (agent, d, node) => {
    origDeed(agent, d, node);
    const k = DEED_KIND[d];
    // passa da game.orgEvent, così chi ascolta (server/law.ts) vede anche i colpi dei giocatori
    if (k && node && !agent.npc) game.orgEvent?.(node, k, agent.handle);
  };
  game.orgStrike = (n) => (state.orgs[n.id]?.strikeUntil ?? 0) > now();
  // chi ha tagliato il turno di notte, di notte guarda ancora meno
  game.orgWatch = (n) => (state.orgs[n.id]?.cuts && dayPart(n.x, now()) === "notte" ? 1.2 : 1);
  game.regionAlert = (region) => (state.alerts[region] ?? 0) > now();
  // lo stato d'emergenza accorcia le indagini e allunga la custodia
  const origNum = game.num.bind(game);
  game.num = (key) => origNum(key) * (state.emergencyUntil > now() ? (key === "sweepMult" ? 0.7 : key === "jailMult" ? 1.3 : 1) : 1);

  // ---------------------------------------------------------------- contratti di guerra
  function warJobs(w: War) {
    if (now() - w.lastJob < 40 * 60_000) return;
    w.lastJob = now();
    const A = game.nodes.get(w.a);
    const B = game.nodes.get(w.b);
    if (!A || !B) return;
    for (const [me, foe] of [[A, B], [B, A]] as const) {
      const red = game.baseMission("red", "chain", foe);
      red.title = `Guerra commerciale: ${foe.org}`;
      red.brief = `${me.org} è in guerra con ${foe.org} e paga di tasca sua. Entra da admin e porta via almeno un file: quello che trovi, loro sapranno usarlo.`;
      red.objectives = [{ deed: "admin", n: 1, nodeId: foe.id, label: `Diventa admin su ${foe.org}` }, { deed: "t:copy", n: 1, nodeId: foe.id, label: "Copia un file" }];
      red.reward += 700 + tier(foe) * 300;
      red.xp += 120;
      red.expiresAt = now() + 60 * 60_000;
      red.requires = game.secRequires(foe);
      game.priced(red);
      game.missions.set(red.id, red);
      game.touch("mission", red.id);
      const blue = game.baseMission("blue", "audit", me);
      blue.title = `Scorta: ${me.org}`;
      blue.brief = `${me.org} è in guerra con ${foe.org} e si aspetta visite. Presidia il sistema e rinforzalo con il Patch Kit.`;
      blue.objectives = [{ deed: "preside", n: 1, nodeId: me.id, label: `Presidia ${me.org}` }, { deed: "t:patch", n: 1, nodeId: me.id, label: "Rinforza il sistema" }];
      blue.clientAccess = true;
      (blue as unknown as { clientNodes: string[] }).clientNodes = [me.id];
      blue.reward += 500 + tier(me) * 250;
      blue.xp += 100;
      blue.expiresAt = now() + 60 * 60_000;
      blue.requires = ["patch"];
      game.priced(blue);
      game.missions.set(blue.id, blue);
      game.touch("mission", blue.id);
    }
  }

  /** Le difese di un nodo sono cambiate: i contratti generati su quel nodo seguono la stessa formula della paga di base.
   * Se salgono, salgono anche quelli già accettati (e chi li ha in mano lo viene a sapere); se scendono, solo quelli ancora aperti. */
  function reprice(n: NodeDoc, before: number, up: boolean) {
    const after = n.proxy + n.firewall + n.monitor;
    const k = (450 + after * 260) / (450 + before * 260);
    for (const m of game.missions.values()) {
      if (m.nodeId !== n.id || m.postedBy || !(m.status === "open" || (up && m.status === "taken"))) continue;
      const old = m.reward;
      m.reward = Math.round(m.reward * k);
      if (m.faction === "red") m.requires = [...new Set([...m.requires.filter((t) => t !== "proxy" && t !== "firewall"), ...game.secRequires(n)])];
      game.touch("mission", m.id);
      const taker = m.takenBy ? game.agents.get(m.takenBy) : null;
      if (taker && !taker.npc && m.reward !== old) {
        game.out.toast(taker.id, `${n.org} ha alzato le difese: il tuo contratto ora paga ${fmtCr(m.reward)}.`, "info");
        game.dirty.add(taker.id);
      }
    }
  }

  // ---------------------------------------------------------------- il battito
  let cursor = 0;
  function pulse() {
    const t = now();
    const all = [...game.nodes.values()].filter(isOrg);
    // ogni battito un quinto delle organizzazioni: in meno di quattro minuti le si passa tutte
    const slice = Math.ceil(all.length / 5);
    for (let i = 0; i < slice; i += 1) {
      const n = all[(cursor + i) % all.length]!;
      const o = org(n);
      const tr = tier(n) + 1;
      o.cash += (staffed(n.kind, n.x, t) && !game.orgStrike?.(n) ? tr * 6 : 0) - tr * 1.75;
      o.fear = clamp(o.fear - 0.1);
      o.morale = clamp(o.morale + (o.cash > 0 ? 0.05 : -0.2));
      o.rep = clamp(o.rep + 0.02);
      // paura e soldi: si comprano difese migliori (al massimo due scatti sopra quelle di serie)
      const cost = 1500 * tr;
      if (o.fear >= 60 && o.cash >= cost * 1.5 && o.invested < 2 && n.proxy + n.firewall + n.monitor < 9) {
        const key = (["firewall", "proxy", "monitor"] as const).filter((k) => n[k] < 3).sort((a, b) => n[a] - n[b])[0];
        if (key) {
          const before = n.proxy + n.firewall + n.monitor;
          n[key] += 1;
          reprice(n, before, true);
          o.cash -= cost;
          o.fear = clamp(o.fear - 40);
          o.invested += 1;
          o.investedAt = t;
          game.touch("node", n.id);
          news("difesa", `${n.org} rafforza le difese: ${key} portato al livello ${n[key]}. Costo: ${fmtCr(cost)}.`, n);
        }
      }
      // quando torna la calma e i conti piangono, le difese comprate si lasciano scadere
      if (o.invested > 0 && t - o.investedAt > 48 * H && o.fear < 10 && Math.random() < 0.02) {
        const key = (["monitor", "proxy", "firewall"] as const).find((k) => n[k] > o.base[k]);
        if (key) {
          const before = n.proxy + n.firewall + n.monitor;
          n[key] -= 1;
          reprice(n, before, false);
          o.invested -= 1;
          game.touch("node", n.id);
          news("economia", `${n.org} non rinnova il contratto di sicurezza: ${key} torna al livello ${n[key]}.`, n, false);
        } else o.invested = 0;
      }
      if (!o.cuts && o.cash < 0) {
        o.cuts = true;
        news("economia", `${n.org} taglia il turno di notte per contenere i costi.`, n, false);
      } else if (o.cuts && o.cash > start(n) / 2) o.cuts = false;
      if (o.morale < 20 && o.strikeUntil < t && Math.random() < 0.25) {
        o.strikeUntil = t + 2 * H;
        o.morale = 45;
        news("economia", `Sciopero a ${n.org}: per due ore uffici vuoti e centralino muto.`, n);
      }
      if (!o.crisisSince && o.cash < -start(n) * 0.75) {
        o.crisisSince = t;
        news("economia", `${n.org} è in crisi di liquidità. I fornitori non vengono pagati da settimane.`, n);
      }
      if (o.crisisSince && o.cash > 0) o.crisisSince = 0;
      if (o.crisisSince && t - o.crisisSince > 12 * H) {
        // nessuno chiude per sempre: il concorrente più ricco compra
        const buyers = Object.keys(o.rivals).map((id) => game.nodes.get(id)).filter((x): x is NodeDoc => Boolean(x)).sort((a, b) => org(b).cash - org(a).cash);
        const buyer = buyers[0];
        o.crisisSince = 0;
        o.cash = start(n);
        o.rep = 50;
        o.morale = 40;
        o.cuts = false;
        o.group = buyer ? buyer.org : "un fondo estero";
        if (buyer) org(buyer).cash -= start(n) / 2;
        news("economia", `${n.org} è stata comprata da ${o.group}. Restano il nome sull'insegna e metà del personale.`, n);
        game.orgAcquired?.(n);
      }
    }
    cursor = (cursor + slice) % Math.max(1, all.length);
    for (const w of state.wars) {
      if (w.until > t) warJobs(w);
      else if (w.lastJob >= 0) {
        w.lastJob = -1;
        const A = game.nodes.get(w.a);
        const B = game.nodes.get(w.b);
        if (A && B) {
          const loser = w.aLoss === w.bLoss ? null : w.aLoss > w.bLoss ? A : B;
          if (loser) org(loser).rep = clamp(org(loser).rep - 10);
          news("guerra", loser ? `Finita la guerra fra ${A.org} e ${B.org}: ne esce peggio ${loser.org}.` : `Tregua fra ${A.org} e ${B.org}: nessuna delle due ha di che vantarsi.`, A);
        }
      }
    }
    state.wars = state.wars.filter((w) => w.lastJob >= 0);
    // soglie di mondo
    state.intrusions = state.intrusions.filter((x) => t - x < 24 * H);
    if (state.emergencyUntil < t && state.intrusions.length >= EMERGENCY_AT && !game.lawScandal?.()) {
      state.emergencyUntil = t + 12 * H;
      state.intrusions = [];
      news("legge", `Stato d'emergenza: dopo ${EMERGENCY_AT} intrusioni in un giorno la Guardia del Reticolo ottiene poteri speciali per dodici ore. Indagini più rapide, custodie più lunghe.`, null);
    }
    const inf: Record<string, number> = {};
    for (const n of game.nodes.values()) {
      const k = (n as unknown as { infections?: unknown[] }).infections?.length ?? 0;
      if (k) inf[regionAt(n.x, n.y)] = (inf[regionAt(n.x, n.y)] ?? 0) + k;
    }
    for (const [region, k] of Object.entries(inf)) {
      if (k >= 8 && (state.alerts[region] ?? 0) < t) {
        state.alerts[region] = t + 3 * H;
        news("virus", `Allerta virus in ${REGION_NAME[region as keyof typeof REGION_NAME]}: ${k} sistemi infetti. Per tre ore gli antivirus della regione lavorano con le firme d'emergenza.`, null);
      }
    }
    dirty = true;
  }
  game.onPulse.push(pulse);

  // ---------------------------------------------------------------- viste
  const name = (id: string | null) => (id ? (game.nodes.get(id)?.org ?? null) : null);
  function orgView(n: NodeDoc): OrgView {
    const o = org(n);
    return { id: n.id, name: n.org, kind: n.kind, city: n.city ?? "", status: statusOf(n, o), group: o.group, cash: Math.round(o.cash), rep: Math.round(o.rep), morale: Math.round(o.morale), fear: Math.round(o.fear), cuts: o.cuts, sec: { proxy: n.proxy, firewall: n.firewall, monitor: n.monitor }, base: o.base, rivals: Object.entries(o.rivals).filter(([id]) => game.nodes.get(id)).map(([id, heat]) => ({ id, name: game.nodes.get(id)!.org, heat, war: Boolean(inWar(n.id) && (inWar(n.id)!.a === id || inWar(n.id)!.b === id)) })), history: [...o.hist].reverse() };
  }
  function world(a: AgentDoc): WorldView {
    const known = new Set(a.knownNodes);
    const rows: NewsRow[] = state.news.slice(-120).reverse().map((x) => ({ ...x, orgName: name(x.org) }));
    const live = Object.entries(state.orgs).map(([id, o]) => ({ id, o, n: game.nodes.get(id) })).filter((x): x is { id: string; o: Org; n: NodeDoc } => Boolean(x.n));
    void known;
    return {
      news: rows,
      emergencyUntil: state.emergencyUntil,
      alerts: Object.entries(state.alerts).filter(([, u]) => u > now()).map(([region, until]) => ({ region: REGION_NAME[region as keyof typeof REGION_NAME] ?? region, until })),
      wars: state.wars.filter((w) => w.until > now()).map((w) => ({ a: w.a, aName: name(w.a) ?? "?", b: w.b, bName: name(w.b) ?? "?", until: w.until })),
      crisis: live.filter((x) => x.o.crisisSince || x.o.cash < 0).sort((x, y) => x.o.cash - y.o.cash).slice(0, 8).map((x) => ({ id: x.id, name: x.n.org, cash: Math.round(x.o.cash) })),
      hit: live.filter((x) => x.o.fear >= 20).sort((x, y) => y.o.fear - x.o.fear).slice(0, 8).map((x) => ({ id: x.id, name: x.n.org, fear: Math.round(x.o.fear) })),
      intrusions24h: state.intrusions.length,
      law: game.lawView?.() ?? null,
    };
  }

  const prev = game.socialAct;
  game.socialAct = (agent, a, p) => {
    if (a !== "world") return prev?.(agent, a, p) ?? null;
    if (p.cmd === "org") {
      const n = game.nodes.get(String(p.id));
      if (!n || !isOrg(n)) return { ok: false, error: "organizzazione sconosciuta" };
      return { ok: true, data: orgView(n) };
    }
    if (p.cmd === "dev" && process.env.AETHER_DEV === "1") {
      const n = game.nodes.get(String(p.id));
      if (n) {
        Object.assign(org(n), p.set ?? {});
        if (typeof p.event === "string") for (let i = 0; i < Number(p.times ?? 1); i += 1) (game.orgEvent ?? event)(n, p.event as Kind, "test");
      }
      if (typeof p.intrusions === "number") state.intrusions = Array.from({ length: p.intrusions }, () => now());
      for (let i = 0; i < Number(p.pulses ?? 0); i += 1) pulse();
      let job: { jobId: string; jobReward: number } | Record<string, never> = {};
      if (n && p.mkJob) {
        const m = game.baseMission("red", "chain", n);
        m.objectives = [{ deed: "admin", n: 1, nodeId: n.id, label: `Diventa admin su ${n.org}` }];
        m.title = `Prova: ${n.org}`;
        game.missions.set(m.id, m);
        job = { jobId: m.id, jobReward: m.reward };
      }
      if (typeof p.jobId === "string") {
        const m = game.missions.get(p.jobId);
        if (m) job = { jobId: m.id, jobReward: m.reward };
      }
      return { ok: true, data: n ? { ...orgView(n), ...job } : world(agent) };
    }
    return { ok: true, data: world(agent) };
  };

  return {
    news,
    /** Lo scandalo (server/law.ts) chiude lo stato d'emergenza. */
    endEmergency() {
      state.emergencyUntil = 0;
      dirty = true;
    },
    org: (n: NodeDoc) => org(n),
    isOrg,
    statusOf: (n: NodeDoc) => statusOf(n, org(n)),
    save() {
      if (!dirty) return;
      dirty = false;
      game.store.put("world", "state", state);
    },
  };
}
