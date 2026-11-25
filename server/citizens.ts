// Le persone: routine sull'orologio del mondo, debiti, licenziamenti, ferie, relazioni (tipi in shared/citizens.ts).
// Un giocatore conosce una persona quando ne ha letto il nome in un organico; da lì può indagare, corrompere,
// farne una fonte, ricattarla. I blu possono metterla in guardia.
import type { Game, AgentDoc, NodeDoc } from "./game.ts";
import { PEOPLE, type Person } from "./people.ts";
import { WORLD } from "./worldgen.ts";
import { fmtCr } from "../shared/rules.ts";
import { clockLabel, hoursOf, isWeekend, localHour, staffed } from "../shared/clock.ts";
import { INVESTIGATE_COST, SOURCE_COST, type CitizenRow, type Where } from "../shared/citizens.ts";

type R = { ok: boolean; error?: string; note?: string; data?: unknown };
type Cit = { debt: number; loyalty: number; fired: string | null; firedAt: number; warned: number; cd: Record<string, number>; job?: string };
type State = { people: Record<string, Cit> };
type Zones = { staffOf: (n: NodeDoc) => Person[]; opPass: (n: NodeDoc) => string };
type Orgs = { news: (kind: "gente" | "economia", text: string, n: NodeDoc | null, feed?: boolean) => void; statusOf: (n: NodeDoc) => string; isOrg: (n: NodeDoc) => boolean; org: (n: NodeDoc) => { cuts: boolean; crisisSince: number } };

const now = () => Date.now();
const DAY = 86400_000;
const hash = (s: string) => [...s].reduce((q, c) => (Math.imul(q, 33) ^ c.charCodeAt(0)) >>> 0, 5381);
const week = () => Math.floor(now() / (7 * DAY));

