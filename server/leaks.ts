// Bottino con un contenuto (regole in shared/leaks.ts). Il contenuto si assegna quando il file entra nell'archivio
// (Game.deed «t:copy» per le copie, «z:dossier» per gli allegati della posta interna) e viaggia con il file: si vende,
// si scambia e si compra al mercato nero come gli altri. Usarlo consuma il file.
import type { Game, AgentDoc, NodeDoc } from "./game.ts";
import { fmtCr } from "../shared/rules.ts";
import {
  BLACKMAIL_RISK,
  LEAK_MIN_VALUE,
  PRESS_FAME,
  PRESS_REP,
  RESEARCH_CHANCE,
  RESEARCH_FROM,
  SCANDAL_CHANCE,
  SCANDAL_FROM,
  blackmailPay,
  pressPay,
  rivalPay,
  type LeakContent,
} from "../shared/leaks.ts";
import { TRUST_DELTA } from "../shared/law.ts";

type R = { ok: boolean; error?: string; note?: string; data?: unknown };
type Org = { cash: number; rep: number; fear: number };
type Orgs = { news: (kind: "economia" | "legge" | "gente", text: string, n: NodeDoc | null, feed?: boolean) => void; isOrg: (n: NodeDoc) => boolean; org: (n: NodeDoc) => Org; rivalsOf: (n: NodeDoc) => string[]; blame: (n: NodeDoc, rivalId: string) => void };

const dev = () => process.env.AETHER_DEV === "1";

export function installLeaks(game: Game, orgs: Orgs) {
  let force: LeakContent["kind"] | null = null;
  // quando un file entra nell'archivio, si guarda cosa c'è dentro
  const prevDeed = game.deed.bind(game);
  game.deed = (agent, d, node) => {
    prevDeed(agent, d, node);
    if ((d !== "t:copy" && d !== "z:dossier") || !node || agent.npc || !orgs.isOrg(node)) return;
    const st = [...agent.storage].filter((x) => x.nodeId === node.id && !x.item && !x.content).sort((a, b) => b.at - a.at)[0];
    if (!st) return;
    const value = st.value ?? node.files.find((f) => f.id === st.fileId)?.value ?? 0;
    let kind: LeakContent["kind"] | null = force;
    if (!kind && d === "z:dossier") kind = "scandal";
    if (!kind && value >= LEAK_MIN_VALUE) {
      if (RESEARCH_FROM.includes(node.kind) && Math.random() < RESEARCH_CHANCE) kind = "research";
      else if (SCANDAL_FROM.includes(node.kind) && Math.random() < SCANDAL_CHANCE) kind = "scandal";
    }
    if (!kind) return;
    st.content = { kind, nodeId: node.id, org: node.org, tier: game.tierOf(node) };
    game.touch("agent", agent.id);
    game.dirty.add(agent.id);
    game.out.toast(agent.id, kind === "research" ? `«${st.name}» è un progetto riservato di ${node.org}: alla concorrenza interessa.` : `«${st.name}» è la prova di uno scandalo di ${node.org}.`, "ok");
  };

  // ---------------------------------------------------------------- usarlo
  function act(a: AgentDoc, p: Record<string, unknown>): R {
    if (p.dev && dev()) {
      force = (p.force as LeakContent["kind"] | null) ?? null;
      return { ok: true };
    }
    const st = a.storage.find((x) => x.key === p.key);
    const c = st?.content;
    if (!st || !c) return { ok: false, error: "quel file non ha niente di speciale" };
    const victim = game.nodes.get(c.nodeId);
    if (!victim) return { ok: false, error: "l'organizzazione non esiste più" };
    const o = orgs.org(victim);
    const use = String(p.use ?? "");
    const done = (note: string): R => {
      a.storage = a.storage.filter((x) => x !== st);
      game.touch("agent", a.id);
      game.dirty.add(a.id);
      return { ok: true, note };
    };
    if (use === "rival") {
      if (c.kind !== "research") return { ok: false, error: "è uno scandalo, non un progetto" };
      const rid = orgs.rivalsOf(victim)[0];
      const rival = rid ? game.nodes.get(rid) : null;
      if (!rival) return { ok: false, error: `${c.org} non ha concorrenti a cui venderlo` };
      const pay = rivalPay(c.tier);
      a.credits += pay;
      o.cash -= 800 + c.tier * 300;
      o.rep = Math.max(0, o.rep - 5);
      const ro = orgs.org(rival);
      ro.cash += 600 + c.tier * 200;
      ro.rep = Math.min(100, ro.rep + 3);
      orgs.blame(victim, rival.id);
      orgs.news("economia", `${rival.org} presenta un prodotto sospettamente simile a quello che ${c.org} stava per lanciare. In ${c.org} si parla di spionaggio industriale.`, victim);
      game.bump(a, "leak:rival");
      a.ethics = Math.max(-100, a.ethics - 3);
      return done(`${rival.org} paga ${fmtCr(pay)} per il progetto di ${c.org}. ${c.org} comincia a sospettare di loro.`);
    }
    if (use === "press") {
      if (c.kind !== "scandal") return { ok: false, error: "un progetto non fa notizia" };
      const papers = [...game.nodes.values()].filter((n) => n.kind === "news" && orgs.isOrg(n) && !n.hidden && !n.inner);
      const paper = papers.sort((x, y) => Math.hypot(x.x - victim.x, x.y - victim.y) - Math.hypot(y.x - victim.x, y.y - victim.y))[0];
      if (!paper) return { ok: false, error: "nessun giornale vuole pubblicarlo" };
      const pay = pressPay(c.tier);
      a.credits += pay;
      game.addFame(a, PRESS_FAME);
      a.ethics = Math.min(100, a.ethics + 4);
      o.rep = Math.max(0, o.rep - PRESS_REP);
      o.fear = Math.min(100, o.fear + 10);
      o.cash -= 500 + c.tier * 300;
      if (victim.kind === "law" || victim.kind === "gov") game.lawTrust?.(TRUST_DELTA.leak * 2, a);
      orgs.news(victim.kind === "law" || victim.kind === "gov" ? "legge" : "economia", `Scandalo: ${paper.org} pubblica documenti interni di ${c.org}. «Una fonte anonima», scrive il giornale. ${c.org} non commenta.`, victim);
      game.bump(a, "leak:press");
      return done(`${paper.org} pubblica tutto. Ti paga ${fmtCr(pay)}, e il tuo nome gira fra chi conta (fama +${PRESS_FAME}).`);
    }
    if (use === "blackmail") {
      if (c.kind !== "scandal") return { ok: false, error: "un progetto non si usa per ricattare" };
      a.ethics = Math.max(-100, a.ethics - 8);
      if (Math.random() < BLACKMAIL_RISK) {
        a.heat = Math.min(100, a.heat + 20);
        game.charge(a, `tentata estorsione a ${c.org}`, 2, c.org);
        return done(`${c.org} non paga e va dritta alla polizia. Calore +20, e un capo d'accusa.`);
      }
      const pay = blackmailPay(c.tier);
      a.credits += pay;
      o.cash -= pay;
      game.bump(a, "leak:blackmail");
      return done(`${c.org} paga ${fmtCr(pay)} perché tutto resti dov'è.`);
    }
    return { ok: false, error: "uso sconosciuto" };
  }
  const prev = game.socialAct;
  game.socialAct = (agent, a, p) => (a === "leak" ? act(agent, p) : (prev?.(agent, a, p) ?? null));
}
