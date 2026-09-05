import { z } from 'zod';
import { browserAutomationPolicySchema } from './browser.js';
import {
   driverFocusTargetFieldsSchema,
   driverFocusTargetSchema,
} from './driver-focus.js';
import {
   driverCurrentItemSchema,
   driverNavigationActionRequestSchemas,
} from './driver-navigation.js';
import { platformSchema } from './platform.js';

export { platformSchema, type Platform } from './platform.js';

export const targetSchema = z.object({
   id: z.string(),
   platform: platformSchema,
   os: z.string(),
   status: z.enum(['ready', 'requires-setup', 'unsupported']),
   notes: z.array(z.string()),
});
export type Target = z.infer<typeof targetSchema>;

export const doctorCheckStatusSchema = z.enum(['pass', 'warn', 'fail']);
export type DoctorCheckStatus = z.infer<typeof doctorCheckStatusSchema>;

export const doctorCheckSchema = z.object({
   id: z.string(),
   label: z.string(),
   status: doctorCheckStatusSchema,
   detail: z.string().optional(),
   action: z.string().optional(),
   actionLabel: z.string().optional(),
});
export type DoctorCheck = z.infer<typeof doctorCheckSchema>;

export const doctorTargetSchema = targetSchema.extend({
   summary: z.string(),
   checks: z.array(doctorCheckSchema),
});
export type DoctorTarget = z.infer<typeof doctorTargetSchema>;

export const doctorActionSchema = z.object({
   label: z.string(),
   command: z.string(),
   required: z.boolean(),
});
export type DoctorAction = z.infer<typeof doctorActionSchema>;

export const doctorHostSchema = z.object({
   platform: z.string(),
   osName: z.string(),
   release: z.string(),
   arch: z.string(),
});
export type DoctorHost = z.infer<typeof doctorHostSchema>;

