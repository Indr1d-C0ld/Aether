import { useEffect, useMemo, useState } from "react";
import type { FileView, LogView, OpView, ToolId } from "../../../shared/types.ts";
import { KIND_LABEL, MISSION_LABEL, clockShort, toolDef } from "../../../shared/rules.ts";
import { net } from "../net.ts";
import { sfx } from "../audio.ts";
import type { DeckCtx } from "./Deck.tsx";
import { Arsenal, LedgerPanel, RecordsPanel } from "./Archive.tsx";
import { rarityColor, rarityName } from "../../../shared/depth.ts";
import { CrackDisplay, Decode, ToolTheater, TypeOut, shoot } from "../cinema.tsx";
import { ZonesPanel } from "./Zones.tsx";
import { FirewallGrid } from "./FirewallGrid.tsx";
import { Rotors } from "./Rotors.tsx";
import { BioBarrier } from "./Scope.tsx";
import { DefacePanel, NodeMalware } from "./Lab.tsx";
import { PART_NAME, clockLabel, dayPart, statusLine } from "../../../shared/clock.ts";
import { CLEARANCE } from "../../../shared/zones.ts";
import type { SurpriseView } from "../../../shared/surprises.ts";

export function Connection({ ctx, elapsed }: { ctx: DeckCtx; elapsed: number }) {
  const { state } = ctx;
  const op = state.op;
  if (!op) {
    return (
      <div className="panel" style={{ maxWidth: 640 }}>
        <div className="panel-head">
          <span className="label">Console</span>
        </div>
        <div className="panel-body list">
          <p style={{ margin: 0 }}>Nessuna connessione aperta.</p>
          <p className="dim" style={{ margin: 0 }}>
            Accetta un contratto in bacheca, poi dalla mappa costruisci il rimbalzo e collegati al bersaglio.
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => ctx.go("map")}>
              Apri la mappa
            </button>
            <button className="btn" onClick={() => ctx.go("board")}>
              Bacheca
            </button>
          </div>
        </div>
      </div>
    );
  }
  return <Live ctx={ctx} op={op} elapsed={elapsed} />;
}

