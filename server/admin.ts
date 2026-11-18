// Il pannello dell'amministratore: regolazioni del mondo, account, accessi, messaggi, manutenzione,
// statistiche. Ogni azione passa da Game.act («admin.<azione>»), è riservata agli account staff
// e finisce nel registro (meta.audit). main.ts fornisce quello che sta fuori dal mondo: le connessioni.
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Game, AgentDoc } from "./game.ts";
import { DEFAULT_SETTINGS, SETTINGS, sanitizeSetting, type AdminAccount, type AdminSession, type IpBan } from "../shared/admin.ts";
import { ACH_TOTAL } from "../shared/achievements.ts";
import { HARDWARE, TOOLS, rankOf } from "../shared/rules.ts";
import { warrantLevel } from "../shared/depth.ts";
import type { Faction, HardwareId, ToolId } from "../shared/types.ts";

export type NetHooks = {
  sessions(): AdminSession[];
  /** chiude le connessioni di un handle (con un ultimo messaggio); restituisce quante */
  kick(agentId: string, reason: string): number;
  kickIp(ip: string, reason: string): number;
  kickAll(reason: string): number;
  dbPath: string;
  startedAt: number;
  adminHandles: Set<string>;
};

type R = { ok: boolean; error?: string; note?: string; data?: unknown };
const HANDLE_RE = /^[A-Za-z0-9_\-]{3,16}$/;
const now = () => Date.now();

