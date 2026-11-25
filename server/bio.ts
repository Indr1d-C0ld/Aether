// Barriere biometriche: quali nodi ne hanno una, di chi è il campione che serve, come lo si ruba
// (centralino, ufficio del personale, cartelle cliniche, o un gadget), e l'oscilloscopio con cui lo si
// presenta al lettore. Per i blu: ri-registrare il personale. Per i rossi: impiantare i propri modelli.
import type { Game, AgentDoc, NodeDoc, OpDoc } from "./game.ts";
import type { Person } from "./people.ts";
import { fmtCr } from "../shared/rules.ts";
import { CLEARANCE, type ZoneView } from "../shared/zones.ts";
import { BIO_NAME, BIO_SAMPLE, SAMPLE_DAYS, SCOPE_FAIL_TRACE, SCOPE_KNOBS, SCOPE_OK, SCOPE_TRIES, scopeMatch, scopeWave, type BioKind, type BioView, type SampleView, type ScopeParams } from "../shared/bio.ts";

type R = { ok: boolean; error?: string; note?: string; data?: unknown };
type Sample = { pid: string; kind: BioKind; at: number };
type BioNode = NodeDoc & { bioReset?: number; bioSwap?: { agentId: string; until: number }[] };
type BioAgent = AgentDoc & { samples?: Sample[]; bioWanted?: string[]; bioDev?: boolean };
type BioOp = OpDoc & { bioPassed?: boolean; bioLocked?: boolean; scope?: { target: ScopeParams; tries: number; state: "open" | "won" | "lost"; last: number | null } };

const now = () => Date.now();
const hash = (s: string) => [...s].reduce((q, c) => (Math.imul(q, 33) ^ c.charCodeAt(0)) >>> 0, 5381);
const KINDS: BioKind[] = ["voce", "impronta", "retina"];
const BIO_ORGS = ["corp", "bank", "gov", "law", "lab", "mil", "med", "telco", "util"];
const DAY = 86400_000;

