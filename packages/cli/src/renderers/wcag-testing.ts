import type {
   ActRuleIndexEntry,
   AssessmentProcedure,
   CriterionTestMethod,
   EvidenceStrategy,
} from '#contracts';
import { code, fields, indent, listItems, section, wrap } from '../lib/format.js';
import {
   actRulesSection,
   hangingTechniqueLines,
   type TechniqueReference,
} from './shared.js';

const FAILS_DISPLAY_LIMIT = 2;
const PAIR_LENGTH = 2;

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

function procedureLines(input: {
   procedure: AssessmentProcedure;
   width: number;
}): string[] {
   const { procedure, width } = input;
   const lines = [
      `${procedure.title} (${procedure.procedureId}, version ${procedure.version})`,
      ...fields([
         ['Scope', procedure.scope],
         ['Applies to', procedure.applicability],
         ['Required capabilities', procedure.requiredCapabilities.join(', ')],
         ['Required evidence', procedure.requiredEvidence.join(', ')],
      ]),
      ...section('Setup', listItems(procedure.setup)),
      ...section('Actions', listItems(procedure.actions)),
      ...section(
         'Evaluation',
         fields([
            ['Pass', procedure.evaluation.passed],
            ['Fail', procedure.evaluation.failed],
            ['Not applicable', procedure.evaluation.inapplicable],
            ['Uncertain', procedure.evaluation.cantTell],
         ]),
      ),
      ...section('Recovery', listItems(procedure.recovery)),
      ...section('Limitations', listItems(procedure.limitations)),
      ...listItems(procedure.sources.map((source) => `${source.kind}: ${source.url}`)),
   ];
   return lines.flatMap((line) => wrap(line, 0, width));
}

function manualLines(input: { strategy: EvidenceStrategy; width: number }): string[] {
   const lines: string[] = [];
   for (const procedure of input.strategy.procedures) {
      if (procedure.procedureId !== 'axe_scan') {
         lines.push(...procedureLines({ procedure, width: input.width }), '');
      }
   }
   if (input.strategy.coverageGap) {
      lines.push(...wrap(`Coverage gap: ${input.strategy.coverageGap}`, 0, input.width));
   }
   return lines;
}

/**
 * Answers "how do I test this criterion": the axe command as a runnable line naming the
 * rule it runs, followed by the versioned assessment guidance and any coverage gap.
 */
export function testingSection(input: {
   criterionId: string;
   testMethod: CriterionTestMethod;
   strategy: EvidenceStrategy;
   width: number;
}): string[] {
   const axeLines = axeScanLines({
      criterionId: input.criterionId,
      axeRuleIds: input.testMethod.axeRuleIds,
      hasManualWork: input.strategy.procedureIds.some((id) => id !== 'axe_scan'),
      width: input.width,
   });
   const manual = manualLines({
      strategy: input.strategy,
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
 * The raw test method and strategy values `--verbose` prints: the internal enums, ids,
 * and notes the default view turns into sentences instead of showing directly.
 */
export function verboseTestMethodLines(input: {
   testMethod: CriterionTestMethod;
   strategy: EvidenceStrategy;
   actRules: readonly ActRuleIndexEntry[];
   width?: number | undefined;
}): string[] {
   const notes = [...new Set([...input.testMethod.notes, ...input.strategy.notes])];
   const body = fields([
      ['Test method', input.testMethod.method],
      ['Evidence mode', input.strategy.preferredEvidenceMode],
      ['Procedure ids', input.strategy.procedureIds.join(', ') || 'none'],
      ['Source attribution', input.testMethod.sourceAttribution.join(', ') || 'none'],
   ]);
   return [
      ...section('Raw test method data', [...body, ...listItems(notes)]),
      ...actRulesSection({
         ruleIds: input.testMethod.actRuleIds,
         rules: input.actRules,
         width: input.width,
      }),
   ];
}
