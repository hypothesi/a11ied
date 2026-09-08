import type {
   ApgAttributeCheckRow,
   ApgCheckResult,
   ApgKeyboardCheckRow,
   EvidenceOutcome,
   EvidenceRecord,
   RecordedJudgment,
} from '@a11ied/contracts';

/**
 * What the tool will record about one key.
 *
 * `changed` becomes `cantTell` rather than `passed`: something happened, and whether it
 * was the behavior the guide documents is a judgment the tool does not make. A key it
 * cannot press gets no outcome at all, because not recording a result already means
 * untested. Nothing here ever produces `inapplicable`; only a person or an agent decides
 * that.
 */
export function keyboardRowOutcome(
   status: ApgKeyboardCheckRow['status'],
): EvidenceOutcome | undefined {
   if (status === 'no-observable-effect') {
      return 'failed';
   }
   if (status === 'changed') {
      return 'cantTell';
   }
   return undefined;
}

/**
 * What the tool will record about one attribute row.
 *
 * An absence is `cantTell`, not `failed`. The APG's own reference combobox leaves
 * `aria-activedescendant` off while the listbox is closed, so an absent attribute usually
 * means the widget is in another state rather than that it is broken.
 */
export function attributeRowOutcome(
   status: ApgAttributeCheckRow['status'],
): EvidenceOutcome | undefined {
   if (status === 'broken-reference') {
      return 'failed';
   }
   if (status === 'present') {
      return 'passed';
   }
   if (status === 'absent') {
      return 'cantTell';
   }
   return undefined;
}

function toJudgment(record: EvidenceRecord, currentHash: string): RecordedJudgment {
   return {
      outcome: record.outcome,
      ...(record.note === undefined ? {} : { note: record.note }),
      ...(record.assertedBy === undefined ? {} : { assertedBy: record.assertedBy }),
      recordedAt: record.recordedAt,
      stale: record.subjectHash !== undefined && record.subjectHash !== currentHash,
   };
}

/**
 * Attaches the judgments already recorded for this page to the rows they are about.
 *
 * A judgment made against a different accessibility tree is marked stale rather than
 * applied, so a recorded `inapplicable` stops counting the moment the component changes.
 */
export function attachRecordedJudgments(input: {
   result: ApgCheckResult;
   records: EvidenceRecord[];
   subjectHash: string;
}): ApgCheckResult {
   const byRowKey = new Map<string, EvidenceRecord>();
   for (const record of input.records) {
      if (
         record.test.kind === 'patternRow' &&
         record.test.exampleId === input.result.exampleId
      ) {
         byRowKey.set(record.test.rowKey, record);
      }
   }

   if (byRowKey.size === 0) {
      return input.result;
   }

   const attach = <TRow extends { rowKey: string }>(row: TRow): TRow => {
      const record = byRowKey.get(row.rowKey);
      return record ? { ...row, recorded: toJudgment(record, input.subjectHash) } : row;
   };

   return {
      ...input.result,
      keyboardRows: input.result.keyboardRows.map((row) => attach(row)),
      attributeRows: input.result.attributeRows.map((row) => attach(row)),
   };
}

/**
 * Whether a row still counts toward the exit code.
 *
 * A row someone recorded as `inapplicable` or `passed` is set aside, until the page
 * changes under it, at which point the judgment goes stale and the row counts again.
 */
export function isSetAside(row: { recorded?: RecordedJudgment | undefined }): boolean {
   const recorded = row.recorded;
   if (!recorded || recorded.stale) {
      return false;
   }
   return recorded.outcome === 'inapplicable' || recorded.outcome === 'passed';
}
