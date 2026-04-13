import { z } from 'zod';
import { platformSchema } from './core.js';

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
