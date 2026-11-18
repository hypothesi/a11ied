import { join } from 'node:path';
import { addEvent, createAudit, type Audit, type OpenAuditOptions } from './db.js';
import type { ConformanceLevel, Platform } from './schema.js';
import { resolveScopeCriteria } from './scope.js';
import { resolveAuditsRoot, slugify } from './workspace.js';

export interface StartAuditInput {
   /** A URL, an app name, or a short description of what is being audited. */
   target: string;
   name?: string | undefined;
   id?: string | undefined;
   platform?: Platform | undefined;
   wcagVersion?: string | undefined;
   level?: ConformanceLevel | undefined;
   criteria?: readonly string[] | undefined;
   passes?: readonly string[] | undefined;
   rules?: readonly string[] | undefined;
   access?: string | undefined;
   /** Directory that holds audits. Defaults to the workspace audits root. */
   root?: string | undefined;
}

const DEFAULT_WCAG_VERSION = '2.2';
const DATE_LENGTH = 10;

/** Creates an audit with a fixed scope. Pages are added afterwards. */
export function startAudit(
   input: StartAuditInput,
   options: OpenAuditOptions = {},
): Audit {
   const now = (options.now ?? ((): Date => new Date()))();
   const wcagVersion = input.wcagVersion ?? DEFAULT_WCAG_VERSION;
   const level = input.level ?? 'AA';
   const criteria = resolveScopeCriteria({
      wcagVersion,
      level,
      criteria: input.criteria,
      passes: input.passes,
   });
   const id =
      input.id ??
      `${slugify(input.name ?? input.target)}-${now.toISOString().slice(0, DATE_LENGTH)}`;
   const audit = createAudit(
      join(input.root ?? resolveAuditsRoot(), id),
      {
         id,
         name: input.name ?? input.target,
         target: input.target,
         platform: input.platform ?? 'web',
         wcagVersion,
         level,
         criteria,
         rules: [...(input.rules ?? [])],
         access: input.access ?? '',
         createdAt: now.toISOString(),
      },
      options,
   );
   addEvent(audit, {
      actor: 'lead',
      type: 'audit-created',
      message: `Created audit ${id}: ${String(criteria.length)} criteria, WCAG ${wcagVersion} ${level}`,
   });
   return audit;
}
