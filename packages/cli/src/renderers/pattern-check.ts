import {
   apgCheckResultSchema,
   type ApgCheckResult,
   type CliOutputEnvelope,
} from '#contracts';

import { code, count, dim, section, table } from '../lib/format.js';
import { apgAttribution, KEY_COLUMN_CAP, seeMoreLine } from './pattern.js';

const CHECK_STATUS_LABELS: Record<string, string> = {
   absent: 'absent',
   changed: 'changed',
   'no-observable-effect': 'NO EFFECT',
   'not-testable': 'not tested',
   present: 'present',
};

const STATUS_COLUMN_CAP = 12;

function checkRowLines(rows: { keyboardRows: ApgCheckResult['keyboardRows'] }): string[] {
   const body = rows.keyboardRows.flatMap((row) => {
      const observed =
         row.observedChanges.length > 0
            ? row.observedChanges.join(', ')
            : (row.reason ?? '');
      const line = [
         code(row.keys.join(' / ')),
         CHECK_STATUS_LABELS[row.status] ?? row.status,
         observed,
      ];
      return [line, ['', '', dim(row.description.join(' '))]];
   });

   return table(['Key', 'Result', 'Observed'], body, [KEY_COLUMN_CAP, STATUS_COLUMN_CAP]);
}

function judgedLines(result: ApgCheckResult): string[] {
   const judged = [...result.keyboardRows, ...result.attributeRows].filter(
      (row) => row.recorded !== undefined,
   );
   if (judged.length === 0) {
      return [];
   }

   return section(
      'Already judged',
      judged.map((row) => {
         const recorded = row.recorded;
         const stale = recorded?.stale
            ? dim(' - the page changed since, so this row counts again')
            : '';
         return `${code(row.rowKey)} ${recorded?.outcome ?? ''}${stale} ${dim(recorded?.note ?? '')}`;
      }),
   );
}

function hintLines(result: ApgCheckResult): string[] {
   if (result.applicabilityHints.length === 0) {
      return [];
   }

   return [
      ...section(
         'May not apply',
         result.applicabilityHints.map((hint) => {
            const rows = hint.relatedRowKeys.join(', ') || 'none';
            return `${code(hint.attribute)} ${dim(`is documented but never set here; rows: ${rows}`)}`;
         }),
      ),
      dim('These are hints, not findings. Decide which parts of the pattern apply.'),
   ];
}

function unprobedLines(result: ApgCheckResult): string[] {
   if (result.unprobedTables.length === 0) {
      return [];
   }

   return section(
      'Not probed',
      result.unprobedTables.map(
         (name) =>
            `${name} ${dim(`- run with --table '${name}' and --setup to reach it`)}`,
      ),
   );
}

function attributeLines(result: ApgCheckResult): string[] {
   if (result.attributeRows.length === 0) {
      return [];
   }

   const rows = result.attributeRows.map((row) => [
      code(row.attribute ?? row.role ?? `<${row.element}>`),
      CHECK_STATUS_LABELS[row.status] ?? row.status,
      row.reason ?? row.observedValue ?? '',
   ]);

   return section(
      'Attributes',
      table(['Role or attribute', 'Result', 'Observed'], rows, [
         KEY_COLUMN_CAP,
         STATUS_COLUMN_CAP,
      ]),
   );
}

/**
 * Prints one check run. The APG's own description sits under every key, because the tool
 * decides only that a declared key did nothing; whether the right thing happened is a
 * judgment for the person reading it.
 */
export function renderPatternCheckText(
   envelope: CliOutputEnvelope,
   _options: { verbose: boolean },
): string {
   const result = apgCheckResultSchema.parse(envelope.result);
   const lines = [
      `${result.title} against ${result.selector}`,
      dim(`example ${result.exampleId}, keyboard table "${result.tableName}"`),
   ];

   if (result.keyboardRows.length > 0) {
      lines.push(...section('Keyboard', checkRowLines(result)));
   }

   lines.push(...attributeLines(result));

   lines.push(...hintLines(result));

   lines.push(...judgedLines(result));

   lines.push(...unprobedLines(result));

   lines.push('', seeMoreLine(result.pageUrl), '', apgAttribution(result.document));
   return lines.join('\n');
}

interface PatternRecordResult {
   record: {
      outcome: string;
      note?: string;
      test: { exampleId: string; rowKey: string };
      subject: string;
   };
   file: string;
}

interface PatternPendingResult {
   subject: string;
   exampleId: string;
   pending: string[];
   count: number;
}

/** Prints the judgment that was just written, and where it went. */
export function renderPatternRecordText(
   envelope: CliOutputEnvelope,
   _options: { verbose: boolean },
): string {
   const result = envelope.result as unknown as PatternRecordResult;
   const lines = [
      `${result.record.test.exampleId} ${code(result.record.test.rowKey)} ${result.record.outcome}`,
      dim(`  target  ${result.record.subject}`),
   ];

   if (result.record.note) {
      lines.push(dim(`  note    ${result.record.note}`));
   }
   lines.push(dim(`  stored  ${result.file}`));
   return lines.join('\n');
}

/** Prints the rows of one example nobody has judged yet for this target. */
export function renderPatternPendingText(
   envelope: CliOutputEnvelope,
   _options: { verbose: boolean },
): string {
   const result = envelope.result as unknown as PatternPendingResult;

   if (result.count === 0) {
      return [
         `${result.exampleId} against ${result.subject}`,
         dim('Every row has a recorded result.'),
      ].join('\n');
   }

   return [
      `${result.exampleId} against ${result.subject}`,
      dim(`${count(result.count, 'row', 'rows')} with no recorded result`),
      '',
      ...result.pending.map((rowKey) => `  ${code(rowKey)}`),
      '',
      `${dim('Record one with')} a1 pattern record <target> --pattern ${result.exampleId} --row <rowKey> --outcome inapplicable --note '...'`,
   ].join('\n');
}
