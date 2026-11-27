// Raccoglie le frasi italiane che il client mostra: testi JSX, attributi leggibili (title, placeholder, aria-label, alt),
// stringhe e modelli (`Calore +${n}` → «Calore +{0}») in client/src, shared/ e server/ (i messaggi del server). Confronta con il catalogo inglese
// (client/src/i18n/en.json) e scrive quelle che mancano, per tradurle.
// Uso: node scripts/i18n-extract.ts [file di uscita]   (predefinito: stampa solo i conteggi)
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseAst } from "rolldown/parseAst";

const ROOT = new URL("..", import.meta.url).pathname;
// l'amministrazione e il diario di sviluppo restano in italiano
const SKIP_FILES = new Set(["client/src/views/Admin.tsx", "shared/admin.ts", "shared/devlog.ts", "client/src/views/DevLog.tsx", "client/src/i18n.ts", "server/admin.ts", "server/db.ts"]);
const TEXT_ATTRS = new Set(["title", "placeholder", "aria-label", "alt", "label", "hint", "text", "confirm"]);
// chiavi di oggetti e proprietà il cui valore non si legge mai a schermo
const CODE_KEYS = new Set([
  "id", "t", "a", "cmd", "kind", "key", "type", "tone", "className", "cls", "color", "icon", "mode", "faction", "region", "tag", "src", "href",
  "role", "tool", "slot", "org", "nodeId", "pid", "to", "from", "field", "font", "fill", "stroke", "ev", "sfx", "mood", "glyph", "ch", "sym",
]);
const CODE_CALLS = new Set([
  "do", "act", "send", "getItem", "setItem", "removeItem", "getElementById", "querySelector", "querySelectorAll", "addEventListener",
  "removeEventListener", "setAttribute", "getAttribute", "closest", "add", "remove", "toggle", "contains", "startsWith", "endsWith", "includes",
  "split", "join", "replace", "replaceAll", "padStart", "padEnd", "toLocaleString", "toLocaleDateString", "toLocaleTimeString", "matchMedia",
  "createElement", "getContext", "import", "require", "fetch", "postMessage", "setLineDash", "has", "get", "set", "delete", "indexOf", "sfx", "play",
  "test", "match", "RegExp", "warn", "exit", "prepare", "exec", "run", "pragma", "env", "Intl.NumberFormat", "localeCompare", "fillStyle", "dispatchEvent", "Event", "CustomEvent",
]);

