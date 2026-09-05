import { code, count, dim, getTerminalWidth, level, wrap } from '../lib/format.js';

export interface RenderOptions {
   verbose: boolean;
   /** Wrap width for prose lines. Defaults to the terminal width. */
   width?: number;
}

export interface CriterionSummary {
   id: string;
   title: string;
   level?: string;
   guideline?: { number: string; title: string };
}

export interface RenderedElement {
   xpath: string;
   snippet: string;
}

export interface TechniqueReference {
   id?: string | undefined;
   title: string;
   technology?: string | undefined;
}

export interface StrategySummary {
   preferredEvidenceMode: string;
   procedureIds: string[];
}

/** What each applicability state means, in the order the text output lists them. */
export const applicabilityStateDefinitions: ReadonlyArray<{
   state: string;
   definition: string;
}> = [
   {
      state: 'applicable',
      definition: 'a page signal (a form, a dialog, a live region) matched the criterion',
   },
   {
      state: 'not-detected',
      definition:
         'no signal matched. The criterion may still apply to content the parser cannot see',
   },
   {
      state: 'out-of-scope',
      definition: 'the criterion covers content this target cannot contain',
   },
   {
      state: 'unknown',
      definition:
         'an interactive widget was found but no recognized pattern, so applicability is unresolved',
   },
];

export function criterionLine(criterion: {
   id: string;
   title: string;
   level?: string;
}): string {
   const suffix = criterion.level ? `  ${level(criterion.level)}` : '';
   return `${code(criterion.id)}  ${criterion.title}${suffix}`;
}

export function techniqueLine(technique: TechniqueReference): string {
   const technology = technique.technology ? `  ${dim(technique.technology)}` : '';
   return `${code(technique.id ?? '-')}  ${technique.title}${technology}`;
}

/** Like techniqueLine, but wrapped so continuation lines hang under the title. */
export function hangingTechniqueLines(
   technique: TechniqueReference,
   width = getTerminalWidth(),
): string[] {
   const gap = '  ',
      id = technique.id ?? '-',
      technology = technique.technology ? `${gap}${dim(technique.technology)}` : '';
   const continuation = ' '.repeat(id.length + gap.length);
   return wrap(`${technique.title}${technology}`, 0, width - continuation.length).map(
      (line, index) =>
         index === 0 ? `${code(id)}${gap}${line}` : `${continuation}${line}`,
   );
}

export function applicabilityDefinitionLines(): string[] {
   return applicabilityStateDefinitions.map(
      (entry) => `${code(entry.state)}: ${entry.definition}`,
   );
}

/**
 * Names the command to run next for one criterion: the axe scan when automation decides
 * it, otherwise the manual procedures from the testing strategy.
 */
export function nextCommandLine(input: {
   criterionId: string;
   strategy: StrategySummary | undefined;
   url?: string | undefined;
}): string {
   const target = input.url ? ` ${input.url}` : ' <target>';
   if (input.strategy?.preferredEvidenceMode === 'automated') {
      return `${code(`a1 axe --criterion ${input.criterionId}${target}`)}`;
   }
   const procedures = input.strategy?.procedureIds.join(', ') || 'manual_review';
   return `${procedures} ${dim(`(${input.strategy?.preferredEvidenceMode ?? 'manual'})`)}; see ${code(`a1 wcag ${input.criterionId}`)}`;
}

export function renderElementLines(elements: RenderedElement[], limit: number): string[] {
   const shown = elements
      .slice(0, limit)
      .map((element) => `${element.xpath}  ${dim(element.snippet)}`);
   const hidden = elements.length - shown.length;
   if (hidden > 0) {
      shown.push(dim(`... ${count(hidden, 'more element')} in --json output`));
   }
   return shown;
}
