import { platformSchema, type Platform } from '#contracts';
import {
   CliUsageError,
   describeResolvedTarget,
   resolveDefaultTarget,
   resolveDocumentTarget,
   type DocumentLoad,
   type ResolveDocumentTargetInput,
} from '#core';
import { getPlatformScreenReaders } from '../commands/drive-key-help.js';

interface VirtualTargetGuardOptions {
   allowVirtual?: boolean;
}

export function buildVirtualTargetGuardOptions(
   allowVirtual?: boolean,
): VirtualTargetGuardOptions | undefined {
   if (allowVirtual) {
      return { allowVirtual: true };
   }
   return undefined;
}

function ensureVirtualTargetAllowed(
   target: Platform,
   options?: VirtualTargetGuardOptions,
): void {
   if (target !== 'virtual') {
      return;
   }

   const fallback = resolveDefaultTarget();
   if (fallback.target === 'virtual') {
      return;
   }

   if (options?.allowVirtual) {
      return;
   }

   throw new CliUsageError(
      'virtual-target-disallowed',
      `The virtual target is a simulation. Omit --sr to use ${getPlatformScreenReaders()}, or pass --allow-virtual to proceed.`,
      {
         target,
         defaultTarget: fallback.target,
      },
   );
}

export function parsePlatform(
   target: string | undefined,
   options?: VirtualTargetGuardOptions,
): Platform {
   if (!target) {
      const fallback = resolveDefaultTarget();
      throw new CliUsageError(
         'validation-error',
         `${fallback.message} Provide --sr to override.`,
         {
            field: 'sr',
            value: target ?? undefined,
            defaultTarget: fallback.target,
         },
      );
   }

   const parsed = platformSchema.safeParse(target);
   if (!parsed.success) {
      throw new CliUsageError(
         'validation-error',
         `Screen reader "${target ?? ''}" is unsupported.`,
         {
            field: 'sr',
            value: target ?? undefined,
            supportedTargets: [...platformSchema.options],
         },
      );
   }

   ensureVirtualTargetAllowed(parsed.data, options);
   return parsed.data;
}

export interface ResolvedCliTarget {
   resolvedUrl: string;
   html: string;
   metadata: Record<string, string>;
   userHints: string[];
   reportTarget: {
      kind: string;
      value: string;
      resolvedUrl: string;
   };
}

function buildReportTarget(
   resolved: Awaited<ReturnType<typeof resolveDocumentTarget>>,
   resolvedUrl: string,
): ResolvedCliTarget['reportTarget'] {
   return {
      kind: resolved.target.kind,
      value: resolved.target.value,
      resolvedUrl,
   };
}

async function toCliTarget(
   resolved: Awaited<ReturnType<typeof resolveDocumentTarget>>,
): Promise<ResolvedCliTarget> {
   const resolvedUrl = describeResolvedTarget(resolved);
   return {
      resolvedUrl,
      html: await resolved.readHtml(),
      metadata: resolved.metadata,
      userHints: resolved.userHints,
      reportTarget: buildReportTarget(resolved, resolvedUrl),
   };
}

// Fallow-ignore-next-line unused-export
export async function resolveCliTarget(options: {
   url?: string | undefined;
}): Promise<ResolvedCliTarget> {
   if (!options.url) {
      throw new CliUsageError('missing-target', 'Provide a --url to resolve the target.');
   }

   return toCliTarget(await resolveDocumentTarget({ url: options.url }));
}

export async function resolveOptionalCliTarget(options: {
   url?: string | undefined;
}): Promise<ResolvedCliTarget | undefined> {
   if (!options.url) {
      return undefined;
   }

   return resolveCliTarget(options);
}

export interface ResolvedPageTarget {
   /** How to load this target into a Playwright page. Never undefined for a page command. */
   load: DocumentLoad;
   /** Reads the target's raw markup. Only call this when it is actually needed. */
   readHtml: () => Promise<string>;
   metadata: Record<string, string>;
   userHints: string[];
   reportTarget: {
      kind: string;
      value: string;
      resolvedUrl: string;
   };
}

function assertLoad(
   load: Awaited<ReturnType<typeof resolveDocumentTarget>>['load'],
): DocumentLoad {
   if (!load) {
      throw new CliUsageError('missing-target', 'This command needs a document target.');
   }
   return load;
}

function hasPageTargetInput(options: ResolveDocumentTargetInput): boolean {
   return options.target !== undefined || options.html !== undefined;
}

/**
 * Resolves one page command's target (axe, tree, audit): an http(s) URL, a file path, `-`
 * for stdin, or `--html`. Unlike {@link resolveCliTarget}, this never fetches the target's
 * markup up front; call `readHtml()` only when the raw markup is needed.
 */
export async function resolvePageTarget(
   options: ResolveDocumentTargetInput,
): Promise<ResolvedPageTarget> {
   if (!hasPageTargetInput(options)) {
      throw new CliUsageError(
         'missing-target',
         'Provide a target: a URL, a file path, - for stdin, or --html.',
      );
   }

   const resolved = await resolveDocumentTarget(options);
   const load = assertLoad(resolved.load);
   const resolvedUrl = describeResolvedTarget(resolved);
   return {
      load,
      readHtml: resolved.readHtml,
      metadata: resolved.metadata,
      userHints: resolved.userHints,
      reportTarget: {
         kind: resolved.target.kind,
         value: resolved.target.value,
         resolvedUrl,
      },
   };
}

function countSelectors(options: {
   criterion?: string;
   level?: string;
   rule?: string[];
}): number {
   let count = 0;
   if (options.criterion) {
      count += 1;
   }
   if (options.level) {
      count += 1;
   }
   if (options.rule && options.rule.length > 0) {
      count += 1;
   }
   return count;
}

// Fallow-ignore-next-line unused-export
export function resolveRunAxeSelection(options: {
   criterion?: string;
   level?: string;
   rule?: string[];
}):
   | { kind: 'all' }
   | { kind: 'criterion'; criterion: string }
   | { kind: 'level'; level: string }
   | { kind: 'rule'; ruleIds: string[] } {
   const selectionCount = countSelectors(options);
   if (selectionCount > 1) {
      throw new CliUsageError(
         'invalid-selection',
         'Choose at most one of --criterion, --level, or --rule.',
      );
   }

   if (selectionCount === 0) {
      return { kind: 'all' };
   }

   if (options.criterion) {
      return { kind: 'criterion', criterion: options.criterion };
   }

   if (options.level) {
      return { kind: 'level', level: options.level };
   }

   const ruleIds = options.rule ?? [];
   return { kind: 'rule', ruleIds };
}
