import { readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { TargetReference } from '@a11ied/contracts';

import { CliEnvironmentError, CliUsageError } from '../errors/cli-errors.js';
import {
   classifyPositionalTarget,
   parseAppTargetName,
   parseHttpUrl,
   rejectAppTarget,
   type DocumentLoad,
} from './parse.js';
import { readStdin } from './stdin.js';

/** Default timeout for the network fetch a `url` target's `readHtml()` makes. */
export const DEFAULT_TARGET_TIMEOUT_MS = 10_000;

export interface ResolveDocumentTargetInput {
   /** A resolved URL, kept for MCP and other callers that already have one. */
   url?: string;
   /** The CLI's positional `<target>`: an http(s) URL, a file path, or `-` for stdin. */
   target?: string;
   /** Inline HTML from `--html`. */
   html?: string;
   /** Set by sr to allow `app:<name>` targets; page commands leave this unset. */
   allowApp?: boolean;
   /** Overrides {@link DEFAULT_TARGET_TIMEOUT_MS} for `readHtml()`'s network fetch. */
   timeoutMs?: number;
   /** Name of the command rejecting an app target, for the error message. */
   commandName?: string;
}

export interface ResolvedDocumentTarget {
   target: TargetReference;
   /** How to load this target into a Playwright page. Undefined for an app target. */
   load: DocumentLoad | undefined;
   metadata: Record<string, string>;
   userHints: string[];
   /**
    * Reads the target's raw markup: a timeout-bounded fetch for a `url` target, a file
    * read for a `file` target, or the already-known content otherwise. Call this only
    * when the raw markup is actually needed (applicability signal detection) - axe and
    * tree never need it and must not call it.
    */
   readHtml: () => Promise<string>;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
   try {
      return await fetch(url, {
         headers: { 'user-agent': 'a11ied/0.1.0' },
         signal: AbortSignal.timeout(timeoutMs),
      });
   } catch (error) {
      let causeMessage = String(error);
      if (error instanceof Error) {
         causeMessage = error.message;
      }
      throw new CliEnvironmentError(
         'target-unavailable',
         `Could not open URL "${url}".`,
         {
            url,
            cause: causeMessage,
         },
      );
   }
}

function memoize(read: () => Promise<string>): () => Promise<string> {
   let cached: Promise<string> | undefined = undefined;
   return () => {
      cached ??= read();
      return cached;
   };
}

function buildResolvedTarget(args: {
   target: TargetReference;
   load: DocumentLoad | undefined;
   readHtml: () => Promise<string>;
}): ResolvedDocumentTarget {
   return {
      target: args.target,
      load: args.load,
      metadata: {},
      userHints: [],
      readHtml: memoize(args.readHtml),
   };
}

function resolveUrlTarget(url: string, timeoutMs: number): ResolvedDocumentTarget {
   const parsedUrl = parseHttpUrl(url);
   const value = parsedUrl.toString();

   return buildResolvedTarget({
      target: { kind: 'url', value },
      load: { kind: 'goto', url: value },
      readHtml: async () => {
         const response = await fetchWithTimeout(value, timeoutMs);
         if (!response.ok) {
            throw new CliEnvironmentError(
               'target-unavailable',
               `Could not open URL "${value}".`,
               { url: value, status: response.status, statusText: response.statusText },
            );
         }
         return response.text();
      },
   });
}

async function readFileTarget(path: string): Promise<string> {
   try {
      return await readFile(path, 'utf8');
   } catch (error) {
      let causeMessage = String(error);
      if (error instanceof Error) {
         causeMessage = error.message;
      }
      throw new CliEnvironmentError(
         'target-unavailable',
         `Could not read file "${path}".`,
         { path, cause: causeMessage },
      );
   }
}

function resolveFileTarget(path: string): ResolvedDocumentTarget {
   const absolutePath = resolvePath(path);
   const fileUrl = pathToFileURL(absolutePath).toString();

   return buildResolvedTarget({
      target: { kind: 'file', value: path },
      load: { kind: 'goto', url: fileUrl },
      readHtml: () => readFileTarget(absolutePath),
   });
}

function resolveInlineTarget(
   kind: 'stdin' | 'html',
   html: string,
): ResolvedDocumentTarget {
   return buildResolvedTarget({
      target: { kind, value: kind === 'html' ? html : '-' },
      load: { kind: 'html', html },
      readHtml: () => Promise.resolve(html),
   });
}

async function resolveStdinTarget(): Promise<ResolvedDocumentTarget> {
   const html = await readStdin();
   return resolveInlineTarget('stdin', html);
}

function resolveAppTarget(
   target: string,
   allowApp: boolean,
   commandName: string,
): ResolvedDocumentTarget {
   if (!allowApp) {
      rejectAppTarget(target, commandName);
   }
   const value = parseAppTargetName(target);
   return buildResolvedTarget({
      target: { kind: 'app', value },
      load: undefined,
      readHtml: () => Promise.reject(new Error('An app target has no markup to read.')),
   });
}

async function resolvePositionalTarget(
   target: string,
   input: ResolveDocumentTargetInput,
): Promise<ResolvedDocumentTarget> {
   const kind = classifyPositionalTarget(target);
   const timeoutMs = input.timeoutMs ?? DEFAULT_TARGET_TIMEOUT_MS;
   const commandName = input.commandName ?? 'This command';

   if (kind === 'stdin') {
      return resolveStdinTarget();
   }
   if (kind === 'app') {
      return resolveAppTarget(target, Boolean(input.allowApp), commandName);
   }
   if (kind === 'url') {
      return resolveUrlTarget(target, timeoutMs);
   }
   return resolveFileTarget(target);
}

/** Describes a resolved target as one string for reporting: a URL, or a fixed label. */
export function describeResolvedTarget(resolved: ResolvedDocumentTarget): string {
   if (resolved.load?.kind === 'goto') {
      return resolved.load.url;
   }
   if (resolved.target.kind === 'html') {
      return 'inline-html';
   }
   return resolved.target.value;
}

/**
 * Resolves one document target: an http(s) URL, a local file path, `-` for HTML on stdin,
 * inline `--html`, or (when `allowApp` is set) `app:<name>` for a native app. Returns a
 * `load` descriptor for Playwright and a lazy `readHtml()` for callers that need the raw
 * markup, so a page command that only drives Playwright never makes a separate network
 * request first.
 */
export async function resolveDocumentTarget(
   input: ResolveDocumentTargetInput,
): Promise<ResolvedDocumentTarget> {
   if (input.html !== undefined) {
      return resolveInlineTarget('html', input.html);
   }
   if (input.url !== undefined) {
      return resolveUrlTarget(input.url, input.timeoutMs ?? DEFAULT_TARGET_TIMEOUT_MS);
   }
   if (input.target !== undefined) {
      return resolvePositionalTarget(input.target, input);
   }

   throw new CliUsageError(
      'missing-target',
      'Provide a target: an http(s) URL, a file path, - for stdin, or --html.',
   );
}
