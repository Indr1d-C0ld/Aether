// Persistenza minimale: SQLite integrato in Node (node:sqlite), documenti JSON per entità.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export class Store {
  db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      pragma journal_mode = wal;
      create table if not exists docs (kind text not null, id text not null, data text not null, primary key (kind, id));
      create table if not exists accounts (handle_key text primary key, handle text not null, salt text not null, hash text not null, agent_id text not null);
      create table if not exists tokens (token text primary key, agent_id text not null, created integer not null);
    `);
  }

  all<T>(kind: string): T[] {
    const rows = this.db.prepare("select data from docs where kind = ?").all(kind) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as T);
  }

  get<T>(kind: string, id: string): T | null {
    const row = this.db.prepare("select data from docs where kind = ? and id = ?").get(kind, id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as T) : null;
  }

  put(kind: string, id: string, value: unknown) {
    this.db.prepare("insert into docs (kind, id, data) values (?, ?, ?) on conflict(kind, id) do update set data = excluded.data").run(kind, id, JSON.stringify(value));
  }

  remove(kind: string, id: string) {
    this.db.prepare("delete from docs where kind = ? and id = ?").run(kind, id);
  }

  transaction(fn: () => void) {
    this.db.exec("begin");
    try {
      fn();
      this.db.exec("commit");
    } catch (err) {
      this.db.exec("rollback");
      throw err;
    }
  }

  // ---- Account ----

  createAccount(handle: string, pass: string, agentId: string) {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(pass, salt, 32).toString("hex");
    this.db.prepare("insert into accounts (handle_key, handle, salt, hash, agent_id) values (?, ?, ?, ?, ?)").run(handle.toLowerCase(), handle, salt, hash, agentId);
  }

  handleTaken(handle: string) {
    return Boolean(this.db.prepare("select 1 from accounts where handle_key = ?").get(handle.toLowerCase()));
  }

  verify(handle: string, pass: string): string | null {
    const row = this.db.prepare("select salt, hash, agent_id from accounts where handle_key = ?").get(handle.toLowerCase()) as
      | { salt: string; hash: string; agent_id: string }
      | undefined;
    if (!row) return null;
    const got = scryptSync(pass, row.salt, 32);
    const want = Buffer.from(row.hash, "hex");
    return got.length === want.length && timingSafeEqual(got, want) ? row.agent_id : null;
  }

  /** Nuova chiave per un account esistente (chi la cambia, chiude anche le sessioni aperte). */
  setPassword(agentId: string, pass: string) {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(pass, salt, 32).toString("hex");
    const r = this.db.prepare("update accounts set salt = ?, hash = ? where agent_id = ?").run(salt, hash, agentId);
    this.revokeTokens(agentId);
    return Number(r.changes) > 0;
  }

  accountByHandle(handle: string): { handle: string; agentId: string } | null {
    const row = this.db.prepare("select handle, agent_id from accounts where handle_key = ?").get(handle.toLowerCase()) as { handle: string; agent_id: string } | undefined;
    return row ? { handle: row.handle, agentId: row.agent_id } : null;
  }

  renameAccount(agentId: string, handle: string) {
    this.db.prepare("update accounts set handle_key = ?, handle = ? where agent_id = ?").run(handle.toLowerCase(), handle, agentId);
  }

  deleteAccount(agentId: string) {
    this.db.prepare("delete from accounts where agent_id = ?").run(agentId);
    this.revokeTokens(agentId);
  }

  revokeTokens(agentId: string) {
    this.db.prepare("delete from tokens where agent_id = ?").run(agentId);
  }

  /** Copia coerente del database (VACUUM INTO): per le copie a mano dal pannello. */
  snapshot(path: string) {
    this.db.prepare("vacuum into ?").run(path);
  }

  issueToken(agentId: string) {
    const token = randomBytes(24).toString("base64url");
    this.db.prepare("insert into tokens (token, agent_id, created) values (?, ?, ?)").run(token, agentId, Date.now());
    return token;
  }

  agentForToken(token: string): string | null {
    const row = this.db.prepare("select agent_id from tokens where token = ?").get(token) as { agent_id: string } | undefined;
    return row?.agent_id ?? null;
  }
}
