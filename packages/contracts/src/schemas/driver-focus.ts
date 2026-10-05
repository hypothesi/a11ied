import { z } from 'zod';
import { platformSchema } from './platform.js';

export const nativeInputPolicySchema = z.enum([
   'guarded',
   'require-binding',
   'development',
]);
export type NativeInputPolicy = z.infer<typeof nativeInputPolicySchema>;

export const driverFocusMatchSchema = z.enum(['contains', 'exact']);
export type DriverFocusMatch = z.infer<typeof driverFocusMatchSchema>;

export const driverFocusTargetFieldsSchema = z.object({
   appName: z.string().min(1).optional(),
   bundleId: z.string().min(1).optional(),
   processName: z.string().min(1).optional(),
   pid: z.number().int().positive().optional(),
   windowTitle: z.string().min(1).optional(),
   match: driverFocusMatchSchema.optional(),
});

export const driverFocusTargetRefinement = (
   value: z.infer<typeof driverFocusTargetFieldsSchema>,
   context: z.RefinementCtx,
): void => {
   if (
      !value.appName &&
      !value.bundleId &&
      !value.processName &&
      !value.pid &&
      !value.windowTitle
   ) {
      context.addIssue({
         code: z.ZodIssueCode.custom,
         message: 'Provide at least one focus identifier.',
      });
   }
};

export const driverFocusTargetSchema = driverFocusTargetFieldsSchema.superRefine(
   driverFocusTargetRefinement,
);
export type DriverFocusTarget = z.infer<typeof driverFocusTargetSchema>;

export const driverFocusStatusSchema = z.enum([
   'focused',
   'not-found',
   'skipped',
   'failed',
]);
export type DriverFocusStatus = z.infer<typeof driverFocusStatusSchema>;

export const driverFocusResultSchema = z.object({
   status: driverFocusStatusSchema,
   target: driverFocusTargetSchema,
   platform: platformSchema,
   details: z.array(z.string()).optional(),
});
export type DriverFocusResult = z.infer<typeof driverFocusResultSchema>;

/** Availability of an observation, without implying verified target binding. */
export const driverObservationSchema = z.discriminatedUnion('status', [
   z.object({
      status: z.literal('observed'),
      source: z.string().min(1),
   }),
   z.object({
      status: z.enum(['unavailable', 'unsupported']),
      source: z.string().min(1),
      reason: z.string().min(1),
      code: z.string().min(1).optional(),
   }),
]);

export const driverObservationsSchema = z.object({
   keyboardFocus: driverObservationSchema,
   readerCursorIdentity: driverObservationSchema,
   targetIdentity: driverObservationSchema,
});
