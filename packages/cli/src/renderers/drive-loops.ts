import {
   driverActionResultSchema,
   driverLoopItemSchema,
   driverLoopStopSchema,
   type CliOutputEnvelope,
   type DriverLoopItem,
} from '#contracts';
import { count, dim, numberedItems, title } from '../lib/format.js';
import { verdictLines } from './drive.js';

function describeLoopItem(item: DriverLoopItem): string {
   if (!item.role) {
      return item.phrase;
   }
   const level = item.level === undefined ? '' : ` level ${String(item.level)}`;
   const name = item.name ? `: ${item.name}` : '';
   return `${item.role}${level}${name}  ${dim(item.phrase)}`;
}

function parseLoopItems(value: unknown): DriverLoopItem[] {
   const parsed = driverLoopItemSchema.array().safeParse(value);
   return parsed.success ? parsed.data : [];
}

/** One line that says why the loop stopped: the end of the page or the cap. */
function stopLine(details: Record<string, unknown>): string {
   const stoppedAt = driverLoopStopSchema.safeParse(details.stoppedAt);
   const max = typeof details.max === 'number' ? details.max : undefined;
   if (stoppedAt.success && stoppedAt.data === 'cap') {
      return dim(
         `Stopped at the cap of ${String(max ?? '?')} items; raise --max to see more.`,
      );
   }
   if (stoppedAt.success && stoppedAt.data === 'match') {
      return dim('Stopped at the match.');
   }
   return dim('Stopped at the end of the document.');
}

/** Text for `sr elements <kind>`: the rotor list as the reader announced it. */
export function renderDriveElementsText(
   envelope: CliOutputEnvelope,
   _options: { verbose: boolean },
): string {
   const parsed = driverActionResultSchema.safeParse(envelope.result);
   if (!parsed.success || !parsed.data.details) {
      return 'No result.';
   }
   const { details, session } = parsed.data;
   const items = parseLoopItems(details.items);
   const kind = String(details.kind ?? 'item');
   return [
      `${title(`sr elements ${kind}`)}  ${session.target}`,
      `${count(items.length, `${kind} element`)} from the top of the page.`,
      '',
      ...numberedItems(items.map((item) => describeLoopItem(item))),
      '',
      stopLine(details),
      ...verdictLines(envelope),
   ].join('\n');
}

/** Text for `sr read-all` and `sr walk`: every phrase in order, then why it stopped. */
export function renderDriveReadAllText(
   envelope: CliOutputEnvelope,
   _options: { verbose: boolean },
): string {
   const parsed = driverActionResultSchema.safeParse(envelope.result);
   if (!parsed.success || !parsed.data.details) {
      return 'No result.';
   }
   const { details, session } = parsed.data;
   const items = parseLoopItems(details.items);
   const commandLine = envelope.result?.commandLine;
   const heading =
      typeof commandLine === 'string' ? commandLine : envelope.command.subcommand;
   return [
      `${title(`sr ${heading}`)}  ${session.target}`,
      `${count(items.length, 'phrase')} from the cursor onward.`,
      '',
      ...numberedItems(items.map((item) => item.phrase)),
      '',
      stopLine(details),
      ...verdictLines(envelope),
   ].join('\n');
}
