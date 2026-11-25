// La griglia del firewall: la tabella delle regole, con le falle da trovare a colpi di sonda.
// Il server tiene il segreto; qui si disegna solo quello che ha già risposto.
import { useState } from "react";
import type { GridView } from "../../../shared/grid.ts";
import { GRID_CLEAN } from "../../../shared/grid.ts";
import { net } from "../net.ts";
import { sfx } from "../audio.ts";

/** Etichetta finta di regola, stabile per casella: fa tabella di firewall senza voler dire nulla. */
const rule = (i: number) => ((i * 7919 + 4099) % 65536).toString(16).toUpperCase().padStart(4, "0");

export function FirewallGrid({ grid, level }: { grid: GridView; level: number }) {
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<number | null>(null);
  const open = grid.state === "open";
  const left = grid.holes - grid.found.length;

  const probe = async (cell: number) => {
    if (busy || !open) return;
    setBusy(true);
    setLast(cell);
    const r = await net.do("grid", { act: "probe", cell }, true);
    const d = (r.data ?? {}) as { hit?: boolean; won?: boolean; lost?: boolean };
    if (!r.ok || d.lost) sfx.bad();
    else if (d.hit) sfx.ok();
    else sfx.key();
    setBusy(false);
  };

  const cells = [];
  for (let i = 0; i < grid.side * grid.side; i += 1) {
    const hit = grid.found.includes(i);
    const clue = grid.clues[i];
    const missed = grid.missed.includes(i);
    const cls = hit ? "hit" : missed ? "missed" : clue !== undefined ? `miss d${Math.min(clue, 4)}` : "";
    cells.push(
      <button
        key={i}
        className={`fw-cell ${cls} ${last === i ? "last" : ""}`}
        disabled={!open || busy || hit || clue !== undefined}
        onClick={() => void probe(i)}
        aria-label={hit ? "falla trovata" : clue !== undefined ? `falla a ${clue} caselle` : `regola ${rule(i)}`}
      >
        {hit ? "◆" : missed ? "◇" : clue !== undefined ? clue : <span className="fw-rule">{rule(i)}</span>}
      </button>,
    );
  }

  return (
    <div className={`fw-grid-box ${grid.state}`}>
      <div className="spread">
        <span className="label">Regole del firewall · L{level}</span>
        <span className="fw-pips" title="sonde rimaste">
          {Array.from({ length: grid.probes }, (_, i) => (
            <i key={i} className={grid.probes - i <= GRID_CLEAN ? "spare" : ""} />
          ))}
          <b>{grid.probes}</b>
        </span>
      </div>
      <div className="fw-grid" style={{ gridTemplateColumns: `repeat(${grid.side}, 1fr)` }}>
        {cells}
      </div>
      <p className="fw-hint">
        {grid.state === "won" ? (
          <span className="t-green">Falle trovate: il firewall è aperto.</span>
        ) : grid.state === "lost" ? (
          <span className="t-red">Sonde finite: le regole sono state ricaricate{grid.manual ? ", e il monitor ti ha sentito" : ""}.</span>
        ) : (
          <>
            {left === 1 ? "Resta 1 falla" : `Restano ${left} falle`}. Il numero dice a quante caselle sta la più vicina, contando solo in orizzontale e in verticale.
            {grid.manual ? " Qui il tuo Firewall Bypass non arriva: o le trovi, o il monitor accelera." : ` Finisci con almeno ${GRID_CLEAN} sonde avanzate e nel log non resta niente.`}
          </>
        )}
      </p>
    </div>
  );
}
