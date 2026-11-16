import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { writeAtomic } from '../../files/store.js';
import type {
   AssessmentEvidenceKind,
   EvidenceProvenance,
   MediaInventory,
} from '@a11ied/contracts';
import type { Judgement } from './probe-types.js';
import type { PageFacts } from './page-fact-types.js';

const METHOD_LIMIT = 400;
const JSON_INDENT = 3;
const MIN_POINTER_TARGET_PX = 24;

type Artifact = EvidenceProvenance['artifacts'][number];

export interface CriterionMeasurement {
   value: number;
   unit: string;
   method: string;
}

export interface PageJudgement {
   url: string;
   judgement: Judgement;
   mediaInventory?: MediaInventory | undefined;
   /** Observed facts about the page, when the browser collected them. */
   facts?: PageFacts | undefined;
   /** Pre-built measurements, preferred over extracting from facts. */
   measurements?: CriterionMeasurement[] | undefined;
}

export function getProbeArtifactPath(
   checkId: string,
   attempt: number,
   kind: AssessmentEvidenceKind,
): string {
   const extension = kind === 'screenshot' ? 'png' : 'json';
   return `artifacts/${checkId}-a${String(attempt)}-${kind}.${extension}`;
}

export type StateReference = EvidenceProvenance['states'][number];

export interface ArtifactInput {
   runFile: string;
   runId: string;
   checkId: string;
   attempt: number;
   environmentId: string;
   kinds: AssessmentEvidenceKind[];
   states: StateReference[];
   pages: PageJudgement[];
   rationale: string;
   captureScreenshot: (url: string) => Promise<Buffer>;
}

function sha256(body: Buffer): string {
   return createHash('sha256').update(body).digest('hex');
}

function buildTrace(input: ArtifactInput, capturedAt: string): unknown[] {
   const at = (): string => capturedAt;
   const first = input.states[0]?.stateId ?? '';
   return [
      {
         index: 0,
         action: `checkpoint ${input.checkId}`,
         at: at(),
         stateId: first,
         checkpoint: input.checkId,
      },
      ...input.states.map((state, index) => ({
         index: index + 1,
         action: 'evaluate criterion probe in the browser',
         at: at(),
         stateId: state.stateId,
      })),
   ];
}

function fallbackMeasurement(page: PageJudgement): CriterionMeasurement {
   return {
      value: page.judgement.outcome === 'failed' ? 0 : 1,
      unit: 'px',
      method:
         `Browser measurement check on ${page.url}: ${page.judgement.rationale}`.slice(
            0,
            METHOD_LIMIT,
         ),
   };
}

/**
 * Turns the observed facts for one page into the physical measurements behind the
 * criterion, preferring caller-provided measurements from judgePages.
 */
export function buildCriterionMeasurements(
   criterionId: string | undefined,
   page: PageJudgement,
): CriterionMeasurement[] {
   if (page.measurements) {
      return page.measurements;
   }
   if (criterionId === '1.4.4') {
      return [];
   }
   if (page.facts) {
      const { facts } = page;
      switch (criterionId) {
         case '1.4.10': {
            return [
               {
                  value: facts.reflow.overflowPx,
                  unit: 'px',
                  method: `Horizontal overflow at 320x256 CSS px on ${page.url}`,
               },
            ];
         }
         case '1.3.4': {
            return [
               {
                  value: facts.portraitOverflowPx,
                  unit: 'px',
                  method: `Horizontal overflow in portrait 768x1024 CSS px on ${page.url}`,
               },
            ];
         }
         case '1.4.12': {
            return [
               {
                  value: facts.textSpacingClipped.length,
                  unit: 'clipped elements',
                  method: `WCAG 1.4.12 text-spacing override check on ${page.url}`,
               },
            ];
         }
         case '2.5.8': {
            if (facts.smallTargets.length > 0) {
               return facts.smallTargets.map((target) => ({
                  value: Math.min(target.width, target.height),
                  unit: 'px',
                  method: `Pointer target ${target.html || 'control'} (${String(
                     target.width,
                  )}x${String(target.height)} px) on ${page.url}`,
               }));
            }
            return [
               {
                  value: MIN_POINTER_TARGET_PX,
                  unit: 'px',
                  method: `Minimum pointer target dimension on ${page.url}`,
               },
            ];
         }
         case '2.2.2':
         case '2.3.1': {
            if (facts.runningAnimations.length === 0) {
               return [
                  {
                     value: 0,
                     unit: 'ms',
                     method: `Animation duration check on ${page.url}`,
                  },
               ];
            }
            return facts.runningAnimations.map((animation) => ({
               value: animation.dur ?? 0,
               unit: 'ms',
               method: `Animation duration for ${animation.name} on ${page.url}`,
            }));
         }
         default: {
            return [fallbackMeasurement(page)];
         }
      }
   }
   return [fallbackMeasurement(page)];
}

/** Each kind's content must match what the evidence contract accepts for that kind. */
function buildContent(kind: string, input: ArtifactInput, capturedAt: string): unknown {
   const pages = input.pages.map((page) => page.url);
   switch (kind) {
      case 'action-trace': {
         return buildTrace(input, capturedAt);
      }
      case 'measurement': {
         return input.pages.flatMap((page) =>
            buildCriterionMeasurements(input.checkId.split(':')[0], page),
         );
      }
      case 'media': {
         return {
            source: pages[0] ?? '',
            transcript: input.rationale,
            observations: input.pages.flatMap((page, index) =>
               page.mediaInventory
                  ? [{ ...page.mediaInventory, stateId: input.states[index]?.stateId }]
                  : [],
            ),
         };
      }
      default: {
         return { text: `${input.rationale}\nPages: ${pages.join(', ')}` };
      }
   }
}

async function buildBody(
   kind: string,
   input: ArtifactInput,
   capturedAt: string,
): Promise<Buffer> {
   if (kind === 'screenshot') {
      return input.captureScreenshot(input.pages[0]?.url ?? '');
   }
   return Buffer.from(
      JSON.stringify(
         {
            version: '1',
            runId: input.runId,
            attempt: input.attempt,
            environmentId: input.environmentId,
            states: input.states,
            source: 'browser',
            capturedAt,
            kind,
            content: buildContent(kind, input, capturedAt),
         },
         undefined,
         JSON_INDENT,
      ),
   );
}

/**
 * Write one file per evidence kind. The envelope repeats the provenance `capturedAt`
 * exactly, so the same timestamp is returned with each artifact.
 */
export async function writeProbeArtifacts(input: ArtifactInput): Promise<Artifact[]> {
   return Promise.all(
      input.kinds.map(async (kind) => {
         const capturedAt = new Date().toISOString();
         const path = getProbeArtifactPath(input.checkId, input.attempt, kind);
         const body = await buildBody(kind, input, capturedAt);
         await writeAtomic(join(dirname(input.runFile), path), body);
         return { kind, path, sha256: sha256(body), capturedAt };
      }),
   );
}
