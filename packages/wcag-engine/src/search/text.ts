const SUFFIX_IES_LENGTH = 3;
const SUFFIX_ES_LENGTH = 2;

/** Lowercases and strips punctuation, so "focus-order" and "Focus Order" agree. */
export function normalizeText(value: string): string {
   return value
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, ' ')
      .trim();
}

/** Folds a common English plural, so "buttons" matches a field that says "button". */
export function normalizeToken(value: string): string {
   const normalized = normalizeText(value);
   if (normalized.endsWith('ies') && normalized.length > SUFFIX_IES_LENGTH) {
      return `${normalized.slice(0, -SUFFIX_IES_LENGTH)}y`;
   }
   if (normalized.endsWith('es') && normalized.length > SUFFIX_IES_LENGTH) {
      return normalized.slice(0, -SUFFIX_ES_LENGTH);
   }
   if (normalized.endsWith('s') && normalized.length > SUFFIX_ES_LENGTH) {
      return normalized.slice(0, -1);
   }
   return normalized;
}

export function tokenize(value: string): string[] {
   return normalizeText(value)
      .split(/\s+/u)
      .map((token) => normalizeToken(token))
      .filter((token) => token.length > 0);
}
