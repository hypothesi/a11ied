import type { DriverTableMove } from '@a11ied/contracts';

import { DriverCommandError } from './command-registry.js';
import { getVirtualDocumentTitle } from './virtual-dom.js';
import { walkVirtualUntil, type VirtualStepContext } from './virtual-steps.js';

const VIRTUAL_TITLE_SOURCE = 'virtual: document.title';

/** The document title of the attached page. */
export function readVirtualTitle(): { title: string; source: string } {
   return { title: getVirtualDocumentTitle(), source: VIRTUAL_TITLE_SOURCE };
}

function containsText(wanted: string, phrase: string, node: Node | null): boolean {
   const own = node?.nodeType === node?.TEXT_NODE ? (node?.textContent ?? '') : '';
   return phrase.toLowerCase().includes(wanted) || own.toLowerCase().includes(wanted);
}

/**
 * Walks forward until the phrase or item text contains `text`, ignoring case, wrapping
 * past the end. When the only match is the item the cursor started on, the walk comes
 * back to it and reports it found.
 */
export async function findVirtualText(
   context: VirtualStepContext,
   text: string,
): Promise<{ found: boolean }> {
   const wanted = text.toLowerCase();
   const found = await walkVirtualUntil({
      context,
      direction: 'next',
      isMatch: (phrase, node) => containsText(wanted, phrase, node),
   });
   if (found) {
      return { found };
   }
   const phrase = await context.virtual.lastSpokenPhrase();
   return { found: containsText(wanted, phrase, context.virtual.activeNode) };
}

interface CellPosition {
   table: HTMLTableElement;
   rows: HTMLTableRowElement[];
   rowIndex: number;
   columnIndex: number;
}

function isElement(node: Node | null): node is Element {
   return node !== null && node.nodeType === node.ELEMENT_NODE;
}

function isTableRow(element: Element): element is HTMLTableRowElement {
   return element.tagName === 'TR';
}

function isTable(element: Element): element is HTMLTableElement {
   return element.tagName === 'TABLE';
}

function isTableCell(element: Element): element is HTMLTableCellElement {
   return element.tagName === 'TD' || element.tagName === 'TH';
}

function locateCell(node: Node | null): CellPosition | undefined {
   const start = isElement(node) ? node : node?.parentElement;
   const cell = start?.closest('td, th');
   const row = cell?.parentElement;
   const table = cell?.closest('table');
   if (
      !cell ||
      !row ||
      !table ||
      !isTableCell(cell) ||
      !isTableRow(row) ||
      !isTable(table)
   ) {
      return undefined;
   }
   const rows = [...table.querySelectorAll('tr')].filter(
      (candidate) => candidate.closest('table') === table,
   );
   return {
      table,
      rows,
      rowIndex: rows.indexOf(row),
      columnIndex: [...row.cells].indexOf(cell),
   };
}

function cellAt(
   position: CellPosition,
   rowIndex: number,
   columnIndex: number,
): Element | undefined {
   return position.rows[rowIndex]?.cells[columnIndex] ?? undefined;
}

function nextCellInDocumentOrder(
   position: CellPosition,
   offset: 1 | -1,
): Element | undefined {
   const row = position.rows[position.rowIndex];
   if (!row) {
      return undefined;
   }
   const sameRow = cellAt(position, position.rowIndex, position.columnIndex + offset);
   if (sameRow) {
      return sameRow;
   }
   const otherRow = position.rows[position.rowIndex + offset];
   if (!otherRow) {
      return undefined;
   }
   const cells = [...otherRow.cells];
   return offset === 1 ? cells[0] : cells.at(-1);
}

function resolveTargetCell(
   position: CellPosition,
   move: DriverTableMove,
): Element | undefined {
   switch (move) {
      case 'next-cell': {
         return nextCellInDocumentOrder(position, 1);
      }
      case 'previous-cell': {
         return nextCellInDocumentOrder(position, -1);
      }
      case 'next-column': {
         return cellAt(position, position.rowIndex, position.columnIndex + 1);
      }
      case 'previous-column': {
         return cellAt(position, position.rowIndex, position.columnIndex - 1);
      }
      case 'next-row': {
         return cellAt(position, position.rowIndex + 1, position.columnIndex);
      }
      case 'previous-row': {
         return cellAt(position, position.rowIndex - 1, position.columnIndex);
      }
      default: {
         return undefined;
      }
   }
}

function readHeader(
   position: CellPosition,
   move: 'row-header' | 'column-header',
): string {
   if (move === 'row-header') {
      const row = position.rows[position.rowIndex];
      const header = row?.querySelector('th[scope="row"]') ?? row?.querySelector('th');
      return header?.textContent?.trim() ?? '';
   }
   const column = position.rows
      .map((row) => row.cells[position.columnIndex])
      .find((cell) => cell?.tagName === 'TH' && cell.getAttribute('scope') !== 'row');
   return column?.textContent?.trim() ?? '';
}

function isMoveBackward(move: DriverTableMove): boolean {
   return move.startsWith('previous-');
}

/**
 * Moves the virtual cursor between the cells of the DOM table it is in, or reads the row
 * or column header of the current cell without moving.
 */
export async function moveInVirtualTable(
   context: VirtualStepContext,
   move: DriverTableMove,
): Promise<{ moved?: boolean; header?: string }> {
   const position = locateCell(context.virtual.activeNode);
   if (!position) {
      throw new DriverCommandError(
         'driver-not-in-table',
         'The cursor is not in a table cell. Move into a table with sr next table, then sr next until a cell.',
         { move },
      );
   }
   if (move === 'row-header' || move === 'column-header') {
      return { header: readHeader(position, move) };
   }
   const target = resolveTargetCell(position, move);
   if (!target) {
      return { moved: false };
   }
   const moved = await walkVirtualUntil({
      context,
      direction: isMoveBackward(move) ? 'previous' : 'next',
      isMatch: (phrase, node) => node === target && !phrase.startsWith('end of '),
   });
   return { moved };
}
