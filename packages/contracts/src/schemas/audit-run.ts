import { z } from 'zod';

import { platformSchema, wcagLevelSchema, wcagVersionSchema } from './core.js';
import { targetReferenceSchema } from './query.js';
import { evidenceOutcomeSchema } from './evidence.js';
import { criterionIdSchema } from './wcag.js';
import { assessmentCapabilitySchema, assessmentScopeSchema } from './assessment.js';

export const auditProfileSchema = z.object({
   wcagVersion: wcagVersionSchema,
   level: wcagLevelSchema,
});
export const auditRunIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u);

export const auditEnvironmentSchema = z.object({
   environmentId: z.string().min(1),
   platform: platformSchema,
   os: z.string().min(1),
   browser: z.string().min(1).optional(),
   readerVersion: z.string().min(1).optional(),
   capabilities: z.array(assessmentCapabilitySchema),
   limitations: z.array(z.string().min(1)),
});
export type AuditEnvironment = z.infer<typeof auditEnvironmentSchema>;

export const auditStateSchema = z.object({
   stateId: z.string().min(1),
   target: targetReferenceSchema,
   label: z.string().min(1),
   fingerprint: z.string().min(1),
   revision: z.number().int().positive(),
   environmentId: z.string().min(1),
   observedAt: z.string().datetime(),
   artifacts: z.array(z.string().min(1)),
   setup: z.array(z.string().min(1)),
});
export type AuditState = z.infer<typeof auditStateSchema>;

export const auditJourneySchema = z.object({
   journeyId: z.string().min(1),
   label: z.string().min(1),
   stateIds: z.array(z.string().min(1)).min(1),
   status: z.enum(['discovered', 'completed', 'blocked']),
   reason: z.string().min(1).optional(),
});
export type AuditJourney = z.infer<typeof auditJourneySchema>;

export const assessmentCheckSchema = z
   .object({
      checkId: z.string().min(1),
      criterionId: criterionIdSchema,
      procedureId: z.string().min(1),
      procedureVersion: z.string().min(1),
      patternRow: z
         .object({ exampleId: z.string().min(1), rowKey: z.string().min(1) })
         .optional(),
      scope: assessmentScopeSchema,
      pointer: z.string().min(1).optional(),
      stateIds: z.array(z.string().min(1)),
      journeyId: z.string().min(1).optional(),
      environmentId: z.string().min(1),
      status: z.enum([
         'queued',
         'running',
         'evaluated',
         'blocked',
         'unsupported',
         'stale',
      ]),
      attempts: z.number().int().nonnegative(),
      attemptStartedAt: z.string().datetime().optional(),
      outcome: evidenceOutcomeSchema.optional(),
      evidenceIds: z.array(z.string().min(1)),
      reason: z.string().min(1).optional(),
      updatedAt: z.string().datetime(),
   })
   .superRefine((check, context) => {
      if ((check.scope === 'component' || check.scope === 'element') && !check.pointer) {
         context.addIssue({
            code: 'custom',
            message: 'Component and element checks require an element identity.',
         });
      }
      if (
         (check.scope === 'journey' && !check.journeyId) ||
         (check.scope !== 'site' && check.stateIds.length === 0)
      ) {
         context.addIssue({
            code: 'custom',
            message: 'The check requires references for its assessment scope.',
         });
      }
      if (check.patternRow && !check.pointer) {
         context.addIssue({
            code: 'custom',
            message: 'An APG row check requires a widget pointer.',
         });
      }
      if (
         check.status === 'evaluated' &&
         (!check.outcome || check.evidenceIds.length === 0)
      ) {
         context.addIssue({
            code: 'custom',
            message: 'An evaluated check requires an outcome and evidence references.',
         });
      }
      if (
         (check.status === 'blocked' || check.status === 'unsupported') &&
         !check.reason
      ) {
         context.addIssue({
            code: 'custom',
            message: 'A blocked or unsupported check requires a reason.',
         });
      }
   });
