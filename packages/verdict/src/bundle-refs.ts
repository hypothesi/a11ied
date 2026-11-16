import {
   observationRefSchema,
   type ObservationBundle,
   type ObservationRef,
   type Verdict,
} from '@a11ied/contracts';

import { getObservationDigest, readCachedObservationBundle } from '@a11ied/observe';
import { recordVerdict } from './store.js';

/** Build a compact pointer into one cached bundle section. Payloads stay cached. */
export function createBundleRef(
   bundle: ObservationBundle,
   section:
      | 'axe'
      | 'tree'
      | 'facts'
      | 'contrast'
      | 'viewports'
      | 'screenshots'
      | 'transcript'
      | 'heuristics'
      | 'actionTrace'
      | 'collectionTrace',
   options?: { pointer?: string; note?: string },
): ObservationRef {
   return observationRefSchema.parse({
      fingerprint: bundle.fingerprint,
      digest: getObservationDigest(bundle),
      path: `cache/${bundle.fingerprint}/bundle.json#${section}`,
      ...(options?.pointer ? { pointer: options.pointer } : {}),
      ...(options?.note ? { note: options.note } : {}),
   });
}

/** Build a compact pointer to a screenshot inside a bundle cache entry. */
export function createScreenshotBundleRef(
   bundle: ObservationBundle,
   options?: { elementKey?: string; pointer?: string; note?: string },
): ObservationRef {
   const path = options?.elementKey
      ? `cache/${bundle.fingerprint}/elements/${options.elementKey}.png`
      : `cache/${bundle.fingerprint}/full-page.png`;
   return observationRefSchema.parse({
      fingerprint: bundle.fingerprint,
      digest: getObservationDigest(bundle),
      path,
      ...(options?.pointer ? { pointer: options.pointer } : {}),
      ...(options?.note ? { note: options.note } : {}),
   });
}

function hasBundleKey(
   bundle: ObservationBundle,
   section: string,
): section is keyof ObservationBundle {
   return section in bundle;
}

function fragmentOf(path: string): string | undefined {
   const hashIndex = path.indexOf('#');
   if (hashIndex === -1) {
      return undefined;
   }
   const section = path.slice(hashIndex + 1);
   return section === '' ? undefined : section;
}

/** Return the cached bundle and, when the ref carries `#section`, that section's value. */
export async function resolveBundleRef(
   cacheRoot: string,
   ref: ObservationRef,
): Promise<{ bundle: ObservationBundle; sectionValue: unknown } | undefined> {
   const bundle = await readCachedObservationBundle(cacheRoot, ref.fingerprint);
   if (bundle === undefined) {
      return undefined;
   }

   const section = fragmentOf(ref.path);
   if (section === undefined) {
      return { bundle, sectionValue: bundle };
   }

   return {
      bundle,
      sectionValue: hasBundleKey(bundle, section) ? bundle[section] : undefined,
   };
}

/**
 * Record verdicts sequentially so an early failure leaves earlier verdicts durable.
 * Verdict payloads stay compact: each carries only references into the cached bundle,
 * never the bundle's DOM tree or screenshots themselves.
 */
export async function recordBundleVerdicts(
   runDir: string,
   verdicts: readonly Verdict[],
): Promise<Verdict[]> {
   const saved: Verdict[] = [];
   for (const verdict of verdicts) {
      // oxlint-disable-next-line no-await-in-loop -- verdicts append to one JSONL store; writes must stay sequential
      saved.push(await recordVerdict(runDir, verdict));
   }
   return saved;
}
