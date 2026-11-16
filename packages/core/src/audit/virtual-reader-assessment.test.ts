import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getTestMethod, listCriteriaByLevel } from '@a11ied/wcag-engine';
import { describe, expect, it } from 'vitest';
import { startAuditAssessment, nextAuditAssessment } from './run-lifecycle.js';
import { registerAuditState } from './run-state.js';

const WCAG_21_A_AA_COUNT = 50,
   WCAG_22_A_AA_COUNT = 55;

describe('virtual reader assessment scheduling', () => {
   it('claims reader procedures using the explicit screen-reader capability', async () => {
      const root = await mkdtemp(join(tmpdir(), 'a11ied-virtual-audit-'));
      const target = { kind: 'url' as const, value: 'https://example.com/' };
      try {
         const { file } = await startAuditAssessment({
            file: join(root, 'run.json'),
            target,
            scope: 'page',
            profile: { wcagVersion: '2.2', level: 'AA' },
            environment: {
               environmentId: 'virtual',
               platform: 'virtual',
               os: 'fixture',
               capabilities: ['rendered-ui', 'keyboard', 'screen-reader', 'speech'],
               limitations: ['Does not verify native reader behavior.'],
            },
         });
         await registerAuditState({
            file,
            state: {
               stateId: 'initial',
               target,
               label: 'Initial',
               fingerprint: 'observed',
               environmentId: 'virtual',
               setup: [],
               artifacts: [],
            },
         });
         const browserOnly = await nextAuditAssessment(file, {
            excludeCapabilities: ['screen-reader', 'real-reader', 'speech'],
         });

         expect(browserOnly.checks).toBeUndefined();
         const { checks, procedures } = await nextAuditAssessment(file);
         const check = checks?.[0],
            procedure = procedures?.[0];

         expect(check?.criterionId).toBe('1.3.2');
         expect(check?.status).toBe('running');
         expect(procedure?.requiredCapabilities).toContain('screen-reader');
      } finally {
         await rm(root, { recursive: true, force: true });
      }
   });
});

describe('A and AA reader coverage', () => {
   it.each(['2.1', '2.2'])(
      'provides executable reader-neutral procedures across WCAG %s A and AA',
      (version) => {
         const criteria = ['A', 'AA'].flatMap(
            (level) => listCriteriaByLevel(level, version).criteria,
         );
         expect(criteria).toHaveLength(
            version === '2.2' ? WCAG_22_A_AA_COUNT : WCAG_21_A_AA_COUNT,
         );
         for (const criterion of criteria) {
            const { strategy } = getTestMethod(criterion.id, { version });

            expect(strategy.coverageGap).toBeUndefined();
            expect(
               strategy.procedures.some(
                  (procedure) => procedure.procedureId !== 'axe_scan',
               ),
            ).toStrictEqual(true);
            expect(
               strategy.procedures.flatMap((procedure) => procedure.requiredCapabilities),
            ).not.toContain('real-reader');
         }
      },
   );
});
