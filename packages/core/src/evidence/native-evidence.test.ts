import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { assessmentArtifactEnvelopeSchema } from '@a11ied/contracts';
import type { z } from 'zod';
import { afterEach, describe, expect, it } from 'vitest';
import {
   createEvidenceTestAssessment,
   type EvidenceTestFixture,
} from './test-fixtures.js';
import { validateEvidenceRecord } from './validation.js';
import { appendEvidence } from './store.js';
import { validateNativeSpeech } from './native-evidence.js';

const roots: string[] = [];
afterEach(async () => {
   await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
   );
});

async function createNativeEvidence(sessionId?: string): Promise<EvidenceTestFixture> {
   const fixture = await createEvidenceTestAssessment(['real-reader'], {
         extraArtifacts: ['speech'],
      }),
      provenance = fixture.record.provenance;
   if (!provenance) {
      throw new Error('Missing fixture provenance.');
   }
   provenance.source = 'real-reader';
   provenance.sessionId = sessionId;
   fixture.record.evidenceId = 'native-source-fixture';
   roots.push(dirname(fixture.runFile));
   await Promise.all(
      provenance.artifacts.map(async (artifact) => {
         const path = join(dirname(fixture.runFile), artifact.path);
         const envelope = assessmentArtifactEnvelopeSchema.parse(
            JSON.parse(await readFile(path, 'utf8')),
         );
         envelope.source = 'real-reader';
         envelope.sessionId = sessionId;
         if (artifact.kind === 'speech') {
            envelope.content = {
               text: 'Fixture, button',
               transcript: {
                  sessionId,
                  target: 'voiceover',
                  url: fixture.run.target.value,
                  startedAt: fixture.run.startedAt,
                  exportedAt: envelope.capturedAt,
                  entries: [
                     { index: 0, at: envelope.capturedAt, phrase: 'Fixture, button' },
                  ],
               },
            };
         }
         const body = JSON.stringify(envelope);
         await writeFile(path, body);
         artifact.sha256 = createHash('sha256').update(body).digest('hex');
      }),
   );
   return fixture;
}

async function changeSpeechReceipt(
   fixture: EvidenceTestFixture,
   content: z.infer<typeof assessmentArtifactEnvelopeSchema>['content'],
): Promise<void> {
   const artifact = fixture.record.provenance?.artifacts.find(
      (entry) => entry.kind === 'speech',
   );
   if (!artifact) {
      throw new Error('Missing speech artifact.');
   }
   const path = join(dirname(fixture.runFile), artifact.path);
   const envelope = assessmentArtifactEnvelopeSchema.parse(
      JSON.parse(await readFile(path, 'utf8')),
   );
   envelope.content = content;
   const body = JSON.stringify(envelope);
   await writeFile(path, body);
   artifact.sha256 = createHash('sha256').update(body).digest('hex');
}

describe('observed native evidence', () => {
   it('rejects speech text without a correlated native transcript', async () => {
      const fixture = await createNativeEvidence('observed-reader-session');
      await changeSpeechReceipt(fixture, 'Markup validator found no parsing errors.');
      const validated = await validateEvidenceRecord(fixture.record, fixture);

      expect(validated.verification?.status).toBe('unverified');
   });

   it('rejects real-reader evidence without a session identity', async () => {
      const fixture = await createNativeEvidence();
      const validated = await validateEvidenceRecord(fixture.record, fixture);

      expect(validated.verification?.status).toBe('unverified');
      expect(validated.verification?.reasons.join(' ')).toContain('session ID');
      await expect(appendEvidence(fixture.record, fixture)).rejects.toThrow('session ID');
   });

   it.each(['wrong-session', 'virtual'])(
      'rejects mismatched native transcript identity: %s',
      async (identity) => {
         const fixture = await createNativeEvidence('observed-reader-session');
         await changeSpeechReceipt(fixture, {
            text: 'Fixture, button',
            transcript: {
               sessionId:
                  identity === 'wrong-session' ? identity : 'observed-reader-session',
               target: identity === 'virtual' ? identity : 'voiceover',
               url: fixture.run.target.value,
               startedAt: fixture.run.startedAt,
               exportedAt: fixture.record.recordedAt,
               entries: [
                  { index: 0, at: fixture.record.recordedAt, phrase: 'Fixture, button' },
               ],
            },
         });
         const validated = await validateEvidenceRecord(fixture.record, fixture);

         expect(validated.verification?.status).toBe('unverified');
         expect(validated.verification?.reasons.join(' ')).toContain('Native speech');
      },
   );

   it('accepts matching native session, speech and action artifacts without claiming cursor isolation', async () => {
      const fixture = await createNativeEvidence('observed-reader-session'),
         validated = await validateEvidenceRecord(fixture.record, fixture);

      expect(validated.verification?.status).toBe('verified');
      await expect(appendEvidence(fixture.record, fixture)).resolves.toBeDefined();
   });
});

describe('native session recovery and site states', () => {
   it('accepts a subpage receipt from a session started during the check', async () => {
      const fixture = await createNativeEvidence('recovered-session'),
         provenance = fixture.record.provenance,
         state = fixture.run.states[0];
      if (!provenance || !state) {
         throw new Error('Missing fixture state.');
      }
      state.target = { kind: 'url', value: 'https://createdbyfireside.com/contact' };
      const at = provenance.artifacts[0]?.capturedAt ?? fixture.record.recordedAt;

      expect(() =>
         validateNativeSpeech({
            run: fixture.run,
            provenance,
            capturedAt: at,
            content: {
               text: 'Contact, heading',
               transcript: {
                  sessionId: 'recovered-session',
                  target: 'voiceover',
                  url: state.target.value,
                  startedAt: at,
                  exportedAt: at,
                  entries: [{ index: 0, at, phrase: 'Contact, heading' }],
               },
            },
         }),
      ).not.toThrow();
   });
});
