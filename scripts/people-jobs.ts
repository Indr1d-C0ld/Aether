// Aggiunge ad art/jobs.json le foto tessera dei 100 cittadini (una generazione PixelLab ciascuna).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PEOPLE } from "../server/people.ts";

const path = fileURLToPath(new URL("../art/jobs.json", import.meta.url));
const cfg = JSON.parse(readFileSync(path, "utf8")) as { jobs: { out: string }[] };
cfg.jobs = cfg.jobs.filter((j) => !j.out.startsWith("people/"));
for (const p of PEOPLE) {
  cfg.jobs.push({
    out: `people/${p.id}.png`,
    tool: "pixflux",
    w: 64,
    h: 64,
    prompt: `ID card photo, head and shoulders portrait of a ${p.look}, facing the camera, neutral expression, digitized photo`,
    palette: false,
    style: false,
  } as never);
}
writeFileSync(path, JSON.stringify(cfg, null, 1));
console.log(`${PEOPLE.length} foto in elenco`);
