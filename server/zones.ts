// Sottosistemi dei nodi: posta interna, centralino, telecamere, contabilità, personale, rete interna.
// Si entra anche senza forzare la password di root: con le credenziali personali di un dipendente
// (nome + anno di nascita, come sui PC di casa) si è «impiegato», con la password dell'operatore
// (che gira nella posta interna) «operatore». Ogni stanza chiede un livello e offre poche azioni.
import type { Game, AgentDoc, NodeDoc, OpDoc } from "./game.ts";
import { PEOPLE, type Person } from "./people.ts";
import { WORLD } from "./worldgen.ts";
import { DICTIONARY } from "./content.ts";
import { ALERT_MINUTES, fmtCr, regionAt } from "../shared/rules.ts";
import { CLEARANCE, ORG_KINDS, ZONES, type MailMsg, type ZoneView } from "../shared/zones.ts";
import { MAIL_GOSSIP } from "./irc-text.ts";
import { MAIL_TIMES } from "./life-text.ts";

type R = { ok: boolean; error?: string; note?: string; data?: unknown };
const now = () => Date.now();
const hash = (s: string) => [...s].reduce((q, c) => (Math.imul(q, 33) ^ c.charCodeAt(0)) >>> 0, 5381);
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const personal = (p: Person) => `${p.name.split(" ")[0]!.toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "")}${String(p.born).slice(2)}`;

