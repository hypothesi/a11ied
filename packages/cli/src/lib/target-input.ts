import type { ResolveDocumentTargetInput } from '#core';

export interface CliTargetInputOptions {
   url?: string;
}

/** Builds a document-target input from a command's `--url` option (used by sr start). */
export function buildCliTargetInput(
   options: CliTargetInputOptions,
): CliTargetInputOptions {
   const input: CliTargetInputOptions = {};
   if (options.url) {
      input.url = options.url;
   }
   return input;
}

export interface PageTargetInputOptions {
   html?: string;
   timeout?: string;
}

/**
 * Builds a {@link ResolveDocumentTargetInput} for a page command's positional `<target>`:
 * an http(s) URL, a file path, `-` for stdin, or `--html`. `commandName` names the
 * command in the error message when the target is `app:<name>`, which page commands do
 * not accept.
 */
export function buildPageTargetInput(
   target: string | undefined,
   options: PageTargetInputOptions,
   commandName: string,
): ResolveDocumentTargetInput {
   const input: ResolveDocumentTargetInput = { commandName };
   if (options.html !== undefined) {
      input.html = options.html;
   }
   if (target !== undefined) {
      input.target = target;
   }
   if (options.timeout !== undefined) {
      input.timeoutMs = Number.parseInt(options.timeout, 10);
   }
   return input;
}
