import type { DocumentTargetKind } from '@a11ied/contracts';

import { CliUsageError } from '../errors/cli-errors.js';

/** How a resolved document target should be loaded into a Playwright page. */
export type DocumentLoad = { kind: 'goto'; url: string } | { kind: 'html'; html: string };

const APP_TARGET_PREFIX = 'app:';
const STDIN_TARGET = '-';

/** Parses a `URL` and rejects anything but http or https. */
export function parseHttpUrl(url: string, field = 'target'): URL {
   let parsedUrl: URL | undefined = undefined;
   try {
      parsedUrl = new URL(url);
   } catch {
      throw new CliUsageError('invalid-url', `URL "${url}" is invalid.`, {
         field,
         value: url,
      });
   }

   if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new CliUsageError('invalid-url', `URL "${url}" must use http or https.`, {
         field,
         value: url,
      });
   }

   return parsedUrl;
}

function isHttpUrl(value: string): boolean {
   return value.startsWith('http://') || value.startsWith('https://');
}

/**
 * Classifies one positional `<target>` value into the document target grammar: an http(s)
 * URL, a local file path, `-` for HTML on stdin, or `app:<name>` for a native app. Does
 * not read the target's content.
 */
export function classifyPositionalTarget(target: string): DocumentTargetKind {
   if (target === STDIN_TARGET) {
      return 'stdin';
   }
   if (target.startsWith(APP_TARGET_PREFIX)) {
      return 'app';
   }
   if (isHttpUrl(target)) {
      return 'url';
   }
   return 'file';
}

/** Reads the app name out of an `app:<name>` target string. */
export function parseAppTargetName(target: string): string {
   return target.slice(APP_TARGET_PREFIX.length);
}

/**
 * Rejects an `app:<name>` target for a command that only accepts documents. `commandName`
 * names the rejecting command in the error message.
 */
export function rejectAppTarget(target: string, commandName: string): never {
   throw new CliUsageError(
      'target-unsupported',
      `"${target}" is an app target. ${commandName} accepts a URL, a file path, - for ` +
         'stdin, or --html. Use a1 sr to drive a native app.',
      { field: 'target', value: target },
   );
}
