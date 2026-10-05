import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { assessmentArtifactEnvelopeSchema } from '@a11ied/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { queueAssessmentCheck, registerAuditState } from '../audit/run-state.js';
import { getAssessmentCheckId, updateAuditRun } from '../audit/run-store.js';
import { appendEvidence, readEvidence } from '../evidence/store.js';
import {
   createEvidenceTestAssessment,
   type EvidenceTestFixture,
} from '../evidence/test-fixtures.js';
import { isVerifiedEvidence } from '../evidence/validation.js';
import { listApgRowKeys, listPendingApgRows, showApgExample } from './runtime.js';
import { getApgAssessmentRow, getApgExampleRowKeys } from './row-key.js';
import { runPatternCheck } from './check-runtime.js';
import { isPatternEvidenceComplete } from './outcomes.js';

const roots: string[] = [];
afterEach(async () => {
   await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
   );
});

async function replaceArtifact(
   fixture: EvidenceTestFixture,
   kind: string,
   content: unknown,
): Promise<void> {
   const artifact = fixture.record.provenance?.artifacts.find(
      (entry) => entry.kind === kind,
   );
   if (!artifact) {
      throw new Error('Missing pattern artifact fixture.');
   }
   const path = join(dirname(fixture.runFile), artifact.path);
   const envelope = assessmentArtifactEnvelopeSchema.parse(
      JSON.parse(await readFile(path, 'utf8')),
   );
   const body = JSON.stringify({ ...envelope, content });
   await writeFile(path, body);
   artifact.sha256 = createHash('sha256').update(body).digest('hex');
   fixture.record.recordedAt = new Date().toISOString();
}

async function createPatternFixture(): Promise<EvidenceTestFixture> {
   const fixture = await createEvidenceTestAssessment(['keyboard']);
   roots.push(dirname(fixture.runFile));
   fixture.run = await updateAuditRun({
      file: fixture.runFile,
      change(run) {
         const check = run.checks[0],
            environment = run.environments[0];
         if (!check || !environment) {
            throw new Error('Missing pattern check fixture.');
         }
         check.pointer = '#checkbox';
         check.patternRow = { exampleId: 'checkbox', rowKey: 'key-space[1]' };
         check.scope = 'element';
         check.checkId = getAssessmentCheckId(check);
         run.activeCheckId = check.checkId;
         return run;
      },
   });
   if (fixture.record.provenance) {
      fixture.record.provenance.checkId = fixture.run.activeCheckId ?? '';
   }
   fixture.record.test = {
      kind: 'patternRow',
      exampleId: 'checkbox',
      rowKey: 'key-space[1]',
   };
   fixture.record.pointer = '#checkbox';
   fixture.record.subjectHash = 'same-tree';
   await replaceArtifact(fixture, 'observation', {
      text: 'Space toggled the observed checkbox state.',
      pointer: '#checkbox',
   });
   await replaceArtifact(fixture, 'action-trace', [
      {
         index: 0,
         action: 'Press Space',
         request: { action: 'press', payload: { keys: ['Space'] } },
         at: fixture.record.provenance?.artifacts[0]?.capturedAt,
         stateId: 'initial',
         checkpoint: 'checked',
      },
   ]);
   return fixture;
}

async function listPending(fixture: EvidenceTestFixture): Promise<string[]> {
   const result = await listPendingApgRows({
      subject: fixture.record.subject,
      exampleId: 'checkbox',
      pointer: '#checkbox',
      subjectHash: 'same-tree',
      evidence: fixture,
   });
   return result.pending;
}

async function queueSecondState(fixture: EvidenceTestFixture): Promise<void> {
   await registerAuditState({
      file: fixture.runFile,
      state: {
         stateId: 'second',
         target: fixture.run.target,
         label: 'Another checkbox state',
         fingerprint: 'same-tree',
         environmentId: 'browser',
         setup: [],
         artifacts: [],
      },
   });
   const check = fixture.run.checks[0];
   if (!check) {
      throw new Error('Missing pattern check fixture.');
   }
   await queueAssessmentCheck({
      file: fixture.runFile,
      check: { ...check, stateIds: ['second'] },
   });
}

