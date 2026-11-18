import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { z } from 'zod';
import { AuditError } from './errors.js';
import { auditConfigSchema, type AuditConfig } from './schema.js';

const DATABASE_FILE = 'audit.db';
const BUSY_TIMEOUT_MS = 10_000;
const SCHEMA_VERSION = 2;

/**
 * Changes that bring an older audit up to date, keyed by the version they upgrade from.
 * An audit in progress must keep working after a1 is upgraded.
 */
const MIGRATIONS: Readonly<Record<number, string>> = {
   1: "ALTER TABLE findings ADD COLUMN related TEXT NOT NULL DEFAULT '[]';",
};

// oxlint-disable-next-line unicorn/no-null -- SQLite stores an absent value as NULL
export const SQL_NULL = null;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
   key TEXT PRIMARY KEY
 , value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pages (
   id TEXT PRIMARY KEY
 , seq INTEGER NOT NULL
 , kind TEXT NOT NULL
 , name TEXT NOT NULL
 , locator TEXT NOT NULL
 , notes TEXT NOT NULL DEFAULT ''
 , grp TEXT NOT NULL DEFAULT ''
 , passes TEXT
 , status TEXT NOT NULL DEFAULT 'active'
 , excludeReason TEXT NOT NULL DEFAULT ''
 , createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS units (
   id TEXT PRIMARY KEY
 , pageId TEXT NOT NULL REFERENCES pages (id)
 , pass TEXT NOT NULL
 , criteria TEXT NOT NULL
 , status TEXT NOT NULL DEFAULT 'pending'
 , worker TEXT
 , leaseExpiresAt TEXT
 , attempts INTEGER NOT NULL DEFAULT 0
 , startedAt TEXT
 , finishedAt TEXT
 , reason TEXT NOT NULL DEFAULT ''
 , summary TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS unitsByStatus ON units (status);
CREATE TABLE IF NOT EXISTS results (
   pageId TEXT NOT NULL REFERENCES pages (id)
 , criterion TEXT NOT NULL
 , outcome TEXT NOT NULL
 , note TEXT NOT NULL
 , unitId TEXT NOT NULL
 , worker TEXT NOT NULL
 , recordedAt TEXT NOT NULL
 , PRIMARY KEY (pageId, criterion)
);
CREATE TABLE IF NOT EXISTS states (
   unitId TEXT NOT NULL
 , pageId TEXT NOT NULL REFERENCES pages (id)
 , position INTEGER NOT NULL
 , name TEXT NOT NULL
 , covers TEXT NOT NULL DEFAULT '[]'
 , tested INTEGER NOT NULL
 , note TEXT NOT NULL
 , PRIMARY KEY (unitId, position)
);
CREATE TABLE IF NOT EXISTS priorResults (
   unitId TEXT NOT NULL
 , criterion TEXT NOT NULL
 , outcome TEXT NOT NULL
 , note TEXT NOT NULL
 , worker TEXT NOT NULL
 , recordedAt TEXT NOT NULL
 , reopenReason TEXT NOT NULL
 , PRIMARY KEY (unitId, criterion)
);
CREATE TABLE IF NOT EXISTS findings (
   id TEXT PRIMARY KEY
 , seq INTEGER NOT NULL
 , criterion TEXT NOT NULL
 , related TEXT NOT NULL DEFAULT '[]'
 , title TEXT NOT NULL
 , severity TEXT NOT NULL
 , description TEXT NOT NULL
 , impact TEXT NOT NULL
 , recommendation TEXT NOT NULL
 , source TEXT NOT NULL
 , key TEXT NOT NULL DEFAULT ''
 , createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS instances (
   id INTEGER PRIMARY KEY AUTOINCREMENT
 , findingId TEXT NOT NULL REFERENCES findings (id)
 , pageId TEXT NOT NULL REFERENCES pages (id)
 , unitId TEXT
 , location TEXT NOT NULL
 , detail TEXT NOT NULL DEFAULT ''
 , evidence TEXT NOT NULL DEFAULT '[]'
 , status TEXT NOT NULL DEFAULT 'open'
 , dismissReason TEXT NOT NULL DEFAULT ''
 , worker TEXT NOT NULL
 , createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS instancesByFinding ON instances (findingId);
CREATE INDEX IF NOT EXISTS instancesByPage ON instances (pageId);
CREATE TABLE IF NOT EXISTS signals (
   pageId TEXT NOT NULL REFERENCES pages (id)
 , kind TEXT NOT NULL
 , data TEXT NOT NULL
 , collectedAt TEXT NOT NULL
 , PRIMARY KEY (pageId, kind)
);
CREATE TABLE IF NOT EXISTS events (
   id INTEGER PRIMARY KEY AUTOINCREMENT
 , at TEXT NOT NULL
 , actor TEXT NOT NULL
 , type TEXT NOT NULL
 , unitId TEXT
 , message TEXT NOT NULL
);
`;

/** An open audit: its directory, its database, and the clock used for leases. */
export interface Audit {
   readonly dir: string;
   readonly db: DatabaseSync;
   readonly now: () => Date;
}

export interface OpenAuditOptions {
   /** Replaces the clock. Tests use it to expire leases. */
   now?: () => Date;
}

function readSchemaVersion(db: DatabaseSync): number | undefined {
   const row = db.prepare("SELECT value FROM meta WHERE key = 'schemaVersion'").get();
   const value = row?.['value'];
   return typeof value === 'string' ? Number(value) : undefined;
}

function migrate(db: DatabaseSync, dir: string): void {
   let version = readSchemaVersion(db);
   if (version !== undefined && version > SCHEMA_VERSION) {
      throw new AuditError(
         'audit-too-new',
         `The audit in ${dir} was written by a newer a11ied (schema ${String(version)}). Upgrade a11ied to use it.`,
      );
   }
   while (version !== undefined && version < SCHEMA_VERSION) {
      db.exec(MIGRATIONS[version] ?? '');
      version += 1;
      db.prepare("UPDATE meta SET value = ? WHERE key = 'schemaVersion'").run(
         String(version),
      );
   }
}

function connect(dir: string, options: OpenAuditOptions): Audit {
   const db = new DatabaseSync(join(dir, DATABASE_FILE), { timeout: BUSY_TIMEOUT_MS });
   db.exec('PRAGMA journal_mode = WAL;');
   db.exec('PRAGMA foreign_keys = ON;');
   db.exec(SCHEMA_SQL);
   migrate(db, dir);
   return { dir, db, now: options.now ?? ((): Date => new Date()) };
}

/** Runs `work` in one write transaction, so parallel workers never see a partial change. */
export function transact<TResult>(audit: Audit, work: () => TResult): TResult {
   audit.db.exec('BEGIN IMMEDIATE');
   try {
      const result = work();
      audit.db.exec('COMMIT');
      return result;
   } catch (error) {
      audit.db.exec('ROLLBACK');
      throw error;
   }
}

/** Reads rows and validates each against a schema, so callers get typed records. */
export function selectAll<TSchema extends z.ZodType>(
   audit: Audit,
   schema: TSchema,
   sql: string,
   ...params: SQLInputValue[]
): z.infer<TSchema>[] {
   return audit.db
      .prepare(sql)
      .all(...params)
      .map((row) => schema.parse(row));
}

export function selectOne<TSchema extends z.ZodType>(
   audit: Audit,
   schema: TSchema,
   sql: string,
   ...params: SQLInputValue[]
): z.infer<TSchema> | undefined {
   const row = audit.db.prepare(sql).get(...params);
   return row === undefined ? undefined : schema.parse(row);
}

export function run(audit: Audit, sql: string, ...params: SQLInputValue[]): void {
   audit.db.prepare(sql).run(...params);
}

export function getMeta(audit: Audit, key: string): string | undefined {
   const row = audit.db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
   const value = row?.['value'];
   return typeof value === 'string' ? value : undefined;
}

export function setMeta(audit: Audit, key: string, value: string): void {
   run(
      audit,
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      key,
      value,
   );
}

export function isAuditDir(dir: string): boolean {
   return existsSync(join(dir, DATABASE_FILE));
}

/** Creates the audit directory and database. Fails when one already exists there. */
export function createAudit(
   dir: string,
   config: AuditConfig,
   options: OpenAuditOptions = {},
): Audit {
   if (isAuditDir(dir)) {
      throw new AuditError(
         'audit-exists',
         `An audit already exists in ${dir}. Choose another --id or remove that directory.`,
      );
   }
   mkdirSync(join(dir, 'evidence'), { recursive: true });
   const audit = connect(dir, options);
   setMeta(audit, 'schemaVersion', String(SCHEMA_VERSION));
   setMeta(audit, 'config', JSON.stringify(auditConfigSchema.parse(config)));
   return audit;
}

export function openAudit(dir: string, options: OpenAuditOptions = {}): Audit {
   if (!isAuditDir(dir)) {
      throw new AuditError(
         'audit-not-found',
         `No audit found in ${dir}. Run a1 audit init first, or pass --audit.`,
      );
   }
   return connect(dir, options);
}

export function closeAudit(audit: Audit): void {
   audit.db.close();
}

export function getConfig(audit: Audit): AuditConfig {
   const raw = getMeta(audit, 'config');
   if (raw === undefined) {
      throw new AuditError('audit-corrupt', `The audit in ${audit.dir} has no config.`);
   }
   return auditConfigSchema.parse(JSON.parse(raw));
}

export function saveConfig(audit: Audit, config: AuditConfig): void {
   setMeta(audit, 'config', JSON.stringify(auditConfigSchema.parse(config)));
}

/** Appends one line to the activity log that `status`, `log`, and the dashboard show. */
export function addEvent(
   audit: Audit,
   event: { actor: string; type: string; unitId?: string | null; message: string },
): void {
   run(
      audit,
      'INSERT INTO events (at, actor, type, unitId, message) VALUES (?, ?, ?, ?, ?)',
      audit.now().toISOString(),
      event.actor,
      event.type,
      event.unitId ?? SQL_NULL,
      event.message,
   );
}
