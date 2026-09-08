import type { CliOutputEnvelope, EvidenceRecord, PendingCriterion } from '#contracts';

import { code, dim, listItems, symbols, title } from '../lib/format.js';
import type { RenderOptions } from './shared.js';

interface RecordResult {
   record: EvidenceRecord;
   file: string;
}

interface PendingResult {
   subject: string;
   pending: PendingCriterion[];
   count: number;
}

interface ClearResult {
   subject: string;
   removed: number;
}

function outcomeSymbol(outcome: string): string {
   if (outcome === 'passed') {
      return symbols.pass;
   }
   if (outcome === 'failed') {
      return symbols.fail;
   }
   return symbols.warn;
}

/** Confirms one recorded result and says where it was written. */
export function renderRecordText(
   envelope: CliOutputEnvelope,
   _options: RenderOptions,
): string {
   const result = envelope.result as unknown as RecordResult;
   const { record } = result;
   const lines = [
      `${outcomeSymbol(record.outcome)} ${record.criterionId} ${record.outcome}`,
      dim(`  procedure  ${record.procedureId}`),
      dim(`  target     ${record.subject}`),
   ];

   if (record.pointer) {
      lines.push(dim(`  element    ${record.pointer}`));
   }
   if (record.note) {
      lines.push(dim(`  note       ${record.note}`));
   }
   lines.push(dim(`  written to ${result.file}`));
   return lines.join('\n');
}

/** Lists what still needs a person, with the command that records each one. */
export function renderPendingText(
   envelope: CliOutputEnvelope,
   options: RenderOptions,
): string {
   const result = envelope.result as unknown as PendingResult;
   if (result.pending.length === 0) {
      return dim('Every criterion that needs a person has a recorded result.');
   }

   const rows = result.pending.map((criterion) => {
      const procedures = options.verbose
         ? ` ${dim(criterion.procedureIds.join(', '))}`
         : '';
      return `${criterion.criterionId} ${criterion.title} ${dim(`(${criterion.level}, ${criterion.evidenceMode})`)}${procedures}`;
   });

   return [
      title(`${String(result.count)} criteria still need a person`),
      ...listItems(rows),
      '',
      dim('Record one with:'),
      code(
         `a1 audit record ${result.subject} --criterion <id> --outcome <passed|failed|cantTell|inapplicable>`,
      ),
   ].join('\n');
}

/** Says how many recorded results were dropped. */
export function renderClearText(
   envelope: CliOutputEnvelope,
   _options: RenderOptions,
): string {
   const result = envelope.result as unknown as ClearResult;
   if (result.removed === 0) {
      return dim(`No recorded results for ${result.subject}.`);
   }
   return `Removed ${String(result.removed)} recorded result(s) for ${result.subject}.`;
}
