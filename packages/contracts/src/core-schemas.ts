import { z } from 'zod';

export const platformSchema = z.enum(['voiceover', 'nvda', 'virtual']);
export type Platform = z.infer<typeof platformSchema>;

export const targetSchema = z.object({
   id: z.string(),
   platform: platformSchema,
   os: z.string(),
   status: z.enum(['ready', 'requires-setup', 'unsupported']),
   notes: z.array(z.string()),
});
export type Target = z.infer<typeof targetSchema>;

export const doctorReportSchema = z.object({
   packageVersion: z.string(),
   nodeVersion: z.string(),
   npmVersion: z.string(),
   targets: z.array(targetSchema),
});
export type DoctorReport = z.infer<typeof doctorReportSchema>;

export const cliCommandSchema = z.object({
   name: z.string(),
   summary: z.string(),
   maturity: z.enum(['planned', 'scaffolded', 'ready']),
});
export type CliCommand = z.infer<typeof cliCommandSchema>;

export const cliCommandFamilySchema = z.enum([
   'wcag',
   'inspect',
   'drive',
   'run',
   'verify',
   'doctor',
   'catalog',
   'mcp',
]);
export type CliCommandFamily = z.infer<typeof cliCommandFamilySchema>;

export const wcagVersionSchema = z.enum(['2.1', '2.2']);
export type WcagVersion = z.infer<typeof wcagVersionSchema>;

export const wcagLevelSchema = z.enum(['A', 'AA', 'AAA']);
export type WcagLevel = z.infer<typeof wcagLevelSchema>;

export const cliCommandDescriptorSchema = z.object({
   family: cliCommandFamilySchema,
   subcommand: z.string(),
   version: z.string(),
   wcagVersion: wcagVersionSchema.optional(),
});
export type CliCommandDescriptor = z.infer<typeof cliCommandDescriptorSchema>;

export const cliMessageSchema = z.object({
   code: z.string(),
   message: z.string(),
   details: z.record(z.string(), z.unknown()).optional(),
});
export type CliMessage = z.infer<typeof cliMessageSchema>;

export const cliEnvelopeMetaSchema = z.object({
   schemaVersion: z.literal('1'),
   startedAt: z.string().datetime(),
   completedAt: z.string().datetime(),
   durationMs: z.number().int().nonnegative(),
});
export type CliEnvelopeMeta = z.infer<typeof cliEnvelopeMetaSchema>;

export const cliOutputEnvelopeSchema = z.object({
   ok: z.boolean(),
   command: cliCommandDescriptorSchema,
   target: z.record(z.string(), z.unknown()).nullish(),
   result: z.record(z.string(), z.unknown()).nullish(),
   warnings: z.array(cliMessageSchema),
   errors: z.array(cliMessageSchema),
   meta: cliEnvelopeMetaSchema,
});
export type CliOutputEnvelope = z.infer<typeof cliOutputEnvelopeSchema>;

export const cliExitCodes = {
   success: 0,
   usage: 2,
   environment: 3,
   assertion: 4,
   internal: 5,
} as const;

export const cliExitCodeSchema = z.union([
   z.literal(cliExitCodes.success),
   z.literal(cliExitCodes.usage),
   z.literal(cliExitCodes.environment),
   z.literal(cliExitCodes.assertion),
   z.literal(cliExitCodes.internal),
]);
export type CliExitCode = z.infer<typeof cliExitCodeSchema>;

export const driverCapabilitySchema = z.enum([
   'start',
   'stop',
   'status',
   'attach-document',
   'next',
   'previous',
   'key',
   'type',
   'interact',
   'stop-interacting',
   'click-current-item',
   'read',
   'logs',
   'clear-logs',
   'checkpoint',
]);
export type DriverCapability = z.infer<typeof driverCapabilitySchema>;

export const driverReadinessStatusSchema = z.enum([
   'ready',
   'requires-setup',
   'unsupported',
]);
export type DriverReadinessStatus = z.infer<typeof driverReadinessStatusSchema>;

export const driverReadinessSchema = z.object({
   target: platformSchema,
   status: driverReadinessStatusSchema,
   summary: z.string(),
   details: z.array(z.string()),
   setupCommand: z.string().optional(),
   debug: z.record(z.string(), z.unknown()).optional(),
});
export type DriverReadiness = z.infer<typeof driverReadinessSchema>;

