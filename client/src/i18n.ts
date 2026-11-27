// La lingua del gioco. Il codice è scritto in italiano; per l'inglese c'è un catalogo (client/src/i18n/en.json)
// che va dalla frase italiana a quella inglese. Un traduttore guarda il DOM e sostituisce i testi mentre React li scrive:
// testi, e gli attributi title, placeholder, aria-label e alt. Le frasi con parti variabili («Calore +12») sono modelli
// con segnaposto {0}, {1}… Quello che non è nel catalogo resta in italiano. Per i testi che non passano dal DOM
// (canvas, finestre di conferma, titolo della pagina) c'è t().
// La scelta sta nel browser (localStorage) e arriva al server con l'accesso, per i messaggi del server (fase 2).

import { setNumLocale } from "../../shared/rules.ts";

export type Lang = "it" | "en";
const KEY = "aether.lang";

export const lang: Lang = (() => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "it" || v === "en") return v;
  } catch {
    /* niente memoria: si decide dal browser */
  }
  return (navigator.language || "it").toLowerCase().startsWith("it") ? "it" : "en";
})();

/** Cambia lingua: si ricarica la pagina, così ogni testo riparte dalla lingua giusta. */
export function setLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignora */
  }
  location.reload();
}

type Catalog = { exact: Record<string, string>; patterns: [string, string][] };
let exact = new Map<string, string>();
/** Un modello: l'espressione, la traduzione e la parte fissa più lunga (per scartare in fretta chi non c'entra). */
type Pat = { re: RegExp; to: string; lit: string };
let byPrefix = new Map<string, Pat[]>();
let loose: Pat[] = [];
const PREFIX = 4;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Carica un catalogo (anche per le prove, senza DOM). */
export function load(c: Catalog) {
  exact = new Map(Object.entries(c.exact));
  byPrefix = new Map();
  loose = [];
  memo.clear();
  for (const [from, to] of c.patterns) {
    const parts = from.split(/\{\d+\}/);
    const re = new RegExp(`^${parts.map(esc).join("(.*?)")}$`, "s");
    const lit = parts.reduce((a, b) => (b.trim().length > a.length ? b.trim() : a), "");
    const p: Pat = { re, to, lit };
    const head = parts[0]!;
    if (head.length >= PREFIX) {
      const k = head.slice(0, PREFIX);
      (byPrefix.get(k) ?? byPrefix.set(k, []).get(k)!).push(p);
    } else loose.push(p);
  }
}

/** Le frasi italiane che a schermo non hanno trovato una traduzione (per completare il catalogo). */
export const missing = new Set<string>();
const ITALIAN = /[a-zàèéìòù]{3,}/i;

