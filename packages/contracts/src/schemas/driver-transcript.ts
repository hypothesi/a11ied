import { z } from 'zod';

export const DEFAULT_DRIVER_TRANSCRIPT_LIMIT = 200;
export const MAX_DRIVER_TRANSCRIPT_LIMIT = 1000;

export const driverTranscriptPayloadSchema = z.object({
   since: z
      .string()
      .min(1)
      .optional()
      .describe('Entries after the last matching checkpoint.'),
   tail: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Last N phrases, including intervening checkpoints.'),
   afterIndex: z
      .number()
      .int()
      .min(-1)
      .optional()
      .describe(
         'Entries after this session transcript index; -1 starts at the beginning.',
      ),
   limit: z
      .number()
      .int()
      .positive()
      .max(MAX_DRIVER_TRANSCRIPT_LIMIT)
      .optional()
      .describe('Maximum entries, including checkpoints.'),
});
export type DriverTranscriptPayload = z.infer<typeof driverTranscriptPayloadSchema>;

/** Distinguishes a selected transcript page from a complete session transcript. */
export const driverTranscriptWindowSchema = z.object({
   totalEntries: z.number().int().nonnegative(),
   selectedEntries: z.number().int().nonnegative(),
   returnedEntries: z.number().int().nonnegative(),
   omittedEntries: z.number().int().nonnegative(),
   complete: z.boolean(),
   hasMore: z.boolean(),
   nextAfterIndex: z.number().int().min(-1),
   latestIndex: z.number().int().min(-1),
   rawLogsIncluded: z.literal(false),
});
export type DriverTranscriptWindow = z.infer<typeof driverTranscriptWindowSchema>;
