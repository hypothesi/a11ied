import { JSDOM } from 'jsdom';

export const PAGE_BASE = 'https://www.w3.org/WAI/ARIA/apg/patterns';
export const SOURCE_BASE =
   'https://raw.githubusercontent.com/w3c/aria-practices/main/content/patterns';

/** Raised when an APG page does not have the structure the parser reads. */
export class ApgParseError extends Error {
   readonly fileName: string;

   constructor(fileName: string, message: string) {
      super(`Cannot parse APG source ${fileName}: ${message}`);
      this.name = 'ApgParseError';
      this.fileName = fileName;
   }
}

export function collapseWhitespace(value: string): string {
   return value.replaceAll(/\s+/gu, ' ').trim();
}

export function parseDocument(html: string): Document {
   return new JSDOM(html).window.document;
}

/** Finds one element by id without `getElementById`, which the lint rules disallow. */
export function findById(doc: Document, id: string): Element | null {
   return doc.querySelector(`[id="${id}"]`);
}
