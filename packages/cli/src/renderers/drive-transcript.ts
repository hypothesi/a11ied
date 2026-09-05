import { driverTranscriptSchema, type CliOutputEnvelope } from '#contracts';
import { formatTranscript } from '#core';
import { dim } from '../lib/format.js';

/** Renders `sr transcript` as the Markdown transcript plus the file it wrote, when any. */
export function renderDriveTranscriptText(
   envelope: CliOutputEnvelope,
   _options: { verbose: boolean },
): string {
   const parsed = driverTranscriptSchema.safeParse(envelope.result?.transcript);
   if (!parsed.success) {
      return 'No transcript available.';
   }
   const lines = [formatTranscript(parsed.data, 'md').trimEnd()];
   const file = envelope.result?.file;
   if (typeof file === 'object' && file !== null && 'path' in file) {
      lines.push('', dim(`Written to ${String(file.path)}`));
   }
   return lines.join('\n');
}
