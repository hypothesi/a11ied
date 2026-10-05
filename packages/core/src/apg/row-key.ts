import type {
   ApgAttributeRow,
   ApgExample,
   ApgKeyboardRow,
   AuditRun,
   EvidenceProvenance,
   EvidenceRecord,
} from '@a11ied/contracts';
import { getApgExample } from '@a11ied/wcag-engine';

const NO_TEST_ID = 'row';

/**
 * The stable id for one table row.
 *
 * The APG's `data-test-id` is not unique within a file: the combobox example uses
 * `combobox-aria-expanded` for the `false` row and again for the `true` row. The position
 * is therefore part of the key, so a recorded judgment about one row never applies to
 * another.
 */
export function buildRowKey(testId: string | undefined, index: number): string {
   return `${testId ?? NO_TEST_ID}[${index}]`;
}

function scopeRowKeys(
   tables: string[][],
   kind: 'keyboard' | 'attribute',
   counts: Map<string, number>,
): string[][] {
   return tables.map((keys, tableIndex) =>
      keys.map((key) => (counts.get(key) === 1 ? key : `${kind}[${tableIndex}]:${key}`)),
   );
}

/** Keep unique published keys stable and qualify collisions by table kind and position. */
export function getApgExampleRowKeys(example: ApgExample): {
   keyboard: string[][];
   attributes: string[][];
} {
   const attributes = example.attributeTables.map((table) =>
         table.rows.map((row, index) => buildRowKey(row.testId, index)),
      ),
      counts = new Map<string, number>(),
      keyboard = example.keyboardTables.map((table) =>
         table.rows.map((row, index) => buildRowKey(row.testId, index)),
      );
   for (const key of [...keyboard.flat(), ...attributes.flat()]) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
   }
   return {
      keyboard: scopeRowKeys(keyboard, 'keyboard', counts),
      attributes: scopeRowKeys(attributes, 'attribute', counts),
   };
}

/** Resolve an exact row so its documented input cannot be replaced by another procedure. */
export function getApgAssessmentRow(
   exampleId: string,
   rowKey: string,
):
   | { kind: 'keyboard'; row: ApgKeyboardRow }
   | { kind: 'attribute'; row: ApgAttributeRow }
   | undefined {
   const example = getApgExample(exampleId),
      keys = getApgExampleRowKeys(example);
   for (const [tableIndex, table] of example.keyboardTables.entries()) {
      const row = table.rows.find(
         (_entry, index) => keys.keyboard[tableIndex]?.[index] === rowKey,
      );
      if (row) {
         return { kind: 'keyboard', row };
      }
   }
   for (const [tableIndex, table] of example.attributeTables.entries()) {
      const row = table.rows.find(
         (_entry, index) => keys.attributes[tableIndex]?.[index] === rowKey,
      );
      if (row) {
         return { kind: 'attribute', row };
      }
   }
   return undefined;
}

/** Pattern judgments must include the evidence and capability required by their APG row. */
export function validatePatternRequirements({
   record,
   provenance,
   run,
}: {
   record: EvidenceRecord;
   provenance: EvidenceProvenance;
   run: AuditRun;
}): void {
   const environment = run.environments.find(
      (entry) => entry.environmentId === provenance.environmentId,
   );
   if (record.test.kind === 'patternRow') {
      const row = getApgAssessmentRow(record.test.exampleId, record.test.rowKey);
      const keyboard = row?.kind === 'keyboard';
      const missingRowEvidence =
         !provenance.artifacts.some((artifact) => artifact.kind === 'observation') ||
         (keyboard &&
            !provenance.artifacts.some((artifact) => artifact.kind === 'action-trace'));
      if (
         !row ||
         missingRowEvidence ||
         (keyboard && !environment?.capabilities.includes('keyboard'))
      ) {
         throw new Error(
            'The APG row requires scoped observations and its documented keyboard capability and action evidence.',
         );
      }
   }
}
