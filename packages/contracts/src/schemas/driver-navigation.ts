import { z } from 'zod';

const MIN_HEADING_LEVEL = 1;
const MAX_HEADING_LEVEL = 6;

/** What `sr next` and `sr previous` jump by. `item` is the reader's own next-item step. */
export const driverNavigationKindSchema = z.enum([
   'item',
   'heading',
   'link',
   'landmark',
   'control',
   'button',
   'table',
   'list',
   'graphic',
   'region',
   'form-field',
]);
export type DriverNavigationKind = z.infer<typeof driverNavigationKindSchema>;

export const driverNavigationDirectionSchema = z.enum(['next', 'previous']);
export type DriverNavigationDirection = z.infer<typeof driverNavigationDirectionSchema>;

export const driverNavigatePayloadSchema = z.object({
   kind: driverNavigationKindSchema.default('item'),
   /** Heading level 1 to 6; only meaningful with kind `heading`. */
   level: z.number().int().min(MIN_HEADING_LEVEL).max(MAX_HEADING_LEVEL).optional(),
   /** How many times to repeat the move. Defaults to 1. */
   times: z.number().int().min(1).optional(),
});
export type DriverNavigatePayload = z.infer<typeof driverNavigatePayloadSchema>;

/** One navigation request as the adapters take it: direction plus the payload fields. */
export const driverNavigateRequestSchema = driverNavigatePayloadSchema.extend({
   direction: driverNavigationDirectionSchema,
});
export type DriverNavigateRequest = z.infer<typeof driverNavigateRequestSchema>;

/** The action-request variants that carry a navigation payload. */
export const driverNavigationActionRequestSchemas = [
   z.object({
      action: z.literal('next'),
      payload: driverNavigatePayloadSchema.optional(),
   }),
   z.object({
      action: z.literal('previous'),
      payload: driverNavigatePayloadSchema.optional(),
   }),
] as const;
