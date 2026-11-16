import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import {
   observationBundleSchema,
   observationReceiptSchema,
   type ObservationBundle,
   type StateSetupAction,
} from '@a11ied/contracts';
import { writeAtomic } from './files-store.js';

export const OBSERVATION_COLLECTOR_VERSION = 'observe-4';

/** Canonical shape of the input to `computeObservationFingerprint`. */
export interface ObservationFingerprintInput {
   treeHash: string;
   stateId?: string;
   observationHash?: string;
   targetUrl: string;
   setup?: readonly StateSetupAction[];
   viewportKey?: string;
}

function isENOENT(error: unknown): boolean {
   return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function readRawBundle(bundlePath: string): Promise<string | undefined> {
   try {
      return await readFile(bundlePath, 'utf8');
   } catch (error) {
      if (isENOENT(error)) {
         return undefined;
      }
      throw error;
   }
}

function parseCachedBundle(raw: string, fingerprint: string): unknown {
   try {
      return JSON.parse(raw);
   } catch (error) {
      throw new Error(`Cached bundle for ${fingerprint} failed to parse JSON.`, {
         cause: error,
      });
   }
}

/**
 * Normalize a target URL so `(https://example.com/foo, setup)` and
 * `(https://example.com/foo/, setup)` hash to the same fingerprint.
 *
 * `new URL` handles scheme, authority, query, fragment, percent-encoding, and default
 * ports. A trailing slash on the pathname is stripped unless the pathname is the root
 * (`/`); everything else falls back to the trimmed raw input so non-URL targets are not
 * rejected before caching fails on them later.
 */
export function canonicalizeObservationURL(targetUrl: string): string {
   const trimmed = targetUrl.trim();
   try {
      const url = new URL(trimmed);
      if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
         url.pathname = url.pathname.replace(/\/+$/u, '');
      }
      return url.toString();
   } catch {
      return trimmed;
   }
}

export function getContentDigest(value: string | Uint8Array): string {
   return createHash('sha256').update(value).digest('hex');
}

/** Bind references to all observed data, not just the DOM-derived cache key. */
export function getObservationDigest(bundle: ObservationBundle): string {
   return getContentDigest(JSON.stringify(observationBundleSchema.parse(bundle)));
}

export async function validateObservationReceipt(input: {
   cacheRoot: string;
   bundle: ObservationBundle;
}): Promise<void> {
   const { bundle, cacheRoot } = input;
   const receipt = observationReceiptSchema.parse(
      JSON.parse(
         await readFile(
            join(cacheRoot, 'cache', bundle.fingerprint, 'capture-receipt.json'),
            'utf8',
         ),
      ),
   );
   if (
      receipt.collectorVersion !== OBSERVATION_COLLECTOR_VERSION ||
      receipt.digest !== getObservationDigest(bundle) ||
      receipt.stateId !== bundle.stateId ||
      receipt.capturedAt !== bundle.capturedAt ||
      receipt.environmentId !== bundle.environment?.environmentId
   ) {
      throw new Error(
         'Current collector receipt is stale or belongs to another observation.',
      );
   }
}

/** Content-addressed cache key for one observation bundle. */
export function computeObservationFingerprint(
   input: ObservationFingerprintInput,
): string {
   const treeHash = input.treeHash;
   const canonicalUrl = canonicalizeObservationURL(input.targetUrl);
   const canonicalSetup = JSON.stringify(input.setup ?? []);
   const viewportKey = input.viewportKey ?? 'default';
   const buffer = `${treeHash}|${canonicalUrl}|${canonicalSetup}|${viewportKey}|${input.stateId ?? 'initial'}|${input.observationHash ?? ''}`;
   return getContentDigest(buffer);
}

/** Directory of the content-addressed cache entry for one fingerprint. */
export function getObservationCacheDir(cacheRoot: string, fingerprint: string): string {
   return join(resolve(cacheRoot), 'cache', fingerprint);
}

/** Full path of the persisted `bundle.json` inside one content-addressed cache entry. */
export function getObservationBundlePath(cacheRoot: string, fingerprint: string): string {
   return join(getObservationCacheDir(cacheRoot, fingerprint), 'bundle.json');
}

/** Read and validate a cached observation bundle; `undefined` on cache miss. */
export async function readCachedObservationBundle(
   cacheRoot: string,
   fingerprint: string,
): Promise<ObservationBundle | undefined> {
   const bundlePath = getObservationBundlePath(cacheRoot, fingerprint);
   const raw = await readRawBundle(bundlePath);

   if (raw === undefined) {
      return undefined;
   }

   const parsed = parseCachedBundle(raw, fingerprint);
   const validated = observationBundleSchema.parse(parsed);
   if (validated.fingerprint !== fingerprint) {
      throw new Error(
         `Cached bundle fingerprint mismatch: expected "${fingerprint}", got "${validated.fingerprint}"`,
      );
   }
   return validated;
}

/** Write an observation bundle atomically into its content-addressed cache entry. */
export async function writeCachedObservationBundle(
   cacheRoot: string,
   bundle: ObservationBundle,
): Promise<string> {
   const validated = observationBundleSchema.parse(bundle);
   const bundlePath = getObservationBundlePath(cacheRoot, validated.fingerprint);
   await writeAtomic(bundlePath, validated);
   return bundlePath;
}
