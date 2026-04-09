import { z } from 'zod';

export const fourWayAutomationCountSchema = z.object({
   automated: z.number().int().nonnegative(),
   hybrid: z.number().int().nonnegative(),
   manual: z.number().int().nonnegative(),
   unknown: z.number().int().nonnegative(),
});

export const techniqueReferenceSchema = z.object({
   key: z.string(),
   id: z.string().optional(),
   title: z.string(),
   technology: z.string().optional(),
   kind: z.enum(['sufficient', 'advisory', 'failure']),
});
