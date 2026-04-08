import { createHash } from 'node:crypto';

import { parse as parseYaml } from 'yaml';

import type { JsonRecord, SourceFormat } from './types.js';

const JSON_INDENT = 2;

export function isRecord(value: unknown): value is JsonRecord {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sha256(content: string): string {
   return createHash('sha256').update(content).digest('hex');
}

export function toJsonString(value: unknown): string {
   return `${JSON.stringify(value, undefined, JSON_INDENT)}\n`;
}

export function parseSourcePayload(format: SourceFormat, sourceText: string): unknown {
   if (format === 'json') {
      return JSON.parse(sourceText) as unknown;
   }

   if (format === 'yaml') {
      return parseYaml(sourceText);
   }

   return JSON.parse(sourceText) as unknown;
}

export function provenanceFileName(fileName: string): string {
   const extensionIndex = fileName.lastIndexOf('.');

   if (extensionIndex === -1) {
      return `${fileName}.provenance.json`;
   }

   return `${fileName.slice(0, extensionIndex)}.provenance.json`;
}

export function withOptionalStringProperties<TTarget extends object>(
   target: TTarget,
   values: Record<string, string | undefined>,
): TTarget {
   const nextTarget = { ...target } as Record<string, unknown>;

   for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) {
         nextTarget[key] = value;
      }
   }

   return nextTarget as TTarget;
}
