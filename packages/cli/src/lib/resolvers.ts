import { platformSchema, type Platform, type VerificationReport } from '#contracts';
import { CliUsageError, resolveDocumentTarget } from '#core';

export function parsePlatform(target: string | undefined): Platform {
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

   return parsed.data;
}

export function resolveDriveSession(options: {
   session?: string;
   target?: string;
   ephemeral?: boolean;
}): {
   sessionId?: string;
   target?: Platform;
   ephemeral: boolean;
} {
   if (options.ephemeral && options.session) {
      throw new CliUsageError(
         'ephemeral-session-conflict',
         'Use either --session or --ephemeral, not both.',
         { session: options.session },
      );
   }

   if (options.ephemeral) {
      if (!options.target) {
         throw new CliUsageError(
            'missing-target',
            'A driver target is required when --ephemeral is present.',
         );
      }

      return {
         ephemeral: true,
         target: parsePlatform(options.target),
      };
   }

   if (!options.session) {
      throw new CliUsageError(
         'missing-session',
         'A session id is required unless --ephemeral is present.',
      );
   }

   return {
      ephemeral: false,
      sessionId: options.session,
   };
}

export interface ResolvedCliTarget {
   resolvedUrl: string;
   html: string;
   metadata: Record<string, string>;
   userHints: string[];
   reportTarget: VerificationReport['target'];
}

function hasStorybookInput(options: {
   storybookUrl?: string;
   storyId?: string;
}): boolean {
   return Boolean(options.storybookUrl || options.storyId);
}

function requireStorybookPair(options: {
   storybookUrl?: string;
   storyId?: string;
}): void {
   if (!options.storybookUrl) {
      throw new CliUsageError(
         'missing-storybook-url',
         'A Storybook base URL is required when --story-id is present.',
      );
   }

   if (!options.storyId) {
      throw new CliUsageError(
         'missing-story-id',
         'A story id is required when --storybook-url is present.',
      );
   }
}

function buildReportTarget(
   resolved: Awaited<ReturnType<typeof resolveDocumentTarget>>,
): VerificationReport['target'] {
   if (resolved.target.kind === 'story') {
      return {
         kind: 'story',
         value: resolved.target.value,
         resolvedUrl: resolved.resolvedUrl,
         storybookBaseUrl: resolved.storybookBaseUrl,
      };
   }

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

async function resolveStorybookCliTarget(options: {
   storybookUrl?: string;
   storyId?: string;
}): Promise<ResolvedCliTarget> {
   requireStorybookPair(options);
   const storybookUrl = options.storybookUrl;
   const storyId = options.storyId;
   if (!storybookUrl || !storyId) {
      throw new CliUsageError(
         'missing-target',
         'Provide either --url or --storybook-url with --story-id.',
      );
   }
   return toCliTarget(await resolveDocumentTarget({ storybookUrl, storyId }));
}

function validateNoConflictingInputs(options: {
   url?: string;
   storybookUrl?: string;
   storyId?: string;
}): void {
   if (options.url && hasStorybookInput(options)) {
      throw new CliUsageError(
         'conflicting-target-inputs',
         'Use either --url or --storybook-url with --story-id, not both.',
      );
   }
}

export async function resolveCliTarget(options: {
   url?: string;
   storybookUrl?: string;
   storyId?: string;
}): Promise<ResolvedCliTarget> {
   validateNoConflictingInputs(options);

   if (hasStorybookInput(options)) {
      return resolveStorybookCliTarget(options);
   }

   if (!options.url) {
      throw new CliUsageError(
         'missing-target',
         'Provide either --url or --storybook-url with --story-id.',
      );
   }

   return toCliTarget(await resolveDocumentTarget({ url: options.url }));
}

export async function resolveOptionalCliTarget(options: {
   url?: string;
   storybookUrl?: string;
   storyId?: string;
}): Promise<ResolvedCliTarget | undefined> {
   if (!options.url && !options.storybookUrl && !options.storyId) {
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

export function resolveRunAxeSelection(options: {
   criterion?: string;
   level?: string;
   rule?: string[];
}):
   | { kind: 'criterion'; criterion: string }
   | { kind: 'level'; level: string }
   | { kind: 'rule'; ruleIds: string[] } {
   if (countSelectors(options) !== 1) {
      throw new CliUsageError(
         'invalid-selection',
         'Choose exactly one of --criterion, --level, or --rule.',
      );
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
