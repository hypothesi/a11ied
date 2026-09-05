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

/**
 * What the cursor is on, as far as the target can tell. `source` names where each field
 * came from: the virtual reader's active node, VoiceOver's phrase and item text, or
 * NVDA's phrase. VoiceOver's `axFocusedElement` is keyboard focus, not the cursor, and
 * stays separate.
 */
export const driverCurrentItemSchema = z.object({
   role: z.string().optional(),
   name: z.string().optional(),
   value: z.string().optional(),
   states: z.array(z.string()),
   /** Heading level when the item is a heading. */
   level: z.number().int().optional(),
   phrase: z.string().optional(),
   itemText: z.string().optional(),
   source: z.string(),
});
export type DriverCurrentItem = z.infer<typeof driverCurrentItemSchema>;

export const driverFindPayloadSchema = z.object({ text: z.string().min(1) });
export type DriverFindPayload = z.infer<typeof driverFindPayloadSchema>;

/** Moves inside a table the cursor has entered. Header reads do not move the cursor. */
export const driverTableMoveSchema = z.enum([
   'next-cell',
   'previous-cell',
   'next-row',
   'previous-row',
   'next-column',
   'previous-column',
   'row-header',
   'column-header',
]);
export type DriverTableMove = z.infer<typeof driverTableMoveSchema>;

export const driverTablePayloadSchema = z.object({ move: driverTableMoveSchema });
export type DriverTablePayload = z.infer<typeof driverTablePayloadSchema>;

/** Default caps for the bounded loops, so a page with no end detector still stops. */
export const DEFAULT_ELEMENTS_MAX = 200;
export const DEFAULT_READ_ALL_MAX = 500;
export const DEFAULT_GOTO_MAX = 500;

/** `sr elements <kind>`: jump from the top through every element of one kind. */
export const driverElementsPayloadSchema = z.object({
   kind: driverNavigationKindSchema.exclude(['item']),
   max: z.number().int().min(1).default(DEFAULT_ELEMENTS_MAX),
});
export type DriverElementsPayload = z.infer<typeof driverElementsPayloadSchema>;

/** `sr read-all`: step item by item from the cursor to the end of the document. */
export const driverReadAllPayloadSchema = z.object({
   max: z.number().int().min(1).default(DEFAULT_READ_ALL_MAX),
});
export type DriverReadAllPayload = z.infer<typeof driverReadAllPayloadSchema>;

/** `sr goto`: step forward until the current item has the role, the name, or both. */
export const driverGotoPayloadSchema = z
   .object({
      role: z.string().min(1).optional(),
      name: z.string().min(1).optional(),
      max: z.number().int().min(1).default(DEFAULT_GOTO_MAX),
   })
   .refine((payload) => payload.role !== undefined || payload.name !== undefined, {
      message: 'Provide a role, a name, or both.',
   });
export type DriverGotoPayload = z.infer<typeof driverGotoPayloadSchema>;

export const DEFAULT_WAIT_TIMEOUT_MS = 5000;
export const DEFAULT_WAIT_PAUSE_MS = 500;

/**
 * `sr wait`: pause, or poll the transcript until a phrase matches `for`. `for` is plain
 * text matched without case, or `/pattern/flags` for a regular expression.
 */
export const driverWaitPayloadSchema = z.object({
   for: z.string().min(1).optional(),
   /** Fixed pause when `for` is absent. */
   ms: z.number().int().nonnegative().optional(),
   timeoutMs: z.number().int().positive().default(DEFAULT_WAIT_TIMEOUT_MS),
});
export type DriverWaitPayload = z.infer<typeof driverWaitPayloadSchema>;

/** One entry of a loop result: what the reader announced at each stop. */
export const driverLoopItemSchema = z.object({
   index: z.number().int().positive(),
   phrase: z.string(),
   role: z.string().optional(),
   name: z.string().optional(),
   level: z.number().int().optional(),
});
export type DriverLoopItem = z.infer<typeof driverLoopItemSchema>;

/** Why a bounded loop stopped: it reached the end of the page or hit its cap. */
export const driverLoopStopSchema = z.enum(['end', 'cap', 'match']);
export type DriverLoopStop = z.infer<typeof driverLoopStopSchema>;

/** The action-request variants that carry a navigation or structure payload. */
export const driverNavigationActionRequestSchemas = [
   z.object({
      action: z.literal('next'),
      payload: driverNavigatePayloadSchema.optional(),
   }),
   z.object({
      action: z.literal('previous'),
      payload: driverNavigatePayloadSchema.optional(),
   }),
   z.object({ action: z.literal('find'), payload: driverFindPayloadSchema }),
   z.object({ action: z.literal('table'), payload: driverTablePayloadSchema }),
   z.object({ action: z.literal('elements'), payload: driverElementsPayloadSchema }),
   z.object({ action: z.literal('read-all'), payload: driverReadAllPayloadSchema }),
   z.object({ action: z.literal('goto'), payload: driverGotoPayloadSchema }),
   z.object({ action: z.literal('wait'), payload: driverWaitPayloadSchema }),
] as const;
