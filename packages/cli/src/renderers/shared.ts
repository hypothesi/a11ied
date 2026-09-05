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
 * One dim line naming a copied W3C document and its URL. The W3C Document License
 * requires attribution on every copy, and terminal output that prints the document's text
 * is a copy, so every renderer that prints Understanding or technique prose calls this.
 */
export function attributionLine(document: {
   title: string;
   url: string;
   status?: string;
}): string {
   const status = document.status ? ` ${document.status}.` : '';
   return dim(
      `Copyright W3C. From ${document.title}, used under the W3C Document License.${status} ${document.url}`,
   );
}

/**
 * The dim meta line under a listing of criterion ids, naming the command that opens one
 * in detail. The command itself prints at normal contrast so it stands out against the
 * dim text around it without becoming a full color accent; `x.y.z` stays a placeholder
 * because it stands for any id listed above it.
 */
export function showCriterionHintLine(): string {
   return `${dim('Run')} a1 wcag x.y.z ${dim('for details')}`;
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
