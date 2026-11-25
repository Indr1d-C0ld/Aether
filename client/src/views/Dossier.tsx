// Scheda del giocatore: inventario (dati, exploit, chip), fedina e indagini, fama e imprese.
import { CHIP_LABEL, FEATS, WARRANT, describeEffects, rarityColor, rarityName } from "../../../shared/depth.ts";
import { freshLabel } from "../../../shared/blackmarket.ts";
import { ANALYST_COST, ANALYST_MINUTES, clockShort, fmtCr, socBoost, socCooldown, socPresidia, socSensors } from "../../../shared/rules.ts";
import { net } from "../net.ts";
import type { DeckCtx } from "./Deck.tsx";

void CHIP_LABEL;

export function ChipsPanel({ ctx }: { ctx: DeckCtx }) {
  const me = ctx.state.me;
  const slots = Array.from({ length: me.chipSlots }, (_, i) => me.chips[i] ?? null);
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">Chip montati</span>
        <span className="faint">
          {me.chips.length}/{me.chipSlots} slot
        </span>
      </div>
      <div className="panel-body list" style={{ gap: 6 }}>
        {slots.map((c, i) =>
          c ? (
            <div key={i} className="spread item-row" style={{ borderColor: rarityColor(c.rarity) }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ color: rarityColor(c.rarity) }}>{c.name}</span> <span className="faint" style={{ fontSize: 11 }}>{rarityName(c.rarity)}</span>
                <div className="t-green" style={{ fontSize: 12 }}>
                  {describeEffects(c.effects)}
                </div>
              </span>
              <button className="btn small" disabled={Boolean(ctx.state.op)} onClick={() => void net.do("unequip", { index: i })}>
                Smonta
              </button>
            </div>
          ) : (
            <div key={i} className="item-row faint">
              slot libero
            </div>
          ),
        )}
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          Uno slot ogni tre ranghi, fino a quattro. I chip montati non si possono rubare; quelli in archivio sì.
        </p>
      </div>
    </div>
  );
}

