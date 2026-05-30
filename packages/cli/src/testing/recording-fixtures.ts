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
