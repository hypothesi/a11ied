import chalk from 'chalk';
import wrapAnsi from 'wrap-ansi';
import type { DoctorTextStyle } from '#core';

const DEFAULT_WIDTH = 80;
const MAX_WIDTH = 110;
const INDENT = '  ';
const LABEL_GAP = 2;

export const symbols = {
   pass: chalk.green('✓'),
   fail: chalk.red('✗'),
   warn: chalk.yellow('!'),
   skip: chalk.dim('-'),
   bullet: chalk.dim('•'),
} as const;

const stateColors: Readonly<Record<string, (text: string) => string>> = {
   applicable: chalk.green,
   'likely-applicable': chalk.yellow,
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
export function wrap(text: string, depth = 0): string[] {
   const width = getTerminalWidth() - INDENT.length * depth;
   return indent(wrapAnsi(text, width, { hard: false, trim: true }).split('\n'), depth);
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
