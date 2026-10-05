import {
   auditAssessmentRequestSchema,
   type AssessmentCheck,
   type AssessmentProcedure,
   type AuditAssessmentRequest,
   type AuditRun,
} from '@a11ied/contracts';
import { CliUsageError } from '../errors/cli-errors.js';
import {
   finalizeAuditAssessment,
   getAuditAssessmentStatus,
   nextAuditAssessment,
   resumeAuditAssessment,
   startAuditAssessment,
} from './run-lifecycle.js';
import {
   queueAssessmentCheck,
   registerAuditJourney,
   registerAuditState,
   transitionAssessmentCheck,
} from './run-state.js';
import { getAssessmentCheckId, getAuditRunPaths } from './run-store.js';
import type { AuditAssessmentStatus } from './run-status.js';

const DEFAULT_LIMIT = 20;

interface AssessmentPage<Item> {
   items: Item[];
   total: number;
   nextOffset?: number;
}

export interface AuditAssessmentResponse {
   action: AuditAssessmentRequest['action'];
   file: string;
   evidenceFile: string;
   artifactsDir: string;
   run: Pick<
      AuditRun,
      | 'runId'
      | 'revision'
      | 'target'
      | 'profile'
      | 'scope'
      | 'status'
      | 'activeCheckId'
      | 'actionPolicy'
   >;
   complete: boolean;
   coverage: AuditAssessmentStatus['coverage'];
   issues: AssessmentPage<AuditAssessmentStatus['issues'][number]>;
   states: AssessmentPage<AuditRun['states'][number]>;
   journeys: AssessmentPage<AuditRun['journeys'][number]>;
   environments: AssessmentPage<AuditRun['environments'][number]>;
   progress: {
      states: AssessmentPage<AuditAssessmentStatus['progress']['states'][number]>;
      pages: AssessmentPage<AuditAssessmentStatus['progress']['pages'][number]>;
      journeys: AssessmentPage<AuditAssessmentStatus['progress']['journeys'][number]>;
   };
   mutation?: {
      revision: number;
      stateId?: string | undefined;
      journeyId?: string | undefined;
      checkId?: string | undefined;
   };
   next?: {
      check: AssessmentCheck;
      procedure: AssessmentProcedure;
      context: {
         environment: AuditRun['environments'][number] | undefined;
         journey: AuditRun['journeys'][number] | undefined;
         states: AssessmentPage<AuditRun['states'][number]>;
      };
   };
   guidance: string;
}

function getPage<Item>(
   items: Item[],
   offset: number,
   limit: number,
): AssessmentPage<Item> {
   const end = offset + limit;
   return {
      items: items.slice(offset, end),
      total: items.length,
      ...(end < items.length ? { nextOffset: end } : {}),
   };
}

function getCheckContext(
   run: AuditRun,
   check: AssessmentCheck,
): NonNullable<AuditAssessmentResponse['next']>['context'] {
   const byId = new Map(run.states.map((state) => [state.stateId, state]));
   const states =
      check.scope === 'site'
         ? run.states.filter((state) => state.environmentId === check.environmentId)
         : check.stateIds.flatMap((id) => {
              const state = byId.get(id);
              return state ? [state] : [];
           });
   return {
      environment: run.environments.find(
         (environment) => environment.environmentId === check.environmentId,
      ),
      journey: run.journeys.find((journey) => journey.journeyId === check.journeyId),
      states: { items: states.slice(0, DEFAULT_LIMIT), total: states.length },
   };
}

