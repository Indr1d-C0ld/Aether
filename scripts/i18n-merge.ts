// Unisce traduzioni nuove al catalogo inglese (client/src/i18n/en.json): file con { exact, patterns } come quelli
// che produce la traduzione dell'elenco di scripts/i18n-extract.ts. Le voci nuove sostituiscono quelle vecchie.
// Controlla i segnaposto dei modelli: ognuno di quelli inglesi deve esistere in quello italiano.
// Uso: node scripts/i18n-merge.ts traduzioni1.json [traduzioni2.json …]
import { readFileSync, writeFileSync } from "node:fs";

type Catalog = { exact: Record<string, string>; patterns: [string, string][] };
const path = new URL("../client/src/i18n/en.json", import.meta.url).pathname;
const cat = JSON.parse(readFileSync(path, "utf8")) as Catalog;
const exact = new Map(Object.entries(cat.exact));
const patterns = new Map(cat.patterns);
let bad = 0;
for (const f of process.argv.slice(2)) {
  const add = JSON.parse(readFileSync(f, "utf8")) as Partial<Catalog>;
  for (const [it, en] of Object.entries(add.exact ?? {})) if (typeof en === "string" && en.trim() && en !== it) exact.set(it, en);
  for (const [it, en] of add.patterns ?? []) {
    const has = new Set(it.match(/\{\d+\}/g) ?? []);
    const wrong = (en.match(/\{\d+\}/g) ?? []).filter((p) => !has.has(p));
    if (!has.size) {
      exact.set(it, en); // un «modello» senza parti variabili è una frase esatta
      continue;
    }
    if (wrong.length) {
      console.warn(`segnaposto sbagliati in «${it}» → «${en}»`);
      bad += 1;
      continue;
    }
    patterns.set(it, en);
  }
}
const sorted = <T,>(m: Map<string, T>) => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "it"));
// prima i modelli più lunghi: a parità di inizio vince quello più preciso
const pats = [...patterns.entries()].sort((a, b) => b[0].length - a[0].length || a[0].localeCompare(b[0], "it"));
writeFileSync(path, `${JSON.stringify({ exact: Object.fromEntries(sorted(exact)), patterns: pats }, null, 1)}\n`);
console.log(`catalogo: ${exact.size} frasi, ${patterns.size} modelli${bad ? `, ${bad} scartati` : ""}`);
