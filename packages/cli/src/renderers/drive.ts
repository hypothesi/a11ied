import type { CliOutputEnvelope } from '@a11lied/contracts';

function formatCheckpoints(checkpoints?: Array<{ label: string }>): string {
   return checkpoints?.map((entry) => entry.label).join(', ') || 'none';
}

function buildDriveLines(args: {
   action: string;
   sessionId: string;
   target: string;
   detailLabel: string;
   detailValue: string;
   secondaryLabel: string;
   secondaryValue: string;
   logCursor: number;
   checkpoints: Array<{ label: string }> | undefined;
   verbose: boolean;
}): string[] {
   const lines = [
      `Action: ${args.action}`,
      `Session: ${args.sessionId}`,
      `Target: ${args.target}`,
      `${args.detailLabel}: ${args.detailValue}`,
      `${args.secondaryLabel}: ${args.secondaryValue}`,
      `Log cursor: ${args.logCursor}`,
   ];

   if (args.verbose) {
      lines.push(`Checkpoints: ${formatCheckpoints(args.checkpoints)}`);
   }

   return lines;
}

export function renderDriveSessionText(
   envelope: CliOutputEnvelope,
   _options: { verbose: boolean },
): string {
   const result = envelope.result as {
      session: {
         sessionId: string;
         target: string;
         startedAt: string;
         brokerPid: number;
         socketPath: string;
      };
   };

   return [
      `Session: ${result.session.sessionId}`,
      `Target: ${result.session.target}`,
      `Started: ${result.session.startedAt}`,
      `Broker PID: ${result.session.brokerPid}`,
      `Socket: ${result.session.socketPath}`,
   ].join('\n');
}

export function renderDriveStatusText(
   envelope: CliOutputEnvelope,
   options: { verbose: boolean },
): string {
   const result = envelope.result as {
      action: string;
      session: { sessionId: string; target: string };
      state: {
         lastSpokenPhrase: string | null;
         currentItemText: string | null;
         logCursor: number;
         checkpoints?: Array<{ label: string }>;
      };
   };

   const lines = buildDriveLines({
      action: result.action,
      sessionId: result.session.sessionId,
      target: result.session.target,
      detailLabel: 'Last spoken phrase',
      detailValue: result.state.lastSpokenPhrase ?? 'none',
      secondaryLabel: 'Current item text',
      secondaryValue: result.state.currentItemText ?? 'none',
      logCursor: result.state.logCursor,
      checkpoints: result.state.checkpoints,
      verbose: options.verbose,
   });

   return lines.join('\n');
}

export function renderDriveLogsText(
   envelope: CliOutputEnvelope,
   options: { verbose: boolean },
): string {
   const result = envelope.result as {
      action: string;
      session: { sessionId: string; target: string };
      state: {
         spokenPhraseLog: string[];
         itemTextLog: string[];
         logCursor: number;
         checkpoints?: Array<{ label: string }>;
      };
   };

   const lines = buildDriveLines({
      action: result.action,
      sessionId: result.session.sessionId,
      target: result.session.target,
      detailLabel: 'Spoken phrases',
      detailValue: result.state.spokenPhraseLog.join(' | ') || 'none',
      secondaryLabel: 'Item text',
      secondaryValue: result.state.itemTextLog.join(' | ') || 'none',
      logCursor: result.state.logCursor,
      checkpoints: result.state.checkpoints,
      verbose: options.verbose,
   });

   return lines.join('\n');
}
