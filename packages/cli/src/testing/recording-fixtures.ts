import type { AccessibilityDriverSession } from '#contracts';

export function createMockDriveSession(stateDir: string): AccessibilityDriverSession {
   return {
      sessionId: 'drv_recording',
      target: 'voiceover',
      targetType: 'real',
      startedAt: '2026-04-08T20:00:00.000Z',
      capabilities: ['start', 'stop', 'status'],
      logCursor: 0,
      brokerPid: 123,
      socketPath: 'in-memory://drv_recording',
      metadataFile: `${stateDir}/session.json`,
      recording: {
         path: `${process.cwd()}/recordings/voiceover.mov`,
         format: 'mov',
         status: 'active',
         startedAt: '2026-04-08T20:00:00.000Z',
      },
   };
}