export const accessibilityDriverSessionSchema = z.object({
   sessionId: z.string().min(1),
   target: platformSchema,
   startedAt: z.string().datetime(),
   capabilities: z.array(driverCapabilitySchema),
   logCursor: z.number().int().nonnegative(),
   brokerPid: z.number().int().positive(),
   socketPath: z.string().min(1),
   metadataFile: z.string().min(1),
});
export type AccessibilityDriverSession = z.infer<typeof accessibilityDriverSessionSchema>;

export const driverCheckpointSchema = z.object({
   label: z.string(),
   createdAt: z.string().datetime(),
});
export type DriverCheckpoint = z.infer<typeof driverCheckpointSchema>;

export const driverStateSnapshotSchema = z.object({
   lastSpokenPhrase: z.string().nullish(),
   currentItemText: z.string().nullish(),
   spokenPhraseLog: z.array(z.string()),
   itemTextLog: z.array(z.string()),
   logCursor: z.number().int().nonnegative(),
   checkpoints: z.array(driverCheckpointSchema),
});
export type DriverStateSnapshot = z.infer<typeof driverStateSnapshotSchema>;

export const driverActionNameSchema = z.enum([
   'start',
   'status',
   'stop',
   'attach-document',
   'next',
   'previous',
   'key',
   'type',
   'interact',
   'stop-interacting',
   'click-current-item',
   'read',
   'logs',
   'clear-logs',
   'checkpoint',
]);
export type DriverActionName = z.infer<typeof driverActionNameSchema>;

export const driverActionResultSchema = z.object({
   session: accessibilityDriverSessionSchema,
   action: driverActionNameSchema,
   state: driverStateSnapshotSchema,
   details: z.record(z.string(), z.unknown()).optional(),
});
export type DriverActionResult = z.infer<typeof driverActionResultSchema>;

export const interactionPatternIdSchema = z.enum([
   'tab_sequence',
   'landmark_sequence',
   'heading_sequence',
   'form_field_walk',
   'status_message_probe',
   'dialog_probe',
   'focus_order_probe',
   'focus_visibility_probe',
   'focus_obscured_probe',
   'auth_flow_probe',
   'redundant_entry_probe',
]);
export type InteractionPatternId = z.infer<typeof interactionPatternIdSchema>;

export const interactionPatternStepStatusSchema = z.enum([
   'completed',
   'observed',
   'warning',
]);
export type InteractionPatternStepStatus = z.infer<
   typeof interactionPatternStepStatusSchema
>;

export const interactionPatternStepSchema = z.object({
   id: z.string(),
   label: z.string(),
   status: interactionPatternStepStatusSchema,
   details: z.record(z.string(), z.unknown()).optional(),
});
export type InteractionPatternStep = z.infer<typeof interactionPatternStepSchema>;

export const interactionPatternAssertionStatusSchema = z.enum([
   'passed',
   'failed',
   'not-run',
]);
export type InteractionPatternAssertionStatus = z.infer<
   typeof interactionPatternAssertionStatusSchema
>;

export const interactionPatternAssertionSchema = z.object({
   id: z.string(),
   status: interactionPatternAssertionStatusSchema,
   message: z.string(),
   details: z.record(z.string(), z.unknown()).optional(),
});
export type InteractionPatternAssertion = z.infer<
   typeof interactionPatternAssertionSchema
>;

export const interactionPatternBrowserEvidenceSchema = z.object({
   kind: z.enum(['focus', 'visibility', 'dialog', 'status-message', 'structure']),
   summary: z.string(),
   details: z.record(z.string(), z.unknown()).optional(),
});
export type InteractionPatternBrowserEvidence = z.infer<
   typeof interactionPatternBrowserEvidenceSchema
>;

export const interactionPatternResultSchema = z.object({
   patternId: interactionPatternIdSchema,
   url: z.string().url(),
   target: platformSchema,
   sessionId: z.string().min(1),
   managedSession: z.boolean(),
   stepLog: z.array(interactionPatternStepSchema),
   spokenPhraseLog: z.array(z.string()),
   itemTextLog: z.array(z.string()),
   assertions: z.array(interactionPatternAssertionSchema),
   targetMetadata: z.record(z.string(), z.unknown()),
   browserEvidence: z.array(interactionPatternBrowserEvidenceSchema),
});
export type InteractionPatternResult = z.infer<typeof interactionPatternResultSchema>;
