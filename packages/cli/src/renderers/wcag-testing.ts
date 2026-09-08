import type { ActRuleIndexEntry, CriterionCoverage, EvidenceStrategy } from '#contracts';
import { code, fields, indent, listItems, section, wrap } from '../lib/format.js';
import {
   actRulesSection,
   hangingTechniqueLines,
   type TechniqueReference,
} from './shared.js';

const FAILS_DISPLAY_LIMIT = 2;
const PAIR_LENGTH = 2;

interface ProcedureGuidance {
   instruction: string;
   commands?: string[];
}

/**
 * A by-hand instruction for each procedure id the coverage strategy can name, with the
 * `sr` commands that help where one applies. "Probe" never appears in the wording: each
 * entry says what the check actually does.
 */
const PROCEDURE_GUIDANCE: Record<string, ProcedureGuidance> = {
   manual_review: {
      instruction: 'Compare the page against the Understanding document by hand.',
   },
   landmark_sequence: {
      instruction:
         'Move through the landmarks in order and confirm you can reach the main content.',
      commands: ['a1 sr walk <target>', 'a1 sr elements landmark'],
   },
   auth_flow_probe: {
      instruction: 'Walk through the sign-in flow and check it against this criterion.',
      commands: ['a1 sr walk <target>'],
   },
   focus_order_probe: {
      instruction:
         'Tab through the page and confirm focus moves in a sensible reading order.',
      commands: ['a1 sr walk <target>'],
   },
   focus_visibility_probe: {
      instruction:
         'Tab through the page and confirm the focus indicator is visible at every stop.',
      commands: ['a1 sr walk <target>'],
   },
   focus_obscured_probe: {
      instruction:
         'Tab through the page and confirm nothing, such as a sticky header, covers the focused element.',
      commands: ['a1 sr walk <target>'],
   },
   redundant_entry_probe: {
      instruction:
         'Check that information already entered is not asked for again in the same process.',
   },
   status_message_probe: {
      instruction:
         'Trigger a status message and confirm a screen reader announces it without moving focus.',
      commands: ['a1 sr expect <text>'],
   },
   cross_page_consistency_review: {
      instruction:
         'Compare repeated components, such as navigation or search, across pages for consistent order and labeling.',
   },
};

