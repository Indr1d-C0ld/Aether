// Pixel art procedurale a bassa risoluzione (stile VGA 320×180), poi scalata senza filtri.
import { darkness } from "../../shared/clock.ts";
import type { NodeKind, NodeView } from "../../shared/types.ts";
export { gatewayPos } from "../../shared/rules.ts";

export const MAP_W = 320;
export const MAP_H = 180;

function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function fbm(x: number, y: number, seed: number) {
  let v = 0;
  let amp = 0.55;
  let f = 1;
  for (let i = 0; i < 4; i += 1) {
    v += valueNoise(x * f, y * f, seed + i * 17) * amp;
    f *= 2.1;
    amp *= 0.5;
  }
  return v;
}

const PAL = {
  sea: [3, 4, 10],
  seaDot: [10, 18, 34],
  grid: [9, 14, 28],
  landA: [12, 26, 42],
  landB: [9, 20, 34],
  coast: [28, 86, 112],
  coast2: [46, 242, 255],
};

/** Mappa di base: continenti procedurali con dithering, coste al neon, griglia. Deterministica. */
export function buildBaseMap(seed = 2039) {
  const c = document.createElement("canvas");
  c.width = MAP_W;
  c.height = MAP_H;
  const g = c.getContext("2d")!;
  const img = g.createImageData(MAP_W, MAP_H);
  const land = new Uint8Array(MAP_W * MAP_H);
  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      const edge = Math.min(x, MAP_W - 1 - x, y * 1.6, (MAP_H - 1 - y) * 1.6) / 40;
      const v = fbm(x / 52, y / 40, seed) - (1 - Math.min(1, edge)) * 0.35;
      land[y * MAP_W + x] = v > 0.47 ? 1 : 0;
    }
  }
  const put = (x: number, y: number, rgb: number[]) => {
    const i = (y * MAP_W + x) * 4;
    img.data[i] = rgb[0]!;
    img.data[i + 1] = rgb[1]!;
    img.data[i + 2] = rgb[2]!;
    img.data[i + 3] = 255;
  };
  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      const isLand = land[y * MAP_W + x];
      if (isLand) {
        const coast =
          !land[y * MAP_W + Math.max(0, x - 1)] ||
          !land[y * MAP_W + Math.min(MAP_W - 1, x + 1)] ||
          !land[Math.max(0, y - 1) * MAP_W + x] ||
          !land[Math.min(MAP_H - 1, y + 1) * MAP_W + x];
        if (coast) put(x, y, hash(x, y, 7) > 0.85 ? PAL.coast2 : PAL.coast);
        else put(x, y, (x + y) % 2 === 0 ? PAL.landA : PAL.landB);
      } else if (x % 16 === 0 || y % 16 === 0) {
        put(x, y, PAL.grid);
      } else {
        put(x, y, hash(x, y, 3) > 0.985 ? PAL.seaDot : PAL.sea);
      }
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export const KIND_COLOR: Record<NodeKind, string> = {
  relay: "#7487b3",
  registry: "#ffffff",
  edu: "#39ff88",
  law: "#3d8bff",
  gov: "#9d5cff",
  bank: "#ffb000",
  corp: "#ff2bd6",
  lab: "#7dff3a",
  news: "#2ef2ff",
  market: "#ff6a3d",
  transit: "#ffd23d",
  mil: "#ff3355",
  shop: "#ffa0c8",
  med: "#ff6a6a",
  util: "#ffd23d",
  telco: "#6ad0ff",
  home: "#c8d2e8",
  gateway: "#ff3355",
};

