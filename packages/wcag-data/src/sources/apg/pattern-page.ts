import type { ApgPatternSection } from '@a11ied/contracts';

import { absolutizeLinks, htmlToMarkdown } from '../documents/convert.js';
import { ApgParseError, collapseWhitespace, parseDocument } from './shared.js';

export interface ParsedApgPatternPage {
   sections: ApgPatternSection[];
}

/**
 * Reads a pattern page's `<main>` sections: About This Pattern, Example or Examples,
 * Keyboard Interaction, and WAI-ARIA Roles, States, and Properties, in page order. Each
 * section's heading becomes its title and the rest of it becomes Markdown. Images are
 * dropped, because the illustration says nothing the text does not, and a link to an
 * anchor on the same page becomes its text, because it leads nowhere in a terminal.
 */
export function parseApgPatternPage(
   html: string,
   pageUrl: string,
   fileName = 'pattern.html',
): ParsedApgPatternPage {
   const doc = parseDocument(html);
   const main = doc.querySelector('main');
   if (!main) {
      throw new ApgParseError(fileName, 'has no <main> element');
   }
   absolutizeLinks(main, pageUrl);
   for (const anchor of main.querySelectorAll('a[href^="#"]')) {
      anchor.replaceWith(anchor.textContent ?? '');
   }

   /* The published page wraps the sections in a div; the source file does not. */
   const sections = [...main.querySelectorAll('section[id]')].flatMap((section) => {
      const heading = section.querySelector(':scope > h2');
      if (!heading || section.parentElement?.closest('section')) {
         return [];
      }
      const title = collapseWhitespace(heading.textContent ?? '');
      heading.remove();
      for (const image of section.querySelectorAll('img')) {
         image.remove();
      }
      return [{ id: section.id, title, markdown: htmlToMarkdown(section.innerHTML) }];
   });
   if (sections.length === 0) {
      throw new ApgParseError(fileName, 'has no titled sections under <main>');
   }
   return { sections };
}
