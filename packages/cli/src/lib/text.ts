import chalk from 'chalk';

const FIELD_LABEL_INDEX = 1;
const FIELD_SPACING_INDEX = 2;
const FIELD_VALUE_INDEX = 3;
const FIELD_LINE = /^([A-Z][A-Za-z0-9 /()_-]+:)(\s*)(.*)$/u;

export function stripHtml(value: string): string {
   return value
      .replaceAll(/<[^>]+>/g, '')
      .replaceAll(/\s+/g, ' ')
      .trim();
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
