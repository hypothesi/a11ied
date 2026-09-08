import type { MobileGuidanceEntry } from '#contracts';
import { section, wrap } from '../lib/format.js';
import { stripMarkdown } from '../lib/text.js';
import { attributionLine, type RenderOptions } from './shared.js';

const PARAGRAPH_BREAK = /\n\s*\n/u;

/**
 * The lead paragraph of WCAG2Mobile's guidance, which is where it says whether the
 * criterion applies as written and which web terms mobile substitutes. The paragraphs
 * after it restate the criterion with those substitutions applied, and the criterion's
 * own text is already printed above, so they are kept for `--verbose`.
 */
function guidanceParagraphs(guidance: string, verbose: boolean): string[] {
   const paragraphs = guidance
      .split(PARAGRAPH_BREAK)
      .map((paragraph) => stripMarkdown(paragraph))
      .filter(Boolean);
   return verbose ? paragraphs : paragraphs.slice(0, 1);
}

function paragraphLines(paragraphs: string[], width: number | undefined): string[] {
   const lines: string[] = [];
   for (const paragraph of paragraphs) {
      if (lines.length > 0) {
         lines.push('');
      }
      lines.push(...wrap(paragraph, 0, width));
   }
   return lines;
}

/**
 * What WCAG2Mobile says about this criterion, when the task force has written it: how the
 * criterion reads on a mobile platform, then its notes and examples. A criterion the
 * document still lists as a placeholder prints nothing, because it has nothing to say
 * yet. The attribution line is required on every copy of W3C prose.
 */
export function mobileSection(
   guidance: MobileGuidanceEntry | undefined,
   options: RenderOptions,
): string[] {
   if (!guidance || guidance.state === 'placeholder') {
      return [];
   }
   const paragraphs = [
      ...guidanceParagraphs(guidance.guidance, options.verbose),
      ...guidance.notes.map((note) => stripMarkdown(note)),
      ...guidance.examples.map((example) => stripMarkdown(example)),
      attributionLine(guidance),
   ];
   return section('Mobile', paragraphLines(paragraphs, options.width));
}