export const doctorReportSchema = z.object({
   ready: z.boolean(),
   host: doctorHostSchema,
   packageVersion: z.string(),
   nodeVersion: z.string(),
   npmVersion: z.string(),
   browserAutomation: browserAutomationPolicySchema,
   targets: z.array(doctorTargetSchema),
   actions: z.array(doctorActionSchema),
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
   'sr',
   'axe',
   'tree',
   'audit',
   'doctor',
   'setup',
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

export const portableDriverVerbSchema = z.enum([
   'next',
   'previous',
   'interact',
   'stop-interacting',
   'activate',
   'top',
   'bottom',
   'escape',
]);
export type PortableDriverVerb = z.infer<typeof portableDriverVerbSchema>;

export const driverActionNameSchema = z.enum([
   'start',
   'status',
   'stop',
   'attach-document',
   'focus',
   ...portableDriverVerbSchema.options,
   'press',
   'type',
   'perform',
   'read',
   'transcript',
   'checkpoint',
   'title',
   'find',
   'table',
   'elements',
   'read-all',
   'goto',
   'wait',
   'screenshot',
]);
export type DriverActionName = z.infer<typeof driverActionNameSchema>;

export const driverCapabilitySchema = driverActionNameSchema;
export type DriverCapability = z.infer<typeof driverCapabilitySchema>;

export const driverModeSchema = z.enum(['broker', 'in-process']);
export type DriverMode = z.infer<typeof driverModeSchema>;

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

export const recordingFormatSchema = z.enum(['mov', 'mp4']);
export type RecordingFormat = z.infer<typeof recordingFormatSchema>;

export const recordingStatusSchema = z.enum(['active', 'completed']);
export type RecordingStatus = z.infer<typeof recordingStatusSchema>;

export const sessionRecordingSchema = z.object({
   path: z.string().min(1),
   format: recordingFormatSchema,
   status: recordingStatusSchema,
   startedAt: z.string().datetime(),
   stoppedAt: z.string().datetime().optional(),
});
export type SessionRecording = z.infer<typeof sessionRecordingSchema>;

export const targetTypeSchema = z.enum(['real', 'simulated']);
export type TargetType = z.infer<typeof targetTypeSchema>;

export const accessibilityDriverSessionSchema = z.object({
   sessionId: z.string().min(1),
   target: platformSchema,
   targetType: targetTypeSchema.default('simulated'),
   startedAt: z.string().datetime(),
   capabilities: z.array(driverCapabilitySchema),
   logCursor: z.number().int().nonnegative(),
   brokerPid: z.number().int().positive(),
   socketPath: z.string().min(1),
   metadataFile: z.string().min(1),
   recording: sessionRecordingSchema.optional(),
   /** The page the session opened, updated by attach-document. */
   url: z.string().optional(),
   /** The app or browser window the session opened, used by a bare focus action. */
   app: driverFocusTargetFieldsSchema.optional(),
   idleTimeoutMinutes: z.number().nonnegative().optional(),
});
export type AccessibilityDriverSession = z.infer<typeof accessibilityDriverSessionSchema>;

export const driverCheckpointSchema = z.object({
   label: z.string(),
   createdAt: z.string().datetime(),
});
export type DriverCheckpoint = z.infer<typeof driverCheckpointSchema>;

/**
 * One captured phrase, timestamped by the broker when the action that produced it
 * finished. Checkpoint entries carry the label in `checkpoint` and an empty phrase.
 */
export const driverTranscriptEntrySchema = z.object({
   index: z.number().int().nonnegative(),
   at: z.string().datetime(),
   phrase: z.string(),
   itemText: z.string().optional(),
   checkpoint: z.string().optional(),
});
export type DriverTranscriptEntry = z.infer<typeof driverTranscriptEntrySchema>;

export const driverTranscriptSchema = z.object({
   target: platformSchema,
   url: z.string().optional(),
   startedAt: z.string().datetime(),
   exportedAt: z.string().datetime(),
   entries: z.array(driverTranscriptEntrySchema),
});
export type DriverTranscript = z.infer<typeof driverTranscriptSchema>;

export const driverTranscriptFormatSchema = z.enum(['json', 'md']);
export type DriverTranscriptFormat = z.infer<typeof driverTranscriptFormatSchema>;

/**
 * AX properties of the element that held system keyboard focus at the time of a driver
 * action. Populated for VoiceOver (macOS) sessions only. Note that the VoiceOver cursor
 * and system keyboard focus can diverge during virtual-cursor navigation; treat this as a
 * best-effort supplement to lastSpokenPhrase.
 */
export const axFocusedElementSchema = z.object({
   role: z.string().optional(),
   subrole: z.string().optional(),
   title: z.string().optional(),
   description: z.string().optional(),
   value: z.string().optional(),
   enabled: z.boolean().optional(),
});
export type AxFocusedElement = z.infer<typeof axFocusedElementSchema>;

export const driverStateSnapshotSchema = z.object({
   lastSpokenPhrase: z.string().nullish(),
   currentItemText: z.string().nullish(),
   spokenPhraseLog: z.array(z.string()),
   itemTextLog: z.array(z.string()),
   logCursor: z.number().int().nonnegative(),
   checkpoints: z.array(driverCheckpointSchema),
   transcript: z.array(driverTranscriptEntrySchema).default([]),
   axFocusedElement: axFocusedElementSchema.optional(),
   currentItem: driverCurrentItemSchema.optional(),
});
export type DriverStateSnapshot = z.infer<typeof driverStateSnapshotSchema>;

export const driverPressPayloadSchema = z.object({
   keys: z.array(z.string().min(1)).min(1),
});
export type DriverPressPayload = z.infer<typeof driverPressPayloadSchema>;

export const driverTypePayloadSchema = z.object({ text: z.string() });
export type DriverTypePayload = z.infer<typeof driverTypePayloadSchema>;

export const driverPerformPayloadSchema = z.object({
   command: z.string().min(1),
   commandSet: z.string().optional(),
});
export type DriverPerformPayload = z.infer<typeof driverPerformPayloadSchema>;

export const driverCheckpointPayloadSchema = z.object({ label: z.string().min(1) });
export type DriverCheckpointPayload = z.infer<typeof driverCheckpointPayloadSchema>;

/**
 * `next` and `previous` carry an optional navigation payload, so they have their own
 * variants.
 */
const payloadFreeActionSchema = z.enum([
   ...portableDriverVerbSchema.exclude(['next', 'previous']).options,
   'read',
   'transcript',
   'title',
]);

/**
 * One action request keyed by action name. Actions that take input declare their payload
 * here so a caller cannot send the wrong shape.
 */
export const driverActionRequestSchema = z.discriminatedUnion('action', [
   z.object({ action: payloadFreeActionSchema }),
   ...driverNavigationActionRequestSchemas,
   z.object({ action: z.literal('press'), payload: driverPressPayloadSchema }),
   z.object({ action: z.literal('type'), payload: driverTypePayloadSchema }),
   z.object({ action: z.literal('perform'), payload: driverPerformPayloadSchema }),
   z.object({ action: z.literal('checkpoint'), payload: driverCheckpointPayloadSchema }),
   z.object({ action: z.literal('focus'), payload: driverFocusTargetSchema.optional() }),
]);
export type DriverActionRequest = z.infer<typeof driverActionRequestSchema>;

export const driverActionResultSchema = z.object({
   session: accessibilityDriverSessionSchema,
   action: driverActionNameSchema,
   state: driverStateSnapshotSchema,
   details: z.record(z.string(), z.unknown()).optional(),
   actionDurationMs: z.number().nonnegative().optional(),
});
export type DriverActionResult = z.infer<typeof driverActionResultSchema>;
