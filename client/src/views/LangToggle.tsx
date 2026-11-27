import { lang, setLang, type Lang } from "../i18n.ts";

/** La scelta della lingua: IT / EN. Cambiarla ricarica la pagina (la sessione resta). */
export function LangToggle() {
  const pick = (l: Lang) => () => {
    if (l !== lang) setLang(l);
  };
  return (
    <div className="row lang-toggle" style={{ gap: 2, flexWrap: "nowrap" }} data-i18n-skip role="group" aria-label={lang === "it" ? "Lingua" : "Language"}>
      {(["it", "en"] as const).map((l) => (
        <button key={l} className={`btn small ${l === lang ? "" : "dim"}`} onClick={pick(l)} aria-pressed={l === lang} title={l === "it" ? "Italiano" : "English"}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
