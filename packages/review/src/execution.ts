import { resolve } from 'node:path';
import type { AuditAssessmentRequest } from '@a11ied/contracts';
import type {
   CoordinatedReviewScope,
   ReviewCoordinatorLink,
} from './coordinator-scope.js';
import type { BroaderReviewObligation } from './coordinated-progress.js';
import type { ReviewCoverageSummary, StateClaimLease } from './types.js';

export type ReviewExecutionAction =
   | { tool: 'review.next'; arguments: { runDir: string; agentId: string } }
   | { tool: 'review.report'; arguments: { runDir: string; draft: false } }
   | {
        tool: 'audit_assessment';
        arguments: Extract<AuditAssessmentRequest, { action: 'next' | 'resume' }>;
     }
   | { kind: 'collect-scope'; checkIds: readonly string[] };

export interface ReviewExecutionState {
   state: 'runnable' | 'waiting' | 'blocked' | 'complete';
   unresolved: number;
   nextAction?: ReviewExecutionAction;
   waitUntil?: string;
   reasons: readonly string[];
}

interface ExecutionInput {
   runDir: string;
   agentId: string;
   coverage: ReviewCoverageSummary;
   finalReady: boolean;
   stateWorkAvailable: boolean;
   activeLeases: readonly StateClaimLease[];
   scopeGaps: readonly string[];
   blockers: readonly string[];
   broader: readonly BroaderReviewObligation[];
   coordinator?: ReviewCoordinatorLink | undefined;
   scope?: CoordinatedReviewScope | undefined;
}

function getBroaderCheckStatus(
   input: ExecutionInput,
   checkId: string,
): string | undefined {
   return input.scope?.snapshot.status.run.checks.find(
      (check) => check.checkId === checkId,
   )?.status;
}

function getBroaderExecutionAction(
   input: ExecutionInput,
): ReviewExecutionAction | undefined {
   if (
      !input.coordinator ||
      (input.scope?.snapshot.status.run.activeCheckIds.length ?? 0) > 0
   ) {
      return undefined;
   }
   const staleCheckIds = input.broader
      .filter(
         (unit) =>
            !unit.complete && getBroaderCheckStatus(input, unit.checkId) === 'stale',
      )
      .map((unit) => unit.checkId);
   if (staleCheckIds.length > 0) {
      return {
         tool: 'audit_assessment',
         arguments: {
            action: 'resume',
            file: resolve(input.runDir, input.coordinator.file),
            retryCheckIds: staleCheckIds,
            onlyIfIdle: true,
         },
      };
   }
   const queued = input.broader.filter((unit) => {
      const status = getBroaderCheckStatus(input, unit.checkId);
      return (
         !unit.complete &&
         unit.environmentId &&
         (status === undefined || status === 'queued')
      );
   });
   if (queued.length > 0) {
      return {
         tool: 'audit_assessment',
         arguments: {
            action: 'next',
            file: resolve(input.runDir, input.coordinator.file),
            scopes: ['site', 'journey'],
            checkIds: queued.map((unit) => unit.checkId),
            count: 1,
         },
      };
   }
   const missingScope = input.broader.filter(
      (unit) => !unit.complete && !unit.environmentId,
   );
   return missingScope.length > 0
      ? { kind: 'collect-scope', checkIds: missingScope.map((unit) => unit.checkId) }
      : undefined;
}

/** Describe existing durable work without creating another queue or replaying actions. */
export function getReviewExecutionState(input: ExecutionInput): ReviewExecutionState {
   const base = {
      unresolved: input.coverage.unresolved,
      reasons: [...input.scopeGaps, ...input.blockers],
   };
   if (input.finalReady) {
      return {
         ...base,
         state: 'complete',
         nextAction: {
            tool: 'review.report',
            arguments: { runDir: input.runDir, draft: false },
         },
      };
   }
   if (input.stateWorkAvailable) {
      return {
         ...base,
         state: 'runnable',
         nextAction: {
            tool: 'review.next',
            arguments: { runDir: input.runDir, agentId: input.agentId },
         },
      };
   }
   const broaderAction = getBroaderExecutionAction(input);
   if (broaderAction) {
      return { ...base, state: 'runnable', nextAction: broaderAction };
   }
   const runningBroader =
      (input.scope?.snapshot.status.run.activeCheckIds.length ?? 0) > 0;
   if (input.activeLeases.length > 0 || runningBroader) {
      const waitUntil = input.activeLeases
         .map((lease) => lease.expiresAt)
         .filter((value) => value !== undefined)
         .toSorted()[0];
      return {
         ...base,
         state: 'waiting',
         ...(waitUntil ? { waitUntil } : {}),
         reasons: runningBroader
            ? [
                 ...base.reasons,
                 'The linked coordinator has active work. Inspect its claims before recovering interrupted work.',
              ]
            : base.reasons,
      };
   }
   return {
      ...base,
      state: 'blocked',
      reasons: [
         ...base.reasons,
         ...input.broader
            .filter((unit) => !unit.complete)
            .flatMap((unit) => unit.reasons),
         'No unleased assessment is runnable. Inspect recorded blockers or missing scope; coverage remains incomplete.',
      ],
   };
}
