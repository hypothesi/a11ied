import {
   getFeatureReport,
   listFeatures,
   type FeatureReport,
   type FeatureType,
} from '@a11ied/support-data';
import type { FeatureUsageInput, ResolvedFeatureQuery } from './types.js';

const PREFIX_SET = new Set<FeatureType>(['aria', 'html', 'css', 'js']);

function parsePrefix(prefix: string): FeatureType | undefined {
   const lower = prefix.toLowerCase();
   for (const item of PREFIX_SET) {
      if (item === lower) {
         return item;
      }
   }
   return undefined;
}

function normalizeRawString(rawInput: string): {
   readonly type?: FeatureType;
   readonly featureRef: string;
} {
   const trimmed = rawInput.trim();
   const roleAttrMatch = /^role\s*=\s*["']?([^"'\s]+)["']?$/iu.exec(trimmed);
   if (roleAttrMatch?.[1]) {
      return {
         type: 'aria',
         featureRef: roleAttrMatch[1].toLowerCase(),
      };
   }

   const colonIndex = trimmed.indexOf(':');
   if (colonIndex > 0) {
      const maybeType = parsePrefix(trimmed.slice(0, colonIndex));
      if (maybeType) {
         return {
            type: maybeType,
            featureRef: trimmed.slice(colonIndex + 1).trim(),
         };
      }
   }

   const lower = trimmed.toLowerCase();
   if (lower.startsWith('aria-')) {
      return {
         type: 'aria',
         featureRef: lower,
      };
   }

   if (lower.startsWith('@aria-')) {
      return {
         type: 'aria',
         featureRef: lower.slice(1),
      };
   }

   if (trimmed.startsWith('@')) {
      return {
         type: 'html',
         featureRef: trimmed,
      };
   }

   return {
      featureRef: trimmed,
   };
}

/**
 * Normalizes shorthand feature strings (`aria:alert`, `role="alert"`, `aria-labelledby`,
 * `@checked`, etc.) or `FeatureUsage` objects into structured queries.
 */
export function normalizeFeatureUsage(input: FeatureUsageInput): ResolvedFeatureQuery {
   if (typeof input === 'string') {
      const normalized = normalizeRawString(input);
      return {
         raw: input.trim(),
         ...(normalized.type ? { type: normalized.type } : {}),
         featureRef: normalized.featureRef,
      };
   }

   const parsed = normalizeRawString(input.feature);
   const resolvedType = input.type ?? parsed.type;
   return {
      raw: input.feature.trim(),
      ...(resolvedType ? { type: resolvedType } : {}),
      featureRef: parsed.featureRef,
      ...(input.element === undefined ? {} : { element: input.element }),
      ...(input.location === undefined ? {} : { location: input.location }),
   };
}

function findCaseInsensitiveFeature(
   features: readonly FeatureReport[],
   refId: string,
   type?: FeatureType,
): FeatureReport | undefined {
   const targetLower = refId.toLowerCase();
   return features.find((item) => {
      if (type && item.type !== type) {
         return false;
      }
      return item.refId.toLowerCase() === targetLower;
   });
}

/** Resolves a normalized feature query against `@a11ied/support-data`. */
export function resolveFeatureReport(
   query: ResolvedFeatureQuery,
): FeatureReport | undefined {
   const features = listFeatures();
   if (query.type) {
      const exact = getFeatureReport(query.type, query.featureRef);
      if (exact) {
         return exact;
      }
      if (query.type === 'html' && !query.featureRef.startsWith('@')) {
         const attrVariant = getFeatureReport('html', `@${query.featureRef}`);
         if (attrVariant) {
            return attrVariant;
         }
      }
      return findCaseInsensitiveFeature(features, query.featureRef, query.type);
   }

   for (const typeCandidate of ['aria', 'html', 'css', 'js'] as const) {
      const direct = getFeatureReport(typeCandidate, query.featureRef);
      if (direct) {
         return direct;
      }
   }

   const htmlAt = getFeatureReport('html', `@${query.featureRef}`);
   if (htmlAt) {
      return htmlAt;
   }

   return findCaseInsensitiveFeature(features, query.featureRef);
}
