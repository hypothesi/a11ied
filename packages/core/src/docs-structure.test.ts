import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const rootDir = resolve(import.meta.dirname, '../../..');
const docsPagesDir = resolve(rootDir, 'packages/docs/src/pages');
const ROW_OPEN = '<div class="route-row">';
const ROW_CELLS = 2;
const REPORTED_MARKUP_LENGTH = 80;
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function listPages(directory: string): string[] {
   return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
         return listPages(path);
      }
      return entry.name.endsWith('.astro') ? [path] : [];
   });
}

/** Reads one route row's markup, from its opening tag to its matching close. */
function readRow(source: string, start: number): string {
   let depth = 0,
      index = start;
   while (index < source.length) {
      if (source.startsWith('<div', index)) {
         depth += 1;
      } else if (source.startsWith('</div>', index)) {
         depth -= 1;
         if (depth === 0) {
            return source.slice(start, index + '</div>'.length);
         }
      }
      index += 1;
   }
   return source.slice(start);
}

function countCells(rowMarkup: string): number {
   const row = new JSDOM(rowMarkup).window.document.querySelector('.route-row');
   return [...(row?.childNodes ?? [])].filter(
      (node) =>
         node.nodeType === ELEMENT_NODE ||
         (node.nodeType === TEXT_NODE && (node.textContent ?? '').trim() !== ''),
   ).length;
}

function findRowsWithStrayCells(page: string): string[] {
   const source = readFileSync(page, 'utf8');
   const found: string[] = [];
   let index = source.indexOf(ROW_OPEN);
   while (index !== -1) {
      const markup = readRow(source, index);
      if (countCells(markup) !== ROW_CELLS) {
         found.push(
            `${page.replace(`${rootDir}/`, '')}: ${markup.slice(0, REPORTED_MARKUP_LENGTH)}`,
         );
      }
      index = source.indexOf(ROW_OPEN, index + ROW_OPEN.length);
   }
   return found;
}

/**
 * A route row is a two-column grid, so every child becomes a cell, including the text
 * between two elements. A row written as two commands separated by a comma puts the comma
 * where the description belongs, and every string assertion still passes because the
 * strings are all present.
 */
describe('docs route rows', () => {
   it('gives every route row exactly two grid cells', () => {
      const stray = listPages(docsPagesDir).flatMap((page) =>
         findRowsWithStrayCells(page),
      );

      expect(stray).toEqual([]);
   });
});