export function InventoryPanel({ ctx }: { ctx: DeckCtx }) {
  const me = ctx.state.me;
  const used = me.storage.reduce((s, f) => s + f.size, 0);
  return (
    <div className="panel" style={{ gridColumn: "1 / -1" }}>
      <div className="panel-head">
        <span className="label">Archivio e bottino</span>
        <span className="faint">
          {used}/{me.storageCap} GQ
        </span>
      </div>
      <div className="panel-body list" style={{ gap: 6 }}>
        {me.storage.length ? (
          me.storage.map((f) => {
            const r = f.item?.rarity ?? f.rarity ?? 0;
            const n = ctx.state.nodes.find((x) => x.id === f.nodeId);
            const left = f.expiresAt ? Math.max(0, Math.round((f.expiresAt - ctx.serverNow) / 1000)) : null;
            return (
              <div key={f.key} className="spread item-row" style={{ borderColor: r ? rarityColor(r) : undefined }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ color: r ? rarityColor(r) : undefined }}>{f.name}</span>{" "}
                  <span className="faint" style={{ fontSize: 11 }}>
                    {f.item ? f.item.kind : "dati"} · {rarityName(r)} · {f.size} GQ{f.fresh !== undefined ? ` · ${freshLabel(f.fresh)}` : ""}
                  </span>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {f.item ? (f.item.kind === "chip" ? <span className="t-green">{describeEffects(f.item.effects)}</span> : f.item.desc) : `da ${n?.org ?? "un nodo fuori mappa"}`}
                    {left !== null ? <span className={left < 120 ? "t-red" : "t-amber"}> · {left ? `si corrompe fra ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "corrotto"}</span> : null}
                  </div>
                </span>
                <span className="row">
                  {f.item?.kind === "chip" ? (
                    <button className="btn small" disabled={Boolean(ctx.state.op)} onClick={() => void net.do("equip", { key: f.key })}>
                      Monta
                    </button>
                  ) : null}
                  {f.item?.kind === "exploit" ? (
                    <button className="btn small" onClick={() => void net.do("useItem", { key: f.key })}>
                      Usa
                    </button>
                  ) : null}
                  {f.item?.kind === "gadget" ? (
                    <button className="btn small" disabled={(me.cooldowns[f.item.code] ?? 0) > ctx.serverNow} onClick={() => void net.do("useItem", { key: f.key })}>
                      {(me.cooldowns[f.item.code] ?? 0) > ctx.serverNow ? `pronto fra ${Math.ceil(((me.cooldowns[f.item.code] ?? 0) - ctx.serverNow) / 60_000)}′` : "Attiva"}
                    </button>
                  ) : null}
                  <button className="btn small danger" onClick={() => void net.do("dropFile", { key: f.key })}>
                    Butta
                  </button>
                </span>
              </div>
            );
          })
        ) : (
          <p className="dim" style={{ margin: 0 }}>
            Vuoto. Qui finiscono i file copiati e il bottino: exploit monouso, gadget che si ricaricano e chip per il gateway.
          </p>
        )}
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          Dal Mercato nero puoi vendere tutto, o darlo al ricettatore. Gli exploit da connessione si usano dalla Console.
        </p>
      </div>
    </div>
  );
}

export function LawPanel({ ctx }: { ctx: DeckCtx }) {
  const me = ctx.state.me;
  const w = WARRANT[me.warrant]!;
  return (
    <div className="panel" style={me.warrant >= 2 ? { borderColor: "var(--red)" } : undefined}>
      <div className="panel-head">
        <span className="label">Fedina</span>
        <span className={`chip ${me.warrant >= 2 ? "red" : me.warrant ? "amber" : "green"}`}>{w.name}</span>
      </div>
      <div className="panel-body list" style={{ gap: 6 }}>
        <span className="dim" style={{ fontSize: 13 }}>
          {w.desc}
        </span>
        {me.charges.map((c) => (
          <div key={c.id} className="spread" style={{ fontSize: 13 }}>
            <span>
              <span className="t-amber">{"▮".repeat(c.severity)}</span> {c.text}
              <span className="faint"> · {c.where}</span>
            </span>
            <span className="faint">{clockShort(c.at)}</span>
          </div>
        ))}
        {!me.charges.length ? <span className="t-green" style={{ fontSize: 13 }}>Nessun capo d'accusa.</span> : null}
        {me.investigations.length ? (
          <div className="list" style={{ gap: 4, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            <span className="label t-red">Indagini in corso</span>
            {me.investigations.map((i, k) => {
              const left = Math.max(0, Math.round((i.sweepAt - ctx.serverNow) / 1000));
              return (
                <div key={k} className="spread" style={{ fontSize: 13 }}>
                  <span>
                    {i.org} {i.grave ? <span className="chip red">frode</span> : null}
                  </span>
                  <span className={left < 60 ? "t-red" : "t-amber"}>
                    {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
                  </span>
                </div>
              );
            })}
            <span className="faint" style={{ fontSize: 12 }}>
              Allo scadere la Guardia del Reticolo segue i log dal nodo fino a un gateway. Se hai lasciato righe, o un relay le conserva ancora, hai questo tempo
              per tornare a cancellarle.
            </span>
          </div>
        ) : null}
        {me.pending.length ? (
          <div className="list" style={{ gap: 4, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            <span className="label t-amber">Denaro in transito</span>
            {me.pending.map((p, k) => (
              <div key={k} className="spread" style={{ fontSize: 13 }}>
                <span>dal conto di {p.from}</span>
                <span className="t-amber">{fmtCr(p.amount)}</span>
              </div>
            ))}
          </div>
        ) : null}
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          Arresti: {me.arrests}. Con un mandato federale, il prossimo passo falso è l'arresto: custodia, multa, archivio sequestrato. Le accuse si
          cancellano dal casellario della Polizia di Meridia, o con un avvocato.
        </p>
      </div>
    </div>
  );
}

export function FamePanel({ ctx }: { ctx: DeckCtx }) {
  const me = ctx.state.me;
  const mine = FEATS.filter((f) => !f.faction || f.faction === me.faction);
  return (
    <div className="panel" style={{ gridColumn: "1 / -1" }}>
      <div className="panel-head">
        <span className="label">Fama e imprese</span>
        <span className="t-amber px" style={{ fontSize: 22 }}>
          {me.fameTitle} · {me.fame}
        </span>
      </div>
      <div className="panel-body list">
        <div className="spread" style={{ fontSize: 13 }}>
          <span className="dim">
            {me.fameNext ? `Prossimo titolo a ${me.fameNext} di fama.` : "Hai il titolo più alto."} La fama apre i contratti più scottanti e migliora il
            bottino, ma sbiadisce col tempo{me.faction === "red" ? ", e i monitor imparano a riconoscerti" : ""}.
          </span>
          <span>
            Etica: <b>{me.ethicsTitle}</b> <span className="faint">({me.ethics > 0 ? "+" : ""}{me.ethics})</span>
          </span>
        </div>
        <div className="feats">
          {mine.map((f) => {
            const got = me.feats.includes(f.id);
            return (
              <div key={f.id} className={`feat ${got ? "got" : ""}`}>
                <div className="px" style={{ fontSize: 20 }}>
                  {got || !f.secret ? f.name : "? ? ?"}
                </div>
                <div className="faint" style={{ fontSize: 12 }}>
                  {got || !f.secret ? f.desc : "Impresa segreta."}
                </div>
                <div className={got ? "t-amber" : "faint"} style={{ fontSize: 12 }}>
                  +{f.fame} fama
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Schermata di custodia: finché sei dentro non tocchi niente. */
export function JailScreen({ ctx }: { ctx: DeckCtx }) {
  const me = ctx.state.me;
  const left = Math.max(0, Math.ceil((me.jailUntil - ctx.serverNow) / 1000));
  return (
    <div className="jail">
      <div className="panel" style={{ maxWidth: 620, borderColor: "var(--red)" }}>
        <div className="panel-head">
          <span className="label t-red">Tribunale di Meridia</span>
          <span className="px t-red" style={{ fontSize: 26 }}>
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
          </span>
        </div>
        <div className="panel-body list">
          <div className="px glitch" data-text="IN CUSTODIA" style={{ fontSize: 54, lineHeight: 1 }}>
            IN CUSTODIA
          </div>
          <p style={{ margin: 0 }}>
            «L'imputato non potrà possedere né utilizzare un computer o un telefono a toni.» Per ora è solo questione di minuti: il gateway è
            sequestrato, l'archivio pure, e te ne hanno assegnato uno nuovo.
          </p>
          <p className="dim" style={{ margin: 0 }}>
            I dettagli sono nella posta. Puoi aspettare, oppure pagare la cauzione.
          </p>
          <button className="btn primary" disabled={me.credits < me.bail} onClick={() => void net.do("payBail")}>
            Paga la cauzione · {fmtCr(me.bail)}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Sala operativa dei blu: presidi, sensori con la copia dei log, analista di turno. */
export function SocPanel({ ctx }: { ctx: DeckCtx }) {
  const me = ctx.state.me;
  const lvl = me.hw.soc;
  const onDuty = me.analystUntil > ctx.serverNow;
  return (
    <div className="panel" style={{ gridColumn: "1 / -1" }}>
      <div className="panel-head">
        <span className="label t-fac">Sala operativa</span>
        <span className="faint">
          Console SOC liv. {lvl} · contro-trace ×{socBoost(lvl).toFixed(1)} ogni {socCooldown(lvl)}s
        </span>
      </div>
      <div className="panel-body list">
        <div className="spread">
          <span>
            Presidi {me.presiding.length}/{socPresidia(lvl)}
            <span className="faint">
              {" "}
              {me.presiding.map((x) => `${ctx.state.nodes.find((n) => n.id === x.nodeId)?.name ?? "?"} fino alle ${clockShort(x.until).slice(0, 5)}`).join(" · ") || "nessuno: si mettono dalla mappa"}
            </span>
          </span>
          <button className="btn small" disabled={me.credits < ANALYST_COST} onClick={() => void net.do("hireAnalyst")}>
            {onDuty ? `Analista fino alle ${clockShort(me.analystUntil).slice(0, 5)} · prolunga` : `Analista di turno · ${fmtCr(ANALYST_COST)}`}
          </button>
        </div>
        <span className="faint" style={{ fontSize: 12 }}>
          Con un analista di turno ({ANALYST_MINUTES} minuti) i tuoi presidi restano attivi anche quando sei scollegato, e il contro-trace parte da
          solo sugli intrusi.
        </span>
        <span className="label">
          Sensori {me.sensors.length}/{socSensors(lvl)}
        </span>
        {me.sensors.length ? (
          me.sensors.map((sx) => (
            <div key={sx.nodeId} className="item-row" style={{ borderColor: "var(--green)" }}>
              <div className="spread">
                <span>{sx.name}</span>
                <span className="faint">fino alle {clockShort(sx.until).slice(0, 5)}</span>
              </div>
              <div className="logs" style={{ maxHeight: 130, marginTop: 4 }}>
                {[...sx.lines].reverse().map((l, i) => (
                  <div key={i} className="logrow rec">
                    <time>{clockShort(l.at)}</time>
                    <span style={{ wordBreak: "break-all" }}>{l.text}</span>
                  </div>
                ))}
                {!sx.lines.length ? <div className="logrow faint">Nessun passaggio registrato, per ora.</div> : null}
              </div>
            </div>
          ))
        ) : (
          <p className="dim" style={{ margin: 0 }}>
            Nessun sensore. Si installano dalla mappa, su nodi e relay.
          </p>
        )}
        <span className="faint" style={{ fontSize: 12 }}>
          Un sensore copia ogni riga di log che ha un indirizzo d'origine. La copia resta tua anche se il rosso cancella o falsifica il log, e vale
          come prova quando consegni una caccia; sulle cacce chiuse dove avevi un sensore il cliente paga il 25% in più. Chi entra da admin può
          staccarlo, e in quel caso la copia della sua sessione va persa.
        </span>
      </div>
    </div>
  );
}
