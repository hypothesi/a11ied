import type {
   ApgApplicabilityHint,
   ApgAttributeCheckRow,
   ApgAttributeRow,
   ApgAttributeTable,
   ApgKeyboardTable,
} from '@a11ied/contracts';
import type { Page } from 'playwright';

import { buildRowKey } from './row-key.js';

interface AttributeReading {
   present: boolean;
   values: string[];
   danglingIdRefs: string[];
}

type AttributeReadings = Record<string, AttributeReading>;

/**
 * Reads, for each attribute the example documents, whether the widget sets it anywhere,
 * the values it holds, and any value that points at an id the document does not have.
 */
async function readAttributes(
   page: Page,
   selector: string,
   names: string[],
): Promise<AttributeReadings> {
   return page.evaluate(
      ({ widgetSelector, attributeNames }) => {
         const root = globalThis.document.querySelector(widgetSelector);
         const elements = root ? [root, ...root.querySelectorAll('*')] : [];
         const idRefSuffixes = [
            'labelledby',
            'describedby',
            'controls',
            'activedescendant',
            'owns',
         ];
         const readings: Record<
            string,
            { present: boolean; values: string[]; danglingIdRefs: string[] }
         > = {};

         for (const name of attributeNames) {
            const values = elements
               .map((element) => element.getAttribute(name))
               .filter((value) => value !== null);
            const isIdRefAttribute = idRefSuffixes.some((suffix) =>
               name.endsWith(suffix),
            );
            const danglingIdRefs = isIdRefAttribute
               ? values
                    .flatMap((value) => value.split(/\s+/u))
                    .filter((id) => id.length > 0)
                    .filter((id) => !globalThis.document.querySelector(`[id="${id}"]`))
               : [];

            readings[name] = { present: values.length > 0, values, danglingIdRefs };
         }

         return readings;
      },
      { widgetSelector: selector, attributeNames: names },
   );
}

function buildRowBase(
   row: ApgAttributeRow,
   index: number,
): Omit<ApgAttributeCheckRow, 'status'> {
   return {
      ...(row.testId === undefined ? {} : { testId: row.testId }),
      rowKey: buildRowKey(row.testId, index),
      ...(row.role === undefined ? {} : { role: row.role }),
      ...(row.attribute === undefined ? {} : { attribute: row.attribute.raw }),
      element: row.element,
      usage: row.usage,
   };
}

/**
 * Decides one row.
 *
 * A row with a role and no attribute is checked against the accessibility tree rather
 * than against a `role` attribute, so a native element that carries the role implicitly
 * passes.
 */
function checkOneRow(input: {
   row: ApgAttributeRow;
   index: number;
   readings: AttributeReadings;
   accessibilityTree: string;
}): ApgAttributeCheckRow {
   const { row } = input;
   const base = buildRowBase(row, input.index);

   if (!row.attribute) {
      if (!row.role) {
         return {
            ...base,
            status: 'not-testable',
            reason: 'the row documents an element, not a role or an attribute',
         };
      }
      return {
         ...base,
         status: input.accessibilityTree.includes(row.role) ? 'present' : 'absent',
      };
   }

   const reading = input.readings[row.attribute.name];
   if (!reading?.present) {
      return { ...base, status: 'absent' };
   }

   const observedValue = reading.values.join(', ');
   if (reading.danglingIdRefs.length > 0) {
      return {
         ...base,
         status: 'broken-reference',
         reason: `points at an id that is not in the document: ${reading.danglingIdRefs.join(', ')}`,
         observedValue,
      };
   }

   return { ...base, status: 'present', observedValue };
}

/**
 * Names the attributes the example documents that the widget never sets, together with
 * the keyboard rows whose description mentions them.
 *
 * This is a hint and never a verdict. It gives a person or an agent the evidence needed
 * to decide which parts of the pattern apply to the component under test, which is a
 * judgment the tool does not make.
 */
function buildApplicabilityHints(
   names: string[],
   readings: AttributeReadings,
   keyboardTables: ApgKeyboardTable[],
): ApgApplicabilityHint[] {
   const hints: ApgApplicabilityHint[] = [];

   for (const name of names) {
      if (readings[name]?.present) {
         continue;
      }
      const relatedRowKeys: string[] = [];
      for (const table of keyboardTables) {
         for (const [index, row] of table.rows.entries()) {
            if (row.description.some((line) => line.includes(name))) {
               relatedRowKeys.push(buildRowKey(row.testId, index));
            }
         }
      }
      hints.push({ attribute: name, relatedRowKeys });
   }

   return hints;
}

function listAttributeNames(table: ApgAttributeTable): string[] {
   const names = table.rows
      .map((row) => row.attribute?.name)
      .filter((name) => name !== undefined);
   return [...new Set(names)];
}

/**
 * Checks one attribute table against the widget on the page.
 *
 * This half of the check is fully automated, because the rows are concrete: an attribute
 * name on an element, not prose about behavior.
 */
export async function checkApgAttributes(input: {
   page: Page;
   selector: string;
   table: ApgAttributeTable | undefined;
   accessibilityTree: string;
   keyboardTables: ApgKeyboardTable[];
}): Promise<{ rows: ApgAttributeCheckRow[]; hints: ApgApplicabilityHint[] }> {
   const table = input.table;
   if (!table) {
      return { rows: [], hints: [] };
   }

   const names = listAttributeNames(table);
   const readings = await readAttributes(input.page, input.selector, names);
   const rows: ApgAttributeCheckRow[] = [];

   for (const [index, row] of table.rows.entries()) {
      rows.push(
         checkOneRow({
            row,
            index,
            readings,
            accessibilityTree: input.accessibilityTree,
         }),
      );
   }

   return { rows, hints: buildApplicabilityHints(names, readings, input.keyboardTables) };
}
