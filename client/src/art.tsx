// Grafica in pixel art (generata con PixelLab) caricata da /art/. Se un file manca, il gioco
// ripiega sul disegno procedurale o non mostra nulla: l'arte è un livello opzionale.
import { useState, type ReactNode } from "react";

export const art = {
  hero: "/art/hero.png",
  tool: (id: string) => `/art/tools/${id}.png`,
  kind: (kind: string) => `/art/kinds/${kind}.png`,
  npc: (handle: string) => `/art/npc/${handle.toLowerCase()}.png`,
  person: (id: string) => `/art/people/${id}.png`,
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
