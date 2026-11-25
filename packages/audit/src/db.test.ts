import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeAudit, transact, type Audit } from './db.js';
import { startAudit } from './init.js';

let root = '';
const opened: Audit[] = [];

function start(): Audit {
   const audit = startAudit({ target: 'https://example.test', id: 'test', root });
   opened.push(audit);
   return audit;
}

function readMetaValue(audit: Audit, key: string): unknown {
   return audit.db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.['value'];
}

beforeEach(() => {
   root = mkdtempSync(join(tmpdir(), 'a11ied-audit-db-'));
});

afterEach(() => {
   for (const audit of opened.splice(0)) {
      closeAudit(audit);
   }
   rmSync(root, { recursive: true, force: true });
});

describe('audit transactions', () => {
   it('undoes the changes of work that throws and rethrows its error', () => {
      const audit = start();

      const run = (): void =>
         transact(audit, () => {
            audit.db.exec("INSERT INTO meta (key, value) VALUES ('draft', 'x')");
            throw new Error('work failed');
         });

      expect(run).toThrow('work failed');
      expect(readMetaValue(audit, 'draft')).toBeUndefined();
   });

   it('reports the original error when SQLite already rolled the transaction back', () => {
      const audit = start();

      /*
       * A full disk makes SQLite roll the transaction back by itself. An OR ROLLBACK
       * conflict does the same thing without filling the disk.
       */
      const run = (): void =>
         transact(audit, () => {
            audit.db.exec(
               "INSERT OR ROLLBACK INTO meta (key, value) VALUES ('schemaVersion', 'x')",
            );
         });

      expect(run).toThrow(/UNIQUE constraint failed/u);
   });

   it('accepts a new transaction after one that SQLite rolled back', () => {
      const audit = start();
      try {
         transact(audit, () => {
            audit.db.exec(
               "INSERT OR ROLLBACK INTO meta (key, value) VALUES ('schemaVersion', 'x')",
            );
         });
      } catch {
         // The failure is the setup; the next transaction is under test.
      }

      transact(audit, () => {
         audit.db.exec("INSERT INTO meta (key, value) VALUES ('later', 'y')");
      });

      expect(readMetaValue(audit, 'later')).toBe('y');
   });
});
