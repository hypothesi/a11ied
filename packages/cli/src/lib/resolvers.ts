import { platformSchema, type Platform, type VerificationReport } from '#contracts';
import { CliUsageError, resolveDefaultTarget, resolveDocumentTarget } from '#core';
import { resolveImplicitDriveSession, type DriveSessionSource } from './drive-session.js';
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
      `The virtual target is a simulation. Omit --target to use ${getPlatformScreenReaders()}, or pass --allow-virtual to proceed.`,
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
         `${fallback.message} Provide --target to override.`,
         {
            field: 'target',
            value: target ?? undefined,
            defaultTarget: fallback.target,
         },
      );
   }

   const parsed = platformSchema.safeParse(target);
   if (!parsed.success) {
      throw new CliUsageError(
         'validation-error',
         `Driver target "${target ?? ''}" is unsupported.`,
         {
            field: 'target',
            value: target ?? undefined,
            supportedTargets: [...platformSchema.options],
         },
      );
   }

   ensureVirtualTargetAllowed(parsed.data, options);
   return parsed.data;
}

function buildResolvedSessionOptions(options: { session?: string; cwd?: string }): {
   session?: string;
   cwd?: string;
} {
   const sessionOptions: { session?: string; cwd?: string } = {};

   if (options.session) {
      sessionOptions.session = options.session;
   }
   if (options.cwd) {
      sessionOptions.cwd = options.cwd;
   }

   return sessionOptions;
}

function resolveEphemeralDriveSession(options: {
   target?: string;
   allowVirtual?: boolean;
}): { target?: Platform; ephemeral: true; sessionSource: 'none' } {
   if (!options.target) {
      return {
         ephemeral: true,
         sessionSource: 'none',
      };
   }

   return {
      ephemeral: true,
      sessionSource: 'none',
      target: parsePlatform(
         options.target,
         buildVirtualTargetGuardOptions(options.allowVirtual),
      ),
   };
}

export async function resolveDriveSession(options: {
   session?: string;
   target?: string;
   ephemeral?: boolean;
   allowVirtual?: boolean;
   cwd?: string;
   allowMissing?: boolean;
}): Promise<{
   sessionId?: string;
   target?: Platform;
   ephemeral: boolean;
   sessionSource: DriveSessionSource;
}> {
   if (options.ephemeral && options.session) {
      throw new CliUsageError(
         'ephemeral-session-conflict',
         'Use either --session or --ephemeral, not both.',
         { session: options.session },
      );
   }

   if (options.ephemeral) {
      return resolveEphemeralDriveSession(options);
   }

   const resolvedSession = await resolveImplicitDriveSession(
      buildResolvedSessionOptions(options),
   );

   if (!resolvedSession.sessionId) {
      if (options.allowMissing) {
         return {
            ephemeral: false,
            sessionSource: 'none',
         };
      }
      throw new CliUsageError(
         'missing-session',
         'A session id is required unless --ephemeral is present.',
      );
   }

   return {
      ephemeral: false,
      sessionId: resolvedSession.sessionId,
      sessionSource: resolvedSession.source,
   };
}

export interface ResolvedCliTarget {
   resolvedUrl: string;
   html: string;
   metadata: Record<string, string>;
   userHints: string[];
   reportTarget: VerificationReport['target'];
}

function buildReportTarget(
   resolved: Awaited<ReturnType<typeof resolveDocumentTarget>>,
): VerificationReport['target'] {
   return {
      kind: 'url',
      value: resolved.target.value,
      resolvedUrl: resolved.resolvedUrl,
   };
}

function toCliTarget(
   resolved: Awaited<ReturnType<typeof resolveDocumentTarget>>,
): ResolvedCliTarget {
   return {
      resolvedUrl: resolved.resolvedUrl,
      html: resolved.html,
      metadata: resolved.metadata,
      userHints: resolved.userHints,
      reportTarget: buildReportTarget(resolved),
   };
}

// Fallow-ignore-next-line unused-export
export async function resolveCliTarget(options: {
   url?: string;
}): Promise<ResolvedCliTarget> {
   if (!options.url) {
      throw new CliUsageError('missing-target', 'Provide a --url to resolve the target.');
   }

   return toCliTarget(await resolveDocumentTarget({ url: options.url }));
}

export async function resolveOptionalCliTarget(options: {
   url?: string;
}): Promise<ResolvedCliTarget | undefined> {
   if (!options.url) {
      return undefined;
   }

   return resolveCliTarget(options);
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
