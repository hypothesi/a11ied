import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';

export type DocumentExtractMode = 'full' | 'core-sections';

const CORE_SECTION_IDS = new Set(['brief', 'intent', 'benefits', 'examples']);
const FURNITURE_SELECTORS = [
   'script',
   'style',
   'noscript',
   'nav',
   '[role="navigation"]',
   '.button-group',
   '.navtoc',
   '.button-backtotop',
   'a[href="#top"]',
];

const turndown = new TurndownService({
   headingStyle: 'atx',
   bulletListMarker: '-',
   codeBlockStyle: 'fenced',
});

/** Reads the W3C WAI status subtitle ("Informative explanations, not required..."). */
export function extractDocumentStatus(document: Document): string {
   const subtitle = document.querySelector('.minimal-header-subtitle');
   return subtitle?.textContent?.trim() || 'Informative WAI supporting document';
}

function removeFurniture(main: Element): void {
   for (const selector of FURNITURE_SELECTORS) {
      for (const node of main.querySelectorAll(selector)) {
         node.remove();
      }
   }
}

/**
 * A W3C page links within the site with root-relative hrefs. Those resolve to nothing
 * once the text is read in a terminal, so each one becomes an absolute URL against the
 * page it was copied from.
 */
function absolutizeLinks(main: Element, documentUrl: string): void {
   for (const anchor of main.querySelectorAll('a[href]')) {
      const href = anchor.getAttribute('href') ?? '';
      if (href.startsWith('#') || href === '') {
         continue;
      }
      try {
         anchor.setAttribute('href', new URL(href, documentUrl).toString());
      } catch {
         anchor.removeAttribute('href');
      }
   }
}

/**
 * Keeps only the In Brief, Intent, Benefits, and Examples sections of an Understanding
 * document, dropping the normative text repeat, the glossary, references, and test rules.
 * Used only when the full corpus would exceed the package size budget.
 */
function keepCoreSections(main: Element): void {
   const sections = [...main.querySelectorAll('section[id]')];
   for (const section of sections) {
      if (!CORE_SECTION_IDS.has(section.id)) {
         section.remove();
      }
   }
}

/**
 * Extracts and converts one W3C Understanding or technique page's main content to
 * Markdown. `mode` "core-sections" keeps only the substantive Understanding sections (In
 * Brief, Intent, Benefits, Examples) to stay under the package size budget.
 */
export function convertDocumentHtml(input: {
   html: string;
   mode: DocumentExtractMode;
   url: string;
}): {
   status: string;
   markdown: string;
} {
   const dom = new JSDOM(input.html);
   const { document } = dom.window;
   const main = document.querySelector('main#main') ?? document.querySelector('main');

   if (!main) {
      throw new Error('document is missing a <main> content element');
   }

   const status = extractDocumentStatus(document);
   removeFurniture(main);
   absolutizeLinks(main, input.url);
   if (input.mode === 'core-sections') {
      keepCoreSections(main);
   }

   const markdown = turndown.turndown(main.innerHTML).trim();
   return { status, markdown };
}
