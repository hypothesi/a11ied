import chalk from 'chalk';
import stringWidth from 'string-width';
import wrapAnsi from 'wrap-ansi';
import type { DoctorTextStyle } from '#core';

const DEFAULT_WIDTH = 80;
const MAX_WIDTH = 110;
const INDENT = '  ';
const LABEL_GAP = 2;
const COLUMN_GAP = 2;

export const symbols = {
   pass: chalk.green('✓'),
   fail: chalk.red('✗'),
   warn: chalk.yellow('!'),
   skip: chalk.dim('-'),
   bullet: chalk.dim('•'),
} as const;

const stateColors: Readonly<Record<string, (text: string) => string>> = {
   relevant: chalk.green,
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

/** The least room the last column keeps on a narrow terminal. */
const MIN_LAST_COLUMN = 24;

/** Breaks one cell into lines no wider than its column, cutting a long token if it must. */
function wrapCell(text: string, width: number): string[] {
   if (width <= 0 || stringWidth(text) <= width) {
      return [text];
   }
   return wrapAnsi(text, width, { hard: true, trim: true }).split('\n');
}

/** Shrinks the last column so the whole table fits the terminal, indented once. */
function fitToTerminal(widths: number[]): number[] {
   const last = widths.length - 1;
   let taken = INDENT.length + COLUMN_GAP * last;
   for (const width of widths.slice(0, last)) {
      taken += width;
   }
   const room = Math.max(MIN_LAST_COLUMN, getTerminalWidth() - taken);
   return widths.map((width, index) => (index === last ? Math.min(width, room) : width));
}

/**
 * Renders a column-aligned table with a dim header row. Cells may carry color, because
 * widths count printed characters rather than escape codes. `caps` limits a column's
 * width, and the last column shrinks to fit the terminal. A cell longer than its column
 * wraps onto further lines under that column, so nothing is cut short.
 */
export function table(
   headers: string[],
   rows: string[][],
   caps: number[] = [],
): string[] {
   const widths = fitToTerminal(columnWidths(headers, rows, caps));
   const gap = ' '.repeat(COLUMN_GAP);

   function lines(cells: string[]): string[] {
      const wrapped = cells.map((cell, index) => wrapCell(cell, widths[index] ?? 0));
      const height = Math.max(...wrapped.map((cellLines) => cellLines.length));
      const out: string[] = [];
      for (let lineIndex = 0; lineIndex < height; lineIndex += 1) {
         out.push(
            wrapped
               .map((cellLines, index) =>
                  padCell(cellLines[lineIndex] ?? '', widths[index] ?? 0),
               )
               .join(gap)
               .trimEnd(),
         );
      }
      return out;
   }

   return [
      ...lines(headers).map((line) => dim(line)),
      ...rows.flatMap((row) => lines(row)),
   ];
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

const LIST_ITEM = /^(?<indent>\s*)(?<marker>[-*]|\d+\.)\s+(?<text>.*)$/u;
const MARKDOWN_HEADING = /^#{1,6}\s+(?<text>.*)$/u;
/** Turndown indents a nested list item by four spaces. */
const NESTED_LIST_INDENT = 4;

interface ListItem {
   level: number;
   /** A bullet, or the number the Markdown gave the item. */
   marker: string;
   text: string;
}

/** One item, wrapped to the terminal, with its continuation lines hanging under the text. */
function itemLines(item: ListItem, depth: number): string[] {
   const lead = INDENT.repeat(depth),
      prefix = `${item.marker} `;
   return wrap(item.text, depth + 1).map((line, index) => {
      /* Printed width, because a colored bullet is longer than the one column it takes. */
      const hang = index === 0 ? prefix : ' '.repeat(stringWidth(prefix));
      return `${lead}${hang}${line.trimStart()}`;
   });
}

function listLines(block: string, depth: number): string[] {
   const items: ListItem[] = [];
   for (const line of block.split('\n')) {
      const match = LIST_ITEM.exec(line);
      const last = items.at(-1);
      if (match?.groups) {
         const marker = match.groups.marker ?? '';
         items.push({
            level: Math.floor((match.groups.indent ?? '').length / NESTED_LIST_INDENT),
            marker: marker.endsWith('.') ? marker : symbols.bullet,
            text: match.groups.text ?? '',
         });
      } else if (last) {
         last.text = `${last.text} ${line.trim()}`;
      }
   }
   return items.flatMap((item) => itemLines(item, depth + item.level));
}

function markdownBlockLines(block: string, depth: number): string[] {
   const headingMatch = MARKDOWN_HEADING.exec(block);
   if (headingMatch?.groups) {
      return indent([heading(headingMatch.groups.text ?? '')], depth);
   }
   if (LIST_ITEM.test(block.split('\n')[0] ?? '')) {
      return listLines(block, depth);
   }
   return wrap(block.replaceAll(/\s*\n\s*/gu, ' '), depth);
}

/**
 * Prints Markdown the way the rest of the output reads: headings in the heading color,
 * list items as wrapped bullets, and paragraphs wrapped to the terminal. Links stay as
 * written, so a reader can follow them.
 */
export function markdownLines(markdown: string, depth = 0): string[] {
   const blocks = markdown
      .split(/\n\s*\n/u)
      .map((block) => block.trim())
      .filter((block) => block.length > 0);
   const lines: string[] = [];
   for (const [index, block] of blocks.entries()) {
      if (index > 0) {
         lines.push('');
      }
      lines.push(...markdownBlockLines(block, depth));
   }
   return lines;
}
