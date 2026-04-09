interface MockVerifyCriterionRow {
   criterionId: string;
   criterion: {
      id: string;
      title: string;
      level: string;
      wcagVersion: string;
   };
   verdict: string;
   evidenceMode: string;
   procedureIds: string[];
   applicability: {
      state: string;
      reasons: string[];
      signals: never[];
   };
   coverage: {
      coverageState: string;
      axeRuleIds: never[];
      actRuleIds: never[];
   };
   notes: never[];
   sourceReferences: never[];
   executionSteps: never[];
   evidence: never[];
   uncoveredWork: never[];
   errors: never[];
}

export function createRecordingSummary(): {
   totalCriteria: number;
   verdicts: Record<string, number>;
   evidenceModes: Record<string, number>;
   uncoveredCount: number;
   manualOnlyCount: number;
   failedCount: number;
} {
   return {
      totalCriteria: 1,
      verdicts: {
         pass: 1,
         fail: 0,
         'needs-manual-review': 0,
         'not-applicable': 0,
         'not-covered': 0,
         error: 0,
      },
      evidenceModes: {
         automated: 0,
         hybrid: 1,
         manual: 0,
         unknown: 0,
      },
      uncoveredCount: 0,
      manualOnlyCount: 0,
      failedCount: 0,
   };
}

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

function createMockVerifyCriterionRow(): MockVerifyCriterionRow {
   return {
      criterionId: '4.1.3',
      criterion: {
         id: '4.1.3',
         title: 'Status Messages',
         level: 'AA',
         wcagVersion: '2.2',
      },
      verdict: 'pass',
      evidenceMode: 'hybrid',
      procedureIds: ['status_message_probe'],
      applicability: {
         state: 'applicable',
         reasons: ['The page announces an async save result.'],
         signals: [],
      },
      coverage: {
         coverageState: 'partial',
         axeRuleIds: [],
         actRuleIds: [],
      },
      notes: [],
      sourceReferences: [],
      executionSteps: [],
      evidence: [],
      uncoveredWork: [],
      errors: [],
   };
}

export function createMockVerifyCriterionReport(
   baseUrl: string,
   cwd: string,
): {
   target: { kind: string; value: string; platform: string };
   wcagVersion: string;
   requestedScope: { kind: string; criterion: string };
   summary: ReturnType<typeof createRecordingSummary>;
   criteria: MockVerifyCriterionRow[];
   recording: {
      path: string;
      format: string;
      status: string;
      startedAt: string;
      stoppedAt: string;
   };
   warnings: never[];
   errors: never[];
} {
   return {
      target: {
         kind: 'url',
         value: `${baseUrl}/status-message.html`,
         platform: 'voiceover',
      },
      wcagVersion: '2.2',
      requestedScope: { kind: 'criterion', criterion: '4.1.3' },
      summary: createRecordingSummary(),
      criteria: [createMockVerifyCriterionRow()],
      recording: {
         path: `${cwd}/recordings/verify.mov`,
         format: 'mov',
         status: 'completed',
         startedAt: '2026-04-08T20:00:00.000Z',
         stoppedAt: '2026-04-08T20:00:01.000Z',
      },
      warnings: [],
      errors: [],
   };
}
