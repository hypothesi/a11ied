import type {
   ApgAttributeRow,
   ApgAttributeTable,
   ApgAttributeValue,
   ApgKeyboardRow,
   ApgKeyboardTable,
} from '@a11ied/contracts';

import { collapseWhitespace, findById, parseDocument } from './shared.js';

const ATTRIBUTE_CELL_PATTERN = /^(?<name>[a-zA-Z-]+)(?:="(?<value>[^"]*)")?$/u;
const CHORD_SEPARATOR = '+';
const ID_REF_PREFIX = '#IDREF';
const KEYBOARD_TABLE_LABEL = 'kbd_label';
const ATTRIBUTE_TABLE_LABEL = 'rps_label';
const ROLE_CELL = 0;
const ATTRIBUTE_CELL = 1;
const ELEMENT_CELL = 2;
const USAGE_CELL = 3;
const ATTRIBUTE_CELL_COUNT = 4;
const LAST = -1;

export interface ParsedApgExample {
   keyboardTables: ApgKeyboardTable[];
   attributeTables: ApgAttributeTable[];
}

function isElementNode(node: ChildNode): node is Element {
   return node.nodeType === node.ELEMENT_NODE;
}

function isKbdElement(node: ChildNode): node is Element {
   return isElementNode(node) && node.tagName === 'KBD';
}

function appendKey(groups: string[][], key: string, separator: string): void {
   const current = groups.at(LAST);
   if (current && separator.includes(CHORD_SEPARATOR)) {
      current.push(key);
      return;
   }
   groups.push([key]);
}

/**
 * Splits a key cell into groups.
 *
 * An APG key cell means one of two things, and only a `+` between two `kbd` elements
 * makes a chord. `or`, a `br`, and a bare comma all separate alternatives, each of which
 * satisfies the row on its own. Anything that is not a `+` therefore starts a new group,
 * which fails toward pressing two real keys instead of inventing a chord such as `Down
 * Arrow+Space+Enter` that no reader of the page would ever press.
 */
function readKeyGroups(cell: Element): string[][] {
   const groups: string[][] = [];
   let separator = '';

   for (const node of cell.childNodes) {
      if (isKbdElement(node)) {
         appendKey(groups, collapseWhitespace(node.textContent ?? ''), separator);
         separator = '';
         continue;
      }
      separator += isElementNode(node) ? ' ' : (node.textContent ?? '');
   }

   if (groups.length > 0) {
      return groups;
   }
   return [[collapseWhitespace(cell.textContent ?? '')]];
}

function readDescription(cell: Element | null): string[] {
   if (!cell) {
      return [];
   }
   const items = [...cell.querySelectorAll('li')];
   if (items.length > 0) {
      return items.map((item) => collapseWhitespace(item.textContent ?? ''));
   }
   const text = collapseWhitespace(cell.textContent ?? '');
   return text.length > 0 ? [text] : [];
}

function readKeyboardRow(row: HTMLElement): ApgKeyboardRow | undefined {
   const keyCell = row.querySelector('th');
   if (!keyCell) {
      return undefined;
   }
   const testId = row.dataset.testId;
   return {
      ...(testId === undefined ? {} : { testId }),
      keyGroups: readKeyGroups(keyCell),
      description: readDescription(row.querySelector('td')),
   };
}

function parseAttributeCell(cell: Element | undefined): ApgAttributeValue | undefined {
   const raw = collapseWhitespace(cell?.textContent ?? '');
   if (raw.length === 0) {
      return undefined;
   }
   const groups = ATTRIBUTE_CELL_PATTERN.exec(raw)?.groups;
   if (!groups?.name) {
      return { raw, name: raw, isIdRef: false };
   }
   const value = groups.value;
   return {
      raw,
      name: groups.name,
      ...(value === undefined ? {} : { value }),
      isIdRef: value !== undefined && value.startsWith(ID_REF_PREFIX),
   };
}

function readAttributeRow(row: HTMLElement): ApgAttributeRow | undefined {
   const cells = [...row.children];
   if (cells.length < ATTRIBUTE_CELL_COUNT) {
      return undefined;
   }
   const attribute = parseAttributeCell(cells.at(ATTRIBUTE_CELL)),
      role = collapseWhitespace(cells.at(ROLE_CELL)?.textContent ?? ''),
      testId = row.dataset.testId;

   return {
      ...(testId === undefined ? {} : { testId }),
      ...(role.length === 0 ? {} : { role }),
      ...(attribute === undefined ? {} : { attribute }),
      element: collapseWhitespace(cells.at(ELEMENT_CELL)?.textContent ?? ''),
      usage: collapseWhitespace(cells.at(USAGE_CELL)?.textContent ?? ''),
   };
}

/**
 * Names a table from the heading it points at. A table labeled by both a section heading
 * and a sub-heading takes the sub-heading, such as "Closed Combobox". A table labelled
 * only by the section heading has no name of its own, which is how a one-table example
 * reads.
 */
function readTableName(doc: Document, table: Element, sectionLabel: string): string {
   const subHeadingId = (table.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/u)
      .find((token) => token.length > 0 && token !== sectionLabel);
   const heading = subHeadingId ? findById(doc, subHeadingId) : undefined;
   return collapseWhitespace(heading?.textContent ?? '');
}

function selectLabelledTables(
   doc: Document,
   selector: string,
   sectionLabel: string,
): Element[] {
   return [...doc.querySelectorAll(selector)].filter((table) =>
      (table.getAttribute('aria-labelledby') ?? '').split(/\s+/u).includes(sectionLabel),
   );
}

function readRows<TRow>(
   table: Element,
   readRow: (row: HTMLElement) => TRow | undefined,
): TRow[] {
   return [...table.querySelectorAll<HTMLElement>('tbody tr')]
      .map((row) => readRow(row))
      .filter((row) => row !== undefined);
}

/**
 * Parses one APG example's keyboard and attribute tables.
 *
 * Both selectors match on the `aria-labelledby` token rather than on the class alone. The
 * data grid example holds three demo tables that also carry `class="data"`, and a looser
 * selector reads those as the pattern's documentation.
 *
 * An example with neither table, such as any of the landmark examples, parses to two
 * empty lists rather than an error.
 */
export function parseApgExample(html: string): ParsedApgExample {
   const doc = parseDocument(html);

   return {
      keyboardTables: selectLabelledTables(doc, 'table.def', KEYBOARD_TABLE_LABEL).map(
         (table) => ({
            name: readTableName(doc, table, KEYBOARD_TABLE_LABEL),
            rows: readRows(table, readKeyboardRow),
         }),
      ),
      attributeTables: selectLabelledTables(
         doc,
         'table.data.attributes',
         ATTRIBUTE_TABLE_LABEL,
      ).map((table) => ({
         name: readTableName(doc, table, ATTRIBUTE_TABLE_LABEL),
         rows: readRows(table, readAttributeRow),
      })),
   };
}
