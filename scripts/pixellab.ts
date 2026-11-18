// Genera la grafica del gioco con l'API PixelLab v2.
// Uso: node scripts/pixellab.ts [filtro]   — legge art/jobs.json, salta i file già presenti.
// Token: variabile PIXELLAB_TOKEN oppure ~/.config/pixellab/token (mai nel repository).
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const token = process.env.PIXELLAB_TOKEN ?? readFileSync(join(homedir(), ".config/pixellab/token"), "utf8").trim();
const API = "https://api.pixellab.ai/v2";

type Job = {
  out: string; // percorso relativo a client/public/art
  tool: "pixflux" | "pixen";
  w: number;
  h: number;
  prompt: string;
  transparent?: boolean;
  seed?: number;
  palette?: boolean; // default true per pixflux
  style?: boolean; // false: non aggiunge lo stile neon comune (foto tessera)
  init?: string; // immagine di partenza (img2img), relativa a client/public/art
  initStrength?: number; // quanto resta dell'immagine di partenza (1-999)
  outline?: string;
  shading?: string;
  detail?: string;
  view?: string;
};

const cfg = JSON.parse(readFileSync(join(root, "art/jobs.json"), "utf8")) as { style: string; palette: string[]; jobs: Job[] };

// PNG minimale con un pixel per colore: la palette forzata per pixflux
function palettePng(hex: string[]) {
  const w = hex.length;
  const raw = Buffer.alloc((w * 3 + 1) * 1);
  raw[0] = 0;
  hex.forEach((c, i) => {
    const n = parseInt(c.slice(1), 16);
    raw[1 + i * 3] = (n >> 16) & 255;
    raw[2 + i * 3] = (n >> 8) & 255;
    raw[3 + i * 3] = n & 255;
  });
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 255]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]).toString("base64");
}

const palette = palettePng(cfg.palette);

async function run(job: Job) {
  const out = join(root, "client/public/art", job.out);
  if (existsSync(out)) return `salto ${job.out}`;
  const body: Record<string, unknown> = {
    description: job.style === false ? `${job.prompt}, 1990 VGA 256-color pixel art` : `${job.prompt}. ${cfg.style}`,
    image_size: { width: job.w, height: job.h },
    no_background: Boolean(job.transparent),
  };
  if (job.seed !== undefined) body.seed = job.seed;
  for (const k of ["outline", "shading", "detail", "view"] as const) if (job[k]) body[k] = job[k];
  if (job.init) {
    body.init_image = { type: "base64", base64: readFileSync(join(root, "client/public/art", job.init)).toString("base64") };
    body.init_image_strength = job.initStrength ?? 300;
  }
  if (job.tool === "pixflux" && job.palette !== false) body.color_image = { type: "base64", base64: palette };
  const res = await fetch(`${API}/create-image-${job.tool}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${job.out}: HTTP ${res.status} ${text.slice(0, 300)}`);
  const data = JSON.parse(text) as { image: { base64: string } };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(data.image.base64, "base64"));
  return `ok ${job.out}`;
}

const filter = process.argv[2];
const queue = cfg.jobs.filter((j) => !filter || j.out.includes(filter));
let i = 0;
const worker = async () => {
  while (i < queue.length) {
    const job = queue[i++]!;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        console.log(await run(job));
        break;
      } catch (e) {
        console.error(`errore (tentativo ${attempt}) ${(e as Error).message}`);
        if (attempt === 3) process.exitCode = 1;
        else await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
    }
  }
};
await Promise.all([worker(), worker(), worker()]);