/** Inquadrature della mappa: il mondo intero o una regione ingrandita. */
export type MapRect = { x: number; y: number; w: number; h: number };
export const MAP_VIEWS: { id: string; name: string; rect: MapRect }[] = [
  { id: "world", name: "Mondo", rect: { x: 0, y: 0, w: 320, h: 180 } },
  { id: "na", name: "Nord America", rect: { x: 12, y: 18, w: 128, h: 72 } },
  { id: "sa", name: "Sud America", rect: { x: 50, y: 82, w: 128, h: 72 } },
  { id: "eu", name: "Europa", rect: { x: 128, y: 12, w: 96, h: 54 } },
  { id: "af", name: "Africa", rect: { x: 112, y: 58, w: 144, h: 81 } },
  { id: "as", name: "Asia", rect: { x: 192, y: 14, w: 128, h: 72 } },
  { id: "oc", name: "Oceania", rect: { x: 224, y: 88, w: 96, h: 54 } },
];


export const MAP_STYLES: { id: string; name: string; hint: string }[] = [
  { id: "vector", name: "Reticolo", hint: "Vettoriale, lo stile del deck." },
  { id: "uplink", name: "Uplink", hint: "Blu a retino, come nei terminali del 2001." },
  { id: "norad", name: "NORAD", hint: "Fosfori ambra sul tabellone del comando strategico." },
  { id: "neon", name: "Neon", hint: "I continenti sono circuiti." },
  { id: "notte", name: "Notte", hint: "La Terra dall'orbita, con le luci delle città." },
];

/** Carica il planisfero nello stile scelto; se l'immagine manca ripiega su quello procedurale. */
export function loadBaseMap(style: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = MAP_W;
      c.height = MAP_H;
      const g = c.getContext("2d")!;
      g.imageSmoothingEnabled = false;
      g.drawImage(img, 0, 0, MAP_W, MAP_H);
      resolve(c);
    };
    img.onerror = () => resolve(buildBaseMap());
    img.src = `${import.meta.env.BASE_URL}art/maps/${style}.png`;
  });
}

export const RELAY_COLOR: Record<string, string> = {
  public: "#9fb0d8",
  carrier: "#ffffff",
  grey: "#9d5cff",
  offshore: "#39ff88",
  sat: "#2ef2ff",
};

function glyph(g: CanvasRenderingContext2D, n: NodeView, x: number, y: number) {
  g.fillStyle = KIND_COLOR[n.kind];
  if (n.kind === "relay") {
    // sfondo scuro: i relay devono leggersi su qualunque planisfero
    g.fillStyle = "#03040a";
    g.fillRect(x - 2, y - 2, 5, 5);
    g.fillStyle = RELAY_COLOR[n.cls ?? "public"] ?? "#9fb0d8";
    g.fillRect(x, y - 1, 1, 3);
    g.fillRect(x - 1, y, 3, 1);
    if (n.cls === "sat") {
      g.fillRect(x - 2, y - 2, 1, 1);
      g.fillRect(x + 2, y + 2, 1, 1);
    }
    if (n.myKey) {
      g.fillStyle = "#ffb000";
      g.fillRect(x + 2, y - 2, 1, 1);
    }
  } else if (n.kind === "registry") {
    g.fillRect(x - 2, y, 5, 1);
    g.fillRect(x, y - 2, 1, 5);
    g.fillRect(x - 2, y - 2, 1, 1);
    g.fillRect(x + 2, y - 2, 1, 1);
    g.fillRect(x - 2, y + 2, 1, 1);
    g.fillRect(x + 2, y + 2, 1, 1);
  } else {
    g.fillRect(x - 2, y - 2, 5, 5);
    g.fillStyle = "#03040a";
    g.fillRect(x - 1, y - 1, 3, 3);
    g.fillStyle = KIND_COLOR[n.kind];
    g.fillRect(x, y, 1, 1);
  }
}

function line(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, dash = 0, phase = 0) {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  let i = 0;
  g.fillStyle = color;
  for (;;) {
    if (!dash || (i + phase) % dash < dash / 2) g.fillRect(x, y, 1, 1);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    i += 1;
  }
}

