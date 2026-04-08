import type { CliOutputEnvelope } from '@a11lied/contracts';

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

   const lines = [
      `Action: ${result.action}`,
      `Session: ${result.session.sessionId}`,
      `Target: ${result.session.target}`,
      `Last spoken phrase: ${result.state.lastSpokenPhrase ?? 'none'}`,
      `Current item text: ${result.state.currentItemText ?? 'none'}`,
      `Log cursor: ${result.state.logCursor}`,
   ];

   if (options.verbose) {
      lines.push(
         `Checkpoints: ${result.state.checkpoints?.map((entry) => entry.label).join(', ') || 'none'}`,
      );
   }

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

   const lines = [
      `Action: ${result.action}`,
      `Session: ${result.session.sessionId}`,
      `Target: ${result.session.target}`,
      `Spoken phrases: ${result.state.spokenPhraseLog.join(' | ') || 'none'}`,
      `Item text: ${result.state.itemTextLog.join(' | ') || 'none'}`,
      `Log cursor: ${result.state.logCursor}`,
   ];

   if (options.verbose) {
      lines.push(
         `Checkpoints: ${result.state.checkpoints?.map((entry) => entry.label).join(', ') || 'none'}`,
      );
   }

   return lines.join('\n');
}
