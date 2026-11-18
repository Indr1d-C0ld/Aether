// Avvia server (con --watch) e Vite insieme; chiude entrambi all'uscita.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const procs = [
  // in sviluppo è attivo il comando devGrant (XP e crediti per i test); in produzione no
  spawn(process.execPath, ["--watch", "server/main.ts"], { cwd: root, stdio: "inherit", env: { ...process.env, AETHER_DEV: process.env.AETHER_DEV ?? "1" } }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--config", "client/vite.config.ts"], { cwd: root, stdio: "inherit" }),
];
const stop = () => {
  for (const p of procs) p.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const p of procs) p.on("exit", stop);