export function installCitizens(game: Game, zones: Zones, orgs: Orgs) {
  const state: State = game.store.get<State>("cit", "state") ?? { people: {} };
  let dirty = false;
  const cit = (p: Person): Cit => (state.people[p.id] ??= { debt: hash(p.id + "d") % 4 === 0 ? 2500 + (hash(p.id + "e") % 9000) : hash(p.id + "d") % 900, loyalty: 30 + (hash(p.id + "l") % 65), fired: null, firedAt: 0, warned: 0, cd: {} });
  const employerOf = (p: Person) => (cit(p).fired ? null : (game.nodes.get(cit(p).job ?? WORLD.employer[p.id] ?? "") ?? null));
  const homeOf = (p: Person) => game.nodes.get(WORLD.home[p.id] ?? "") ?? null;
  const cityX = (p: Person) => employerOf(p)?.x ?? homeOf(p)?.x ?? 170;
  const onVacation = (p: Person) => hash(`${p.id}:${week()}`) % 9 === 0;
  /** Le relazioni clandestine: una persona su sei, sempre con un collega. */
  function affairOf(p: Person): Person | null {
    const n = game.nodes.get(WORLD.employer[p.id] ?? "");
    if (!n) return null;
    const mates = PEOPLE.filter((q) => q.id !== p.id && WORLD.employer[q.id] === n.id).sort((a, b) => a.id.localeCompare(b.id));
    if (!mates.length) return null;
    const pairKey = (a: Person, b: Person) => [a.id, b.id].sort().join("+");
    const m = mates[hash(p.id + n.id) % mates.length]!;
    return hash(pairKey(p, m)) % 3 === 0 ? m : null;
  }
  function whereIs(p: Person): Where {
    if (game.clockForce === "giorno") return employerOf(p) ? "in ufficio" : "a casa";
    if (game.clockForce === "notte") return "dorme";
    if (onVacation(p)) return "in ferie";
    const x = cityX(p);
    const h = localHour(x, now());
    if (h >= 23.5 || h < 6.5) return "dorme";
    const e = employerOf(p);
    if (e && staffed(e.kind, e.x, now()) && hoursOf(e.kind) !== "sempre") return "in ufficio";
    if (e && hoursOf(e.kind) === "sempre" && h >= 8 && h < 17 && !isWeekend(x, now())) return "in ufficio";
    return h >= 18.5 || h < 8 ? "a casa" : "in giro";
  }
  game.employerOf = (pid) => {
    const p = PEOPLE.find((x) => x.id === pid);
    return p ? (employerOf(p)?.id ?? null) : null;
  };
  const contacts = (a: AgentDoc) => ((a as unknown as { contacts?: string[] }).contacts ??= []);
  const dossiers = (a: AgentDoc) => ((a as unknown as { dossiers?: string[] }).dossiers ??= []);
  function meet(a: AgentDoc, ps: Person[]) {
    const c = contacts(a);
    let n = 0;
    for (const p of ps) if (!c.includes(p.id)) c.push(p.id), (n += 1);
    if (c.length > 80) c.splice(0, c.length - 80);
    if (n) game.bump(a, "cit:met", n), game.touch("agent", a.id);
  }

  // leggere un organico vuol dire conoscere chi ci lavora
  const origDeed = game.deed.bind(game);
  game.deed = (agent, d, node) => {
    origDeed(agent, d, node);
    if (node && !agent.npc && (d === "z:organico" || d === "z:voce" || d === "z:impronta" || d === "staff")) meet(agent, zones.staffOf(node).filter((p) => WORLD.employer[p.id] === node.id || p.id === node.adminId));
  };
  // l'amministratore in ferie: il sostituto guarda meno. E un PC di casa, col padrone fuori, non lo guarda nessuno.
  const prevWatch = game.orgWatch;
  game.orgWatch = (n) => {
    let f = prevWatch?.(n) ?? 1;
    if (game.clockForce) return f;
    const boss = PEOPLE.find((p) => p.id === n.adminId);
    if (boss && orgs.isOrg(n) && onVacation(boss)) f *= 1.1;
    const owner = n.kind === "home" ? PEOPLE.find((p) => p.id === n.homeOf) : null;
    if (owner && whereIs(owner) !== "a casa") f *= 1.3;
    return f;
  };
  const prevStaffed = game.lifeStaffed;
  game.lifeStaffed = (n) => {
    const boss = PEOPLE.find((p) => p.id === n.adminId);
    if (boss && !game.clockForce && onVacation(boss)) return `${boss.name.split(" ")[0]} è in ferie fino a lunedì: risponde il sostituto, e non è la voce che ti serve`;
    return prevStaffed?.(n) ?? null;
  };

  // ---------------------------------------------------------------- la vita che scorre
  let cursor = 0;
  function pulse() {
    const slice = 10;
    for (let i = 0; i < slice; i += 1) {
      const p = PEOPLE[(cursor + i) % PEOPLE.length]!;
      const c = cit(p);
      c.debt = Math.max(0, c.debt + (hash(p.id + Math.floor(now() / DAY)) % 5 === 0 ? 4 : -2));
      const e = employerOf(p);
      // le organizzazioni in difficoltà licenziano
      if (e && orgs.isOrg(e) && p.id !== e.adminId && (orgs.org(e).cuts || orgs.org(e).crisisSince) && Math.random() < 0.01) {
        c.fired = e.id;
        c.firedAt = now();
        c.loyalty = 5;
        c.debt += 1500;
        orgs.news("gente", `${e.org} lascia a casa ${p.name}, ${p.job}. «Riorganizzazione», dice l'azienda.`, e, false);
      }
      // dopo due settimane qualcuno li riassume (se non li ha già presi un'organizzazione nuova)
      if (c.fired && !c.job && now() - c.firedAt > 14 * DAY) c.fired = null;
    }
    cursor = (cursor + slice) % PEOPLE.length;
    dirty = true;
  }
  game.onPulse.push(pulse);

  // ---------------------------------------------------------------- viste e azioni
  function row(a: AgentDoc, p: Person): CitizenRow {
    const c = cit(p);
    const e = employerOf(p);
    const ex = c.fired ? game.nodes.get(c.fired) : null;
    const known = dossiers(a).includes(p.id);
    const lover = affairOf(p);
    const cd = (k: string) => ((c.cd[`${k}:${a.id}`] ?? 0) > now() ? `di nuovo fra ${Math.ceil(((c.cd[`${k}:${a.id}`] ?? 0) - now()) / 3600_000)} h` : null);
    const can: CitizenRow["can"] = [];
    if (!known) can.push({ act: "investigate", label: "Indaga", cost: INVESTIGATE_COST, why: null });
    if (a.faction === "red") {
      if (known && e && c.debt > 3000) can.push({ act: "bribe", label: `Compra un badge di ${e.org}`, cost: Math.round(800 + c.debt * 0.2), why: cd("bribe") });
      if (ex) can.push({ act: "source", label: `Fatti raccontare ${ex.org}`, cost: SOURCE_COST, why: cd("source") });
      if (known && lover) can.push({ act: "blackmail", label: "Ricatta", cost: 0, why: cd("blackmail") });
    } else if (e && (c.debt > 3000 || lover)) can.push({ act: "warn", label: "Mettila in guardia", cost: 0, why: cd("warn") });
    return { id: p.id, name: p.name, job: p.job, city: p.city, employer: e?.org ?? null, employerId: e?.id ?? null, role: e ? (e.adminId === p.id ? "amministratore" : "dipendente") : ex ? "ex dipendente" : "nessuno", where: whereIs(p), clock: clockLabel(cityX(p), now()), known, debt: known ? Math.round(c.debt) : c.debt > 3000 ? -1 : null, fired: ex?.org ?? null, affair: known ? (lover?.name ?? null) : null, vacation: !game.clockForce && onVacation(p), can };
  }
  function act(a: AgentDoc, q: Record<string, unknown>): R {
    const cmd = String(q.cmd ?? "list");
    if (cmd === "list") return { ok: true, data: { rows: contacts(a).map((id) => PEOPLE.find((p) => p.id === id)).filter((p): p is Person => Boolean(p)).map((p) => row(a, p)).reverse() } };
    if (cmd === "dev" && process.env.AETHER_DEV === "1") {
      const p = PEOPLE.find((x) => x.id === q.id);
      if (!p) return { ok: false, error: "chi?" };
      Object.assign(cit(p), q.set ?? {});
      if (q.meet) meet(a, [p]);
      return { ok: true, data: { row: row(a, p), affair: affairOf(p)?.id ?? null } };
    }
    const p = PEOPLE.find((x) => x.id === q.id);
    if (!p || !contacts(a).includes(p.id)) return { ok: false, error: "non la conosci: i nomi si leggono negli organici" };
    const c = cit(p);
    const r = row(a, p);
    const opt = r.can.find((x) => x.act === cmd);
    if (!opt) return { ok: false, error: "non puoi farlo, con lei" };
    if (opt.why) return { ok: false, error: opt.why };
    if (a.credits < opt.cost) return { ok: false, error: `ti servono ${fmtCr(opt.cost)}` };
    a.credits -= opt.cost;
    const cool = (k: string, h: number) => (c.cd[`${k}:${a.id}`] = now() + h * 3600_000);
    const done = (note: string): R => (game.touch("agent", a.id), game.dirty.add(a.id), (dirty = true), { ok: true, note, data: { row: row(a, p) } });
    const e = employerOf(p);
    switch (cmd) {
      case "investigate":
        dossiers(a).push(p.id);
        game.bump(a, "cit:dossier");
        return done(`fascicolo su ${p.name}: ora sai quanto deve, con chi esce e quando va in ferie`);
      case "bribe": {
        cool("bribe", 24);
        if (c.warned > now() || (c.loyalty > 75 && Math.random() < 0.5)) {
          a.heat = Math.min(100, a.heat + 12);
          a.credits += opt.cost;
          return done(`${p.name} rifiuta, e ne parla col suo capo. Calore +12.`);
        }
        ((e as unknown as { badges?: { agentId: string; until: number }[] }).badges ??= []).push({ agentId: a.id, until: now() + 24 * 3600_000 });
        game.touch("node", e!.id);
        game.reveal(a, e!.id);
        c.debt = Math.max(0, c.debt - opt.cost);
        c.loyalty = Math.max(0, c.loyalty - 20);
        a.ethics = Math.max(-100, a.ethics - 3);
        game.bump(a, "cit:bribe");
        game.deed(a, "cit:bribe", e);
        return done(`${p.name} ti lascia il suo badge: per 24 ore entri in ${e!.org} da operatore`);
      }
      case "source": {
        cool("source", 7 * 24);
        const ex = game.nodes.get(c.fired!)!;
        game.reveal(a, ex.id);
        game.mail(a, p.name, `Quello che so di ${ex.org}`, `Mi hanno lasciato a casa dopo anni. Non gli devo niente.\n\nL'utenza operatore: ${zones.opPass(ex)}\nLa password di root comincia per «${ex.password.slice(0, Math.ceil(ex.password.length / 2))}».\nIl sistema risponde al ${ex.ip}.\n\nNon mi cercare più.`);
        game.bump(a, "cit:source");
        game.deed(a, "cit:source", ex);
        return done(`${p.name} parla: guarda la posta`);
      }
      case "blackmail": {
        cool("blackmail", 7 * 24);
        const take = 500 + (hash(p.id + a.id) % 900);
        a.ethics = Math.max(-100, a.ethics - 6);
        game.bump(a, "cit:blackmail");
        if (c.warned > now() || Math.random() < 0.2) {
          a.heat = Math.min(100, a.heat + 18);
          return done(`${p.name} va dritta alla polizia. Calore +18.`);
        }
        a.credits += take;
        c.debt += take;
        return done(`${p.name} paga: +${fmtCr(take)}. Non ha dormito, stanotte.`);
      }
      case "warn": {
        cool("warn", 24);
        c.warned = now() + 48 * 3600_000;
        c.loyalty = Math.min(100, c.loyalty + 25);
        const b = e as unknown as { badges?: { agentId: string; until: number }[] };
        const live = (b.badges ?? []).filter((x) => x.until > now()).length;
        b.badges = [];
        const pay = 150 + live * 200;
        a.credits += pay;
        a.stats.defense += 1;
        game.bump(a, "cit:warn");
        game.deed(a, "cit:warn", e);
        return done(`${p.name} è avvisata: per due giorni non si farà comprare né ricattare${live ? `, e ${live} badge sospetti sono stati annullati` : ""} · +${fmtCr(pay)}`);
      }
    }
    return { ok: false, error: "azione sconosciuta" };
  }
  const prev = game.socialAct;
  game.socialAct = (agent, a, q) => (a === "cit" ? act(agent, q) : (prev?.(agent, a, q) ?? null));

  return {
    whereIs,
    /** Chi è senza lavoro adesso: licenziati da un'organizzazione. */
    jobless: () => PEOPLE.filter((p) => cit(p).fired && !cit(p).job),
    /** Assunzione in un'organizzazione nuova: cambia il datore di lavoro e cancella il licenziamento. */
    hire(pid: string, nodeId: string) {
      const p = PEOPLE.find((x) => x.id === pid);
      if (!p) return;
      const c = cit(p);
      c.fired = null;
      c.job = nodeId;
      c.loyalty = 60;
      c.debt = Math.max(0, c.debt - 1000);
      dirty = true;
    },
    /** Licenziamento deciso da fuori (un'acquisizione): il cittadino resta senza lavoro. */
    fire(pid: string, nodeId: string) {
      const p = PEOPLE.find((x) => x.id === pid);
      if (!p) return;
      const c = cit(p);
      c.fired = nodeId;
      c.firedAt = now();
      c.job = undefined;
      c.loyalty = 5;
      c.debt += 1500;
      dirty = true;
    },
    /** Quello che c'è nel fascicolo di una persona (server/intel.ts lo mette in vendita). */
    facts(pid: string) {
      const p = PEOPLE.find((x) => x.id === pid);
      if (!p) return null;
      const c = cit(p);
      const e = employerOf(p);
      return { debt: Math.round(c.debt), affair: affairOf(p)?.name ?? null, fired: c.fired ? (game.nodes.get(c.fired)?.org ?? null) : null, admin: Boolean(e && e.adminId === p.id), employer: e?.org ?? null };
    },
    /** Un fascicolo comprato: la persona entra fra i contatti, già indagata. */
    learn(a: AgentDoc, pid: string) {
      const p = PEOPLE.find((x) => x.id === pid);
      if (!p) return;
      meet(a, [p]);
      if (!dossiers(a).includes(pid)) dossiers(a).push(pid);
      game.touch("agent", a.id);
    },
    employerId: (pid: string) => {
      const p = PEOPLE.find((x) => x.id === pid);
      return p ? (employerOf(p)?.id ?? null) : null;
    },
    save() {
      if (!dirty) return;
      dirty = false;
      game.store.put("cit", "state", state);
    },
  };
}
