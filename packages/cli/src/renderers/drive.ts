import type { CliOutputEnvelope } from '#contracts';

interface DriveRecording {
   path: string;
   status: string;
   format: string;
}

interface DriveSessionInfo {
   sessionId: string;
   target: string;
   recording?: DriveRecording;
}

interface DriveStateWithCursor {
   logCursor: number;
   checkpoints?: Array<{ label: string }>;
}

interface DriveStatusState extends DriveStateWithCursor {
   lastSpokenPhrase: string | null;
   currentItemText: string | null;
}

interface DriveLogsState extends DriveStateWithCursor {
   spokenPhraseLog: string[];
   itemTextLog: string[];
}

interface DriveResult<TState extends DriveStateWithCursor> {
   action: string;
   session: DriveSessionInfo;
   state: TState;
   details?: {
      focus?: {
         status?: string;
         details?: string[];
      };
   };
}

function formatCheckpoints(checkpoints?: Array<{ label: string }>): string {
   return checkpoints?.map((entry) => entry.label).join(', ') || 'none';
}

function formatRecording(recording?: {
   path: string;
   status: string;
   format: string;
}): string {
   if (!recording) {
      return 'none';
   }

   return `${recording.status} ${recording.format} ${recording.path}`;
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

// Fallow-ignore-next-line unused-export
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
         recording?: { path: string; status: string; format: string };
      };
   };

   return [
      `Session: ${result.session.sessionId}`,
      `Target: ${result.session.target}`,
      `Started: ${result.session.startedAt}`,
      `Broker PID: ${result.session.brokerPid}`,
      `Socket: ${result.session.socketPath}`,
      `Recording: ${formatRecording(result.session.recording)}`,
   ].join('\n');
}

// Fallow-ignore-next-line unused-export
export function renderDriveStatusText(
   envelope: CliOutputEnvelope,
   options: { verbose: boolean },
): string {
   const result = envelope.result as unknown as DriveResult<DriveStatusState>;

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

   if (result.action === 'focus' && result.details?.focus) {
      const status = result.details.focus.status ?? 'unknown';
      lines.push(`Focus status: ${status}`);
      if (options.verbose && result.details.focus.details?.length) {
         lines.push(`Focus notes: ${result.details.focus.details.join(' | ')}`);
      }
   }
   lines.push(`Recording: ${formatRecording(result.session.recording)}`);

   return lines.join('\n');
}

// Fallow-ignore-next-line unused-export
export function renderDriveLogsText(
   envelope: CliOutputEnvelope,
   options: { verbose: boolean },
): string {
   const result = envelope.result as unknown as DriveResult<DriveLogsState>;

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
   lines.push(`Recording: ${formatRecording(result.session.recording)}`);

   return lines.join('\n');
}