export type MapScene = {
  nodes: NodeView[];
  gateway: { x: number; y: number };
  route: string[]; // rimbalzo in costruzione o attivo (relay..., bersaglio)
  live: boolean;
  traceFrac: number | null; // 0..1 avanzamento del trace lungo la catena (dal bersaglio verso di te)
  selected: string | null;
  presiding: string[];
  view: MapRect;
  t: number;
  /** ora del server: da qui l'ombra della notte */
  now?: number;
  /** territori: un alone per città, del colore di chi la tiene */
  turf?: { x: number; y: number; color: string; tag: string; contested: boolean }[];
};

export function drawMap(g: CanvasRenderingContext2D, base: HTMLCanvasElement, s: MapScene) {
  g.imageSmoothingEnabled = false;
  const v = s.view;
  g.drawImage(base, v.x, v.y, v.w, v.h, 0, 0, MAP_W, MAP_H);
  // la notte: una fascia d'ombra che scorre con l'ora vera, sfumata al crepuscolo
  if (s.now) {
    const step = 2;
    let prev = -1;
    for (let px = 0; px < MAP_W; px += step) {
      const wx = v.x + ((px + step / 2) / MAP_W) * v.w;
      const d = darkness(wx, s.now);
      // il terminatore: una linea tratteggiata dove il giorno diventa notte
      if (prev >= 0 && (prev < 0.5) !== (d < 0.5)) {
        g.fillStyle = "rgba(255, 176, 0, 0.5)";
        for (let y = 0; y < MAP_H; y += 6) g.fillRect(px, y, 1, 3);
      }
      prev = d;
      // il lato in luce appena più chiaro, la notte molto più scura: su una mappa scura serve tutte e due
      if (d < 1) {
        g.fillStyle = `rgba(120, 170, 255, ${((1 - d) * 0.07).toFixed(3)})`;
        g.fillRect(px, 0, step, MAP_H);
      }
      if (d > 0) {
        g.fillStyle = `rgba(0, 0, 8, ${(d * 0.66).toFixed(3)})`;
        g.fillRect(px, 0, step, MAP_H);
      }
    }
    // l'etichetta sulla mezzanotte locale, se è nell'inquadratura
    const t = new Date(s.now);
    let lon = -(t.getUTCHours() + t.getUTCMinutes() / 60) * 15;
    lon = ((((lon + 180) % 360) + 360) % 360) - 180;
    const mx = (((lon + 180) / 360) * 320 - v.x) * (MAP_W / v.w);
    if (mx > 14 && mx < MAP_W - 14) {
      g.fillStyle = "rgba(255, 176, 0, 0.8)";
      g.font = "7px monospace";
      g.fillText("☾ notte", mx - 12, 9);
    }
  }
  // dalle coordinate del mondo a quelle dell'inquadratura
  const T = (p: { x: number; y: number }) => ({ x: Math.round(((p.x - v.x) * MAP_W) / v.w), y: Math.round(((p.y - v.y) * MAP_H) / v.h) });
  const zoom = MAP_W / v.w;
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  const inView = (p: { x: number; y: number }) => p.x >= v.x - 2 && p.x <= v.x + v.w + 2 && p.y >= v.y - 2 && p.y <= v.y + v.h + 2;
  // territori: un anello per città, del colore di chi la tiene; tratteggiato ambra se è contesa
  for (const c of s.turf ?? []) {
    if (!inView(c)) continue;
    const p = T(c);
    const r = Math.max(4, Math.round(3.5 * zoom));
    for (let k = 0; k < 48; k += 1) {
      if (c.contested && k % 3 === 0) continue;
      const a = (k / 48) * Math.PI * 2;
      g.fillStyle = c.color;
      g.fillRect(Math.round(p.x + Math.cos(a) * r), Math.round(p.y + Math.sin(a) * r), 1, 1);
    }
    if (zoom >= 1.5 || c.contested) {
      g.fillStyle = c.color;
      g.font = "6px monospace";
      g.fillText(c.tag, p.x - 6, p.y + r + 7);
    }
  }
  // città al buio dopo un sabotaggio a una rete: un alone velato con un anello che pulsa piano, e la scritta
  const darkCities = new Map<string, { x: number; y: number }>();
  for (const n of s.nodes) if (n.dark && n.city && !darkCities.has(n.city)) darkCities.set(n.city, { x: n.x, y: n.y });
  const pulse = 0.55 + 0.3 * Math.sin(s.t / 600);
  for (const [, p] of darkCities) {
    if (!inView(p)) continue;
    const c = T(p);
    const r = Math.max(6, Math.round(5 * zoom));
    for (let yy = -r; yy <= r; yy += 1)
      for (let xx = -r; xx <= r; xx += 1) {
        const d2 = xx * xx + yy * yy;
        if (d2 > r * r) continue;
        g.fillStyle = d2 > (r - 1) * (r - 1) ? `rgba(255, 176, 0, ${pulse.toFixed(2)})` : "rgba(40, 24, 0, 0.45)";
        g.fillRect(c.x + xx, c.y + yy, 1, 1);
      }
    g.fillStyle = "rgba(255, 176, 0, 0.9)";
    g.font = "7px monospace";
    g.fillText("al buio", c.x - 12, c.y - r - 2);
  }
  // traslochi: dalla vecchia sede alla nuova, una traccia tratteggiata e una croce dove non c'è più niente
  for (const n of s.nodes) {
    if (!n.moved) continue;
    const a = T(n.moved);
    const b = T(n);
    if (!inView(n.moved) && !inView(n)) continue;
    line(g, a.x, a.y, b.x, b.y, "rgba(200, 212, 240, 0.85)", 3);
    g.fillStyle = "rgba(200, 212, 240, 0.95)";
    for (const [dx, dy] of [[-1, -1], [1, 1], [-1, 1], [1, -1], [0, 0]] as const) g.fillRect(a.x + dx, a.y + dy, 1, 1);
  }
  // attività: aloni che pulsano sui nodi trafficati
  for (const n of s.nodes) {
    if (n.activity < 0.05 || !inView(n)) continue;
    const c = T(n);
    const r = 3 + Math.round(n.activity * 4 + Math.sin(s.t / 300 + n.x) * 1.5);
    g.fillStyle = `rgba(255,43,214,${0.08 + n.activity * 0.12})`;
    g.fillRect(c.x - r, c.y - r, r * 2 + 1, r * 2 + 1);
  }
  // rimbalzo
  const pts = [s.gateway, ...s.route.map((id) => byId.get(id)).filter((n): n is NodeView => Boolean(n))].map(T);
  const phase = Math.floor(s.t / 90);
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    line(g, a.x, a.y, b.x, b.y, s.live ? "#ffb000" : "#8a6a20", s.live ? 6 : 4, s.live ? -phase : 0);
  }
  // trace: dal bersaglio verso il gateway, segmento dopo segmento
  if (s.traceFrac !== null && pts.length > 1) {
    const segs = pts.length - 1;
    let left = s.traceFrac * segs;
    for (let i = segs; i > 0 && left > 0; i -= 1) {
      const a = pts[i]!;
      const b = pts[i - 1]!;
      const f = Math.min(1, left);
      line(g, a.x, a.y, Math.round(a.x + (b.x - a.x) * f), Math.round(a.y + (b.y - a.y) * f), "#ff3355");
      left -= 1;
    }
  }
  for (const n of s.nodes) {
    if (!inView(n)) continue;
    const c = T(n);
    if (n.offline) {
      g.fillStyle = "#3a3f55";
      g.fillRect(c.x - 1, c.y - 1, 3, 3);
      continue;
    }
    // a tutto mondo i nodi minori sono puntini: i dettagli si vedono ingrandendo una regione
    if (zoom < 1.5 && !n.landmark && n.kind !== "relay" && n.id !== s.selected) {
      g.fillStyle = KIND_COLOR[n.kind];
      g.fillRect(c.x, c.y, n.kind === "home" ? 1 : 2, n.kind === "home" ? 1 : 2);
    } else glyph(g, n, c.x, c.y);
    // la cicatrice di un sabotaggio: quattro bruciature agli angoli, che sbiadiscono in tre giorni
    if (n.scar) {
      g.fillStyle = `rgba(255, 90, 40, ${(0.25 + n.scar * 0.6).toFixed(2)})`;
      for (const [dx, dy] of [[-3, -3], [3, -3], [-3, 3], [3, 3]] as const) g.fillRect(c.x + dx, c.y + dy, 1, 1);
      if (n.scar > 0.5) for (const [dx, dy] of [[-2, -3], [3, -2], [-3, 2], [2, 3]] as const) g.fillRect(c.x + dx, c.y + dy, 1, 1);
    }
    if (n.alert && Math.floor(s.t / 500) % 2 === 0) {
      g.fillStyle = "#ff3355";
      g.fillRect(c.x + 3, c.y - 4, 1, 2);
    }
  }
  // gateway del giocatore
  const gw = T(s.gateway);
  g.fillStyle = Math.floor(s.t / 400) % 2 ? "#ffffff" : "#2ef2ff";
  g.fillRect(gw.x - 1, gw.y - 1, 3, 3);
  // selezione e presidio
  const ring = (n: NodeView, color: string) => {
    const c = T(n);
    g.strokeStyle = color;
    g.lineWidth = 1;
    g.strokeRect(c.x - 4.5, c.y - 4.5, 10, 10);
  };
  const sel = s.selected ? byId.get(s.selected) : null;
  if (sel && Math.floor(s.t / 350) % 2 === 0) ring(sel, "#ffffff");
  for (const id of s.presiding) {
    const p = byId.get(id);
    if (p) ring(p, "#2ef2ff");
  }
  // effetto domino: i fornitori del nodo selezionato (azzurro) e i suoi clienti (ambra); un anello sui nodi in disservizio
  if (sel) {
    const a = T(sel);
    for (const id of sel.suppliers ?? []) {
      const p = byId.get(id);
      if (p) {
        const b = T(p);
        line(g, b.x, b.y, a.x, a.y, "rgba(46, 242, 255, 0.6)", 3);
      }
    }
    for (const n of s.nodes) {
      if (!n.suppliers?.includes(sel.id)) continue;
      const b = T(n);
      line(g, a.x, a.y, b.x, b.y, "rgba(255, 176, 0, 0.55)", 2);
    }
  }
  if (Math.floor(s.t / 600) % 2 === 0)
    for (const n of s.nodes) {
      if (!n.outage || !inView(n)) continue;
      const c = T(n);
      g.strokeStyle = "rgba(255, 176, 0, 0.85)";
      g.lineWidth = 1;
      g.strokeRect(c.x - 5.5, c.y - 5.5, 12, 12);
    }
  // i tuoi sensori: una tacca verde sul nodo
  for (const n of s.nodes) {
    if (!n.mySensor) continue;
    const c = T(n);
    g.fillStyle = "#39ff88";
    g.fillRect(c.x - 3, c.y - 4, 2, 1);
    g.fillRect(c.x - 4, c.y - 3, 1, 2);
  }
}

