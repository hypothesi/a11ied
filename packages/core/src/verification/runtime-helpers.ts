import {
   platformSchema,
   type AccessibilityDriverSession,
   type CliMessage,
   type Platform,
   type VerificationCriterionResult,
   type VerificationReport,
   type WcagLevel,
} from '@a11ied/contracts';

import { CliUsageError } from '../errors/cli-errors.js';
import { resolveDefaultTarget } from '../driver/default-target.js';
import { startDriverSession, stopDriverSession } from '../driver/runtime.js';
import { listWcagCriteria } from '../wcag/runtime.js';
import { buildTarget } from './helpers.js';

function parsePlatform(target: string): Platform {
   const parsed = platformSchema.safeParse(target);
   if (!parsed.success) {
      throw new CliUsageError('validation-error', `Target "${target}" is unsupported.`, {
         field: 'target',
         value: target,
         supportedTargets: [...platformSchema.options],
      });
   }

   return parsed.data;
}

export function resolveVerificationTarget(target: string | undefined): {
   parsedTarget: Platform;
   fallback?: CliMessage;
} {
   if (target) {
      return { parsedTarget: parsePlatform(target) };
   }

   const fallback = resolveDefaultTarget();
   return {
      parsedTarget: fallback.target,
      fallback: {
         code: 'default-target-selected',
         message: fallback.message,
      },
   };
}

export function expandCriteriaForConformanceLevel(
   level: WcagLevel,
   version: string,
): string[] {
   const levelOrder: WcagLevel[] = ['A', 'AA', 'AAA'];
   const selectedIndex = levelOrder.indexOf(level);
   const expanded = levelOrder
      .slice(0, selectedIndex + 1)
      .flatMap((entryLevel) =>
         listWcagCriteria(entryLevel, version).criteria.map((criterion) => criterion.id),
      );

   return [...new Set(expanded)];
}

export function toWarningsList(warning: CliMessage | undefined): CliMessage[] {
   if (warning) {
      return [warning];
   }
   return [];
}

export function resolveTarget(
   target: VerificationReport['target'] | undefined,
   url: string,
   parsedTarget: Platform,
): VerificationReport['target'] {
   if (target) {
      return target;
   }
   return buildTarget(url, parsedTarget);
}

export function resolveVersion(
   criteria: VerificationCriterionResult[],
   fallback: string,
): '2.1' | '2.2' {
   if (criteria[0]?.criterion.wcagVersion) {
      return criteria[0].criterion.wcagVersion;
   }
   return fallback as '2.1' | '2.2';
}

export async function withManagedVerificationSession<TResult>(args: {
   parsedTarget: Platform;
   recordingPath?: string;
   run: (session: AccessibilityDriverSession | undefined) => Promise<TResult>;
   forceSession?: boolean;
}): Promise<{ result: TResult; recording: VerificationReport['recording'] | undefined }> {
   let session: AccessibilityDriverSession | undefined = undefined;
   let result: TResult | undefined = undefined;
   if (args.recordingPath || args.forceSession) {
      session = await startDriverSession(
         args.parsedTarget,
         process.cwd(),
         args.recordingPath,
      );
   }

   try {
      result = await args.run(session);
   } finally {
      if (session) {
         const stopped = await stopDriverSession(session.sessionId);
         session = stopped.session;
      }
   }

   return {
      result: result as TResult,
      recording: session?.recording,
   };
}

function resolveVerificationSessionId(
   session: AccessibilityDriverSession | string,
): string {
   if (typeof session === 'string') {
      return session;
   }

   return session.sessionId;
}

export function withVerificationSessionId<TArgs extends Record<string, unknown>>(
   args: TArgs,
   session: AccessibilityDriverSession | string | undefined,
): TArgs & { sessionId?: string } {
   if (session) {
      const sessionId = resolveVerificationSessionId(session);
      return {
         ...args,
         sessionId,
      };
   }

   return args;
}