export function installAdmin(game: Game, net: NetHooks) {
  const humans = () => [...game.agents.values()].filter((a) => !a.npc);
  const byId = (id: unknown) => {
    const a = game.agents.get(String(id ?? ""));
    if (!a || a.npc) throw new Error("account inesistente");
    return a;
  };
  const audit = (by: AgentDoc, action: string, detail: string) => {
    const rows = (game.meta.audit ??= []);
    rows.unshift({ at: now(), by: by.handle, action, detail });
    game.meta.audit = rows.slice(0, 500);
    game.touch("meta", "world");
    console.warn(`AETHER · admin ${by.handle}: ${action} · ${detail}`);
  };
  const status = (a: AgentDoc): AdminAccount["status"] => (a.ban && (!a.ban.until || a.ban.until > now()) ? "bannato" : a.awaiting ? "in attesa" : "attivo");
  const view = (a: AgentDoc): AdminAccount => ({
    id: a.id,
    handle: a.handle,
    faction: a.faction,
    staff: Boolean(a.staff),
    createdAt: a.createdAt,
    lastSeen: a.lastSeen ?? 0,
    lastIp: a.lastIp ?? "",
    ips: a.ips ?? [],
    logins: a.logins ?? 0,
    online: game.online.has(a.id),
    status: status(a),
    ban: a.ban && (!a.ban.until || a.ban.until > now()) ? { until: a.ban.until, reason: a.ban.reason } : null,
    credits: a.credits,
    xp: a.xp,
    heat: a.heat,
    fame: Math.round(a.fame),
    rank: rankOf(a.xp, a.faction).name,
    achievements: a.feats.filter((f) => f.includes("#")).length,
    jailed: a.jailUntil > now(),
    charges: a.charges.length,
  });
  const endOpOf = (a: AgentDoc) => {
    const op = game.ops.get(a.id);
    if (op) game.endOp(op, "burned");
  };

  const ACTIONS: Record<string, (admin: AgentDoc, p: Record<string, unknown>) => R> = {
    // ---------------------------------------------------------------- panoramica
    overview() {
      const hs = humans().filter((a) => !a.staff);
      const day = new Date().toISOString().slice(0, 10);
      const daily = game.meta.daily ?? {};
      const days = Object.keys(daily).sort().slice(-30);
      const series = (k: string) => days.map((d) => ({ day: d, n: daily[d]?.[k] ?? 0 }));
      const totals = game.meta.totals ?? {};
      const credits = hs.map((a) => a.credits).sort((x, y) => x - y);
      const top = (f: (a: AgentDoc) => number, n = 8) =>
        [...hs]
          .sort((x, y) => f(y) - f(x))
          .slice(0, n)
          .map((a) => ({ id: a.id, handle: a.handle, faction: a.faction, value: Math.round(f(a)) }));
      const missionTypes = Object.entries(totals)
        .filter(([k]) => k.startsWith("m:"))
        .map(([k, v]) => ({ type: k.slice(2), n: v }))
        .sort((x, y) => y.n - x.n);
      const actions = Object.entries(totals)
        .filter(([k]) => k.startsWith("a:") || k.startsWith("t:") || k.startsWith("sys:"))
        .map(([k, v]) => ({ key: k, n: v }))
        .sort((x, y) => y.n - x.n);
      let dbBytes = 0;
      for (const f of [net.dbPath, `${net.dbPath}-wal`]) {
        try {
          dbBytes += statSync(f).size;
        } catch {
          /* il -wal può non esserci */
        }
      }
      const mem = process.memoryUsage();
      return {
        ok: true,
        data: {
          players: hs.length,
          red: hs.filter((a) => a.faction === "red").length,
          blue: hs.filter((a) => a.faction === "blue").length,
          online: [...game.online].filter((id) => !game.agents.get(id)?.staff).length,
          live: [...game.ops.keys()].filter((id) => !game.agents.get(id)?.npc).length,
          awaiting: hs.filter((a) => a.awaiting).length,
          banned: hs.filter((a) => status(a) === "bannato").length,
          jailed: hs.filter((a) => a.jailUntil > now()).length,
          newToday: hs.filter((a) => new Date(a.createdAt).toISOString().slice(0, 10) === day).length,
          activeToday: hs.filter((a) => a.lastDay === day).length,
          active7: hs.filter((a) => (a.lastSeen ?? 0) > now() - 7 * 86400_000).length,
          war: game.meta.war,
          economy: {
            supply: credits.reduce((s, x) => s + x, 0),
            median: credits.length ? credits[Math.floor(credits.length / 2)]! : 0,
            richest: credits.at(-1) ?? 0,
            earned: totals.earned ?? 0,
            stolen: totals.stolen ?? 0,
            spent: totals.spent ?? 0,
          },
          totals: {
            connections: totals["a:connect"] ?? 0,
            missions: totals["a:deliver"] ?? 0,
            traced: totals.traced ?? 0,
            arrests: totals.arrests ?? 0,
            ghosts: totals.ghost ?? 0,
            attributions: totals.attrib ?? 0,
            files: totals["t:copy"] ?? 0,
            heists: totals["a:transfer"] ?? 0,
            blackouts: totals["sys:blackout"] ?? 0,
            achievements: hs.reduce((s, a) => s + a.feats.filter((f) => f.includes("#")).length, 0),
            achievementsPossible: ACH_TOTAL * Math.max(1, hs.length),
            signups: totals.signup ?? 0,
            logins: totals.login ?? 0,
          },
          series: {
            signup: series("signup"),
            login: series("login"),
            connect: series("a:connect"),
            deliver: series("a:deliver"),
            traced: series("traced"),
            earned: series("earned"),
          },
          missionTypes,
          actions: actions.slice(0, 40),
          top: {
            xp: top((a) => a.xp),
            credits: top((a) => a.credits),
            fame: top((a) => a.fame),
            achievements: top((a) => a.feats.filter((f) => f.includes("#")).length),
            ghosts: top((a) => a.stats.clean),
            traced: top((a) => a.counters.traced ?? 0),
          },
          world: {
            nodes: game.nodes.size,
            offline: [...game.nodes.values()].filter((n) => (n.offlineUntil ?? 0) > now()).length,
            alert: [...game.nodes.values()].filter((n) => (n.alertUntil ?? 0) > now()).length,
            blackouts: Object.entries(game.meta.blackout ?? {})
              .filter(([, t]) => (t ?? 0) > now())
              .map(([r]) => r),
            missionsOpen: [...game.missions.values()].filter((m) => m.status === "open").length,
            missionsTaken: [...game.missions.values()].filter((m) => m.status === "taken").length,
            incidents: [...game.incidents.values()].filter((i) => !i.resolved).length,
            listings: game.listings.size,
            npcs: [...game.agents.values()].filter((a) => a.npc).length,
          },
          server: {
            uptime: Math.round((now() - net.startedAt) / 1000),
            rss: mem.rss,
            heap: mem.heapUsed,
            dbBytes,
            node: process.version,
            pid: process.pid,
          },
          audit: (game.meta.audit ?? []).slice(0, 12),
        },
      };
    },

    // ---------------------------------------------------------------- regolazioni
    settings() {
      return { ok: true, data: { defs: SETTINGS, values: { ...DEFAULT_SETTINGS, ...(game.meta.settings ?? {}) } } };
    },
    setSettings(admin, p) {
      const incoming = (p.values ?? {}) as Record<string, unknown>;
      const cur = (game.meta.settings ??= {});
      const changed: string[] = [];
      for (const [k, raw] of Object.entries(incoming)) {
        const v = sanitizeSetting(k, raw);
        if (v === null || cur[k] === v || (cur[k] === undefined && DEFAULT_SETTINGS[k] === v)) continue;
        cur[k] = v;
        changed.push(`${k}=${String(v).slice(0, 40)}`);
      }
      if (!changed.length) return { ok: true, note: "nessuna modifica" };
      game.touch("meta", "world");
      if (changed.some((c) => c.startsWith("maintenance=true"))) {
        net.kickAll(String(game.cfg("maintenanceMsg")));
      }
      if (changed.some((c) => c.startsWith("boardSize"))) game.fillBoard();
      for (const id of game.online) game.dirty.add(id);
      audit(admin, "impostazioni", changed.join(", "));
      return { ok: true, note: `${changed.length} impostazioni aggiornate` };
    },
    resetSettings(admin, p) {
      const keys = Array.isArray(p.keys) ? (p.keys as string[]) : null;
      if (keys) for (const k of keys) delete game.meta.settings?.[k];
      else game.meta.settings = {};
      game.touch("meta", "world");
      for (const id of game.online) game.dirty.add(id);
      audit(admin, "impostazioni predefinite", keys ? keys.join(", ") : "tutte");
      return { ok: true, note: "valori predefiniti ripristinati" };
    },

    // ---------------------------------------------------------------- account
    accounts(_admin, p) {
      const q = String(p.q ?? "").trim().toLowerCase();
      const f = String(p.filter ?? "tutti");
      const list = humans()
        .map(view)
        .filter((a) => !q || a.handle.toLowerCase().includes(q) || a.ips.some((ip) => ip.includes(q)) || a.lastIp.includes(q))
        .filter((a) => f === "tutti" || (f === "online" && a.online) || (f === "attesa" && a.status === "in attesa") || (f === "bannati" && a.status === "bannato") || (f === "rossi" && a.faction === "red") || (f === "blu" && a.faction === "blue") || (f === "staff" && a.staff))
        .sort((x, y) => Number(y.online) - Number(x.online) || y.lastSeen - x.lastSeen || y.createdAt - x.createdAt);
      return { ok: true, data: { list: list.slice(0, 300), total: list.length } };
    },
    account(_admin, p) {
      const a = byId(p.id);
      return {
        ok: true,
        data: {
          ...view(a),
          counters: a.counters,
          feats: a.feats,
          stats: a.stats,
          tools: a.tools,
          hw: a.hw,
          gatewayIp: a.gatewayIp,
          ethics: a.ethics,
          arrests: a.arrests,
          jailUntil: a.jailUntil,
          chargesList: a.charges.map((c) => `${c.text} (${c.where})`),
          warrant: warrantLevel(a.charges),
          storage: a.storage.map((s) => ({ name: s.name, size: s.size, rarity: s.rarity })),
          mail: a.mail.length,
          knownNodes: a.knownNodes.length,
          adminNodes: a.adminNodes.length,
          op: game.ops.get(a.id) ? game.ops.get(a.id)!.chain.at(-1) : null,
        },
      };
    },
    ban(admin, p) {
      const a = byId(p.id);
      if (a.staff) return { ok: false, error: "non si banna un amministratore" };
      const minutes = Math.max(0, Number(p.minutes) || 0);
      a.ban = { until: minutes ? now() + minutes * 60_000 : 0, reason: String(p.reason ?? "").slice(0, 200) || "violazione delle regole", by: admin.handle, at: now() };
      endOpOf(a);
      game.store.revokeTokens(a.id);
      net.kick(a.id, `Account sospeso: ${a.ban.reason}`);
      game.touch("agent", a.id);
      audit(admin, "ban", `${a.handle} · ${minutes ? `${minutes} min` : "per sempre"} · ${a.ban.reason}`);
      return { ok: true, note: `${a.handle} sospeso` };
    },
    unban(admin, p) {
      const a = byId(p.id);
      a.ban = null;
      game.touch("agent", a.id);
      audit(admin, "fine ban", a.handle);
      return { ok: true, note: `${a.handle} riammesso` };
    },
    approve(admin, p) {
      const a = byId(p.id);
      if (!a.awaiting) return { ok: false, error: "non è in attesa" };
      a.awaiting = false;
      game.welcome(a);
      game.feed(`Nuovo handle sul Reticolo: ${a.handle} (${a.faction === "red" ? "cellula rossa" : "cellula blu"}).`, "sys");
      game.touch("agent", a.id);
      audit(admin, "iscrizione approvata", a.handle);
      return { ok: true, note: `${a.handle} approvato` };
    },
    remove(admin, p) {
      const a = byId(p.id);
      if (a.staff) return { ok: false, error: "non si cancella un amministratore da qui" };
      if (String(p.confirm ?? "") !== a.handle) return { ok: false, error: "scrivi l'handle per confermare" };
      endOpOf(a);
      net.kick(a.id, "Account cancellato.");
      for (const m of game.missions.values()) {
        if (m.takenBy === a.id && m.status === "taken") {
          m.status = "open";
          m.takenBy = null;
          game.touch("mission", m.id);
        }
      }
      for (const l of [...game.listings.values()]) {
        if (l.sellerId === a.id) {
          game.listings.delete(l.id);
          game.touch("listing", l.id);
        }
      }
      const gw = game.gatewayId(a);
      game.nodes.delete(gw);
      game.touch("node", gw);
      game.agents.delete(a.id);
      game.touch("agent", a.id);
      game.store.deleteAccount(a.id);
      game.flush();
      audit(admin, p.reject ? "iscrizione respinta" : "account cancellato", a.handle);
      return { ok: true, note: `${a.handle} cancellato` };
    },
    password(admin, p) {
      const a = byId(p.id);
      const pass = String(p.password ?? "");
      if (pass.length < 6) return { ok: false, error: "almeno 6 caratteri" };
      if (!game.store.setPassword(a.id, pass)) return { ok: false, error: "nessun account collegato" };
      if (a.id !== admin.id) net.kick(a.id, "La tua chiave è stata cambiata dall'amministrazione.");
      audit(admin, "chiave cambiata", a.handle);
      return { ok: true, note: `chiave di ${a.handle} cambiata; sessioni chiuse` };
    },
    rename(admin, p) {
      const a = byId(p.id);
      const h = String(p.handle ?? "").trim();
      if (!HANDLE_RE.test(h)) return { ok: false, error: "handle: 3-16 caratteri, lettere, numeri, - e _" };
      if (net.adminHandles.has(h.toLowerCase()) && !a.staff) return { ok: false, error: "handle riservato" };
      if (humans().some((x) => x.id !== a.id && x.handle.toLowerCase() === h.toLowerCase()) || (game.store.accountByHandle(h)?.agentId ?? a.id) !== a.id) return { ok: false, error: "handle già in uso" };
      const old = a.handle;
      a.handle = h;
      game.store.renameAccount(a.id, h);
      game.touch("agent", a.id);
      audit(admin, "rinomina", `${old} → ${h}`);
      return { ok: true, note: `${old} ora è ${h}` };
    },
    faction(admin, p) {
      const a = byId(p.id);
      const f: Faction = p.faction === "blue" ? "blue" : "red";
      a.faction = f;
      endOpOf(a);
      game.touch("agent", a.id);
      game.dirty.add(a.id);
      audit(admin, "cellula", `${a.handle} → ${f}`);
      return { ok: true, note: `${a.handle} passa ai ${f === "red" ? "rossi" : "blu"}` };
    },
    edit(admin, p) {
      const a = byId(p.id);
      const field = String(p.field);
      const v = Number(p.value);
      if (!Number.isFinite(v)) return { ok: false, error: "valore non valido" };
      const lim: Record<string, [number, number]> = { credits: [0, 1e9], xp: [0, 1e8], heat: [0, 99], fame: [0, 1e6], ethics: [-100, 100] };
      if (!lim[field]) return { ok: false, error: "campo non modificabile" };
      const val = Math.round(Math.min(lim[field]![1], Math.max(lim[field]![0], v)));
      const before = (a as unknown as Record<string, number>)[field];
      (a as unknown as Record<string, number>)[field] = val;
      game.touch("agent", a.id);
      game.dirty.add(a.id);
      audit(admin, "modifica", `${a.handle} · ${field}: ${Math.round(before ?? 0)} → ${val}`);
      return { ok: true, note: `${field} = ${val}` };
    },
    clearCharges(admin, p) {
      const a = byId(p.id);
      a.charges = [];
      game.touch("agent", a.id);
      game.dirty.add(a.id);
      audit(admin, "fedina ripulita", a.handle);
      return { ok: true, note: "capi d'accusa cancellati" };
    },
    release(admin, p) {
      const a = byId(p.id);
      a.jailUntil = 0;
      game.touch("agent", a.id);
      game.dirty.add(a.id);
      game.out.toast(a.id, "L'amministrazione ti ha rimesso in libertà.", "info");
      audit(admin, "scarcerazione", a.handle);
      return { ok: true, note: `${a.handle} libero` };
    },
    jail(admin, p) {
      const a = byId(p.id);
      if (a.staff) return { ok: false, error: "non su un amministratore" };
      const minutes = Math.min(24 * 60, Math.max(1, Number(p.minutes) || 5));
      endOpOf(a);
      a.jailUntil = now() + minutes * 60_000;
      game.touch("agent", a.id);
      game.dirty.add(a.id);
      game.mail(a, "GUARDIA DEL RETICOLO", "Custodia amministrativa", `L'amministrazione del Reticolo ti trattiene per ${minutes} minuti.${p.reason ? `\nMotivo: ${String(p.reason).slice(0, 200)}` : ""}`);
      audit(admin, "custodia", `${a.handle} · ${minutes} min`);
      return { ok: true, note: `${a.handle} in custodia per ${minutes} min` };
    },
    grant(admin, p) {
      const a = byId(p.id);
      const tool = String(p.tool ?? "");
      const hw = String(p.hw ?? "");
      const v = Math.round(Number(p.level) || 0);
      if (tool) {
        if (!TOOLS.some((t) => t.id === tool)) return { ok: false, error: "software sconosciuto" };
        if (v <= 0) delete a.tools[tool as ToolId];
        else a.tools[tool as ToolId] = Math.min(3, v);
      } else if (hw) {
        if (!HARDWARE.some((h) => h.id === hw)) return { ok: false, error: "hardware sconosciuto" };
        a.hw[hw as HardwareId] = Math.min(5, Math.max(1, v));
        game.ensureGateway(a);
      } else return { ok: false, error: "niente da assegnare" };
      game.touch("agent", a.id);
      game.dirty.add(a.id);
      audit(admin, "dotazione", `${a.handle} · ${tool || hw} → ${v}`);
      return { ok: true, note: "dotazione aggiornata" };
    },
    resetAchievements(admin, p) {
      const a = byId(p.id);
      a.feats = a.feats.filter((f) => !f.includes("#"));
      game.touch("agent", a.id);
      audit(admin, "traguardi azzerati", a.handle);
      return { ok: true, note: "traguardi azzerati (si riguadagnano col prossimo avanzamento)" };
    },

    // ---------------------------------------------------------------- connessioni e accessi
    sessions() {
      return { ok: true, data: { sessions: net.sessions(), ipBans: (game.meta.ipBans ?? []).filter((b) => !b.until || b.until > now()) } };
    },
    kick(admin, p) {
      const a = byId(p.id);
      endOpOf(a);
      const n = net.kick(a.id, String(p.reason ?? "") || "Scollegato dall'amministrazione.");
      audit(admin, "scollegato", `${a.handle} (${n} connessioni)`);
      return { ok: true, note: `${n} connessioni chiuse` };
    },
    kickIp(admin, p) {
      const ip = String(p.ip ?? "").trim();
      if (!ip) return { ok: false, error: "indirizzo mancante" };
      const n = net.kickIp(ip, String(p.reason ?? "") || "Scollegato dall'amministrazione.");
      audit(admin, "scollegato indirizzo", `${ip} (${n})`);
      return { ok: true, note: `${n} connessioni chiuse` };
    },
    ipBan(admin, p) {
      const ip = String(p.ip ?? "").trim();
      if (!/^[0-9a-fA-F:.]{3,45}$/.test(ip)) return { ok: false, error: "indirizzo non valido" };
      const minutes = Math.max(0, Number(p.minutes) || 0);
      const ban: IpBan = { ip, until: minutes ? now() + minutes * 60_000 : 0, reason: String(p.reason ?? "").slice(0, 200), at: now(), by: admin.handle };
      game.meta.ipBans = [...(game.meta.ipBans ?? []).filter((b) => b.ip !== ip), ban];
      game.touch("meta", "world");
      const n = net.kickIp(ip, "Indirizzo bloccato.");
      audit(admin, "indirizzo bloccato", `${ip} · ${minutes ? `${minutes} min` : "per sempre"} · ${n} connessioni chiuse`);
      return { ok: true, note: `${ip} bloccato` };
    },
    ipUnban(admin, p) {
      const ip = String(p.ip ?? "").trim();
      game.meta.ipBans = (game.meta.ipBans ?? []).filter((b) => b.ip !== ip);
      game.touch("meta", "world");
      audit(admin, "indirizzo sbloccato", ip);
      return { ok: true, note: `${ip} sbloccato` };
    },

    // ---------------------------------------------------------------- messaggi
    mail(admin, p) {
      const to = String(p.to ?? "");
      const subject = String(p.subject ?? "").trim().slice(0, 120);
      const body = String(p.body ?? "").trim().slice(0, 4000);
      const from = String(p.from ?? "").trim().slice(0, 30) || "AMMINISTRAZIONE";
      if (!subject || !body) return { ok: false, error: "oggetto e testo" };
      const list = humans().filter((a) => !a.staff && (to === "all" || (to === "red" && a.faction === "red") || (to === "blue" && a.faction === "blue") || (to === "online" && game.online.has(a.id)) || a.id === to));
      if (!list.length) return { ok: false, error: "nessun destinatario" };
      for (const a of list) {
        game.mail(a, from, subject, body);
        game.dirty.add(a.id);
        if (game.online.has(a.id)) game.out.toast(a.id, `Posta da ${from}: ${subject}`, "info");
      }
      audit(admin, "posta", `${list.length === 1 ? list[0]!.handle : `${list.length} destinatari (${to})`} · ${subject}`);
      return { ok: true, note: `inviata a ${list.length}` };
    },
    toast(admin, p) {
      const text = String(p.text ?? "").trim().slice(0, 200);
      const tone = (["ok", "warn", "bad", "info"].includes(String(p.tone)) ? p.tone : "info") as "ok" | "warn" | "bad" | "info";
      const to = String(p.to ?? "online");
      if (!text) return { ok: false, error: "testo vuoto" };
      const ids = [...game.online].filter((id) => to === "online" || to === id || game.agents.get(id)?.faction === to);
      for (const id of ids) game.out.toast(id, text, tone);
      audit(admin, "avviso istantaneo", `${ids.length} · ${text}`);
      return { ok: true, note: `mostrato a ${ids.length}` };
    },
    feed(admin, p) {
      const text = String(p.text ?? "").trim().slice(0, 240);
      if (!text) return { ok: false, error: "testo vuoto" };
      game.feed(text, "sys");
      audit(admin, "notizia nel feed", text);
      return { ok: true, note: "pubblicata nel feed" };
    },

    // ---------------------------------------------------------------- manutenzione
    save(admin) {
      game.flush();
      audit(admin, "salvataggio", "mondo scritto su disco");
      return { ok: true, note: "mondo salvato" };
    },
    snapshot(admin) {
      game.flush();
      const name = `copia-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.db`;
      const path = join(dirname(net.dbPath), name);
      game.store.snapshot(path);
      audit(admin, "copia del database", path);
      return { ok: true, note: `copia in ${path}` };
    },
    refillBoard(admin) {
      for (const m of game.missions.values()) {
        if (m.status === "open" && !m.postedBy && !m.ownerId) {
          m.status = "expired";
          game.touch("mission", m.id);
        }
      }
      game.fillBoard();
      audit(admin, "bacheca rigenerata", "");
      return { ok: true, note: "bacheca rigenerata" };
    },
    calmWorld(admin) {
      for (const n of game.nodes.values()) {
        if (n.offlineUntil || n.alertUntil) {
          n.offlineUntil = 0;
          n.alertUntil = 0;
          game.touch("node", n.id);
        }
      }
      game.meta.blackout = {};
      game.touch("meta", "world");
      for (const id of game.online) game.dirty.add(id);
      audit(admin, "mondo calmato", "sistemi riaccesi, allerte e blackout azzerati");
      return { ok: true, note: "sistemi riaccesi, allerte e blackout spenti" };
    },
    disconnectAll(admin) {
      let n = 0;
      for (const op of [...game.ops.values()]) {
        const a = game.agents.get(op.agentId);
        if (!a || a.npc) continue;
        game.endOp(op, "burned");
        game.out.toast(a.id, "L'amministrazione ha chiuso tutte le connessioni.", "warn");
        n += 1;
      }
      audit(admin, "operazioni chiuse", `${n}`);
      return { ok: true, note: `${n} operazioni chiuse` };
    },
    kickAll(admin, p) {
      const n = net.kickAll(String(p.reason ?? "") || "Il Reticolo si riavvia: rientra fra qualche minuto.");
      audit(admin, "tutti scollegati", `${n}`);
      return { ok: true, note: `${n} connessioni chiuse` };
    },
    coolAll(admin) {
      for (const a of humans()) {
        a.heat = 0;
        game.touch("agent", a.id);
      }
      audit(admin, "calore azzerato", "tutti gli handle");
      return { ok: true, note: "calore azzerato per tutti" };
    },
    amnesty(admin) {
      let n = 0;
      for (const a of humans()) {
        if (a.jailUntil > now() || a.charges.length) n += 1;
        a.jailUntil = 0;
        a.charges = [];
        game.touch("agent", a.id);
      }
      audit(admin, "amnistia", `${n} handle`);
      return { ok: true, note: `amnistia: ${n} handle` };
    },
    auditLog(_admin, p) {
      const n = Math.min(500, Math.max(10, Number(p.limit) || 200));
      return { ok: true, data: (game.meta.audit ?? []).slice(0, n) };
    },
  };

  game.adminAct = (admin, a, p) => {
    const fn = ACTIONS[a];
    if (!fn) return { ok: false, error: `azione sconosciuta: ${a}` };
    try {
      return fn(admin, p);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "errore" };
    }
  };
}
