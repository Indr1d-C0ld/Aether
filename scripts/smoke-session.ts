// Le sessioni scadono: 30 giorni dopo l'ultimo uso il token non vale più, e ogni uso lo rinnova.
// Il test sposta indietro nel tempo le righe della tabella dei token, aprendo lo stesso database del server.
// Uso: scripts/test-all.sh
import WebSocket from "ws";
import { DatabaseSync } from "node:sqlite";
import type { ServerMsg } from "../shared/types.ts";

const port = process.argv[2] ?? "7077";
const db = new DatabaseSync(process.env.AETHER_DB!);
const DAY = 86400_000;
const fails: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};
/** Apre una connessione, manda un messaggio di accesso e torna la prima risposta. */
function once(msg: Record<string, unknown>) {
  return new Promise<ServerMsg>((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.on("open", () => ws.send(JSON.stringify(msg)));
    ws.on("message", (raw) => {
      const m = JSON.parse(String(raw)) as ServerMsg;
      if (m.t === "auth_ok" || m.t === "auth_err") {
        ws.close();
        resolve(m);
      }
    });
  });
}
const used = (token: string) => (db.prepare("select used from tokens where token = ?").get(token) as { used: number } | undefined)?.used ?? null;
const setUsed = (token: string, at: number) => db.prepare("update tokens set used = ? where token = ?").run(at, token);

const handle = `sess_${Math.random().toString(36).slice(2, 6)}`;
const reg = await once({ t: "auth", mode: "register", handle, pass: "segreto123", faction: "red" });
const token = reg.t === "auth_ok" ? reg.token : "";
check("all'iscrizione arriva un token, con la data d'uso", Boolean(token) && (used(token) ?? 0) > Date.now() - 60_000);
check("e con quel token si rientra", (await once({ t: "hello", token })).t === "auth_ok");

setUsed(token, Date.now() - 10 * DAY);
const back = await once({ t: "hello", token });
check("dieci giorni dopo vale ancora, e l'uso la rinnova", back.t === "auth_ok" && (used(token) ?? 0) > Date.now() - 60_000);

setUsed(token, Date.now() - 31 * DAY);
const old = await once({ t: "hello", token });
check("trentuno giorni senza usarla: sessione scaduta", old.t === "auth_err" && old.error === "sessione scaduta");
check("e il token sparisce dal database", used(token) === null);
check("handle e chiave funzionano come prima", (await once({ t: "auth", mode: "login", handle, pass: "segreto123" })).t === "auth_ok");

console.log(fails.length ? `\n${fails.length} FALLITI` : "\ntutto ok");
process.exit(fails.length ? 1 : 0);
