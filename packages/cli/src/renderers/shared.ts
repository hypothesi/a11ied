import { code, count, dim, level } from '../lib/format.js';

export interface RenderOptions {
   verbose: boolean;
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

export function criterionLine(criterion: {
   id: string;
   title: string;
   level?: string;
}): string {
   const suffix = criterion.level ? `  ${level(criterion.level)}` : '';
   return `${code(criterion.id)}  ${criterion.title}${suffix}`;
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
