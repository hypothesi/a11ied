import { z } from 'zod';
import {
   assessmentCheckSchema,
   auditEnvironmentSchema,
   auditJourneySchema,
   auditProfileSchema,
   auditRunIdSchema,
   auditRunSchema,
   auditStateSchema,
} from './audit-run.js';
import { evidenceOutcomeSchema } from './evidence.js';
import { targetReferenceSchema } from './query.js';

const DEFAULT_LIMIT = 20,
   MAX_LIMIT = 100;

const checkIdSchema = assessmentCheckSchema.shape.checkId,
   checkInputSchema = z.object({
      criterionId: assessmentCheckSchema.shape.criterionId,
      procedureId: assessmentCheckSchema.shape.procedureId,
      procedureVersion: assessmentCheckSchema.shape.procedureVersion,
      patternRow: assessmentCheckSchema.shape.patternRow,
      scope: assessmentCheckSchema.shape.scope,
      pointer: assessmentCheckSchema.shape.pointer,
      stateIds: assessmentCheckSchema.shape.stateIds,
      journeyId: assessmentCheckSchema.shape.journeyId,
      environmentId: assessmentCheckSchema.shape.environmentId,
   });

const fileSchema = z.string().min(1),
   stateInputSchema = auditStateSchema
      .omit({ revision: true, observedAt: true })
      .partial({ stateId: true });

/** The same validated operations drive shell commands and MCP requests. */
export const auditAssessmentRequestSchema = z.discriminatedUnion('action', [
   z.strictObject({
      action: z.literal('start'),
      target: targetReferenceSchema,
      profile: auditProfileSchema.default({ wcagVersion: '2.2', level: 'AA' }),
      scope: auditRunSchema.shape.scope.optional(),
      environment: auditEnvironmentSchema,
      file: fileSchema.optional(),
      runId: auditRunIdSchema.optional(),
      inventoryPath: fileSchema.optional(),
      actionPolicy: auditRunSchema.shape.actionPolicy.optional(),
   }),
   z.strictObject({
      action: z.literal('state'),
      file: fileSchema,
      state: stateInputSchema,
   }),
   z.strictObject({
      action: z.literal('journey'),
      file: fileSchema,
      journey: auditJourneySchema,
   }),
   z.strictObject({
      action: z.literal('queue'),
      file: fileSchema,
      check: checkInputSchema,
   }),
   z.strictObject({ action: z.literal('next'), file: fileSchema }),
   z.strictObject({
      action: z.literal('status'),
      file: fileSchema,
      offset: z.number().int().nonnegative().default(0),
      limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
   }),
   z.strictObject({
      action: z.literal('resume'),
      file: fileSchema,
      retryCheckIds: z.array(checkIdSchema).optional(),
   }),
   z.strictObject({
      action: z.literal('evaluate'),
      file: fileSchema,
      checkId: checkIdSchema,
      outcome: evidenceOutcomeSchema,
      evidenceIds: z.array(z.string().min(1)).min(1),
   }),
   z.strictObject({
      action: z.literal('block'),
      file: fileSchema,
      checkId: checkIdSchema,
      reason: z.string().trim().min(1),
   }),
   z.strictObject({
      action: z.literal('finalize'),
      file: fileSchema,
      allowPartial: z.boolean().default(false),
   }),
]);
export type AuditAssessmentRequest = z.infer<typeof auditAssessmentRequestSchema>;
