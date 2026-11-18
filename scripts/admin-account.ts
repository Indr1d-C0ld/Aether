// Crea l'account dell'amministratore, o gli cambia la chiave.
// La chiave si scrive al terminale (non resta nella cronologia della shell né in un file),
// oppure arriva da stdin per gli script: printf '%s\n' "$CHIAVE" | node scripts/admin-account.ts ...
//
//   node scripts/admin-account.ts [--db percorso/aether.db] [handle]     (handle predefinito: admin)
//
// L'handle deve stare in AETHER_ADMINS del server (predefinito «admin»): al primo accesso il server
// gli crea l'agente con i poteri del pannello. Cambiare la chiave chiude le sessioni aperte.
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../server/db.ts";

// --rinomina <vecchio> <nuovo>: cambia l'handle di un account (a server FERMO: il server tiene gli agenti in memoria)
const args = process.argv.slice(2);
const dbAt = args.indexOf("--db");
const db = dbAt >= 0 ? args[dbAt + 1]! : (process.env.AETHER_DB ?? join(fileURLToPath(new URL("..", import.meta.url)), "data", "aether.db"));
const rest = args.filter((_, i) => i !== dbAt && i !== dbAt + 1);
if (rest[0] === "--rinomina") {
  const [, from, to] = rest;
  if (!from || !to || !/^[A-Za-z0-9_\-]{3,16}$/.test(to)) {
    console.error("uso: --rinomina <vecchio> <nuovo>");
    process.exit(1);
  }
  const st = new Store(db);
  const acct = st.accountByHandle(from);
  if (!acct) {
    console.error(`nessun account «${from}»`);
    process.exit(1);
  }
  if (st.accountByHandle(to)) {
    console.error(`«${to}» esiste già`);
    process.exit(1);
  }
  st.renameAccount(acct.agentId, to);
  const doc = st.get<{ handle: string }>("agent", acct.agentId);
  if (doc) st.put("agent", acct.agentId, { ...doc, handle: to });
  console.log(`«${from}» ora è «${to}»${doc ? "" : " (l'agente nascerà al primo accesso)"}.`);
  process.exit(0);
}
const handle = rest[0] ?? "admin";

if (!/^[A-Za-z0-9_\-]{3,16}$/.test(handle)) {
  console.error("handle: 3-16 caratteri, lettere, numeri, - e _");
  process.exit(1);
}

async function readSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) return line;
    return "";
  }
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    let s = "";
    const on = (b: Buffer) => {
      for (const ch of b.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", on);
          process.stdout.write("\n");
          resolve(s);
          return;
        }
        if (ch === "\u0003") process.exit(130);
        if (ch === "\u007f") s = s.slice(0, -1);
        else s += ch;
      }
    };
    stdin.on("data", on);
  });
}

const pass = await readSecret(`Chiave per ${handle}: `);
if (pass.length < 8) {
  console.error("la chiave deve avere almeno 8 caratteri");
  process.exit(1);
}
if (process.stdin.isTTY) {
  const again = await readSecret("Ripetila: ");
  if (again !== pass) {
    console.error("le due chiavi non coincidono");
    process.exit(1);
  }
}

const store = new Store(db);
const acct = store.accountByHandle(handle);
if (acct) {
  store.setPassword(acct.agentId, pass);
  console.log(`Chiave di ${acct.handle} cambiata; sessioni aperte chiuse.`);
} else {
  store.createAccount(handle, pass, `ag_${randomBytes(5).toString("hex")}`);
  console.log(`Account ${handle} creato. Al primo accesso il server gli assegna il pannello di amministrazione.`);
}
