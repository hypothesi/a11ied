import { mediaInventorySchema } from '@a11ied/contracts';
import { z } from 'zod';
import type { EvidenceArtifactContext } from './artifacts.js';

const absenceSchema = z.object({
   observations: z
      .array(
         mediaInventorySchema.extend({
            stateId: z.string().min(1),
            video: z.literal(0),
            audio: z.literal(0),
            embeds: z.literal(0),
            mediaPlays: z.literal(0),
            audioContexts: z.literal(0),
            uninspectedTrees: z.literal(0),
         }),
      )
      .min(1),
});

export function validateMediaAbsence(
   content: unknown,
   context: EvidenceArtifactContext,
): void {
   const { observations } = absenceSchema.parse(content);
   const { provenance, run } = context;
   if (
      observations.length !== provenance.states.length ||
      observations.some((observation, index) => {
         const reference = provenance.states[index];
         const state = run.states.find((entry) => entry.stateId === reference?.stateId);
         return (
            observation.stateId !== reference?.stateId ||
            observation.url !== state?.target.value
         );
      })
   ) {
      throw new Error(
         'Media absence must cover every observed state and its actual URL in order.',
      );
   }
}
