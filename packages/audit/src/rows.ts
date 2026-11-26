import { z } from 'zod';
import {
   findingSourceSchema,
   outcomeSchema,
   severitySchema,
   pageKindSchema,
   unitStatusSchema,
} from './schema.js';

const jsonText = <TSchema extends z.ZodType>(
   schema: TSchema,
): z.ZodType<z.infer<TSchema>> =>
   z
      .string()
      .transform((text): unknown => JSON.parse(text))
      .pipe(schema);

const stringList = z.array(z.string());

export const pageRowSchema = z
   .object({
      id: z.string(),
      kind: pageKindSchema,
      name: z.string(),
      locator: z.string(),
      notes: z.string(),
      grp: z.string(),
      passes: z.string().nullable(),
      status: z.enum(['active', 'excluded']),
      excludeReason: z.string(),
      createdAt: z.string(),
   })
   .transform((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      locator: row.locator,
      notes: row.notes,
      group: row.grp,
      passes: row.passes === null ? undefined : stringList.parse(JSON.parse(row.passes)),
      status: row.status,
      excludeReason: row.excludeReason,
      createdAt: row.createdAt,
   }));

export const unitRowSchema = z.object({
   id: z.string(),
   pageId: z.string(),
   pass: z.string(),
   criteria: jsonText(stringList),
   status: unitStatusSchema,
   worker: z.string().nullable(),
   leaseExpiresAt: z.string().nullable(),
   attempts: z.number(),
   startedAt: z.string().nullable(),
   finishedAt: z.string().nullable(),
   reason: z.string(),
   summary: z.string(),
});

export const resultRowSchema = z.object({
   pageId: z.string(),
   criterion: z.string(),
   outcome: outcomeSchema,
   note: z.string(),
   unitId: z.string(),
   worker: z.string(),
   recordedAt: z.string(),
});

export const stateRowSchema = z.object({
   unitId: z.string(),
   pageId: z.string(),
   name: z.string(),
   covers: jsonText(stringList),
   tested: z.number().transform((value) => value === 1),
   note: z.string(),
});

export const priorResultRowSchema = z.object({
   criterion: z.string(),
   outcome: outcomeSchema,
   note: z.string(),
   worker: z.string(),
   recordedAt: z.string(),
   reopenReason: z.string(),
});

export const findingRowSchema = z.object({
   id: z.string(),
   criterion: z.string(),
   related: jsonText(stringList),
   reasons: jsonText(z.record(z.string(), z.string())),
   title: z.string(),
   severity: severitySchema,
   description: z.string(),
   impact: z.string(),
   recommendation: z.string(),
   source: findingSourceSchema,
   key: z.string(),
   createdAt: z.string(),
});

export const instanceRowSchema = z.object({
   id: z.number(),
   findingId: z.string(),
   pageId: z.string(),
   unitId: z.string().nullable(),
   location: z.string(),
   detail: z.string(),
   evidence: jsonText(stringList),
   status: z.enum(['open', 'dismissed']),
   dismissReason: z.string(),
   worker: z.string(),
   createdAt: z.string(),
});

export const eventRowSchema = z.object({
   id: z.number(),
   at: z.string(),
   actor: z.string(),
   type: z.string(),
   unitId: z.string().nullable(),
   message: z.string(),
});

export const signalRowSchema = z.object({
   pageId: z.string(),
   kind: z.string(),
   data: jsonText(z.unknown()),
   collectedAt: z.string(),
});

export const countRowSchema = z.object({ count: z.number() });
export const idRowSchema = z.object({ id: z.string() });
