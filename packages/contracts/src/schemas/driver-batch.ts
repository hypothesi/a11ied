import { z } from 'zod';
import { driverActionRequestSchema } from './core.js';

/** A batch line that checks the transcript instead of driving the reader. */
export const driverBatchExpectStepSchema = z.object({
   action: z.literal('expect'),
   payload: z.object({
      match: z.string().min(1),
      since: z.string().min(1).optional(),
      not: z.boolean().optional(),
   }),
});
export type DriverBatchExpectStep = z.infer<typeof driverBatchExpectStepSchema>;

/** One line of `sr batch`: an action request, or an expect line. */
export const driverBatchStepSchema = z.union([
   driverActionRequestSchema,
   driverBatchExpectStepSchema,
]);
export type DriverBatchStep = z.infer<typeof driverBatchStepSchema>;
