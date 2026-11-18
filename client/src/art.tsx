// Grafica in pixel art (generata con PixelLab) caricata da /art/. Se un file manca, il gioco
// ripiega sul disegno procedurale o non mostra nulla: l'arte è un livello opzionale.
import { useState, type ReactNode } from "react";

// Il gioco può stare sotto un percorso (su Balthasar «/aether/»): tutti gli indirizzi partono da lì.
const A = `${import.meta.env.BASE_URL}art`;

export const art = {
  hero: `${A}/hero.png`,
  map: (style: string) => `${A}/maps/${style}.png`,
  tool: (id: string) => `${A}/tools/${id}.png`,
  kind: (kind: string) => `${A}/kinds/${kind}.png`,
  npc: (handle: string) => `${A}/npc/${handle.toLowerCase()}.png`,
  person: (id: string) => `${A}/people/${id}.png`,
};

export function Art({ src, size, alt = "", fallback = null, className }: { src: string; size: number; alt?: string; fallback?: ReactNode; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      style={{ imageRendering: "pixelated", flex: "none" }}
      onError={() => setBroken(true)}
    />
  );
}