export function installZones(game: Game) {
  const isOrg = (n: NodeDoc) => ORG_KINDS.includes(n.kind) && !n.hidden;
  /** Chi lavora in un nodo: i dipendenti veri, più l'amministratore; mai meno di tre nomi. */
  function staffOf(n: NodeDoc): Person[] {
    const real = PEOPLE.filter((p) => (game.employerOf?.(p.id) ?? WORLD.employer[p.id]) === n.id);
    const admin = PEOPLE.find((p) => p.id === n.adminId);
    const out = [...(admin ? [admin] : []), ...real.filter((p) => p.id !== admin?.id)];
    for (let i = 0; out.length < 3; i += 1) {
      const p = PEOPLE[(hash(n.id) + i * 37) % PEOPLE.length]!;
      if (!out.includes(p)) out.push(p);
    }
    return out.slice(0, 6);
  }
  /** La password dell'utenza operatore: una parola e due cifre, diversa per ogni nodo. */
  const opPass = (n: NodeDoc) => `${DICTIONARY[hash(`op:${n.id}`) % DICTIONARY.length]!}${10 + (hash(`n:${n.id}`) % 90)}`;
  const level = (op: OpDoc) => (op.access === "admin" || op.access === "client" ? 3 : op.clearance);
  const innerOf = (n: NodeDoc) => [...game.nodes.values()].find((x) => x.inner === n.id) ?? null;
  const badges = (n: NodeDoc) => ((n as unknown as { badges?: { agentId: string; until: number }[] }).badges ??= []);
  const from = (op: OpDoc, a: AgentDoc) => game.prevIp(op, a);

  // ---------------------------------------------------------------- entrare da dipendente
  game.staffLogin = (op, agent, target, password) => {
    if (!isOrg(target)) return null;
    const pw = password.trim().toUpperCase();
    const who = staffOf(target).find((p) => personal(p) === pw);
    const want = pw === opPass(target).toUpperCase() ? 2 : who ? 1 : 0;
    if (!want) return null;
    if (op.clearance >= want) return { ok: false, error: "sei già dentro con quel livello" };
    op.clearance = want;
    game.log(target, `LOGIN ${want === 2 ? "operator" : (who?.name.split(" ")[0] ?? "user").toLowerCase()} from {FROM}`, { opId: op.id, actorId: agent.id, fromIp: from(op, agent) });
    game.bump(agent, "staff");
    game.deed(agent, "staff", target);
    return { ok: true, note: want === 2 ? "sei dentro come operatore" : `sei dentro con le credenziali di ${who!.name}` };
  };
  game.onConnect = (op, agent, target) => {
    const b = badges(target).find((x) => x.agentId === agent.id && x.until > now());
    if (!b) return;
    op.clearance = 2;
    op.bypass.proxy = true;
    game.log(target, "LOGIN operator (badge) from {FROM}", { opId: op.id, actorId: agent.id, fromIp: from(op, agent) });
    if (!agent.npc) game.out.toast(agent.id, "Il tuo badge è ancora valido: sei dentro come operatore.", "ok");
  };
  game.canReach = (agent, target) => {
    if (!target.inner) return null;
    if ((agent.buffs?.[`pivot:${target.id}`] ?? 0) > now()) return null;
    const parent = game.nodes.get(target.inner);
    return `nessuna portante dall'esterno: ${target.name} risponde solo alla rete interna di ${parent?.org ?? "un altro sistema"}. Entraci da admin e mappa la rete.`;
  };

  // ---------------------------------------------------------------- la posta
  type Raw = MailMsg & { lead?: string; dossier?: number };
  function mailbox(n: NodeDoc, me: AgentDoc): Raw[] {
    const week = Math.floor(now() / (7 * 86400_000));
    const r = rng(hash(`${n.id}:${week}`));
    const pick = <T>(a: T[]): T => a[Math.floor(r() * a.length)]!;
    const staff = staffOf(n);
    const admin = staff[0]!;
    const other = () => pick(staff.filter((p) => p !== admin)) ?? admin;
    const out: Raw[] = [];
    const add = (m: Omit<Raw, "id" | "act"> & { act?: Raw["act"] }) => out.push({ act: null, ...m, id: `m${out.length + 1}` });
    const first = (p: Person) => p.name.split(" ")[0]!;
    add({ from: admin.name, to: "tutti", subject: "Utenza operatore: nuova password", body: `Da lunedì la password dell'utenza operatore è ${opPass(n)}.\nNon scrivetela sui post-it. Sì, ${first(other())}, dico a te.\n\n${first(admin)} — Sistemi` });
    if (r() < 0.45) {
      const half = n.password.slice(0, Math.ceil(n.password.length / 2));
      add({ from: admin.name, to: other().name, subject: "Re: se sono in ferie", body: `Se salta tutto mentre sono via, la password di root comincia per «${half}». Il resto te lo dico a voce: non per iscritto.\n\n${first(admin)}` });
    }
    const near = [...game.nodes.values()].filter((x) => isOrg(x) && !x.inner && x.id !== n.id && regionAt(x.x, x.y) === regionAt(n.x, n.y));
    for (let i = 0; i < 2 && near.length; i += 1) {
      const t = pick(near);
      const p = other();
      add({ from: p.name, to: admin.name, subject: pick(["Fornitore nuovo", "Accesso remoto", "Chi li gestisce?", "Collegamento dati"]), body: `Per la pratica con ${t.org}: il loro sistema risponde al ${t.ip} (${t.name}). ${pick(["Mi hanno dato un'utenza ospite.", "Dicono che non hanno un firewall degno di questo nome.", "Il loro tecnico usa la stessa password ovunque.", "Occhio che di notte non c'è nessuno."])}\n\n${first(p)}`, lead: t.id, act: { kind: "lead", label: `Annota l'indirizzo di ${t.org}`, done: me.knownNodes.includes(t.id) } });
    }
    const homer = staff.find((p) => WORLD.home[p.id]);
    if (homer && r() < 0.6) {
      const h = game.nodes.get(WORLD.home[homer.id]!);
      if (h) add({ from: homer.name, to: admin.name, subject: "Lavoro da casa", body: `Stasera finisco da casa. Se serve, il mio PC risponde al ${h.ip}. La password è sempre quella.\n\n${first(homer)}`, lead: h.id, act: { kind: "lead", label: `Annota l'indirizzo del PC di ${homer.name}`, done: me.knownNodes.includes(h.id) } });
    }
    if (r() < 0.55) {
      const a = other();
      const value = 5 + Math.floor(r() * 5);
      const key = `dossier:${n.id}:${week}`;
      add({ from: a.name, to: pick(staff).name, subject: pick(["Cancella dopo aver letto", "Non qui", "Quella cosa", "RISERVATO"]), body: pick(["Se il consiglio scopre da dove vengono quei soldi, siamo finiti tutti e due. Le ricevute sono nell'allegato: tienile tu.", "Ho le foto della cena. Non le voglio usare, ma non costringermi.", "Il collaudo è fallito tre volte. Nel verbale ho scritto «superato». In allegato i dati veri, nel caso servano a qualcuno.", "Mi hanno offerto il doppio per passare i progetti alla concorrenza. Ti mando la bozza del contratto: dimmi che ne pensi."]) + `\n\n${first(a)}`, dossier: value, act: { kind: "dossier", label: "Copia l'allegato compromettente", done: (me.cooldowns?.[key] ?? 0) > now() } });
    }
    const secret = [...game.nodes.values()].filter((x) => x.hidden);
    if (secret.length && r() < 0.1) {
      const h = pick(secret);
      add({ from: other().name, to: admin.name, subject: "Numero strano nei tabulati", body: `Nei tabulati c'è una chiamata verso ${h.ip.split(".").slice(0, 3).join(".")}.x che nessuno ha fatto. Non è su nessun elenco. Tu ne sai qualcosa?` });
    }
    const gossip = [...MAIL_GOSSIP, ...MAIL_TIMES].sort(() => r() - 0.5).slice(0, 3 + Math.floor(r() * 2));
    for (const g of gossip) {
      const p = pick(staff);
      add({ from: p.name, to: "tutti", subject: g[0], body: `${g[1]}\n\n${first(p)}` });
    }
    return out.sort(() => r() - 0.5).map((m, i) => ({ ...m, id: `m${i + 1}` }));
  }

  // ---------------------------------------------------------------- le stanze
  function zonesOf(op: OpDoc, me: AgentDoc, n: NodeDoc): ZoneView[] {
    if (!isOrg(n) || n.kind === "gateway") return [];
    const lv = level(op);
    return ZONES.filter((z) => (z.kinds === "org" || z.kinds.includes(n.kind)) && (z.id !== "rete" || innerOf(n)) && !(n.inner && z.id === "rete")).map((z) => ({
      id: z.id,
      name: z.name,
      blurb: z.blurb,
      need: z.need,
      open: lv >= z.need,
      actions: z.actions
        .filter((a) => !a.side || a.side === me.faction)
        .map((a) => ({ id: a.id, name: a.name, desc: a.desc, need: a.need, blocked: lv < a.need ? `serve il livello ${CLEARANCE[a.need]}` : blocked(op, me, n, z.id, a.id) })),
    }));
  }
  const cdKey = (n: NodeDoc, a: string) => `z:${a}:${n.id}`;
  function blocked(op: OpDoc, me: AgentDoc, n: NodeDoc, z: string, a: string): string | null {
    const cd = (me.cooldowns?.[cdKey(n, a)] ?? 0) - now();
    if (cd > 0) return `di nuovo fra ${Math.ceil(cd / 60_000)} min`;
    if (a === "loop" && op.zoneUsed.includes("loop")) return "già usato in questa connessione";
    if (a === "loop" && !op.trace.active) return "nessun trace da fermare";
    if (a === "silenzia" && (n.alertUntil ?? 0) < now()) return "il sistema non è in allerta";
    if (a === "badge" && badges(n).some((b) => b.agentId === me.id && b.until > now())) return "hai già un badge valido";
    if (a === "revoca" && !badges(n).some((b) => b.until > now())) return "nessun badge sospetto";
    void z;
    return null;
  }

  function act(agent: AgentDoc, zone: string, action: string, arg: string): R {
    const op = game.ops.get(agent.id);
    const n = op ? game.nodes.get(op.chain.at(-1)!) : null;
    if (!op || !n) return { ok: false, error: "non sei collegato" };
    const zv = zonesOf(op, agent, n).find((z) => z.id === zone);
    if (!zv) return { ok: false, error: "questo sistema non ha quella sezione" };
    if (!zv.open) return { ok: false, error: `serve il livello ${CLEARANCE[zv.need]}` };
    const cds = (agent.cooldowns ??= {});
    const done = (deed: string, note: string, data?: unknown): R => {
      game.bump(agent, `z:${deed}`);
      game.deed(agent, `z:${deed}`, n);
      game.touch("agent", agent.id);
      game.touch("node", n.id);
      game.dirty.add(agent.id);
      return { ok: true, note, data };
    };
    const noise = (line: string) => {
      if (op.access === "client") return;
      game.noisy(op, agent, n);
      game.log(n, line, { opId: op.id, actorId: agent.id, fromIp: from(op, agent) });
      op.touched = true;
    };
    // la posta: leggere, annotare un indirizzo, copiare un allegato
    if (zone === "posta" && action === "leggi") {
      const box = mailbox(n, agent);
      if (!op.zoneUsed.includes("posta")) {
        op.zoneUsed.push("posta");
        noise("MAIL spool read from {FROM}");
        game.bump(agent, "z:posta");
        game.deed(agent, "z:posta", n);
      }
      return { ok: true, data: { mail: box.map(({ lead: _l, dossier: _d, ...m }) => m) } };
    }
    if (zone === "posta" && (action === "lead" || action === "dossier")) {
      const m = mailbox(n, agent).find((x) => x.id === arg);
      if (!m || m.act?.kind !== action) return { ok: false, error: "messaggio non trovato" };
      if (action === "lead") {
        if (!game.reveal(agent, m.lead!)) return { ok: false, error: "lo conosci già" };
        return done("lead", "indirizzo annotato: è sulla tua mappa");
      }
      const key = `dossier:${n.id}:${Math.floor(now() / (7 * 86400_000))}`;
      if ((cds[key] ?? 0) > now()) return { ok: false, error: "l'hai già copiato" };
      if (agent.storage.reduce((s, x) => s + x.size, 0) + 2 > game.storageMax(agent)) return { ok: false, error: "archivio pieno" };
      cds[key] = now() + 7 * 86400_000;
      agent.storage.push({ key: `st_${hash(key + agent.id).toString(16)}${Date.now().toString(36)}`, name: `allegato_${m.from.split(" ").at(-1)!.toLowerCase()}.msg`, nodeId: n.id, fileId: `dossier-${m.id}`, size: 2, at: now(), rarity: m.dossier! >= 9 ? 3 : m.dossier! >= 7 ? 2 : 1, value: m.dossier! });
      agent.ethics = Math.max(-100, agent.ethics - 2);
      noise("MAIL attachment export from {FROM}");
      return done("dossier", "allegato copiato nel tuo archivio: al ricettatore interessa");
    }
    const a = zv.actions.find((x) => x.id === action);
    if (!a) return { ok: false, error: "azione non disponibile" };
    if (a.blocked) return { ok: false, error: a.blocked };
    switch (action) {
      case "allerta":
        n.alertUntil = now() + ALERT_MINUTES * 60_000;
        return done("allerta", `${n.org} resta in allerta per ${ALERT_MINUTES} minuti`);
      case "rubrica": {
        const pool = [...game.nodes.values()].filter((x) => x.kind !== "gateway" && x.kind !== "home" && !x.hidden && !x.inner && !agent.knownNodes.includes(x.id) && regionAt(x.x, x.y) === regionAt(n.x, n.y)).sort(() => Math.random() - 0.5).slice(0, 2);
        if (!pool.length) return { ok: false, error: "in rubrica non c'è nessuno che tu non conosca già" };
        for (const x of pool) game.reveal(agent, x.id);
        cds[cdKey(n, action)] = now() + 20 * 60_000;
        noise("PBX directory dump from {FROM}");
        return done("rubrica", `${pool.length} indirizzi nuovi`, { lines: pool.map((x) => `${x.ip} · ${x.org}`) });
      }
      case "silenzia":
        n.alertUntil = 0;
        noise("PBX security line down src={FROM}");
        return done("silenzia", "la linea della sicurezza è muta: allerta spenta");
      case "guarda": {
        const w = game.wardensOf(n.id).map((x) => x.handle);
        const sn = (n.sensors ?? []).filter((x) => x.until > now()).length;
        return done("guarda", "sala server inquadrata", { lines: [w.length ? `Presidiano: ${w.join(", ")}` : "Nessuno presidia il nodo.", `Sensori attivi: ${sn}`, `Worm in esecuzione: ${n.worms?.length ?? 0}`, (n.alertUntil ?? 0) > now() ? "Il sistema è in allerta." : "Nessuna allerta."] });
      }
      case "loop":
        op.frozenUntil = now() + 15_000;
        op.zoneUsed.push("loop");
        noise("CCTV feed 3 signal loss src={FROM}");
        return done("loop", "nastro in loop: trace fermo per 15 secondi");
      case "nastri": {
        const lost = n.logs.filter((l) => l.removed && l.removedAt && now() - l.removedAt < 30 * 60_000).slice(-2);
        cds[cdKey(n, action)] = now() + 10 * 60_000;
        if (!lost.length) return done("nastri", "sui nastri non c'è niente che il log non dica già");
        for (const l of lost) (l.removed = null), (l.recovered = true);
        agent.stats.defense += 1;
        return done("nastri", `${lost.length} righe ricostruite dai nastri`);
      }
      case "fattura": {
        const tier = game.tierOf(n);
        const amount = 200 + Math.floor(Math.random() * 500) + tier * 150;
        agent.credits += amount;
        agent.ethics = Math.max(-100, agent.ethics - 1);
        cds[cdKey(n, action)] = now() + 45 * 60_000;
        noise(`LEDGER refund ${amount} CR issued from {FROM}`);
        return done("fattura", `+${fmtCr(amount)} da una fattura stornata`);
      }
      case "mastro": {
        if (agent.storage.reduce((s, x) => s + x.size, 0) + 3 > game.storageMax(agent)) return { ok: false, error: "archivio pieno" };
        const value = 4 + Math.min(5, game.tierOf(n) + 1);
        agent.storage.push({ key: `st_${hash(n.id + agent.id).toString(16)}${Date.now().toString(36)}`, name: `libro_mastro_${n.name.toLowerCase()}.xls`, nodeId: n.id, fileId: "mastro", size: 3, at: now(), rarity: value >= 7 ? 2 : 1, value });
        cds[cdKey(n, action)] = now() + 120 * 60_000;
        noise("LEDGER export by operator from {FROM}");
        return done("mastro", "libro mastro copiato nel tuo archivio");
      }
      case "organico":
        return done("organico", "organico letto", { lines: staffOf(n).map((p, i) => `${p.name} · ${i === 0 ? "amministratore di sistema" : p.job} · nato nel ${p.born} a ${p.city}`) });
      case "badge":
        badges(n).push({ agentId: agent.id, until: now() + 24 * 3600_000 });
        noise("HR badge issued src={FROM}");
        return done("badge", "badge stampato: per 24 ore entri qui da operatore");
      case "revoca": {
        const live = badges(n).filter((b) => b.until > now());
        (n as unknown as { badges: unknown[] }).badges = [];
        agent.credits += live.length * 150;
        agent.stats.defense += live.length;
        game.meta.war.blue += live.length;
        for (const b of live) {
          const o = game.agents.get(b.agentId);
          if (o && !o.npc) game.mail(o, "BADGE", `Revocato: ${n.org}`, `${agent.handle} ha revocato il tuo badge su ${n.org}.`);
        }
        return done("revoca", `${live.length} badge revocati (+${fmtCr(live.length * 150)})`);
      }
      case "mappa": {
        const inner = innerOf(n)!;
        (agent.buffs ??= {})[`pivot:${inner.id}`] = now() + 15 * 60_000;
        game.reveal(agent, inner.id);
        noise("NET internal sweep from {FROM}");
        return done("pivot", `rete mappata: ${inner.org} (${inner.ip}) è raggiungibile per 15 minuti`);
      }
      default:
        return { ok: false, error: "azione non disponibile" };
    }
  }

  game.opExtra = (op, me, target) => ({ clearance: level(op), zones: zonesOf(op, me, target) });
  const prev = game.socialAct;
  game.socialAct = (agent, a, p) => (a === "zone" ? act(agent, String(p.zone ?? ""), String(p.act ?? ""), String(p.arg ?? "")) : (prev?.(agent, a, p) ?? null));
  return { opPass, staffOf, personal };
}
