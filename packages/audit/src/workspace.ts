import { existsSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { isAuditDir } from './db.js';
import { AuditError } from './errors.js';

/**
 * Overrides where audits are stored. Defaults to `.a11ied/audits` in the working
 * directory.
 */
export const AUDITS_DIR_ENV_VAR = 'A11IED_AUDITS_DIR';

/** Selects the audit every command uses when `--audit` is not given. */
export const AUDIT_ENV_VAR = 'A11IED_AUDIT';

const MAX_ID_LENGTH = 48;
const { env } = process;

export function resolveAuditsRoot(cwd = process.cwd()): string {
   const override = env[AUDITS_DIR_ENV_VAR];
   return override ? resolve(cwd, override) : resolve(cwd, '.a11ied', 'audits');
}

/** Turns a name or URL into a short directory-safe id. */
export function slugify(text: string): string {
   const slug = text
      .toLowerCase()
      .replace(/^https?:\/\//u, '')
      .replaceAll(/[^a-z0-9]+/gu, '-')
      .replaceAll(/^-+|-+$/gu, '')
      .slice(0, MAX_ID_LENGTH)
      .replace(/-+$/u, '');
   return slug === '' ? 'audit' : slug;
}

/** Lists audit directories, most recently changed first. */
export function listAuditDirs(root = resolveAuditsRoot()): string[] {
   if (!existsSync(root)) {
      return [];
   }
   return readdirSync(root)
      .map((entry) => join(root, entry))
      .filter((dir) => isAuditDir(dir))
      .toSorted(
         (left, right) =>
            statSync(join(right, 'audit.db')).mtimeMs -
            statSync(join(left, 'audit.db')).mtimeMs,
      );
}

/**
 * Finds the audit a command should use: an explicit id or path, then `$A11IED_AUDIT`,
 * then the only audit in the workspace. With several audits and no selection it refuses
 * to guess, because recording work against the wrong audit is hard to undo.
 */
export function resolveAuditDir(selection?: string, root = resolveAuditsRoot()): string {
   const chosen = selection ?? env[AUDIT_ENV_VAR];
   if (chosen) {
      const candidates = [
         isAbsolute(chosen) ? chosen : join(root, chosen),
         resolve(chosen),
      ];
      const found = candidates.find((dir) => isAuditDir(dir));
      if (!found) {
         throw new AuditError(
            'audit-not-found',
            `No audit "${chosen}" in ${root}. Run a1 audit list.`,
         );
      }
      return found;
   }
   const all = listAuditDirs(root);
   const [only] = all;
   if (only === undefined) {
      throw new AuditError(
         'audit-not-found',
         `No audits in ${root}. Start one with a1 audit init <target>.`,
      );
   }
   if (all.length > 1) {
      throw new AuditError(
         'audit-ambiguous',
         `There are ${String(all.length)} audits in ${root}. Pass --audit <id> or set ${AUDIT_ENV_VAR}. Run a1 audit list to see them.`,
      );
   }
   return only;
}
