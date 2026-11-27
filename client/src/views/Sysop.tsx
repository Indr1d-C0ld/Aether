// Il pannello del sysop: aprire il proprio BBS e gestirlo (insegna, regole, aree, area file, porta, inviti).
import { useCallback, useEffect, useState } from "react";
import type { OwnedView } from "../../../shared/bbs.ts";
import { AREA_TEMPLATES, OWN_BANNER_COLS, OWN_BANNER_LINES, OWN_COST, OWN_MAX_AREAS, OWN_MOTD_MAX, OWN_NAME_MAX, OWN_SEIZE_AT, OWN_TAGLINE_MAX } from "../../../shared/bbs.ts";
import { fmtCr } from "../../../shared/rules.ts";
import { net } from "../net.ts";
import type { DeckCtx } from "./Deck.tsx";
import { t } from "../i18n.ts";

export function SysopPanel({ ctx, onCall }: { ctx: DeckCtx; onCall: (id: string) => void }) {
  const [o, setO] = useState<OwnedView | null | undefined>(undefined);
  const [form, setForm] = useState<Partial<OwnedView> & { invitedText?: string }>({});
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const r = await net.do("bbs", { cmd: "own:view" }, true);
    if (r.ok) {
      const v = r.data as OwnedView | null;
      setO(v);
      setForm(v ? { ...v, invitedText: v.invited.join(", ") } : {});
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const run = async (cmd: string, p: Record<string, unknown> = {}) => {
    const r = await net.do("bbs", { cmd: `own:${cmd}`, ...p });
    setMsg(r.ok ? (r.note ?? "") : (r.error ?? "errore"));
    if (r.ok) {
      const v = (r.data as OwnedView | null) ?? null;
      setO(v);
      setForm(v ? { ...v, invitedText: v.invited.join(", ") } : {});
    }
  };
  if (o === undefined) return null;

  if (!o) {
    return (
      <div className="panel">
        <div className="panel-head">
          <span className="label">Il tuo BBS</span>
        </div>
        <form
          className="panel-body list"
          onSubmit={(e) => {
            e.preventDefault();
            void run("open", { name: form.name, tagline: form.tagline });
          }}
        >
          <p className="dim" style={{ margin: 0 }}>
            Un BBS tutto tuo, sul tuo gateway: scegli insegna, regole e aree. Gli abitanti della tua parte lo chiamano, ci scrivono, ci caricano file (di cui ti resta una copia) e ogni tanto scrivono al sysop
            cose che valgono. Ma se ci gira troppo materiale rubato la Guardia mette i sigilli, e chi entra nel tuo gateway può sfregiarti l'insegna.
          </p>
          <div className="row">
            <input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={OWN_NAME_MAX} placeholder="Il nome del BBS" style={{ flex: 1, minWidth: 160 }} aria-label="Nome del BBS" />
            <input value={form.tagline ?? ""} onChange={(e) => setForm({ ...form, tagline: e.target.value })} maxLength={OWN_TAGLINE_MAX} placeholder="Una riga sotto il nome" style={{ flex: 2, minWidth: 200 }} aria-label="Sottotitolo" />
            <button className="btn primary" disabled={(form.name ?? "").trim().length < 3 || ctx.state.me.credits < OWN_COST}>
              Apri · {fmtCr(OWN_COST)}
            </button>
          </div>
          {msg ? <span className="t-amber">{msg}</span> : null}
        </form>
      </div>
    );
  }

  const areas = form.areas ?? o.areas;
  const toggleArea = (id: string) => setForm({ ...form, areas: areas.includes(id) ? areas.filter((x) => x !== id) : [...areas, id].slice(0, OWN_MAX_AREAS) });
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">Il tuo BBS · {o.name}</span>
        <span className="row" style={{ gap: 6 }}>
          {o.seizedUntil > ctx.serverNow ? <span className="chip red">sotto sequestro</span> : null}
          {o.deface ? <span className="chip red">insegna sfregiata da {o.deface.by}</span> : null}
          <button className="btn small" onClick={() => onCall(o.id)} disabled={o.seizedUntil > ctx.serverNow}>
            Chiama
          </button>
        </span>
      </div>
      <div className="panel-body list">
        <div className="lab-stats">
          <span>Numero <b>{o.number}</b></span>
          <span>Fama <b>{o.fame}</b></span>
          <span>Utenti <b>{o.users}</b></span>
          <span>Visite oggi <b>{o.callsToday}</b></span>
          <span>Messaggi <b>{o.posts}</b></span>
          <span>File in area <b>{o.stash}</b></span>
          <span>
            Calore <b className={o.heat > OWN_SEIZE_AT * 0.6 ? "t-red" : ""}>{o.heat}</b>/{OWN_SEIZE_AT}
          </span>
        </div>
        {o.deface ? (
          <div className="spread">
            <span className="t-red">«{o.deface.text}» resta sull'insegna ancora {Math.ceil((o.deface.until - ctx.serverNow) / 3600_000)} h.</span>
            <button className="btn small" onClick={() => void run("restore")}>
              Ripristina dal backup
            </button>
          </div>
        ) : null}
        <form
          className="list"
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            void run("edit", {
              name: form.name,
              tagline: form.tagline,
              banner: form.banner,
              motd: form.motd,
              access: form.access,
              areas,
              files: form.files,
              door: form.door,
              invited: (form.invitedText ?? "").split(/[,\s]+/).filter(Boolean),
            });
          }}
        >
          <div className="row">
            <input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={OWN_NAME_MAX} style={{ flex: 1, minWidth: 160 }} aria-label="Nome del BBS" />
            <input value={form.tagline ?? ""} onChange={(e) => setForm({ ...form, tagline: e.target.value })} maxLength={OWN_TAGLINE_MAX} style={{ flex: 2, minWidth: 200 }} aria-label="Sottotitolo" />
          </div>
          <label className="list" style={{ gap: 4 }}>
            <span className="faint" style={{ fontSize: 12 }}>
              Insegna: al massimo {OWN_BANNER_LINES} righe da {OWN_BANNER_COLS} colonne, in caratteri da tastiera
            </span>
            <textarea className="bbs-input" rows={OWN_BANNER_LINES} value={form.banner ?? ""} onChange={(e) => setForm({ ...form, banner: e.target.value })} style={{ fontFamily: "ui-monospace, monospace", whiteSpace: "pre" }} aria-label="Insegna" />
          </label>
          <textarea className="bbs-input" rows={3} maxLength={OWN_MOTD_MAX} value={form.motd ?? ""} onChange={(e) => setForm({ ...form, motd: e.target.value })} placeholder="Le regole della casa, mostrate a ogni chiamata" aria-label="Regole della casa" />
          <div>
            <span className="faint" style={{ fontSize: 12 }}>Aree messaggi (al massimo {OWN_MAX_AREAS}): gli abitanti scrivono in quelle che conoscono</span>
            <div className="row" style={{ gap: 6, marginTop: 4 }}>
              {AREA_TEMPLATES.map((t) => (
                <label key={t.id} className="row" style={{ gap: 4, fontSize: 13 }} title={t.desc}>
                  <input type="checkbox" checked={areas.includes(t.id)} onChange={() => toggleArea(t.id)} />
                  {t.name}
                </label>
              ))}
            </div>
          </div>
          <div className="row" style={{ gap: 14 }}>
            <label className="row" style={{ gap: 6, fontSize: 13 }}>
              Accesso
              <select value={form.access ?? o.access} onChange={(e) => setForm({ ...form, access: e.target.value as OwnedView["access"] })}>
                <option value="pubblico">pubblico, in rubrica</option>
                <option value="riservato">riservato, su invito</option>
              </select>
            </label>
            <label className="row" style={{ gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={form.files ?? o.files} onChange={(e) => setForm({ ...form, files: e.target.checked })} />
              area file
            </label>
            <label className="row" style={{ gap: 6, fontSize: 13 }}>
              Porta
              <select value={form.door ?? o.door} onChange={(e) => setForm({ ...form, door: e.target.value as OwnedView["door"] })}>
                <option value="">nessuna</option>
                <option value="mercante">Mercante di Chip</option>
                <option value="tris">Tris</option>
              </select>
            </label>
          </div>
          {(form.access ?? o.access) === "riservato" ? (
            <input value={form.invitedText ?? ""} onChange={(e) => setForm({ ...form, invitedText: e.target.value })} placeholder="Handle invitati, separati da virgole" aria-label="Handle invitati" />
          ) : null}
          <div className="row">
            <button className="btn primary">Salva</button>
            <button
              type="button"
              className="btn small danger"
              onClick={() => {
                if (confirm(t(`Chiudere «${o.name}»? Bacheche, utenti e area file spariscono.`))) void run("close");
              }}
            >
              Chiudi il BBS
            </button>
            {msg ? <span className="t-amber">{msg}</span> : null}
          </div>
        </form>
      </div>
    </div>
  );
}
