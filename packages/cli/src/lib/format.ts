import chalk from 'chalk';
import stringWidth from 'string-width';
import wrapAnsi from 'wrap-ansi';
import type { DoctorTextStyle } from '#core';

const DEFAULT_WIDTH = 80;
const MAX_WIDTH = 110;
const INDENT = '  ';
const LABEL_GAP = 2;
const COLUMN_GAP = 2;
const ELLIPSIS = '…';

export const symbols = {
   pass: chalk.green('✓'),
   fail: chalk.red('✗'),
   warn: chalk.yellow('!'),
   skip: chalk.dim('-'),
   bullet: chalk.dim('•'),
} as const;

const stateColors: Readonly<Record<string, (text: string) => string>> = {
   applicable: chalk.green,
   unknown: chalk.magenta,
   'not-detected': chalk.dim,
   'out-of-scope': chalk.dim,
   ready: chalk.green,
   'requires-setup': chalk.yellow,
   unsupported: chalk.dim,
   automated: chalk.green,
   hybrid: chalk.yellow,
   manual: chalk.magenta,
   critical: chalk.red.bold,
   serious: chalk.red,
   moderate: chalk.yellow,
   minor: chalk.blue,
   pass: chalk.green.bold,
   fail: chalk.red.bold,
};

export function getTerminalWidth(): number {
   return Math.min(process.stdout.columns ?? DEFAULT_WIDTH, MAX_WIDTH);
}

export function title(text: string): string {
   return chalk.bold(text);
}

export function heading(text: string): string {
   return chalk.bold.cyan(text);
}

export function dim(text: string): string {
   return chalk.dim(text);
}

export function label(text: string): string {
   return chalk.cyan(text);
}

export function code(text: string): string {
   return chalk.yellow(text);
}

export function indent(lines: string[], depth = 1): string[] {
   return lines.map((line) => {
      if (!line) {
         return line;
      }
      return `${INDENT.repeat(depth)}${line}`;
   });
}

/** Wraps text to the terminal width, indenting every continuation line by the same amount. */
export function wrap(text: string, depth = 0, width = getTerminalWidth()): string[] {
   const usable = width - INDENT.length * depth;
   return indent(wrapAnsi(text, usable, { hard: false, trim: true }).split('\n'), depth);
}

export function badge(state: string): string {
   const colorize = stateColors[state] ?? chalk.white;
   return colorize(state);
}

export function level(wcagLevel: string): string {
   return chalk.dim(`[${wcagLevel}]`);
}

export function count(total: number, singular: string, plural = `${singular}s`): string {
   if (total === 1) {
      return `1 ${singular}`;
   }
   return `${total} ${plural}`;
}

/** Truncates to a printed width, counting what the terminal shows, not escape codes. */
function clip(text: string, width: number): string {
   if (stringWidth(text) <= width) {
      return text;
   }
   let out = '';
   for (const character of text) {
      if (stringWidth(out + character) > width - 1) {
         break;
      }
      out += character;
   }
   return `${out}${ELLIPSIS}`;
}

function padCell(text: string, width: number): string {
   return `${text}${' '.repeat(Math.max(0, width - stringWidth(text)))}`;
}

function columnWidths(headers: string[], rows: string[][], caps: number[]): number[] {
   return headers.map((header, index) => {
      const widest = Math.max(
         stringWidth(header),
         ...rows.map((row) => stringWidth(row[index] ?? '')),
      );
      const cap = caps[index];
      return cap === undefined ? widest : Math.min(widest, cap);
   });
}

/**
 * Renders a column-aligned table with a dim header row. Cells may carry color, because
 * widths count printed characters rather than escape codes. `caps` limits a column's
 * width, and anything longer is clipped.
 */
export function table(
   headers: string[],
   rows: string[][],
   caps: number[] = [],
): string[] {
   const widths = columnWidths(headers, rows, caps);

   function line(cells: string[]): string {
      return cells
         .map((cell, index) =>
            padCell(clip(cell, widths[index] ?? 0), widths[index] ?? 0),
         )
         .join(' '.repeat(COLUMN_GAP))
         .trimEnd();
   }

   return [dim(line(headers)), ...rows.map((row) => line(row))];
}

/** Renders aligned "Label: value" rows with a shared label column. */
export function fields(entries: Array<[label: string, value: string]>): string[] {
   const width =
      Math.max(...entries.map(([entryLabel]) => entryLabel.length + 1)) + LABEL_GAP;
   return entries.map(
      ([entryLabel, value]) => `${label(`${entryLabel}:`.padEnd(width))}${value}`,
   );
}

export function section(name: string, body: string[]): string[] {
   return ['', heading(name), ...indent(body)];
}

/** Prefixes the first wrapped line and indents the rest to hang under it. */
function hangingItem(text: string, prefix: string): string[] {
   const continuation = ' '.repeat(prefix.length);
   return wrap(text).map((line, index) => {
      if (index === 0) {
         return `${prefix}${line}`;
      }
      return `${continuation}${line}`;
   });
}

export function listItems(items: string[], emptyText = 'none'): string[] {
   if (items.length === 0) {
      return [dim(emptyText)];
   }
   return items.flatMap((item) => hangingItem(item, `${symbols.bullet} `));
}

export function numberedItems(items: string[], emptyText = 'none'): string[] {
   if (items.length === 0) {
      return [dim(emptyText)];
   }
   const width = String(items.length).length;
   return items.flatMap((item, index) => {
      const number = dim(`${String(index + 1).padStart(width)}.`);
      return hangingItem(item || dim('(empty)'), `${number} `);
   });
}

export function warningLine(message: string): string {
   return `${symbols.warn} ${chalk.yellow(message)}`;
}

export function errorLine(errorCode: string, message: string): string {
   return `${symbols.fail} ${chalk.red.bold('Error')} ${chalk.red(`(${errorCode})`)}: ${message}`;
}

export const doctorTextStyle: DoctorTextStyle = {
   pass: chalk.green,
   fail: chalk.red,
   warn: chalk.yellow,
   skip: chalk.dim,
   heading,
   dim,
   command: code,
};
