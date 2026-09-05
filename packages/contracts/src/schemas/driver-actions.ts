import { z } from 'zod';

import { portableDriverVerbSchema } from './core.js';
import { driverFocusTargetSchema } from './driver-focus.js';
import { driverNavigationActionRequestSchemas } from './driver-navigation.js';

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
/**
 * The request as a caller writes it: payload fields with defaults, such as `max` on the
 * loops and `kind` on next, may be left out. The broker parses it into a
 * `DriverActionRequest` before running it.
 */
export type DriverActionRequestInput = z.input<typeof driverActionRequestSchema>;
