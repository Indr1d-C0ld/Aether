import { clockShort, fmtCr, latticeClock, maxTasks } from "../../../shared/rules.ts";
import { net } from "../net.ts";
import type { DeckCtx } from "./Deck.tsx";
import { ChipsPanel, FamePanel, InventoryPanel, LawPanel, SocPanel } from "./Dossier.tsx";

export function Gateway({ ctx }: { ctx: DeckCtx }) {
  const me = ctx.state.me;
  const used = me.storage.reduce((s, f) => s + f.size, 0);
  const presNames = me.presiding.map((x) => ctx.state.nodes.find((n) => n.id === x.nodeId)?.org ?? "?");
  return (
    <div className="list" style={{ gap: 14 }}>
      <div className="view-title">
        <h2>Gateway</h2>
        <span className="t-fac px" style={{ fontSize: 24 }}>
          {me.gatewayIp}
        </span>
      </div>
      <div className="grid2">
        <div className="panel">
          <div className="panel-head">
            <span className="label">Identità</span>
          </div>
          <div className="panel-body list" style={{ gap: 6 }}>
            <Row k="Handle" v={me.handle} />
            <Row k="Cellula" v={me.faction === "red" ? "Rossa" : "Blu"} />
            <Row k="Rango" v={`${me.rank} · ${me.xp} XP${me.nextXp ? ` / ${me.nextXp}` : ""}`} />
            <Row k="Crediti" v={fmtCr(me.credits)} />
            <Row k="Conto" v={me.account} />
            <Row k="Fama" v={`${me.fameTitle} · ${me.fame}`} />
            <Row k="Calore" v={`${me.heat}/100 ${me.heat >= 75 ? "· il trace ti trova prima" : ""}`} />
            <Row k="Hardware" v={`CPU ${me.hw.cpu} · Modem ${me.hw.modem} · Memoria ${me.hw.memory} · Difese ${me.hw.shield}`} />
            <Row k="Limiti" v={`${me.maxHops} hop · ${maxTasks(me.hw.memory)} task`} />
            {presNames.length ? <Row k="Presidi" v={presNames.join(", ")} /> : null}
            <p className="faint" style={{ margin: "8px 0 0", fontSize: 12 }}>
              A calore 100 il gateway viene sequestrato: multa, hardware degradato, nuovo indirizzo. Il calore scende da solo col tempo.
            </p>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <span className="label">Statistiche</span>
          </div>
          <div className="panel-body list" style={{ gap: 6 }}>
            <Row k="Operazioni" v={String(me.stats.ops)} />
            <Row k="Fantasma (indagini senza nome)" v={String(me.stats.clean)} />
            <Row k="Tracciato" v={String(me.stats.caught)} />
            <Row k="Attribuzioni" v={String(me.stats.attributions)} />
            <Row k="Sabotaggi" v={String(me.stats.sabotage)} />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <span className="label">Difese del gateway</span>
            <span className="chip">livello {me.hw.shield}</span>
          </div>
          <div className="panel-body list" style={{ gap: 6 }}>
            <Row k="Proxy" v={`L${me.gatewaySec.proxy}`} />
            <Row k="Firewall" v={`L${me.gatewaySec.firewall}`} />
            <Row k="Monitor" v={`L${me.gatewaySec.monitor}`} />
            {me.overloadUntil > ctx.serverNow ? (
              <p className="t-red" style={{ margin: 0 }}>
                CPU sabotata fino alle {clockShort(me.overloadUntil)}: i tuoi strumenti vanno a metà velocità.
              </p>
            ) : null}
            <p className="faint" style={{ margin: "8px 0 0", fontSize: 12 }}>
              {me.xp < me.protectedUntilXp
                ? `Finché non arrivi a ${me.protectedUntilXp} XP il tuo gateway è protetto, e tu non puoi attaccare quelli altrui.`
                : "Chi conosce il tuo indirizzo può entrare: rubarti file, prosciugarti il 15% dei crediti, sabotarti la CPU. Alza le Difese dal Mercato. La password cambia dopo ogni intrusione."}
            </p>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <span className="label">Indirizzi noti</span>
            <span className="faint">{me.known.length}</span>
          </div>
          <div className="panel-body list" style={{ gap: 6 }}>
            {me.known.length ? (
              me.known.map((k) => (
                <div key={k.ip} className="spread" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 4 }}>
                  <span>
                    <span className="t-fac">{k.ip}</span> {k.handle ? <b>{k.handle}</b> : null}
                    <div className="faint" style={{ fontSize: 12 }}>{k.note}</div>
                  </span>
                  <button
                    className="btn small"
                    disabled={Boolean(ctx.state.op) || me.xp < me.protectedUntilXp}
                    onClick={() => void net.do("connect", { chain: ctx.route, targetIp: k.ip })}
                  >
                    {ctx.route.length ? `Collega via ${ctx.route.length} hop` : "Collega diretto"}
                  </button>
                </div>
              ))
            ) : (
              <p className="dim" style={{ margin: 0 }}>
                Nessuno. Gli indirizzi arrivano dai tuoi backdoor, dagli honeypot, dal Registro e dalle cacce chiuse.
              </p>
            )}
            <p className="faint" style={{ margin: 0, fontSize: 12 }}>
              Il collegamento usa il rimbalzo che hai preparato sulla mappa.
            </p>
          </div>
        </div>
        <div className="panel" style={{ gridColumn: "1 / -1" }}>
          <div className="panel-head">
            <span className="label">Log del tuo gateway</span>
            <span className="faint">chi è entrato e da dove</span>
          </div>
          <div className="panel-body">
            <div className="logs">
              {[...me.gatewayLogs].reverse().map((l) => (
                <div key={l.id} className={`logrow ${l.gap ? "gap" : ""} ${/^(CONNECT|LOGIN|BANK|FILE|SYS cpu|WARN)/.test(l.text) ? "hot" : ""}`}>
                  <time>{clockShort(l.at)}</time>
                  <span style={{ wordBreak: "break-all" }}>{l.text}</span>
                </div>
              ))}
              {!me.gatewayLogs.length ? <div className="logrow faint">Nessuna attività.</div> : null}
            </div>
          </div>
        </div>
        {me.faction === "blue" ? <SocPanel ctx={ctx} /> : null}
        <LawPanel ctx={ctx} />
        <ChipsPanel ctx={ctx} />
        <InventoryPanel ctx={ctx} />
        <FamePanel ctx={ctx} />
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="spread" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 4 }}>
      <span className="dim">{k}</span>
      <span>{v}</span>
    </div>
  );
}