function buildResponse(input: {
   request: AuditAssessmentRequest;
   file: string;
   status: AuditAssessmentStatus;
   mutation?: AuditAssessmentResponse['mutation'];
   next?: Pick<NonNullable<AuditAssessmentResponse['next']>, 'check' | 'procedure'>;
}): AuditAssessmentResponse {
   const { request, status } = input;
   const limit = request.action === 'status' ? request.limit : DEFAULT_LIMIT,
      offset = request.action === 'status' ? request.offset : 0;
   const { runId, revision, target, profile, scope, activeCheckId, actionPolicy } =
      status.run;
   return {
      action: request.action,
      ...getAuditRunPaths(input.file),
      run: {
         runId,
         revision,
         target,
         profile,
         scope,
         status: status.run.status,
         activeCheckId,
         actionPolicy,
      },
      complete: status.complete,
      coverage: status.coverage,
      issues: getPage(status.issues, offset, limit),
      states: getPage(status.run.states, offset, limit),
      journeys: getPage(status.run.journeys, offset, limit),
      environments: getPage(status.run.environments, offset, limit),
      progress: {
         states: getPage(status.progress.states, offset, limit),
         pages: getPage(status.progress.pages, offset, limit),
         journeys: getPage(status.progress.journeys, offset, limit),
      },
      ...(input.mutation ? { mutation: input.mutation } : {}),
      ...(input.next
         ? {
              next: {
                 ...input.next,
                 context: getCheckContext(status.run, input.next.check),
              },
           }
         : {}),
      guidance: input.next
         ? 'Execute the procedure in the declared environment, save observed evidence, then evaluate this check. Agent judgment is required. ' +
           'For additional state context, read all status state pages. For site checks, collect every state in the check environment; ' +
           'otherwise preserve check.stateIds order.'
         : 'Inspect coverage issues and registered states. Discover missing states and journeys before claiming completion. Use next for an obligation.',
   };
}

function getMutationResult(
   request: AuditAssessmentRequest,
   run: AuditRun,
): NonNullable<AuditAssessmentResponse['mutation']> {
   switch (request.action) {
      case 'state': {
         return { revision: run.revision, stateId: run.states.at(-1)?.stateId };
      }
      case 'journey': {
         return { revision: run.revision, journeyId: request.journey.journeyId };
      }
      case 'queue': {
         return { revision: run.revision, checkId: getAssessmentCheckId(request.check) };
      }
      case 'evaluate':
      case 'block': {
         return { revision: run.revision, checkId: request.checkId };
      }
      default: {
         return { revision: run.revision };
      }
   }
}

async function applyMutation(
   request: Exclude<AuditAssessmentRequest, { action: 'start' | 'next' | 'status' }>,
): Promise<AuditRun> {
   switch (request.action) {
      case 'state': {
         return registerAuditState(request);
      }
      case 'journey': {
         return registerAuditJourney(request);
      }
      case 'queue': {
         return queueAssessmentCheck(request);
      }
      case 'resume': {
         const status = await resumeAuditAssessment({
            file: request.file,
            ...(request.retryCheckIds ? { retryCheckIds: request.retryCheckIds } : {}),
         });
         return status.run;
      }
      case 'evaluate': {
         return transitionAssessmentCheck({ ...request, status: 'evaluated' });
      }
      case 'block': {
         return transitionAssessmentCheck({ ...request, status: 'blocked' });
      }
      case 'finalize': {
         const status = await finalizeAuditAssessment(request);
         return status.run;
      }
      default: {
         throw new CliUsageError('audit-action-invalid', 'Unknown assessment action.');
      }
   }
}

/** Validate once and use the durable coordinator; this boundary never performs UI input. */
export async function executeAuditAssessment(
   input: AuditAssessmentRequest,
): Promise<AuditAssessmentResponse> {
   const request = auditAssessmentRequestSchema.parse(input);
   if (request.action === 'start') {
      const started = await startAuditAssessment({
         ...request,
         scope: request.scope ?? (request.target.kind === 'app' ? 'app' : 'site'),
      });
      return buildResponse({ request, file: started.file, status: started.status });
   }
   if (request.action === 'next') {
      const next = await nextAuditAssessment(request.file),
         status = await getAuditAssessmentStatus(request.file);
      if (
         status.run.revision !== next.run.revision ||
         (next.check && status.run.activeCheckId !== next.check.checkId)
      ) {
         throw new CliUsageError(
            'audit-claim-changed',
            'The audit changed while claiming work. Inspect status and resume before retrying. No UI input was sent.',
         );
      }
      return buildResponse({
         request,
         file: request.file,
         status,
         ...(next.check && next.procedure
            ? { next: { check: next.check, procedure: next.procedure } }
            : {}),
      });
   }
   const mutation =
      request.action === 'status'
         ? undefined
         : getMutationResult(request, await applyMutation(request));
   return buildResponse({
      request,
      file: request.file,
      ...(mutation ? { mutation } : {}),
      status: await getAuditAssessmentStatus(request.file),
   });
}
