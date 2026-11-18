import { z } from 'zod';

import { addEvent, getConfig, getMeta, setMeta, transact, type Audit } from './db.js';
import { AuditError } from './errors.js';

const LIMITATIONS_KEY = 'limitations';

const limitationSchema = z.object({
   /** The criterion the limitation weakens, or undefined when it affects the whole audit. */
   criterion: z.string().optional(),
   text: z.string().min(1),
   createdAt: z.string(),
});
export type AuditLimitation = z.infer<typeof limitationSchema>;

/**
 * Lists what the audit as a whole could not do, such as testing with a screen reader.
 * Unlike a cannot-tell result these are not tied to one page, and the report lists them
 * as not verified so readers can see which passes rest on weaker testing.
 */
export function listLimitations(audit: Audit): AuditLimitation[] {
   const stored = getMeta(audit, LIMITATIONS_KEY);
   return stored === undefined ? [] : z.array(limitationSchema).parse(JSON.parse(stored));
}

export function addLimitation(
   audit: Audit,
   input: { text: string; criterion?: string | undefined; actor?: string | undefined },
): AuditLimitation {
   const text = input.text.trim();
   if (text === '') {
      throw new AuditError('invalid-limitation', 'Describe what could not be tested.');
   }
   const { criterion } = input;
   if (criterion !== undefined && !getConfig(audit).criteria.includes(criterion)) {
      throw new AuditError(
         'criterion-out-of-scope',
         `${criterion} is not in this audit's scope.`,
      );
   }
   return transact(audit, () => {
      const limitation = {
         ...(criterion === undefined ? {} : { criterion }),
         text,
         createdAt: audit.now().toISOString(),
      };
      setMeta(
         audit,
         LIMITATIONS_KEY,
         JSON.stringify([...listLimitations(audit), limitation]),
      );
      addEvent(audit, {
         actor: input.actor ?? 'lead',
         type: 'limitation-added',
         message: `Limitation${criterion === undefined ? '' : ` on ${criterion}`}: ${text}`,
      });
      return limitation;
   });
}

/** Removes a limitation that no longer holds, by its 1-based position in the list. */
export function removeLimitation(
   audit: Audit,
   input: { position: number; actor?: string | undefined },
): AuditLimitation {
   return transact(audit, () => {
      const limitations = listLimitations(audit);
      const removed = limitations[input.position - 1];
      if (!removed) {
         throw new AuditError(
            'limitation-not-found',
            `No limitation ${String(input.position)}. Run a1 audit limitation --list.`,
         );
      }
      setMeta(
         audit,
         LIMITATIONS_KEY,
         JSON.stringify(limitations.filter((limitation) => limitation !== removed)),
      );
      addEvent(audit, {
         actor: input.actor ?? 'lead',
         type: 'limitation-removed',
         message: `Removed limitation: ${removed.text}`,
      });
      return removed;
   });
}
