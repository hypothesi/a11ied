import chalk from 'chalk';
import { driverNavigateRequestSchema, type DriverActionResult } from '#contracts';
import { dim } from '../lib/format.js';

type Entry = [string, string];

function spoken(value: string | null | undefined): string {
   if (!value) {
      return dim('none');
   }
   return chalk.bold(value);
}

/** Lines for title, find, and table results. */
export function structureEntries(details: Record<string, unknown>): Entry[] {
   const entries: Entry[] = [];
   if (typeof details.title === 'string') {
      entries.push(['Title', spoken(details.title)]);
      entries.push(['Source', dim(String(details.source ?? ''))]);
   }
   if (typeof details.found === 'boolean') {
      entries.push(['Found', details.found ? 'yes' : 'no']);
   }
   if (typeof details.header === 'string') {
      entries.push(['Header', spoken(details.header)]);
   }
   if (typeof details.move === 'string' && details.moved === false) {
      entries.push(['Moved', `no (no cell in the ${String(details.move)} direction)`]);
   }
   return entries;
}

/** Lines for `sr wait`: what was waited for and how long it took. */
export function waitEntries(details: Record<string, unknown>): Entry[] {
   if (typeof details.waitedMs !== 'number') {
      return [];
   }
   const entries: Entry[] = [];
   if (typeof details.for === 'string') {
      entries.push(['Waited for', details.for]);
      entries.push(['Matched', details.matched === true ? 'yes' : 'no']);
   }
   entries.push(['Waited', `${String(details.waitedMs)} ms`]);
   return entries;
}

export function navigationEntries(result: DriverActionResult): Entry[] {
   if (result.details?.moved !== false || result.details.navigation === undefined) {
      return [];
   }
   const parsed = driverNavigateRequestSchema.safeParse(result.details.navigation);
   if (!parsed.success) {
      return [['Moved', 'no (the cursor stayed put)']];
   }
   const level =
      parsed.data.level === undefined ? '' : ` level ${String(parsed.data.level)}`;
   return [
      ['Moved', `no (no ${parsed.data.kind}${level} to jump to, the cursor stayed put)`],
   ];
}
