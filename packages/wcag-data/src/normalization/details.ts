import { isRecord } from '../shared/utils.js';

export function normalizeTags(tagPayload: Record<string, string> | undefined): string[] {
   if (!tagPayload) {
      return [];
   }
   return [
      ...new Set(
         Object.values(tagPayload)
            .flatMap((value) => value.split(/\s+/))
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0),
      ),
   ].toSorted((left, right) => left.localeCompare(right));
}

function extractHandleAndText(value: Record<string, unknown>): {
   handle: string | undefined;
   text: string | undefined;
} {
   let handle: string | undefined = undefined;
   if (typeof value.handle === 'string') {
      handle = value.handle.trim() || undefined;
   }
   let text: string | undefined = undefined;
   if (typeof value.text === 'string') {
      text = value.text.trim() || undefined;
   }
   return { handle, text };
}

function formatHandleText(
   handle: string | undefined,
   text: string | undefined,
): string[] | undefined {
   if (handle && text) {
      return [`${handle}: ${text}`];
   }
   if (text) {
      return [text];
   }
   return undefined;
}

function extractStringDetail(value: string): string[] {
   const normalized = value.trim();
   if (normalized) {
      return [normalized];
   }
   return [];
}

function extractDetailText(value: unknown): string[] {
   if (typeof value === 'string') {
      return extractStringDetail(value);
   }
   if (Array.isArray(value)) {
      return value.flatMap((entry) => extractDetailText(entry));
   }
   if (!isRecord(value)) {
      return [];
   }
   const parsed = extractHandleAndText(value);
   return (
      formatHandleText(parsed.handle, parsed.text) ??
      Object.values(value).flatMap((entry) => extractDetailText(entry))
   );
}

export function normalizeDetails(details: unknown[] | undefined): string[] {
   if (!details) {
      return [];
   }
   return [...new Set(details.flatMap((detail) => extractDetailText(detail)))];
}