export function installBio(game: Game, zones: { staffOf: (n: NodeDoc) => Person[] }) {
  /** Hanno una barriera i sistemi con le difese al massimo e metà delle macchine di rete interna. */
  function kindOf(n: NodeDoc): BioKind | null {
    if (n.hidden || n.kind === "gateway") return null;
    if (n.inner) return hash(`bio:${n.id}`) % 2 === 0 ? KINDS[hash(`k:${n.id}`) % 3]! : null;
    if (!BIO_ORGS.includes(n.kind) || n.proxy + n.firewall + n.monitor < 9) return null;
    return KINDS[hash(`k:${n.id}`) % 3]!;
  }
  /** La casa madre: per una macchina di rete interna, il sistema da cui ci si arriva. */
  const home = (n: NodeDoc) => (n.inner ? (game.nodes.get(n.inner) ?? n) : n);
  /** Il titolare: l'amministratore dell'organizzazione. */
  const holder = (n: NodeDoc) => zones.staffOf(home(n))[0]!;
  const resetAt = (n: NodeDoc) => Math.max((n as BioNode).bioReset ?? 0, (home(n) as BioNode).bioReset ?? 0);
  const samples = (a: AgentDoc) => ((a as BioAgent).samples ??= []);
  const live = (a: AgentDoc) => samples(a).filter((s) => now() - s.at < SAMPLE_DAYS * DAY);
  const has = (a: AgentDoc, n: NodeDoc, kind: BioKind) => live(a).some((s) => s.pid === holder(n).id && s.kind === kind && s.at > resetAt(n));
  const swaps = (n: NodeDoc) => ((n as BioNode).bioSwap ??= []);
  const implanted = (a: AgentDoc, n: NodeDoc) => swaps(n).some((x) => x.agentId === a.id && x.until > now());
  const from = (op: OpDoc, a: AgentDoc) => game.prevIp(op, a);

  function take(agent: AgentDoc, p: Person, kind: BioKind) {
    const list = samples(agent);
    const old = list.findIndex((s) => s.pid === p.id && s.kind === kind);
    if (old >= 0) list.splice(old, 1);
    list.push({ pid: p.id, kind, at: now() });
    if (list.length > 40) list.shift();
    game.bump(agent, "biosample");
    game.bump(agent, `bs:${kind}`);
    game.touch("agent", agent.id);
    game.dirty.add(agent.id);
  }

  // ---------------------------------------------------------------- viste

  game.bioKind = (n) => kindOf(n);
  game.bioBlock = (op, agent, target) => {
    const kind = kindOf(target);
    if (!kind || (op as BioOp).bioPassed || op.access === "client") return null;
    void agent;
    return `${BIO_NAME[kind].toLowerCase()}: l'accesso admin vuole anche ${BIO_SAMPLE[kind]} di ${holder(target).name}`;
  };
  game.bioSamples = (a): SampleView[] => live(a).map((s) => ({ who: game.personName(s.pid), kind: s.kind, at: s.at, expiresAt: s.at + SAMPLE_DAYS * DAY }));

  function view(op: OpDoc, me: AgentDoc, n: NodeDoc): BioView | null {
    const kind = kindOf(n);
    if (!kind) return null;
    const o = op as BioOp;
    return {
      kind,
      who: holder(n).name,
      passed: Boolean(o.bioPassed) || op.access === "client",
      have: has(me, n, kind),
      locked: Boolean(o.bioLocked),
      scope: o.scope ? { target: scopeWave(o.scope.target), tries: o.scope.tries, state: o.scope.state, last: o.scope.last } : null,
    };
  }

  const prevExtra = game.opExtra;
  game.opExtra = (op, me, target) => {
    const base = prevExtra?.(op, me, target) ?? {};
    const kind = kindOf(target);
    const zs = (base.zones as ZoneView[] | undefined) ?? [];
    // le azioni biometriche compaiono solo dove hanno senso
    for (const z of zs) {
      z.actions = z.actions
        .filter((a) => !(["modelli", "riregistra"].includes(a.id) && !kind))
        .map((a) => {
          if (a.blocked) return a;
          if ((a.id === "voce" || a.id === "impronta") && (me.cooldowns?.[`z:${a.id}:${target.id}`] ?? 0) > now()) return { ...a, blocked: "già fatto da poco" };
          if (a.id === "retina" && !wanted(me).length) return { ...a, blocked: "non stai cercando la retina di nessuno: prima trova uno scanner" };
          if (a.id === "modelli" && implanted(me, target)) return { ...a, blocked: "i tuoi modelli sono già nel lettore" };
          return a;
        });
    }
    return { ...base, bio: view(op, me, target) };
  };

  /** Le persone di cui ti serve la retina: i titolari degli scanner che hai incontrato. */
  const wanted = (a: AgentDoc) => ((a as BioAgent).bioWanted ?? []).filter((pid) => !live(a).some((s) => s.pid === pid && s.kind === "retina"));

  const prevConnect = game.onConnect;
  game.onConnect = (op, agent, target) => {
    prevConnect?.(op, agent, target);
    const kind = kindOf(target);
    if (!kind) return;
    const a = agent as BioAgent;
    if (kind === "retina") {
      const w = (a.bioWanted ??= []);
      const pid = holder(target).id;
      if (!w.includes(pid)) w.push(pid), w.length > 12 && w.shift();
    }
    if (a.bioDev || implanted(agent, target)) {
      (op as BioOp).bioPassed = true;
      if (!agent.npc && !a.bioDev) game.out.toast(agent.id, "Il lettore riconosce i modelli che hai impiantato: la barriera è aperta.", "ok");
    }
  };

  // ---------------------------------------------------------------- azioni

  function zoneAct(agent: AgentDoc, zone: string, action: string): R | null {
    if (!["voce", "impronta", "retina", "modelli", "riregistra"].includes(action)) return null;
    const op = game.ops.get(agent.id);
    const n = op ? game.nodes.get(op.chain.at(-1)!) : null;
    if (!op || !n) return { ok: false, error: "non sei collegato" };
    const zs = (game.opExtra?.(op, agent, n).zones as ZoneView[] | undefined) ?? [];
    const zv = zs.find((z) => z.id === zone);
    const av = zv?.actions.find((a) => a.id === action);
    if (!zv || !av) return { ok: false, error: "azione non disponibile" };
    if (!zv.open) return { ok: false, error: `serve il livello ${CLEARANCE[zv.need]}` };
    if (av.blocked) return { ok: false, error: av.blocked };
    const cds = (agent.cooldowns ??= {});
    const done = (deed: string, note: string): R => {
      game.bump(agent, `z:${deed}`);
      game.deed(agent, `z:${deed}`, n);
      game.touch("agent", agent.id);
      game.touch("node", n.id);
      game.dirty.add(agent.id);
      return { ok: true, note };
    };
    const noise = (line: string) => {
      if (op.access === "client") return;
      game.noisy(op, agent, n);
      game.log(n, line, { opId: op.id, actorId: agent.id, fromIp: from(op, agent) });
      op.touched = true;
    };
    const boss = zones.staffOf(n)[0]!;
    switch (action) {
      case "voce":
        take(agent, boss, "voce");
        cds[`z:voce:${n.id}`] = now() + 10 * 60_000;
        noise("PBX call recorded ext 100 src={FROM}");
        return done("voce", `«Pronto? Chi parla?» Hai la voce di ${boss.name}.`);
      case "impronta":
        take(agent, boss, "impronta");
        cds[`z:impronta:${n.id}`] = now() + 10 * 60_000;
        noise("HR badge record export src={FROM}");
        return done("impronta", `Scheda del badge copiata: hai l'impronta di ${boss.name}.`);
      case "retina": {
        const w = wanted(agent);
        for (const pid of w) take(agent, { id: pid } as Person, "retina");
        noise("EHR ophthalmology export src={FROM}");
        return done("retina", w.length === 1 ? `Cartella oculistica copiata: hai la retina di ${game.personName(w[0]!)}.` : `${w.length} cartelle oculistiche copiate.`);
      }
      case "modelli":
        swaps(n).push({ agentId: agent.id, until: now() + DAY });
        agent.ethics = Math.max(-100, agent.ethics - 2);
        noise("BIO template store rewritten src={FROM}");
        return done("modelli", "i tuoi modelli sono nel lettore: per 24 ore la barriera ti apre da sola");
      case "riregistra": {
        const live2 = swaps(n).filter((x) => x.until > now());
        (n as BioNode).bioSwap = [];
        (n as BioNode).bioReset = now();
        const pay = 250 + live2.length * 250;
        agent.credits += pay;
        agent.stats.defense += 1 + live2.length;
        game.meta.war.blue += 1 + live2.length;
        cds[`z:riregistra:${n.id}`] = now() + 60 * 60_000;
        for (const x of live2) {
          const o = game.agents.get(x.agentId);
          if (o && !o.npc) game.mail(o, "BIOMETRIA", `Modelli rimossi: ${n.org}`, `${agent.handle} ha ri-registrato il personale di ${n.org}: i tuoi modelli non valgono più, e nemmeno i campioni che avevi.`);
        }
        return done("riregistra", `personale ri-registrato: campioni rubati e modelli impiantati non valgono più (+${fmtCr(pay)})`);
      }
    }
    return null;
  }

  function scopeAct(agent: AgentDoc, act: string, p: Record<string, unknown>): R {
    const op = game.ops.get(agent.id) as BioOp | undefined;
    const n = op ? game.nodes.get(op.chain.at(-1)!) : null;
    if (!op || !n) return { ok: false, error: "non sei collegato" };
    const kind = kindOf(n);
    if (!kind) return { ok: false, error: "questo sistema non ha lettori biometrici" };
    if (op.bioPassed || op.access === "client") return { ok: false, error: "la barriera è già aperta" };
    if (act === "open") {
      if (!op.bypass.proxy) return { ok: false, error: "il proxy blocca il lettore: abbattilo prima" };
      if (op.bioLocked) return { ok: false, error: "il lettore è bloccato: in questa connessione non accetta più nessuno" };
      if (!has(agent, n, kind)) return { ok: false, error: `ti manca ${BIO_SAMPLE[kind]} di ${holder(n).name}` };
      if (op.scope?.state === "open") return { ok: true };
      const rnd = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
      const target = Object.fromEntries(SCOPE_KNOBS.map((k) => [k.key, rnd(k.min, k.max)])) as ScopeParams;
      op.scope = { target, tries: SCOPE_TRIES, state: "open", last: null };
      game.noisy(op, agent, n);
      return { ok: true, note: "campione sul banco: accordalo" };
    }
    const s = op.scope;
    if (act !== "try" || !s || s.state !== "open") return { ok: false, error: "nessun campione sul banco" };
    const raw = (p.params ?? {}) as Record<string, unknown>;
    const mine = {} as ScopeParams;
    for (const k of SCOPE_KNOBS) {
      const v = Number(raw[k.key]);
      if (!Number.isInteger(v) || v < k.min || v > k.max) return { ok: false, error: "regolazione non valida" };
      mine[k.key] = v;
    }
    const m = scopeMatch(scopeWave(s.target), scopeWave(mine));
    if (m >= SCOPE_OK) {
      s.state = "won";
      op.bioPassed = true;
      const first = s.tries === SCOPE_TRIES;
      game.log(n, `BIO ${kind} match accepted src={FROM}`, { opId: op.id, actorId: agent.id, fromIp: from(op, agent) });
      game.bump(agent, "bio");
      game.bump(agent, `bio:${kind}`);
      game.deed(agent, "bio", n);
      if (first) game.bump(agent, "mg:scope");
      game.out.toast(agent.id, `${BIO_NAME[kind]}: identità confermata. Benvenuto, ${holder(n).name.split(" ")[0]}.`, "ok");
      game.dirty.add(agent.id);
      return { ok: true, data: { won: true, match: Math.round(m * 100) } };
    }
    s.tries -= 1;
    s.last = Math.round(m * 100);
    const total = op.trace.hopTimes.reduce((q, v) => q + v, 0);
    if (total > 0) {
      op.trace.active = true;
      op.trace.progressMs = Math.min(total * 0.97, op.trace.progressMs + total * SCOPE_FAIL_TRACE);
    }
    game.log(n, `BIO ${kind} mismatch src={FROM}`, { opId: op.id, actorId: agent.id, fromIp: from(op, agent) });
    if (s.tries <= 0) {
      s.state = "lost";
      op.bioLocked = true;
      game.bump(agent, "mg:scopelost");
      game.out.toast(agent.id, "Tre letture respinte: il lettore si blocca e la sicurezza è avvisata.", "bad");
      return { ok: true, data: { lost: true, match: s.last } };
    }
    return { ok: true, data: { match: s.last } };
  }

  /** I gadget che fabbricano un campione sul posto, davanti alla barriera giusta. */
  game.bioGadget = (agent, op, target, kind) => {
    if (kindOf(target) !== kind) return `qui non c'è ${kind === "voce" ? "un'impronta vocale" : kind === "impronta" ? "un lettore d'impronte" : "uno scanner della retina"}`;
    if ((op as BioOp).bioPassed) return "la barriera è già aperta";
    take(agent, holder(target), kind);
    return null;
  };

  const prev = game.socialAct;
  game.socialAct = (agent, a, p) => {
    if (a === "scope") return scopeAct(agent, String(p.act ?? "open"), p);
    if (a === "zone") {
      const r = zoneAct(agent, String(p.zone ?? ""), String(p.act ?? ""));
      if (r) return r;
    }
    return prev?.(agent, a, p) ?? null;
  };

  return { kindOf, holder };
}
