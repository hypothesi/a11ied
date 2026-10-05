import { describe, expect, it } from 'vitest';
import { cliOutputEnvelopeSchema, type CliOutputEnvelope } from '@a11ied/contracts';
import { renderDriveReadText, renderDriveStatusText } from './drive.js';

const capturedAt = '2026-10-02T00:00:00.000Z';

function buildEnvelope(): CliOutputEnvelope {
   return cliOutputEnvelopeSchema.parse({
      ok: true,
      command: { family: 'sr', subcommand: 'read', version: '0.1.0' },
      warnings: [],
      errors: [],
      meta: {
         schemaVersion: '1',
         startedAt: capturedAt,
         completedAt: capturedAt,
         durationMs: 0,
      },
      result: {
         action: 'read',
         session: {
            sessionId: 'fixture',
            target: 'voiceover',
            targetType: 'real',
            startedAt: capturedAt,
            capabilities: ['read'],
            logCursor: 1,
            brokerPid: 1,
            socketPath: 'fixture',
            metadataFile: 'fixture',
         },
         state: {
            lastSpokenPhrase: 'Save, button',
            currentItemText: 'Save',
            spokenPhraseLog: ['Save, button'],
            itemTextLog: ['Save'],
            logCursor: 1,
            checkpoints: [],
            transcript: [],
            observations: {
               keyboardFocus: {
                  status: 'unavailable',
                  source: 'macos-ax',
                  reason: 'Accessibility permission denied',
                  code: 'keyboard-focus-query-failed',
               },
               readerCursorIdentity: {
                  status: 'unsupported',
                  source: 'voiceover',
                  reason: 'No native cursor element identity.',
               },
               targetIdentity: {
                  status: 'unavailable',
                  source: 'voiceover',
                  reason: 'No verified target binding.',
               },
            },
         },
      },
   });
}

describe('ordinary CLI observation diagnostics', () => {
   it.each([renderDriveReadText, renderDriveStatusText])(
      'preserves failures in %s',
      (render) => {
         const output = render(buildEnvelope(), { verbose: false });

         expect(output).toContain('Keyboard focus:');
         expect(output).toContain('Accessibility permission denied');
         expect(output).toContain('keyboard-focus-query-failed');
         expect(output).toContain('Reader cursor identity:');
         expect(output).toContain('No verified target binding.');
      },
   );
});