function Live({ ctx, op, elapsed }: { ctx: DeckCtx; op: OpView; elapsed: number }) {
  const { state } = ctx;
  const me = state.me;
  const target = op.target;
  const tools = me.tools;
  const running = (tool: string) => op.tasks.some((k) => k.tool === tool && k.state === "run");
  const run = (tool: ToolId, p: Record<string, unknown> = {}) => {
    sfx.click();
    void net.do("run", { tool, ...p });
  };
  const contract = state.missions.find((m) => m.mine && m.nodeId === target.id);
  // le credenziali del cliente valgono su tutti i nodi del contratto; sui relay si parte da ospiti
  const canClient = me.faction === "blue" && (op.access === "none" || op.access === "guest") && state.missions.some((m) => m.mine && m.clientAccess && m.clientNodes.includes(target.id));
  const inside = op.access === "admin" || op.access === "client";

  return (
    <div className="list" style={{ gap: 14 }}>
      {op.surprise ? <SurpriseCard s={op.surprise} now={ctx.serverNow} /> : null}
      <div className="view-title">
        <div>
          <div className="label">
            {KIND_LABEL[target.kind]} · {target.ip} · via {op.chain.length - 1} hop
          </div>
          <h2 className="glitch" data-text={target.org}>
            {target.org}
          </h2>
        </div>
        <div className="row">
          <span className={`chip ${op.access === "none" && !op.clearance ? "red" : "green"}`}>
            accesso: {op.access === "none" ? (op.clearance ? CLEARANCE[op.clearance] : "negato") : op.access === "guest" ? "guest" : op.access === "client" ? "cliente" : "admin"}
          </span>
          <button
            className="btn danger"
            onClick={() => {
              sfx.bad();
              void net.do("disconnect");
            }}
          >
            Stacca
          </button>
        </div>
      </div>

      {op.banner ? (
        <p className="dim" style={{ margin: 0 }}>
          <Decode text={op.banner} ms={900} /> {target.night ? <span className="chip fac">turno di notte</span> : null} {target.alert ? <span className="chip red">in allerta</span> : null}
        </p>
      ) : null}
      {!op.trace.active && op.access !== "client" && target.sec.monitor > 0 && target.kind !== "relay" ? (
        <p className="t-green" style={{ margin: 0, fontSize: 13 }}>
          Qui nessuno guarda chi entra: il monitor partirà alla prima mossa rumorosa (uno strumento, una password, un file).
        </p>
      ) : null}
      {op.poisoned.length ? (
        <div className="alarm" style={{ animation: "none" }}>
          Hai attraversato un relay avvelenato ({op.poisoned.map((id) => state.nodes.find((n) => n.id === id)?.name).join(", ")}): il trace è più rapido e
          qualcuno conosce ora il tuo IP.
        </div>
      ) : null}
      {op.wardens.length ? (
        <div className="alarm">
          <span className="t-red px" style={{ fontSize: 22 }}>
            SOC ATTIVO
          </span>{" "}
          · {op.wardens.join(", ")} sorveglia questo nodo.
        </div>
      ) : null}
      {contract ? (
        <div className="panel">
          <div className="panel-body spread">
            <span>
              <span className="label t-fac">{MISSION_LABEL[contract.type]}</span> {contract.title}
            </span>
            <span className="dim" style={{ fontSize: 13 }}>
              {contract.brief.slice(0, 140)}
              {contract.brief.length > 140 ? "…" : ""}
            </span>
          </div>
        </div>
      ) : null}

      {statusLine(target.kind, target.x, ctx.serverNow) ? (
        <div className="faint" style={{ fontSize: 13 }}>
          Ora locale {clockLabel(target.x, ctx.serverNow)} ({PART_NAME[dayPart(target.x, ctx.serverNow)]}) · {statusLine(target.kind, target.x, ctx.serverNow)}
        </div>
      ) : null}
      <ToolTheater op={op} elapsed={elapsed} />
      <NodeMalware op={op} faction={me.faction} inside={inside} />
      <DefacePanel op={op} />

      <div className="grid2">
        {/* sicurezza e accesso */}
        <div className="panel">
          <div className="panel-head">
            <span className="label">Sicurezza</span>
          </div>
          <div className="panel-body list">
            <div className="sec-grid">
              <SecCell name="Proxy" level={target.sec.proxy} down={op.bypass.proxy || op.access === "client"} tool="proxy" have={tools.proxy ?? 0} busy={running("proxy")} onRun={() => run("proxy")} />
              <SecCell
                name="Firewall"
                level={target.sec.firewall}
                down={op.bypass.firewall || op.access === "client"}
                tool="firewall"
                have={tools.firewall ?? 0}
                busy={running("firewall")}
                onRun={() => run("firewall")}
                onGrid={op.grid || (tools.firewall ?? 0) < 1 || target.sec.firewall > (tools.firewall ?? 0) + 1 ? undefined : () => void net.do("grid", { act: "open" })}
              />
              <SecCell
                name="Monitor"
                level={target.sec.monitor}
                down={op.bypass.monitor || op.access === "client"}
                tool="monbypass"
                have={tools.monbypass ?? 0}
                busy={running("monbypass")}
                onRun={() => run("monbypass")}
                monitor
              />
            </div>

            {op.bio && !inside ? <BioBarrier bio={op.bio} proxyDown={op.bypass.proxy} /> : null}
            {me.samples.length ? (
              <details className="faint" style={{ fontSize: 12 }}>
                <summary style={{ cursor: "pointer" }}>Campioni biometrici in tasca: {me.samples.length}</summary>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, lineHeight: 1.6 }}>
                  {me.samples.map((x) => (
                    <li key={`${x.who}:${x.kind}`}>
                      {x.kind} di {x.who} · buono ancora {Math.max(1, Math.ceil((x.expiresAt - ctx.serverNow) / 86400_000))} g
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {op.grid && target.sec.firewall > 0 ? <FirewallGrid grid={op.grid} level={target.sec.firewall} /> : null}

            {canClient ? (
              <button className="btn primary" onClick={() => void net.do("clientLogin")}>
                Usa le credenziali cliente
              </button>
            ) : null}

            {op.access === "none" || (op.access === "guest" && target.kind === "relay") ? (
              <LoginBox op={op} haveBreaker={tools.breaker ?? 0} haveDict={tools.dict ?? 0} running={running} run={run} relay={target.kind === "relay"} />
            ) : (
              <div className="t-green px" style={{ fontSize: 22 }}>
                {op.access === "client" ? "Credenziali cliente accettate" : "Sei dentro come admin"}
              </div>
            )}

            {me.faction === "blue" && inside && target.kind !== "relay" ? (
              <button className="btn" disabled={!tools.patch || running("patch")} onClick={() => run("patch", { mode: "harden" })}>
                Patch Kit · rinforza il nodo
              </button>
            ) : null}
            {me.faction === "blue" && inside && target.kind === "relay" ? (
              <button className="btn" disabled={!tools.patch || running("patch")} onClick={() => run("patch", { mode: "purge" })}>
                Patch Kit · bonifica backdoor
              </button>
            ) : null}
            {me.faction === "blue" && op.access === "guest" && target.kind === "relay" && (tools.patch ?? 0) > 0 && !canClient ? (
              <p className="faint" style={{ margin: 0, fontSize: 12 }}>
                Per bonificare un relay serve l'accesso admin (contratto di bonifica o password).
              </p>
            ) : null}
            {me.faction === "red" && op.access === "admin" && !["relay", "gateway", "home"].includes(target.kind) && (tools.worm ?? 0) > 0 ? (
              <button className="btn" disabled={running("worm") || target.myWorm} onClick={() => run("worm")}>
                {target.myWorm ? "Il tuo worm è al lavoro qui" : `Pianta un worm v${tools.worm}`}
              </button>
            ) : null}
            {me.faction === "blue" && inside && target.worms ? (
              <p className="t-amber" style={{ margin: 0, fontSize: 13 }}>
                {target.worms} worm in questo sistema: il Patch Kit in modalità rinforzo li schiaccia.
              </p>
            ) : null}
            {me.faction === "red" && op.access === "admin" && target.kind === "relay" ? (
              <button className="btn" disabled={!tools.bdkit || running("bdkit") || target.mineBackdoor} onClick={() => run("bdkit")}>
                {target.mineBackdoor ? "Backdoor già installato" : tools.bdkit ? "Installa backdoor" : "Serve il Kit Backdoor"}
              </button>
            ) : null}
          </div>
        </div>

        {/* file e archivi */}
        {op.files ? (
          <div className="panel">
            <div className="panel-head">
              <span className="label">File server</span>
              <span className="faint">archivio {me.storage.reduce((s, f) => s + f.size, 0)}/{me.storageCap} GQ</span>
            </div>
            <div className="panel-body list">
              {op.rotor ? <Rotors key={op.rotor.fileId} rotor={op.rotor} /> : null}
              {op.files.length ? (
                op.files.map((f) => <FileRow key={f.id} f={f} op={op} me={me} running={running} run={run} />)
              ) : (
                <p className="dim" style={{ margin: 0 }}>
                  Nessun file.
                </p>
              )}
              {!op.bypass.firewall ? <p className="t-amber" style={{ margin: 0, fontSize: 13 }}>Il firewall blocca copia e cancellazione.</p> : null}
            </div>
          </div>
        ) : null}

        {op.sensors ? (
          <div className="alarm" style={{ animation: "none" }}>
            <div className="spread">
              <span>
                <span className="t-red px" style={{ fontSize: 22 }}>
                  {op.sensors} SENSOR{op.sensors === 1 ? "E" : "I"}
                </span>{" "}
                su questo nodo: copiano ogni tua riga di log. Staccali prima di uscire e la copia di questa sessione va persa.
              </span>
              <button className="btn danger" onClick={() => void net.do("sweepSensors")}>
                Stacca i sensori
              </button>
            </div>
          </div>
        ) : null}

        <ZonesPanel op={op} />

        {op.sys.length ? <SystemPanel op={op} /> : null}

        {target.offline && me.faction === "blue" && inside ? (
          <div className="panel">
            <div className="panel-body spread">
              <span>Il sistema è spento. Con il Patch Kit puoi rimetterlo in linea.</span>
              <button className="btn primary" disabled={!tools.patch} onClick={() => void net.do("restart")}>
                Riavvia il sistema
              </button>
            </div>
          </div>
        ) : null}

        {target.kind === "gateway" ? <GatewayLoot op={op} /> : null}

        <Arsenal op={op} ctx={ctx} />

        {op.ledger ? <LedgerPanel op={op} ctx={ctx} /> : null}

        {op.records ? <RecordsPanel op={op} ctx={ctx} /> : null}

        {op.logs ? <Logs op={op} ctx={ctx} running={running} /> : null}
      </div>
    </div>
  );
}

function SecCell(props: { name: string; level: number; down: boolean; tool: ToolId; have: number; busy: boolean; onRun: () => void; monitor?: boolean; onGrid?: () => void }) {
  const { name, level, down, have, busy, onRun, monitor, onGrid } = props;
  const none = level === 0;
  const can = have >= (monitor ? 1 : level);
  return (
    <div className={`sec-cell ${none ? "" : down ? "down" : "up"}`}>
      <div className="spread">
        <span className="label">{name}</span>
        <span className="px" style={{ fontSize: 22 }}>
          {none ? "—" : `L${level}`}
        </span>
      </div>
      <div style={{ fontSize: 12 }} className={none ? "faint" : down ? "t-green" : "t-red"}>
        {none ? "assente" : down ? (monitor ? "confuso / inattivo" : "aperto") : "attivo"}
      </div>
      {!none && !down ? (
        <button className="btn small" style={{ marginTop: 6, width: "100%" }} disabled={!can || busy} onClick={onRun}>
          {busy ? "in corso…" : !have ? `serve ${toolDef(props.tool).name}` : !can ? `serve v${level}` : monitor ? "Bypass" : "Abbatti"}
        </button>
      ) : null}
      {!none && !down && onGrid ? (
        <button className="btn small" style={{ marginTop: 4, width: "100%" }} onClick={onGrid} title="Cerca a mano le regole lasciate aperte">
          {can ? "Griglia" : "A mano"}
        </button>
      ) : null}
    </div>
  );
}

function LoginBox(props: {
  op: OpView;
  haveBreaker: number;
  haveDict: number;
  running: (t: string) => boolean;
  run: (t: ToolId) => void;
  relay: boolean;
}) {
  const { op, haveBreaker, haveDict, running, run, relay } = props;
  const [pw, setPw] = useState("");
  const blocked = !op.bypass.proxy;
  return (
    <div className="list" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
      <span className="label">{relay ? "Admin del relay" : "Login admin"}</span>
      {relay ? (
        <p className="dim" style={{ margin: 0, fontSize: 13 }}>
          Sei guest: puoi leggere il log. Per cancellarlo o installare backdoor serve la password admin.
        </p>
      ) : null}
      <CrackDisplay cracked={op.cracked} running={running("breaker")} blocked={blocked} />
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void net.do("login", { password: pw }).then((r) => {
            if (!r.ok) {
              sfx.bad();
              shoot("denied", "ACCESS DENIED", { sub: r.error ?? undefined });
            }
          });
          setPw("");
        }}
      >
        <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="password" disabled={blocked} style={{ flex: 1, minWidth: 120, textTransform: "uppercase" }} />
        <button className="btn" disabled={blocked || !pw}>
          Entra
        </button>
      </form>
      <div className="row">
        <button className="btn" disabled={blocked || !haveBreaker || running("breaker")} onClick={() => run("breaker")}>
          {haveBreaker ? (running("breaker") ? "Breaker in corso…" : `Password Breaker v${haveBreaker}`) : "Senza Password Breaker"}
        </button>
        <button className="btn" disabled={blocked || !haveDict || running("dict")} onClick={() => run("dict")}>
          {haveDict ? `Dizionario v${haveDict}` : "Senza Dizionario"}
        </button>
      </div>
      {op.dictOptions ? (
        <div className="row">
          <span className="dim" style={{ fontSize: 13 }}>
            Candidati:
          </span>
          {op.dictOptions.map((w) => (
            <button key={w} className="btn small" onClick={() => void net.do("login", { password: w })}>
              {w}
            </button>
          ))}
        </div>
      ) : null}
      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        Qui valgono anche le credenziali di un dipendente o dell'operatore: aprono i sottosistemi, non i file. Una password sbagliata accelera il trace e lascia una riga nel log. Banche, polizia e uffici pubblici bloccano il login dopo pochi tentativi.
      </p>
    </div>
  );
}

function FileRow({ f, op, me, running, run }: { f: FileView; op: OpView; me: DeckCtx["state"]["me"]; running: (t: string) => boolean; run: (t: ToolId, p?: Record<string, unknown>) => void }) {
  const locked = f.encryption > 0 && !f.decrypted;
  const copyBusy = op.tasks.some((k) => k.tool === "copy" && k.state === "run" && k.label.endsWith(f.name));
  const have = !f.loot && me.storage.some((s) => s.fileId === f.id && s.nodeId === op.targetId);
  if (f.deleted) {
    return (
      <div className="file-row" style={{ opacity: 0.7 }}>
        <div>
          <s>{f.name}</s> <span className="chip red">cancellato</span>
          <pre>Il file non c'è più, ma il backup di stanotte sì.</pre>
        </div>
        <div>
          <button className="btn small" disabled={!me.tools.patch} onClick={() => void net.do("recoverFile", { fileId: f.id })}>
            {me.tools.patch ? "Ripristina dal backup" : "Serve il Patch Kit"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="file-row" style={f.rarity >= 2 || f.loot ? { borderColor: rarityColor(f.rarity) } : undefined}>
      <div>
        <div>
          <span style={{ color: f.rarity ? rarityColor(f.rarity) : undefined }}>{f.name}</span> <span className="faint">{f.size} GQ</span>{" "}
          {f.rarity ? (
            <span className="chip" style={{ color: rarityColor(f.rarity), borderColor: rarityColor(f.rarity) }}>
              {rarityName(f.rarity)}
            </span>
          ) : null}{" "}
          {f.loot ? <span className="chip amber">pacchetto</span> : null}{" "}
          {f.encryption ? <span className={`chip ${f.decrypted ? "green" : "red"}`}>{f.decrypted ? "decifrato" : `cifrato L${f.encryption}`}</span> : null}{" "}
          {f.honeypot ? <span className="chip fac">honeypot</span> : null}
        </div>
        <pre>{f.preview}</pre>
      </div>
      <div className="list" style={{ gap: 4, alignContent: "start" }}>
        {locked ? (
          <button className="btn small" disabled={!me.tools.decrypt || (me.tools.decrypt ?? 0) < f.encryption || running("decrypt")} onClick={() => run("decrypt", { fileId: f.id })}>
            {me.tools.decrypt ? ((me.tools.decrypt ?? 0) < f.encryption ? `serve v${f.encryption}` : "Decifra") : "Serve Decrypter"}
          </button>
        ) : null}
        {locked && me.tools.decrypt && f.encryption <= (me.tools.decrypt ?? 0) + 1 && op.rotor?.fileId !== f.id ? (
          <button className="btn small" disabled={op.rotor?.state === "open"} onClick={() => void net.do("rotor", { act: "open", fileId: f.id })} title="Cerca la chiave a mano, girando i rotori">
            {(me.tools.decrypt ?? 0) < f.encryption ? "A mano" : "Rotori"}
          </button>
        ) : null}
        <button className="btn small" disabled={locked || copyBusy || have || !op.bypass.firewall} onClick={() => void net.do("copy", { fileId: f.id })}>
          {have ? "Copiato" : copyBusy ? "Copia…" : f.loot ? "Prendi" : "Copia"}
        </button>
        {op.access === "admin" ? (
          <button className="btn small danger" disabled={!op.bypass.firewall} onClick={() => void net.do("delete", { fileId: f.id })}>
            Cancella
          </button>
        ) : null}
        {me.tools.honey && !f.honeypot && !f.loot && op.target.kind !== "gateway" ? (
          <button className="btn small" disabled={running("honey")} onClick={() => run("honey", { fileId: f.id })}>
            Honeypot
          </button>
        ) : null}
      </div>
    </div>
  );
}

const STAMPS: Record<string, string> = {
  shutdown: "SYSTEM HALTED",
  blackout: "BLACKOUT",
  cash: "CASSA APERTA",
  warrant: "MANDATO EMESSO",
  publish: "IN PRIMA PAGINA",
  tap: "LINEA INTERCETTATA",
  reroute: "LINEA DEVIATA",
};

/** I comandi che un sistema offre a chi è admin: cambiano secondo quello che il nodo è. */
function SystemPanel({ op }: { op: OpView }) {
  const [handle, setHandle] = useState("");
  const [out, setOut] = useState<string[] | null>(null);
  const run = async (cmd: string, extra: Record<string, unknown> = {}) => {
    const r = await net.do("sys", { cmd, handle, ...extra });
    const lines = (r.data as { lines?: string[] } | undefined)?.lines;
    if (lines) setOut(lines);
    if (r.ok && STAMPS[cmd]) shoot("stamp", STAMPS[cmd]!, { sub: op.target.org });
  };
  const wantsHandle = op.sys.some((c) => c.needs !== "none");
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">Sistema</span>
        <span className="faint">{op.target.sub}</span>
      </div>
      <div className="panel-body list">
        {wantsHandle ? <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="handle (o nome di un cittadino)" /> : null}
        {op.sys.map((c) => (
          <div key={c.id} className="list" style={{ gap: 4 }}>
            <div className="row">
              {c.needs === "handleTone" ? (
                <>
                  <button className="btn small" disabled={Boolean(c.blocked) || !handle} onClick={() => void run(c.id, { tone: "up" })}>
                    {c.name}: lo esalta
                  </button>
                  <button className="btn small danger" disabled={Boolean(c.blocked) || !handle} onClick={() => void run(c.id, { tone: "down" })}>
                    lo demolisce
                  </button>
                </>
              ) : (
                <button className={`btn small ${c.id === "shutdown" || c.id === "blackout" ? "danger" : ""}`} disabled={Boolean(c.blocked) || (c.needs === "handle" && !handle)} onClick={() => void run(c.id)}>
                  {c.name}
                </button>
              )}
              {c.blocked ? <span className="t-amber" style={{ fontSize: 12 }}>{c.blocked}</span> : null}
            </div>
            <span className="faint" style={{ fontSize: 12 }}>
              {c.desc}
            </span>
          </div>
        ))}
        {out ? (
          <TypeOut lines={out} />
        ) : null}
      </div>
    </div>
  );
}

function GatewayLoot({ op }: { op: OpView }) {
  const admin = op.access === "admin";
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label t-red">Gateway privato</span>
        <span className="faint">{op.target.ip}</span>
      </div>
      <div className="panel-body list">
        <p className="dim" style={{ margin: 0, fontSize: 13 }}>
          Il terminale di un altro handle. Il suo archivio è nel file server: quello che copi vale per consegnare i suoi contratti. Ogni azione resta nel
          log del gateway, che il proprietario leggerà.
        </p>
        <button className="btn" disabled={!admin || op.looted} onClick={() => void net.do("siphon").then((r) => r.ok && shoot("stamp", "CONTI PROSCIUGATI", { sub: op.target.ip }))}>
          {op.looted ? "Conti già prosciugati" : "Prosciuga i conti (15%, max 2.000 CR)"}
        </button>
        <button className="btn" disabled={!admin} onClick={() => void net.do("overload").then((r) => r.ok && shoot("stamp", "CPU IN FUSIONE", { sub: op.target.ip }))}>
          Sovraccarica la CPU (−50% per 10 minuti)
        </button>
        {!admin ? <p className="faint" style={{ margin: 0, fontSize: 12 }}>Serve l'accesso admin.</p> : null}
      </div>
    </div>
  );
}

function Logs({ op, ctx, running }: { op: OpView; ctx: DeckCtx; running: (t: string) => boolean }) {
  const me = ctx.state.me;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [forge, setForge] = useState("");
  // l'IP che il bersaglio vede: l'ultimo relay del rimbalzo, o il tuo gateway se sei diretto
  const lastHop = useMemo(() => {
    const id = op.chain.at(-2);
    return id ? (ctx.state.nodes.find((x) => x.id === id)?.ip ?? me.gatewayIp) : me.gatewayIp;
  }, [op.chain, ctx.state.nodes, me.gatewayIp]);
  const hot = (l: LogView) => l.text.includes(lastHop) && l.at >= op.connectedAt;
  const canEdit = op.access === "admin" || op.access === "client";
  const v = me.tools.logdel ?? 0;
  const toggle = (id: string) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSel(next);
  };
  const logs = [...op.logs!].reverse();
  return (
    <div className="panel" style={{ gridColumn: "1 / -1" }}>
      <div className="panel-head">
        <span className="label">Log di sistema</span>
        <span className="faint">{op.logs!.length} righe · le più recenti in alto</span>
      </div>
      <div className="panel-body list">
        {me.faction === "red" ? (
          <p className="dim" style={{ margin: 0, fontSize: 13 }}>
            In <span className="t-amber">ambra</span> le righe di questa sessione con l'IP da cui arrivi ({lastHop}). Chi le legge risale al relay precedente, e
            da lì a te.
          </p>
        ) : (
          <p className="dim" style={{ margin: 0, fontSize: 13 }}>
            Segui gli IP d'origine: ogni relay ha un suo log con la riga ROUTE che punta all'hop precedente. Le righe <span className="t-cyan">azzurre</span> sono
            state ricostruite da Forensics.
          </p>
        )}
        <div className="logs">
          {logs.map((l) => (
            <div
              key={l.id}
              className={`logrow ${sel.has(l.id) ? "sel" : ""} ${l.gap ? "gap" : ""} ${l.recovered ? "rec" : ""} ${me.faction === "red" && hot(l) ? "hot" : ""}`}
              onClick={() => canEdit && !l.gap && toggle(l.id)}
              role={canEdit ? "button" : undefined}
            >
              <time>{clockShort(l.at)}</time>
              <span style={{ wordBreak: "break-all" }}>{l.text}</span>
            </div>
          ))}
        </div>
        <div className="row">
          {canEdit ? (
            <>
              <button
                className="btn"
                disabled={!v || !sel.size || running("logdel")}
                onClick={() => {
                  void net.do("run", { tool: "logdel", logIds: [...sel] });
                  setSel(new Set());
                }}
              >
                {v ? `Log Deleter v${v} · rimuovi ${sel.size || ""}` : "Serve un Log Deleter"}
              </button>
              {v >= 3 ? (
                <>
                  <input value={forge} onChange={(e) => setForge(e.target.value)} placeholder="IP da falsificare" style={{ width: 170 }} />
                  <button
                    className="btn"
                    disabled={!sel.size || !forge || running("logdel")}
                    onClick={() => {
                      void net.do("run", { tool: "logdel", logIds: [...sel], forgeIp: forge });
                      setSel(new Set());
                    }}
                  >
                    Falsifica origine
                  </button>
                </>
              ) : null}
              {sel.size ? (
                <button className="btn small" onClick={() => setSel(new Set())}>
                  deseleziona
                </button>
              ) : null}
            </>
          ) : (
            <span className="faint" style={{ fontSize: 13 }}>
              Accesso in sola lettura.
            </span>
          )}
          {me.faction === "blue" && (me.tools.forensics ?? 0) > 0 ? (
            <button className="btn" disabled={running("forensics")} onClick={() => void net.do("run", { tool: "forensics" })}>
              Forensics v{me.tools.forensics} · ricostruisci
            </button>
          ) : null}
        </div>
        {v === 1 && me.faction === "red" ? (
          <p className="faint" style={{ margin: 0, fontSize: 12 }}>
            Il Log Deleter v1 lascia un buco visibile: un blu con Forensics può ricostruire le righe per 30 minuti.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Un imprevisto: cosa succede, quanto tempo hai per scegliere, e le scelte possibili. */
function SurpriseCard({ s, now }: { s: SurpriseView; now: number }) {
  useEffect(() => {
    sfx.alarm();
  }, [s.id]);
  const left = Math.max(0, s.until - now);
  const total = s.kind === "canary" ? 12_000 : 20_000;
  const tone = s.result ? (s.result.tone === "ok" ? "green" : s.result.tone === "bad" ? "red" : "amber") : "amber";
  return (
    <div className={`surprise ${tone}`} role="alert">
      <div className="spread">
        <span className="px" style={{ fontSize: 24, color: `var(--${tone})` }}>
          ! {s.title}
        </span>
        {s.deadline && s.deadline > now ? <span className="chip red">riavvio fra {Math.ceil((s.deadline - now) / 1000)} s</span> : null}
      </div>
      <p style={{ margin: "6px 0" }}>{s.text}</p>
      {s.result ? <p className={`t-${tone}`} style={{ margin: "6px 0" }}>{s.result.text}</p> : null}
      {s.choices.length ? (
        <>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {s.choices.map((c) => (
              <button key={c.id} className="btn" disabled={Boolean(c.why)} title={c.why ?? c.hint} onClick={() => void net.do("surprise", { choice: c.id })}>
                {c.label}
              </button>
            ))}
          </div>
          {!s.result && left > 0 ? (
            <div className="list" style={{ gap: 4, marginTop: 8 }}>
              <div className="meter">
                <i style={{ width: `${Math.min(100, (left / total) * 100)}%`, background: "var(--amber)" }} />
              </div>
              <span className="faint" style={{ fontSize: 12 }}>
                {Math.ceil(left / 1000)} s per scegliere · se non scegli, {s.fallback}
              </span>
            </div>
          ) : null}
          <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
            {s.choices.map((c) => (
              <div key={c.id}>
                <b>{c.label}</b>: {c.why ? <span className="t-red">{c.why}</span> : c.hint}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
