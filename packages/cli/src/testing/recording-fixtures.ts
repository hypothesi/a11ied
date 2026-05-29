export function createMockDriveSession(cwd: string): {
   sessionId: string;
   target: string;
   startedAt: string;
   capabilities: string[];
   logCursor: number;
   brokerPid: number;
   socketPath: string;
   metadataFile: string;
   recording: {
      path: string;
      format: string;
      status: string;
      startedAt: string;
   };
} {
   return {
      sessionId: 'drv_recording',
      target: 'voiceover',
      startedAt: '2026-04-08T20:00:00.000Z',
      capabilities: ['start', 'stop', 'status'],
      logCursor: 0,
      brokerPid: 123,
      socketPath: 'in-memory://drv_recording',
      metadataFile: `${cwd}/.a11ied/state/sessions/drv_recording.json`,
      recording: {
         path: `${cwd}/recordings/voiceover.mov`,
         format: 'mov',
         status: 'active',
         startedAt: '2026-04-08T20:00:00.000Z',
      },
   };
}

export function createMockPatternResult(
   baseUrl: string,
   cwd: string,
): {
   patternId: string;
   url: string;
   target: string;
   sessionId: string;
   managedSession: boolean;
   recording: {
      path: string;
      format: string;
      status: string;
      startedAt: string;
      stoppedAt: string;
   };
   stepLog: never[];
   spokenPhraseLog: never[];
   itemTextLog: never[];
   assertions: never[];
   targetMetadata: Record<string, never>;
   browserEvidence: never[];
} {
   return {
      patternId: 'landmark_sequence',
      url: `${baseUrl}/basic-page.html`,
      target: 'voiceover',
      sessionId: 'drv_pattern_recording',
      managedSession: true,
      recording: {
         path: `${cwd}/recordings/pattern.mov`,
         format: 'mov',
         status: 'completed',
         startedAt: '2026-04-08T20:00:00.000Z',
         stoppedAt: '2026-04-08T20:00:01.000Z',
      },
      stepLog: [],
      spokenPhraseLog: [],
      itemTextLog: [],
      assertions: [],
      targetMetadata: {},
      browserEvidence: [],
   };
}
