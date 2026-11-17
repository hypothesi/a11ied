import { run, selectAll, type Audit } from './db.js';
import { signalRowSchema } from './rows.js';
import type { Signal } from './schema.js';

/**
 * Stores facts a programmatic check collected about a page. Signals inform a worker's
 * judgment; they never decide an outcome on their own.
 */
export function putSignal(
   audit: Audit,
   signal: { pageId: string; kind: string; data: unknown },
): void {
   run(
      audit,
      'INSERT INTO signals (pageId, kind, data, collectedAt) VALUES (?, ?, ?, ?) ON CONFLICT (pageId, kind) DO UPDATE SET data = excluded.data, collectedAt = excluded.collectedAt',
      signal.pageId,
      signal.kind,
      JSON.stringify(signal.data),
      audit.now().toISOString(),
   );
}

export function listSignals(audit: Audit, pageId?: string): Signal[] {
   return pageId === undefined
      ? selectAll(
           audit,
           signalRowSchema,
           'SELECT pageId, kind, data, collectedAt FROM signals ORDER BY pageId, kind',
        )
      : selectAll(
           audit,
           signalRowSchema,
           'SELECT pageId, kind, data, collectedAt FROM signals WHERE pageId = ? ORDER BY kind',
           pageId,
        );
}