// fine di un periodo, ma non dopo un'abbreviazione («prof. Lightman»)
const ABBR = "(?:[Pp]rof|[Dd]ott|[Dd]r|[Ss]ig|[Ii]ng|[Aa]vv|Mr|Mrs|Ms|St)";
const SENTENCE = new RegExp(`(?<!\\b${ABBR})[.!?…]\\s+["«(]?[A-ZÀ-Ý]`);
/** Come si spezza un testo che non si trova intero: a righe, poi a periodi, poi ai due punti. */
const SPLITS = [/(\n+)/, new RegExp(`(?<=[.!?…»])(?<!\\b${ABBR}\\.)(\\s+)(?=[«"(A-ZÀ-Ý0-9])`), /(?<=[:;])(\s+)(?=[«"(A-ZÀ-Ý0-9])/];

/** Il modello che traduce una frase (senza spazi ai lati), se ce n'è uno. */
function patternFor(s: string): { p: Pat; m: RegExpExecArray } | null {
  for (const list of [byPrefix.get(s.slice(0, PREFIX)), loose]) {
    if (!list) continue;
    for (const p of list) {
      if (p.lit && !s.includes(p.lit)) continue;
      const m = p.re.exec(s);
      // una parte variabile non scavalca un a capo o la fine di un periodo: quel testo è fatto di più frasi
      if (m && !m.slice(1).some((v) => v.includes("\n") || SENTENCE.test(v))) return { p, m };
    }
  }
  return null;
}

// I numeri che scrive il server sono all'italiana (1.500 CR): in inglese 1,500. Non gli indirizzi IP (tre punti).
const IT_NUM = /(?<![\d.,])\d{1,3}(?:\.\d{3})+(?:,\d+)?(?![\d.,]*\d)/g;
const enNum = (v: string) => v.replace(IT_NUM, (n) => ((n.match(/\./g) ?? []).length === 3 ? n : n.replace(/\./g, "\u0000").replace(",", ".").replace(/\u0000/g, ",")));

/** La traduzione di una frase intera, senza spazi ai lati; null se non c'è. */
function lookup(s: string): string | null {
  const hit = exact.get(s);
  if (hit !== undefined) return hit;
  const found = patternFor(s);
  if (found) {
    const { p, m } = found;
    // le parti variabili possono essere a loro volta frasi da tradurre («in allerta», «Banca»), o numeri
    const out = p.to.replace(/\{(\d+)\}/g, (_, i: string) => {
      const v = m[Number(i) + 1] ?? "";
      const core = v.trim();
      if (!core) return v;
      return /[A-Za-zÀ-ÿ]/.test(core) ? v.replace(core, translate(core) ?? enNum(core)) : enNum(v);
    });
    // un modello «di servizio» («{0} · {1}») che non ha tradotto niente non conta: si prova a spezzare il testo
    if (out !== s) return out;
  }
  // una frase scelta da un elenco e messa in maiuscolo dal server («Un ex dipendente»), o in minuscolo
  // («Commissione: portare via un file»)
  const c0 = s.charAt(0);
  if (c0 !== c0.toLowerCase()) {
    const low = exact.get(c0.toLowerCase() + s.slice(1));
    if (low !== undefined) return low.charAt(0).toUpperCase() + low.slice(1);
  } else if (c0 !== c0.toUpperCase()) {
    const up = exact.get(c0.toUpperCase() + s.slice(1));
    if (up !== undefined && !/^[A-Z]{2}/.test(up)) return up.charAt(0).toLowerCase() + up.slice(1);
  }
  return null;
}

const memo = new Map<string, string | null>();
/**
 * Traduce una frase intera; se non c'è, un testo lungo si traduce a righe e poi a periodi (la posta e le notizie
 * del server sono fatte di pezzi messi insieme). null se non si traduce niente.
 */
function translate(s: string): string | null {
  const hit = memo.get(s);
  if (hit !== undefined) return hit;
  let out = lookup(s);
  // una riga d'elenco: «3. Prima di staccare…», «- …», «· …»
  const item = out === null ? /^(\d+[.)]|[-•·*])(\s+)(.+)$/s.exec(s) : null;
  if (item) {
    const rest = translate(item[3]!);
    if (rest !== null) out = item[1]! + item[2]! + rest;
  }
  if (out === null && s.length > 24) {
    const pieces = SPLITS.map((re) => s.split(re)).find((x) => x.length > 1) ?? [];
    if (pieces.length > 1) {
      let any = false;
      out = pieces
        .map((x) => {
          const core = x.trim();
          if (!core) return x;
          const tr = translate(core);
          if (tr === null) {
            if (ITALIAN.test(core) && missing.size < 5000) missing.add(core);
            return x;
          }
          any = true;
          return x.replace(core, tr);
        })
        .join("");
      if (!any) out = null;
    }
  }
  if (memo.size > 20000) memo.clear();
  memo.set(s, out);
  return out;
}

/** Traduce un testo, conservando gli spazi ai lati. In italiano non fa niente. */
export function t(s: string): string {
  if (lang === "it" || !s) return s;
  const core = s.trim();
  if (!core) return s;
  const tr = translate(core);
  if (tr === null) {
    if (ITALIAN.test(core) && missing.size < 5000) missing.add(core);
    return s;
  }
  return s.replace(core, tr);
}

// ---------------------------------------------------------------- il traduttore del DOM
// React scrive le frasi con parti variabili in più nodi di testo («ancora » + «3 ore»): per un elemento che contiene
// solo testo si cerca prima la frase intera (un modello «ancora {0}»), e solo se manca si traducono i pezzi uno per uno.
// Di ogni nodo si ricorda l'originale scritto da React, perché quando React lo aggiorna la frase va ricomposta.
const ATTRS = ["title", "placeholder", "aria-label", "alt"];
const orig = new WeakMap<Text, string>(); // quello che ha scritto React
const written = new WeakMap<Text, string>(); // quello che abbiamo scritto noi
const attrWritten = new WeakMap<Element, Map<string, string>>();
// i campi di testo non si toccano (il loro testo è di chi scrive), ma il loro placeholder sì
const SKIP = "[data-i18n-skip], script, style";

function setText(n: Text, v: string) {
  written.set(n, v);
  if (n.nodeValue !== v) n.nodeValue = v;
}
/** Traduce i testi figli di un elemento: la frase intera se l'elemento ha solo testo, altrimenti pezzo per pezzo. */
function textsOf(el: Element) {
  const texts: Text[] = [];
  let onlyText = true;
  for (const c of el.childNodes) {
    if (c.nodeType === Node.TEXT_NODE) texts.push(c as Text);
    else if (c.nodeType !== Node.COMMENT_NODE) onlyText = false;
  }
  if (!texts.length || el.tagName === "TEXTAREA") return;
  for (const n of texts) if (written.get(n) !== n.nodeValue) orig.set(n, n.nodeValue ?? "");
  const src = texts.map((n) => orig.get(n) ?? "");
  if (onlyText && texts.length > 1) {
    const whole = src.join("");
    const core = whole.trim();
    // un modello che traduce già il primo pezzo da solo, con la parte variabile in fondo, inghiottirebbe gli altri
    const first = src[0]!.trim();
    const greedy = Boolean(first) && !exact.has(core) && patternFor(core)?.p.re.test(first) === true;
    const tr = core && !greedy ? lookup(core) : null;
    if (tr !== null) {
      setText(texts[0]!, whole.replace(core, tr));
      for (const n of texts.slice(1)) setText(n, "");
      return;
    }
  }
  texts.forEach((n, i) => setText(n, t(src[i]!)));
}
function element(el: Element) {
  let done = attrWritten.get(el);
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v || done?.get(a) === v) continue;
    const tr = t(v);
    if (!done) attrWritten.set(el, (done = new Map()));
    done.set(a, tr);
    if (tr !== v) el.setAttribute(a, tr);
  }
}
const skipped = (el: Element | null) => !el || Boolean(el.closest(SKIP));
function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    const p = root.parentElement;
    if (!skipped(p)) textsOf(p!);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || skipped(root as Element)) return;
  const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => ((n as Element).matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n: Node | null = root; n; n = it.nextNode()) {
    element(n as Element);
    textsOf(n as Element);
  }
}

/** Da chiamare all'avvio: carica il catalogo (solo se serve) e comincia a tradurre quello che compare. */
export async function startI18n() {
  document.documentElement.lang = lang;
  if (lang === "it") return;
  setNumLocale("en-GB");
  const c = (await import("./i18n/en.json")).default as unknown as Catalog;
  load(c);
  document.title = t(document.title);
  walk(document.body);
  new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.type === "characterData") {
        const n = r.target as Text;
        if (written.get(n) !== n.nodeValue) walk(n);
      } else if (r.type === "attributes") {
        if (!skipped(r.target as Element)) element(r.target as Element);
      } else {
        for (const n of r.addedNodes) walk(n);
        // un pezzo di testo tolto o aggiunto cambia la frase intera dell'elemento
        if (r.removedNodes.length && r.target.nodeType === Node.ELEMENT_NODE && !skipped(r.target as Element)) textsOf(r.target as Element);
      }
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  // per completare il catalogo: dalla console, aetherMissing()
  (window as unknown as { aetherMissing: () => string[] }).aetherMissing = () => [...missing];
}