function joinWithAnd(items: string[]): string {
   if (items.length <= 1) {
      return items[0] ?? '';
   }
   if (items.length === PAIR_LENGTH) {
      return `${items[0]} and ${items[1]}`;
   }
   return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

const RULE_NAME_DISPLAY_LIMIT = 3;

/**
 * Names the axe rules a scan runs. A handful get named in full; many rules get named as a
 * count with a couple of examples, so the sentence stays a sentence.
 */
function describeAxeRules(axeRuleIds: readonly string[]): string {
   if (axeRuleIds.length <= RULE_NAME_DISPLAY_LIMIT) {
      const ruleWord = axeRuleIds.length === 1 ? 'rule' : 'rules';
      return `the axe ${ruleWord} ${joinWithAnd(axeRuleIds.map((id) => `"${id}"`))}`;
   }
   const examples = axeRuleIds
      .slice(0, RULE_NAME_DISPLAY_LIMIT)
      .map((id) => `"${id}"`)
      .join(', ');
   return `${axeRuleIds.length} axe rules, including ${examples}`;
}

function axeScanLines(input: {
   criterionId: string;
   axeRuleIds: string[];
   hasManualWork: boolean;
   width: number;
}): string[] {
   if (input.axeRuleIds.length === 0) {
      return [];
   }
   const verb = input.hasManualWork ? 'covers part of this' : 'checks this';
   return [
      `A scan ${verb}:`,
      ...indent([code(`a1 axe --criterion ${input.criterionId} <target>`)]),
      ...wrap(`That runs ${describeAxeRules(input.axeRuleIds)}.`, 0, input.width),
   ];
}

function procedureLines(input: { id: string; width: number }): string[] {
   const guidance = PROCEDURE_GUIDANCE[input.id];
   const instruction = guidance?.instruction ?? input.id;
   const commandLines = guidance?.commands ? indent(guidance.commands.map(code)) : [];
   return [...wrap(instruction, 0, input.width), ...commandLines];
}

function restProcedureLines(ids: readonly string[], width: number): string[] {
   const lines: string[] = [];
   for (const id of ids) {
      lines.push('', ...procedureLines({ id, width }));
   }
   return lines;
}

function manualLines(input: { procedureIds: string[]; width: number }): string[] {
   const manualProcedureIds = input.procedureIds.filter((id) => id !== 'axe_scan');
   if (manualProcedureIds.length === 0) {
      return [];
   }
   const intro =
      manualProcedureIds.length === 1 && input.procedureIds.length === 1
         ? 'This needs a real page.'
         : 'The rest needs a real page.';
   const [first, ...rest] = manualProcedureIds;
   const firstLines = procedureLines({ id: first as string, width: input.width });
   return [
      `${intro} ${firstLines[0] ?? ''}`,
      ...firstLines.slice(1),
      ...restProcedureLines(rest, input.width),
   ];
}

/**
 * Answers "how do I test this criterion": the axe command as a runnable line naming the
 * rule it runs, then the by-hand check as an instruction with the `sr` commands that
 * help. Prints nothing when the strategy names no procedure at all.
 */
export function testingSection(input: {
   criterionId: string;
   coverage: CriterionCoverage;
   strategy: EvidenceStrategy;
   width: number;
}): string[] {
   const axeLines = axeScanLines({
      criterionId: input.criterionId,
      axeRuleIds: input.coverage.axeRuleIds,
      hasManualWork: input.strategy.procedureIds.some((id) => id !== 'axe_scan'),
      width: input.width,
   });
   const manual = manualLines({
      procedureIds: input.strategy.procedureIds,
      width: input.width,
   });
   const body =
      axeLines.length > 0 && manual.length > 0
         ? [...axeLines, '', ...manual]
         : [...axeLines, ...manual];
   if (body.length === 0) {
      return [];
   }
   return section('Testing it', body);
}

function dedupeById(items: readonly TechniqueReference[]): TechniqueReference[] {
   const seen = new Set<string>();
   const result: TechniqueReference[] = [];
   for (const item of items) {
      if (!item.id || seen.has(item.id)) {
         continue;
      }
      seen.add(item.id);
      result.push(item);
   }
   return result;
}

/**
 * Answers "what do I do when it fails": the ways to fix it and the ways it commonly
 * breaks, by title, then a command pointing at the full guidance. Prints nothing when the
 * criterion has neither techniques nor failures.
 */
export function failsSection(input: {
   criterionId: string;
   techniques: readonly TechniqueReference[];
   failures: readonly TechniqueReference[];
   width: number;
}): string[] {
   const items = dedupeById([...input.techniques, ...input.failures]);
   if (items.length === 0) {
      return [];
   }
   const shown = items.slice(0, FAILS_DISPLAY_LIMIT);
   const remaining = items.length - shown.length;
   const lines = shown.flatMap((item) => hangingTechniqueLines(item, input.width));
   const guidanceCommand = code(`a1 wcag understanding ${input.criterionId}`);
   const pointer =
      remaining > 0
         ? `${remaining} more, and the full guidance: ${guidanceCommand}`
         : `See the full guidance: ${guidanceCommand}`;
   return section('If it fails', [...lines, ...wrap(pointer, 0, input.width)]);
}

/**
 * The raw coverage and strategy values `--verbose` prints: the internal enums, ids, and
 * notes the default view turns into sentences instead of showing directly.
 */
export function verboseCoverageLines(input: {
   coverage: CriterionCoverage;
   strategy: EvidenceStrategy;
   actRules: readonly ActRuleIndexEntry[];
   width?: number | undefined;
}): string[] {
   const notes = [...new Set([...input.coverage.notes, ...input.strategy.notes])];
   const body = fields([
      ['Coverage state', input.coverage.coverageState],
      ['Evidence mode', input.strategy.preferredEvidenceMode],
      ['Procedure ids', input.strategy.procedureIds.join(', ') || 'none'],
      ['Source attribution', input.coverage.sourceAttribution.join(', ') || 'none'],
   ]);
   return [
      ...section('Raw coverage data', [...body, ...listItems(notes)]),
      ...actRulesSection({
         ruleIds: input.coverage.actRuleIds,
         rules: input.actRules,
         width: input.width,
      }),
   ];
}