/** Solo pioggia e bagliori, su sfondo trasparente: va sopra la scena illustrata. */
export function drawRain(g: CanvasRenderingContext2D, w: number, h: number, t: number) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = "rgba(46,242,255,0.45)";
  for (let i = 0; i < 90; i += 1) {
    const rx = Math.floor((hash(i, 0, 99) * w + t / 18) % w);
    const ry = Math.floor((hash(i, 1, 99) * h + t / 6) % h);
    g.fillRect(w - rx, ry, 1, 3);
  }
  // qualche finestra che si accende e spegne
  for (let i = 0; i < 6; i += 1) {
    if (Math.floor(t / 700 + i * 3) % 4 !== 0) continue;
    g.fillStyle = i % 2 ? "rgba(255,176,0,0.8)" : "rgba(255,43,214,0.8)";
    g.fillRect(Math.floor(hash(i, 5, 41) * w), Math.floor(h * 0.55 + hash(i, 6, 41) * h * 0.4), 1, 1);
  }
}

/** Skyline animata per la schermata d'accesso: sole synthwave, palazzi, finestre, pioggia. */
export function drawSkyline(g: CanvasRenderingContext2D, w: number, h: number, t: number) {
  g.imageSmoothingEnabled = false;
  const bands = ["#05060b", "#0b0820", "#160a32", "#2a0b42", "#4a0d4e", "#7a1253"];
  const bh = Math.ceil((h * 0.75) / bands.length);
  bands.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(0, i * bh, w, bh);
    // dithering tra le bande
    if (i > 0) {
      g.fillStyle = bands[i - 1]!;
      for (let x = (i % 2); x < w; x += 2) g.fillRect(x, i * bh, 1, 1);
    }
  });
  // sole a strisce
  const cx = Math.round(w * 0.68);
  const cy = Math.round(h * 0.58);
  const r = Math.round(h * 0.3);
  for (let y = -r; y <= 0; y += 1) {
    const stripe = y > -r * 0.45 && Math.floor((y + r) / 3) % 2 === 1;
    if (stripe) continue;
    const half = Math.round(Math.sqrt(r * r - y * y));
    g.fillStyle = y < -r * 0.6 ? "#ffd23d" : y < -r * 0.3 ? "#ff8a3d" : "#ff2bd6";
    g.fillRect(cx - half, cy + y, half * 2, 1);
  }
  // palazzi su due livelli
  const layers = [
    { seed: 11, base: h * 0.62, max: h * 0.38, color: "#0f0c24", win: "#3a2b6e", density: 0.08 },
    { seed: 23, base: h * 0.7, max: h * 0.5, color: "#07070f", win: "#2ef2ff", density: 0.12 },
  ];
  for (const L of layers) {
    let x = 0;
    let k = 0;
    while (x < w) {
      const bw = 10 + Math.floor(hash(k, 1, L.seed) * 22);
      const bhgt = Math.floor(L.max * (0.35 + hash(k, 2, L.seed) * 0.65));
      const top = Math.round(h - bhgt - (h - L.base) * 0.2);
      g.fillStyle = L.color;
      g.fillRect(x, top, bw, h - top);
      for (let wy = top + 3; wy < h - 2; wy += 3) {
        for (let wx = x + 2; wx < x + bw - 2; wx += 3) {
          const lit = hash(wx, wy, L.seed + Math.floor(t / 2500 + hash(wx, wy, 5) * 4)) < L.density;
          if (lit) {
            g.fillStyle = hash(wx, wy, 9) > 0.8 ? "#ffb000" : L.win;
            g.fillRect(wx, wy, 1, 1);
          }
        }
      }
      if (hash(k, 3, L.seed) > 0.7) {
        g.fillStyle = L.color;
        g.fillRect(x + Math.floor(bw / 2), top - 6, 1, 6);
        if (Math.floor(t / 600 + k) % 2 === 0) {
          g.fillStyle = "#ff3355";
          g.fillRect(x + Math.floor(bw / 2), top - 7, 1, 1);
        }
      }
      x += bw + (hash(k, 4, L.seed) > 0.6 ? 2 : 0);
      k += 1;
    }
  }
  // pioggia
  g.fillStyle = "rgba(46,242,255,0.35)";
  for (let i = 0; i < 70; i += 1) {
    const rx = Math.floor((hash(i, 0, 99) * w + t / 18) % w);
    const ry = Math.floor((hash(i, 1, 99) * h + t / 6) % h);
    g.fillRect(w - rx, ry, 1, 3);
  }
}