type Hit = { text: string; pattern: boolean; files: Set<string> };
const found = new Map<string, Hit>();
const add = (raw: string, pattern: boolean, file: string, jsx: boolean) => {
  // i nomi dei traguardi sono quattro in una stringa, separati da «|»
  if (file === "shared/achievements.ts" && raw.includes("|")) {
    for (const part of raw.split("|")) add(part, pattern, file, jsx);
    return;
  }
  // segnaposto con nome ({n}, {who}): a schermo diventano parti variabili come quelle dei modelli
  if (!pattern && /\{[a-z]+\}/.test(raw)) {
    let i = 0;
    raw = raw.replace(/\{[a-z]+\}/g, () => `{${i++}}`);
    pattern = true;
  }
  // il testo JSX arriva già come lo scrive React; le stringhe restano esatte (gli a capo contano: posta, BBS)
  const text = (jsx ? raw.replace(/\s+/g, " ") : raw.replace(/[ \t]+\n/g, "\n")).trim();
  if (!text || !/[A-Za-zÀ-ÿ]{2}/.test(text.replace(/\{\d+\}/g, ""))) return;
  // nel codice (fuori dal JSX) una parola sola minuscola è quasi sempre un identificatore
  if (!jsx && !pattern && /^[a-z0-9_:.\-/#%]+$/.test(text)) return;
  if (/^[a-z]+[A-Z]\w*$/.test(text)) return; // camelCase
  if (/^(https?:|\/|\.\/|#[0-9a-f]{3,8}$|rgba?\(|var\(--)/i.test(text)) return;
  if (/^[\w-]+(\s[\w-]+)*$/.test(text) && /\b(btn|row|dim|small|col|grid|card|label|spread|t-[a-z]+|flex|pad)\b/.test(text) && !/[A-Z]/.test(text)) return; // classi CSS
  const h = found.get(text) ?? { text, pattern, files: new Set<string>() };
  h.files.add(file);
  found.set(text, h);
};

type N = { type: string; [k: string]: unknown };
const isNode = (v: unknown): v is N => !!v && typeof v === "object" && typeof (v as N).type === "string";

function calleeName(c: N): string {
  if (c.type === "Identifier") return String(c.name);
  if (c.type === "MemberExpression" || c.type === "StaticMemberExpression") {
    const p = c.property as N;
    return p?.type === "Identifier" ? String(p.name) : "";
  }
  return "";
}

function visit(node: N, file: string, parents: N[]) {
  const parent = parents[parents.length - 1];
  const inJsx = parents.some((p) => p.type === "JSXExpressionContainer" || p.type === "JSXElement" || p.type === "JSXFragment");
  // dove una stringa non è testo da leggere
  const codeContext = (): boolean => {
    for (let i = parents.length - 1; i >= 0; i -= 1) {
      const p = parents[i]!;
      const child = parents[i + 1] ?? node;
      if (p.type === "ImportDeclaration" || p.type === "ExportNamedDeclaration" && (p as N).source === child || p.type === "ExportAllDeclaration") return true;
      if (p.type.startsWith("TS") && p.type !== "TSAsExpression" && p.type !== "TSSatisfiesExpression" && p.type !== "TSNonNullExpression") return true;
      if (p.type === "JSXAttribute") {
        const n = (p.name as N)?.name;
        return !TEXT_ATTRS.has(String(n));
      }
      if (p.type === "BinaryExpression" && ["===", "!==", "==", "!=", "in", "instanceof"].includes(String(p.operator))) return true;
      if (p.type === "SwitchCase" && p.test === child) return true;
      if (p.type === "Property" || p.type === "ObjectProperty") {
        if (p.key === child && !p.computed) return true;
        const k = p.key as N;
        const kn = k?.type === "Identifier" ? String(k.name) : k?.type === "Literal" ? String(k.value) : "";
        if (CODE_KEYS.has(kn)) return true;
        return false;
      }
      if (p.type === "MemberExpression" && p.property === child) return true;
      if (p.type === "CallExpression" || p.type === "NewExpression") {
        const name = calleeName(p.callee as N);
        if (CODE_CALLS.has(name)) return true;
        return false;
      }
      if (p.type === "AssignmentExpression") {
        const l = p.left as N;
        if (l?.type === "MemberExpression" && CODE_KEYS.has(calleeName(l))) return true;
        if (l?.type === "MemberExpression" && ["fillStyle", "strokeStyle", "font", "textAlign", "textBaseline", "globalCompositeOperation", "cursor", "lang"].includes(calleeName(l))) return true;
        return false;
      }
      if (p.type === "JSXExpressionContainer" || p.type === "ReturnStatement" || p.type === "VariableDeclarator" || p.type === "ArrayExpression") return false;
    }
    return false;
  };
  if (node.type === "JSXElement" || node.type === "JSXFragment") leaf(node, file);
  if (node.type === "JSXText") add(String(node.value), false, file, true);
  else if (node.type === "Literal" && typeof node.value === "string") {
    if (!codeContext()) add(node.value, false, file, inJsx);
  } else if (node.type === "TemplateLiteral" && !(parent?.type === "TaggedTemplateExpression")) {
    const quasis = (node.quasis as N[]).map((q) => String((q.value as { cooked: string }).cooked ?? ""));
    if (!codeContext()) {
      if (quasis.length === 1) add(quasis[0]!, false, file, inJsx);
      else add(quasis.map((q, i) => (i ? `{${i - 1}}` : "") + q).join(""), true, file, inJsx);
    }
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === "type" || k === "start" || k === "end") continue;
    const next = [...parents, node];
    if (Array.isArray(v)) for (const c of v) isNode(c) && visit(c, file, next);
    else if (isNode(v)) visit(v, file, next);
  }
}

/** Il testo di un JSXText come lo scrive React: righe ripulite e unite da uno spazio (come fa Babel). */
function jsxText(v: string): string {
  const lines = v.split(/\r\n|\n|\r/);
  let last = 0;
  lines.forEach((l, i) => /[^ \t]/.test(l) && (last = i));
  let out = "";
  lines.forEach((l, i) => {
    let x = l.replace(/\t/g, " ");
    if (i) x = x.trimStart();
    if (i !== lines.length - 1) x = x.trimEnd();
    if (x) out += x + (i !== last ? " " : "");
  });
  return out;
}
/**
 * Un elemento con solo testo ed espressioni («ancora {left(...)}»): a schermo i suoi pezzi sono nodi di testo vicini,
 * e il traduttore cerca la frase intera. Qui diventa un modello: «ancora {0}».
 */
function leaf(node: N, file: string) {
  const kids = (node.children as N[]) ?? [];
  let text = "";
  let k = 0;
  let prevVar = false;
  for (const c of kids) {
    if (c.type === "JSXText") {
      const v = jsxText(String(c.value));
      text += v;
      if (v) prevVar = false;
    } else if (c.type === "JSXExpressionContainer") {
      const e = c.expression as N;
      if (e.type === "JSXEmptyExpression") continue;
      if (e.type === "Literal" && typeof e.value === "string") {
        text += e.value;
        if (e.value) prevVar = false;
        continue;
      }
      if (prevVar) return; // due parti variabili attaccate: non si sa dove finisce l'una
      text += `{${k++}}`;
      prevVar = true;
    } else return; // contiene altri elementi: i suoi testi si traducono a pezzi
  }
  if (!k || !/[A-Za-zÀ-ÿ]{2}/.test(text.replace(/\{\d+\}/g, ""))) return;
  add(text, true, file, true);
}

function files(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.(tsx?|ts)$/.test(e.name) && !e.name.endsWith(".d.ts") ? [join(dir, e.name)] : [],
  );
}
// anche i testi del server: il server scrive in italiano, e il client di chi gioca in inglese li traduce
for (const f of [...files("client/src"), ...files("shared"), ...files("server")]) {
  if (SKIP_FILES.has(f)) continue;
  const src = readFileSync(join(ROOT, f), "utf8");
  const ast = parseAst(src, { lang: f.endsWith(".tsx") ? "tsx" : "ts" }) as unknown as N;
  visit(ast, f, []);
}

const cat = JSON.parse(readFileSync(join(ROOT, "client/src/i18n/en.json"), "utf8")) as { exact: Record<string, string>; patterns: [string, string][] };
const have = new Set([...Object.keys(cat.exact), ...cat.patterns.map((p) => p[0])]);
const all = [...found.values()];
const todo = all.filter((h) => !have.has(h.text));
const words = (l: Hit[]) => l.reduce((s, h) => s + h.text.split(" ").length, 0);
console.log(`frasi: ${all.length} (${words(all)} parole), modelli: ${all.filter((h) => h.pattern).length}`);
console.log(`da tradurre: ${todo.length} (${words(todo)} parole)`);
const out = process.argv[2];
if (out) {
  // raggruppate per file, perché il contesto aiuta a tradurre
  const byFile: Record<string, { text: string; pattern: boolean }[]> = {};
  for (const h of todo) (byFile[[...h.files][0]!] ??= []).push({ text: h.text, pattern: h.pattern });
  writeFileSync(out, JSON.stringify(byFile, null, 1));
  console.log(`scritte in ${out}`);
}