describe('APG row identities', () => {
   it('distinguishes table collisions and rejects their ambiguous legacy key', async () => {
      const { example } = showApgExample('toolbar'),
         allKeys = listApgRowKeys(example.id),
         keys = getApgExampleRowKeys(example);
      const checkboxIndex = example.keyboardTables.findIndex(
            (table) => table.name === 'Checkbox (Night Mode)',
         ),
         checkboxKey = keys.keyboard[checkboxIndex]?.[0],
         linkIndex = example.keyboardTables.findIndex(
            (table) => table.name === 'Link (Help)',
         ),
         linkKey = keys.keyboard[linkIndex]?.[0];
      if (!checkboxKey || !linkKey) {
         throw new Error('Missing colliding toolbar rows.');
      }

      expect(new Set(allKeys).size).toStrictEqual(allKeys.length);
      expect(checkboxKey).not.toStrictEqual(linkKey);
      expect(getApgAssessmentRow(example.id, checkboxKey)?.row).to.eql(
         example.keyboardTables[checkboxIndex]?.rows[0],
      );
      expect(getApgAssessmentRow(example.id, linkKey)?.row).to.eql(
         example.keyboardTables[linkIndex]?.rows[0],
      );
      expect(getApgAssessmentRow(example.id, 'test-not-required[0]')).toBeUndefined();
      const result = await runPatternCheck({
         load: {
            kind: 'html',
            html: '<main><div id="toolbar"><a href="#help">Help</a></div></main>',
         },
         subject: 'https://createdbyfireside.com/',
         exampleId: example.id,
         selector: '#toolbar',
         tableName: 'Link (Help)',
      });

      expect(result.keyboardRows[0]?.rowKey).toStrictEqual(linkKey);
   });
});

describe('APG assessment evidence', () => {
   it('requires the documented typed keypress and scoped widget observation', async () => {
      const fixture = await createPatternFixture();
      await appendEvidence(fixture.record, fixture);
      const records = await readEvidence(fixture);
      const record = records[0];

      expect(record && isVerifiedEvidence(record)).toStrictEqual(true);
      expect(await listPending(fixture)).not.toContain('key-space[1]');
      await replaceArtifact(fixture, 'action-trace', [
         {
            index: 0,
            action: 'Validate rendered markup',
            at: fixture.record.provenance?.artifacts[0]?.capturedAt,
            stateId: 'initial',
            checkpoint: 'checked',
         },
      ]);

      await expect(appendEvidence(fixture.record, fixture)).rejects.toThrow(
         'typed keypress',
      );
   });
   it('keeps a row pending when the same tree has another unassessed state', async () => {
      const fixture = await createPatternFixture();
      await appendEvidence(fixture.record, fixture);
      await queueSecondState(fixture);
      const records = await readEvidence(fixture);
      const record = records[0];
      if (!record) {
         throw new Error('Missing pattern evidence fixture.');
      }

      expect(
         isPatternEvidenceComplete({ record, records, subjectHash: 'same-tree' }),
      ).toStrictEqual(false);
      expect(await listPending(fixture)).toContain('key-space[1]');
   });
   it('keeps a judgment scoped to its pointer and current tree hash', async () => {
      const fixture = await createPatternFixture();
      await appendEvidence(fixture.record, fixture);
      const result = await listPendingApgRows({
         subject: fixture.record.subject,
         exampleId: 'checkbox',
         pointer: '#another',
         subjectHash: 'same-tree',
         evidence: fixture,
      });

      expect(result.pending).toContain('key-space[1]');
      expect(
         isPatternEvidenceComplete({
            record: fixture.record,
            records: [],
            subjectHash: 'changed-tree',
         }),
      ).toStrictEqual(false);
   });
});
