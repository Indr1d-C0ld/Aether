// Crew e sfide: la tua crew (membri, cassa, inviti), la classifica delle crew, i duelli,
// gli scambi di oggetti e i crediti mandati ad altri handle. Gli stessi gesti si fanno da IRC.
import { useState } from "react";
import type { CrewView } from "../../../shared/types.ts";
import { fmtCr } from "../../../shared/rules.ts";
import { rarityColor } from "../../../shared/depth.ts";
import { net } from "../net.ts";
import type { DeckCtx } from "./Deck.tsx";

const left = (t: number, now: number) => {
  const s = Math.max(0, Math.round((t - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function SocialView({ ctx }: { ctx: DeckCtx }) {
  const { state } = ctx;
  const me = state.me;
  const mine = state.crews.find((c) => c.mine) ?? null;
  const invites = state.crews.filter((c) => c.invited && !c.mine);
  return (
    <div className="list" style={{ gap: 14 }}>
      <div className="view-title">
        <div>
          <div className="label">Fra handle</div>
          <h2>Crew e sfide</h2>
        </div>
        <button className="btn" onClick={() => ctx.go("irc")}>
          Apri ReticoloNet
        </button>
      </div>
      <div className="grid2">
        {mine ? <MyCrew c={mine} /> : <NoCrew ctx={ctx} invites={invites} />}
        <Duels ctx={ctx} />
        <Trades ctx={ctx} />
        <Pay />
        <div className="panel" style={{ gridColumn: "1 / -1" }}>
          <div className="panel-head">
            <span className="label">Classifica delle crew</span>
            <span className="faint">{state.crews.length}</span>
          </div>
          <div className="panel-body" style={{ overflowX: "auto" }}>
            {state.crews.length ? (
              <table className="board">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Crew</th>
                    <th>Guida</th>
                    <th>Membri</th>
                    <th>Punteggio</th>
                  </tr>
                </thead>
                <tbody>
                  {state.crews.map((c, i) => (
                    <tr key={c.tag} className={c.mine ? "you" : ""}>
                      <td className="px" style={{ fontSize: 20 }}>
                        {i + 1}
                      </td>
                      <td>
                        <span className={c.faction === "red" ? "t-mag" : "t-cyan"}>[{c.tag}]</span> {c.name}
                        {c.motto ? <div className="faint" style={{ fontSize: 11 }}>«{c.motto}»</div> : null}
                      </td>
                      <td className="dim">{c.leader}</td>
                      <td>
                        {c.members.length}
                        <span className="t-green" style={{ fontSize: 11 }}> · {c.members.filter((m) => m.online).length} online</span>
                      </td>
                      <td className="px" style={{ fontSize: 20 }}>
                        {c.score.toLocaleString("it-IT")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="dim" style={{ margin: 0 }}>
                Nessuna crew, per ora. La prima è la tua?
              </p>
            )}
            <p className="faint" style={{ margin: "8px 0 0", fontSize: 12 }}>
              Punteggio: l'esperienza di tutti i membri, più un decimo della cassa. Tu sei {me.crew ? `nella [${me.crew}]` : "senza crew"}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function NoCrew({ ctx, invites }: { ctx: DeckCtx; invites: CrewView[] }) {
  const [tag, setTag] = useState("");
  const [name, setName] = useState("");
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">La tua crew</span>
      </div>
      <div className="panel-body list">
        {invites.map((c) => (
          <div key={c.tag} className="spread">
            <span>
              Invito da <b>[{c.tag}]</b> {c.name} <span className="faint">· {c.members.length} membri</span>
            </span>
            <button className="btn primary" onClick={() => void net.do("crewJoin", { tag: c.tag })}>
              Entra
            </button>
          </div>
        ))}
        <p className="dim" style={{ margin: 0, fontSize: 13 }}>
          Una crew è una squadra della tua cellula: fino a 12 handle, un canale privato su ReticoloNet, una cassa comune e un posto in classifica. Fondarla
          costa 5.000 CR e servono 550 XP.
        </p>
        <div className="row">
          <input value={tag} onChange={(e) => setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))} placeholder="SIGLA" style={{ width: 90 }} aria-label="Sigla" />
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 28))} placeholder="nome della crew" style={{ flex: 1, minWidth: 120 }} aria-label="Nome" />
          <button className="btn" disabled={tag.length < 2 || name.length < 3 || ctx.state.me.credits < 5000} onClick={() => void net.do("crewCreate", { tag, name })}>
            Fonda
          </button>
        </div>
      </div>
    </div>
  );
}

function MyCrew({ c }: { c: CrewView }) {
  const [handle, setHandle] = useState("");
  const [amount, setAmount] = useState("");
  const [motto, setMotto] = useState(c.motto);
  return (
    <div className="panel">
      <div className="panel-head">
        <span>
          <span className={`px ${c.faction === "red" ? "t-mag" : "t-cyan"}`} style={{ fontSize: 24 }}>
            [{c.tag}]
          </span>{" "}
          {c.name}
        </span>
        <span className="t-amber px" style={{ fontSize: 22 }}>
          {fmtCr(c.bank)}
        </span>
      </div>
      <div className="panel-body list">
        {c.motto ? <div className="dim">«{c.motto}»</div> : null}
        {c.members.map((m) => (
          <div key={m.handle} className="spread stat-row">
            <span>
              <span className={`dot ${m.online ? "on" : ""}`} style={{ display: "inline-block", marginRight: 6 }} />
              {m.handle} {m.handle === c.leader ? <span className="chip amber">guida</span> : null}
            </span>
            <span className="row" style={{ gap: 6 }}>
              <span className="faint">
                {m.rank} · liv. {m.level}
              </span>
              {c.lead && m.handle !== c.leader ? (
                <button className="btn small danger" onClick={() => confirm(`Espellere ${m.handle}?`) && void net.do("crewKick", { handle: m.handle })}>
                  espelli
                </button>
              ) : null}
            </span>
          </div>
        ))}
        <div className="row">
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="importo" style={{ width: 110 }} aria-label="Importo" />
          <button className="btn" disabled={!Number(amount)} onClick={() => void net.do("crewDonate", { amount: Number(amount) })}>
            Versa in cassa
          </button>
        </div>
        {c.lead ? (
          <>
            <div className="row">
              <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="handle" style={{ flex: 1, minWidth: 110 }} aria-label="Handle" />
              <button className="btn" disabled={!handle} onClick={() => void net.do("crewInvite", { handle })}>
                Invita
              </button>
              <button className="btn" disabled={!handle || !Number(amount)} title="Dalla cassa a un membro" onClick={() => void net.do("crewGrant", { handle, amount: Number(amount) })}>
                Dai dalla cassa
              </button>
            </div>
            <div className="row">
              <input value={motto} onChange={(e) => setMotto(e.target.value.slice(0, 80))} placeholder="motto" style={{ flex: 1, minWidth: 120 }} aria-label="Motto" />
              <button className="btn small" onClick={() => void net.do("crewMotto", { text: motto })}>
                Cambia motto
              </button>
            </div>
          </>
        ) : null}
        <div className="spread">
          <span className="faint" style={{ fontSize: 12 }}>
            Canale della crew: #{c.tag.toLowerCase()} · punteggio {c.score.toLocaleString("it-IT")}
          </span>
          <button className="btn small danger" onClick={() => confirm("Lasciare la crew?") && void net.do("crewLeave")}>
            Lascia
          </button>
        </div>
      </div>
    </div>
  );
}

function Duels({ ctx }: { ctx: DeckCtx }) {
  const [handle, setHandle] = useState("");
  const [stake, setStake] = useState("500");
  const d = ctx.state.duels[0] ?? null;
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">Duello</span>
        {d ? <span className={d.state === "live" ? "t-red blink" : "t-amber"}>{d.state === "live" ? "IN CORSO" : "in attesa"} · {left(d.expiresAt, ctx.serverNow)}</span> : null}
      </div>
      <div className="panel-body list">
        {d ? (
          d.state === "live" ? (
            <>
              <div>
                Contro <b>{d.foe}</b> · in palio <span className="t-amber">{fmtCr(d.stake * 2)}</span>
              </div>
              <div className="px t-red" style={{ fontSize: 22 }}>
                Bersaglio: {d.node}
              </div>
              <span className="dim" style={{ fontSize: 13 }}>
                Vince chi ottiene per primo l'accesso admin. Non serve pulire: serve correre.
              </span>
              <button
                className="btn primary"
                onClick={() => {
                  ctx.setSelected(d.nodeId);
                  ctx.go("map");
                }}
              >
                Mostra sulla mappa
              </button>
            </>
          ) : d.incoming ? (
            <>
              <div>
                <b>{d.foe}</b> ti sfida: <span className="t-amber">{fmtCr(d.stake)}</span> a testa.
              </div>
              <div className="row">
                <button className="btn primary" onClick={() => void net.do("duelAccept")}>
                  Accetta
                </button>
                <button className="btn" onClick={() => void net.do("duelDecline")}>
                  Rifiuta
                </button>
              </div>
            </>
          ) : (
            <div className="spread">
              <span>
                Hai sfidato <b>{d.foe}</b> per {fmtCr(d.stake)}: aspetti la risposta.
              </span>
              <button className="btn small" onClick={() => void net.do("duelDecline")}>
                Ritira
              </button>
            </div>
          )
        ) : (
          <>
            <p className="dim" style={{ margin: 0, fontSize: 13 }}>
              Sfida un altro handle: stessa posta, un bersaglio a sorte uguale per tutti e due, dieci minuti. Chi buca per primo prende il piatto (meno il 5%).
            </p>
            <div className="row">
              <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="handle da sfidare" style={{ flex: 1, minWidth: 120 }} aria-label="Handle da sfidare" />
              <input value={stake} onChange={(e) => setStake(e.target.value.replace(/[^0-9]/g, ""))} style={{ width: 90 }} aria-label="Posta" />
              <button className="btn danger" disabled={!handle || Number(stake) < 100} onClick={() => void net.do("duelOffer", { handle, stake: Number(stake) })}>
                Sfida
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Trades({ ctx }: { ctx: DeckCtx }) {
  const me = ctx.state.me;
  const items = me.storage.filter((s) => !s.cargo);
  const [handle, setHandle] = useState("");
  const [key, setKey] = useState("");
  const [price, setPrice] = useState("");
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">Scambi (DCC)</span>
        <span className="faint">{ctx.state.trades.length}</span>
      </div>
      <div className="panel-body list">
        {ctx.state.trades.map((t) => (
          <div key={t.id} className="spread">
            <span>
              {t.incoming ? (
                <>
                  <b>{t.with}</b> ti offre
                </>
              ) : (
                <>
                  Offri a <b>{t.with}</b>
                </>
              )}{" "}
              <span style={{ color: rarityColor(t.rarity) }}>{t.name}</span> {t.price ? <span className="t-amber">per {fmtCr(t.price)}</span> : <span className="t-green">in regalo</span>}{" "}
              <span className="faint">· {left(t.expiresAt, ctx.serverNow)}</span>
            </span>
            <span className="row" style={{ gap: 4 }}>
              {t.incoming ? (
                <button className="btn small primary" onClick={() => void net.do("tradeAccept", { id: t.id })}>
                  Accetta
                </button>
              ) : null}
              <button className="btn small" onClick={() => void net.do("tradeDecline", { id: t.id })}>
                {t.incoming ? "Rifiuta" : "Ritira"}
              </button>
            </span>
          </div>
        ))}
        <div className="row">
          <select value={key} onChange={(e) => setKey(e.target.value)} style={{ flex: 1, minWidth: 140 }} aria-label="Cosa offri">
            <option value="">cosa offri…</option>
            {items.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="a chi" style={{ width: 110 }} aria-label="A chi" />
          <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))} placeholder="prezzo" style={{ width: 80 }} aria-label="Prezzo" />
          <button className="btn" disabled={!key || !handle} onClick={() => void net.do("tradeOffer", { handle, key, price: Number(price) || 0 }).then((r) => r.ok && setKey(""))}>
            Offri
          </button>
        </div>
        <span className="faint" style={{ fontSize: 12 }}>
          File, exploit, chip e gadget passano di mano così: l'altro ha dieci minuti per accettare. Senza prezzo è un regalo.
        </span>
      </div>
    </div>
  );
}

function Pay() {
  const [handle, setHandle] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">Manda crediti</span>
      </div>
      <div className="panel-body list">
        <div className="row">
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="handle" style={{ flex: 1, minWidth: 120 }} aria-label="Handle" />
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="importo" style={{ width: 100 }} aria-label="Importo" />
          <button className="btn" disabled={!handle || Number(amount) < 10} onClick={() => void net.do("pay", { handle, amount: Number(amount) }).then((r) => r.ok && setAmount(""))}>
            Manda
          </button>
        </div>
        <span className="faint" style={{ fontSize: 12 }}>
          Commissione del 5%. Al massimo 20.000 CR al giorno, e servono 200 XP: il Reticolo non ama i prestanome.
        </span>
      </div>
    </div>
  );
}
