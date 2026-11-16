import { rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEvidenceTestAssessment } from './test-fixtures.js';
import { getMissingCapabilities } from './procedure-requirements.js';
import { resolveEvidenceProcedure } from './procedure-catalog.js';
import { validateMediaAbsence } from './media-absence.js';

describe('scoped media absence proof', () => {
   it('requires zero observed media and complete, matching state coverage', async () => {
      const fixture = await createEvidenceTestAssessment();
      try {
         const provenance = fixture.record.provenance;
         if (!provenance) {
            throw new Error('Missing fixture provenance.');
         }
         const context = { ...fixture, provenance };
         const observation = {
            stateId: 'initial',
            url: fixture.run.target.value,
            video: 0,
            audio: 0,
            embeds: 0,
            mediaPlays: 0,
            audioContexts: 0,
            uninspectedTrees: 0,
            method: 'Fixture DOM and playback inventory',
         };

         expect(() =>
            validateMediaAbsence({ observations: [observation] }, context),
         ).not.toThrow();
         for (const field of [
            'video',
            'audio',
            'embeds',
            'mediaPlays',
            'audioContexts',
            'uninspectedTrees',
         ]) {
            expect(() =>
               validateMediaAbsence(
                  { observations: [{ ...observation, [field]: 1 }] },
                  context,
               ),
            ).toThrow();
         }

         expect(() => validateMediaAbsence({ observations: [] }, context)).toThrow();
         expect(() =>
            validateMediaAbsence(
               { observations: [{ ...observation, stateId: 'another' }] },
               context,
            ),
         ).toThrow();
         expect(() =>
            validateMediaAbsence(
               { observations: [{ ...observation, url: 'https://other.test' }] },
               context,
            ),
         ).toThrow();
      } finally {
         await rm(dirname(fixture.runFile), { recursive: true, force: true });
      }
   });
});

describe('media evaluation capability boundary', () => {
   it('relaxes audio only for catalog-defined media absence', () => {
      const procedure = resolveEvidenceProcedure({ criterionId: '1.2.2' });
      const capabilities = ['rendered-ui', 'dom', 'keyboard'] as const;

      expect(
         getMissingCapabilities({ procedure, capabilities, isInapplicable: true }),
      ).to.eql([]);
      expect(getMissingCapabilities({ procedure, capabilities })).toContain('audio');
      expect(
         resolveEvidenceProcedure({ criterionId: '2.1.1' }).inapplicability,
      ).toBeUndefined();
   });
});
