import chalk from 'chalk';

const ERROR_CODE_INDEX = 1;
const ERROR_MESSAGE_INDEX = 2;
const FIELD_LABEL_INDEX = 1;
const FIELD_SPACING_INDEX = 2;
const FIELD_VALUE_INDEX = 3;
const ERROR_LINE = /^Error \(([^)]+)\): (.+)$/u;
const FIELD_LINE = /^([A-Z][A-Za-z0-9 /()_-]+:)(\s*)(.*)$/u;

export function stripHtml(value: string): string {
   return value
      .replaceAll(/<[^>]+>/g, '')
      .replaceAll(/\s+/g, ' ')
      .trim();
}

function styleFieldValue(label: string, value: string): string {
   if (!value) {
      return value;
   }

   if (label === 'Recording:' && value === 'none') {
      return chalk.dim(value);
   }

   if ((label === 'Session:' || label === 'Session ID:') && value.startsWith('drv_')) {
      return chalk.greenBright(value);
   }

   if (label === 'Target:') {
      return chalk.magentaBright(value);
   }

   return value;
}

function styleCommandLine(line: string): string {
   if (!line) {
      return line;
   }

   const errorMatch = ERROR_LINE.exec(line);

   if (errorMatch) {
      return `${chalk.redBright('Error')} ${chalk.red(`(${errorMatch[ERROR_CODE_INDEX]})`)}: ${errorMatch[ERROR_MESSAGE_INDEX]}`;
   }

   if (line.endsWith(':')) {
      return chalk.bold(line);
   }

   const fieldMatch = FIELD_LINE.exec(line);

   if (fieldMatch) {
      const label = fieldMatch[FIELD_LABEL_INDEX] ?? '',
         spacing = fieldMatch[FIELD_SPACING_INDEX] ?? '',
         value = fieldMatch[FIELD_VALUE_INDEX] ?? '';

      return `${chalk.cyan(label)}${spacing}${styleFieldValue(label, value)}`;
   }

   if (line === 'Drive session ready') {
      return chalk.bold.green(line);
   }

   return line;
}

export function styleCommandText(value: string): string {
   return value
      .split('\n')
      .map((line) => styleCommandLine(line))
      .join('\n');
}
