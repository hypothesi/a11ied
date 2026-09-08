const NO_TEST_ID = 'row';

/**
 * The stable id for one table row.
 *
 * The APG's `data-test-id` is not unique within a file: the combobox example uses
 * `combobox-aria-expanded` for the `false` row and again for the `true` row. The position
 * is therefore part of the key, so a recorded judgment about one row never applies to
 * another.
 */
export function buildRowKey(testId: string | undefined, index: number): string {
   return `${testId ?? NO_TEST_ID}[${index}]`;
}
