import chalk from 'chalk';

const FIELD_LABEL_INDEX = 1;
const FIELD_SPACING_INDEX = 2;
const FIELD_VALUE_INDEX = 3;
const FIELD_LINE = /^([A-Z][A-Za-z0-9 /()_-]+:)(\s*)(.*)$/u;

const BLOCK_CLOSING_TAGS = /<\/(?:p|div|li|dt|dd|section|h[1-6])>/giu;

/**
 * Strips markup and collapses whitespace to single spaces. Block-level closing tags get a
 * space first, so minified HTML with no whitespace between elements (`<p>Note</p><p>...`)
 * does not run two sentences together.
 */
export function stripHtml(value: string): string {
   return value
      .replaceAll(BLOCK_CLOSING_TAGS, ' ')
      .replaceAll(/<[^>]+>/g, '')
      .replaceAll(/\s+/g, ' ')
      .trim();
}

const MARKDOWN_LINK = /\[([^\]]+)\]\([^)]*\)/gu;
const MARKDOWN_BOLD = /\*\*([^*]+)\*\*/gu;

/**
 * Reduces Markdown to what reads well in a terminal: a link becomes its text and bold
 * markers are dropped. Markup and whitespace are handled the same as `stripHtml`, because
 * copied W3C prose mixes Markdown and raw HTML in the same paragraph.
 */
export function stripMarkdown(value: string): string {
   return stripHtml(
      value.replaceAll(MARKDOWN_LINK, '$1').replaceAll(MARKDOWN_BOLD, '$1'),
   );
}

function styleHelpLine(line: string): string {
   if (!line) {
      return line;
   }

   if (line.endsWith(':')) {
      return chalk.bold(line);
   }

   const fieldMatch = FIELD_LINE.exec(line);

   if (fieldMatch) {
      const label = fieldMatch[FIELD_LABEL_INDEX] ?? '',
         spacing = fieldMatch[FIELD_SPACING_INDEX] ?? '',
         value = fieldMatch[FIELD_VALUE_INDEX] ?? '';

      return `${chalk.cyan(label)}${spacing}${value}`;
   }

   return line;
}

/** Colors commander help text: section headings in bold and "Label:" prefixes in cyan. */
export function styleCommandText(value: string): string {
   return value
      .split('\n')
      .map((line) => styleHelpLine(line))
      .join('\n');
}