export type AssessmentCheck = z.infer<typeof assessmentCheckSchema>;

const auditRunFieldsSchema = z.object({
   version: z.literal('1'),
   runId: auditRunIdSchema,
   revision: z.number().int().nonnegative(),
   target: targetReferenceSchema,
   profile: auditProfileSchema,
   scope: z.enum(['page', 'section', 'site', 'app']),
   startedAt: z.string().datetime(),
   updatedAt: z.string().datetime(),
   status: z.enum(['active', 'complete']),
   environments: z.array(auditEnvironmentSchema).min(1),
   states: z.array(auditStateSchema),
   journeys: z.array(auditJourneySchema),
   checks: z.array(assessmentCheckSchema),
   activeCheckId: z.string().min(1).optional(),
   actionPolicy: z.object({
      allowFormSubmission: z.boolean().default(false),
      allowDestructiveActions: z.boolean().default(false),
      allowedOrigins: z.array(z.string().url()),
   }),
   inventoryPath: z.string().min(1).optional(),
});

function validateCollectionIDs(
   run: z.infer<typeof auditRunFieldsSchema>,
   context: z.RefinementCtx,
): void {
   const checks = new Set(run.checks.map((item) => item.checkId)),
      environments = new Set(run.environments.map((item) => item.environmentId)),
      journeys = new Set(run.journeys.map((item) => item.journeyId)),
      states = new Set(run.states.map((item) => item.stateId));
   if (
      environments.size !== run.environments.length ||
      states.size !== run.states.length ||
      journeys.size !== run.journeys.length ||
      checks.size !== run.checks.length
   ) {
      context.addIssue({
         code: 'custom',
         message: 'Run IDs must be unique within each collection.',
      });
   }
   if (run.activeCheckId && !checks.has(run.activeCheckId)) {
      context.addIssue({
         code: 'custom',
         message: 'The active claim references an unknown assessment check.',
      });
   }
   for (const state of run.states) {
      if (!environments.has(state.environmentId)) {
         context.addIssue({
            code: 'custom',
            message: `Unknown environment for state ${state.stateId}.`,
         });
      }
   }
}

function isJourneyScopeValid(
   check: AssessmentCheck,
   journeyStates: string[] | undefined,
): boolean {
   if (!check.journeyId || check.status === 'stale') {
      return true;
   }
   if (!journeyStates) {
      return false;
   }
   return check.scope === 'journey'
      ? JSON.stringify(journeyStates) === JSON.stringify(check.stateIds)
      : check.stateIds.every((id) => journeyStates.includes(id));
}

function validateScopeReferences(
   run: z.infer<typeof auditRunFieldsSchema>,
   context: z.RefinementCtx,
): void {
   const environments = new Set(run.environments.map((item) => item.environmentId)),
      journeys = new Map(run.journeys.map((item) => [item.journeyId, item.stateIds])),
      states = new Map(run.states.map((item) => [item.stateId, item.environmentId]));
   for (const journey of run.journeys) {
      if (journey.stateIds.some((id) => !states.has(id))) {
         context.addIssue({
            code: 'custom',
            message: `Unknown state for journey ${journey.journeyId}.`,
         });
      }
   }
   for (const check of run.checks) {
      const foreignState = check.stateIds.some(
            (id) => states.get(id) !== check.environmentId,
         ),
         invalidJourney = !isJourneyScopeValid(
            check,
            journeys.get(check.journeyId ?? ''),
         );
      if (!environments.has(check.environmentId) || foreignState || invalidJourney) {
         context.addIssue({
            code: 'custom',
            message: `Unknown scope or environment for check ${check.checkId}.`,
         });
      }
   }
}

export const auditRunSchema = auditRunFieldsSchema
   .superRefine(validateCollectionIDs)
   .superRefine(validateScopeReferences);
export type AuditRun = z.infer<typeof auditRunSchema>;
