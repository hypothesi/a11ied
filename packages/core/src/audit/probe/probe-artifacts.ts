import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AssessmentEvidenceKind, EvidenceProvenance } from '@a11ied/contracts';
import type { Judgement } from './probe-types.js';

const METHOD_LIMIT = 400;
const JSON_INDENT = 3;

type Artifact = EvidenceProvenance['artifacts'][number];

export interface PageJudgement {
   url: string;
   judgement: Judgement;
}

export interface StateReference {
   stateId: string;
   revision: number;
   fingerprint: string;
}

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

/** Each kind's content must match what the evidence contract accepts for that kind. */
function buildContent(kind: string, input: ArtifactInput, capturedAt: string): unknown {
   const pages = input.pages.map((page) => page.url);
   switch (kind) {
      case 'action-trace': {
         return buildTrace(input, capturedAt);
      }
      case 'measurement': {
         return input.pages.map((page) => ({
            value: page.judgement.outcome === 'failed' ? 1 : 0,
            unit: 'failing probes per page',
            method: `Browser probe on ${page.url}: ${page.judgement.rationale}`.slice(
               0,
               METHOD_LIMIT,
            ),
         }));
      }
      case 'media': {
         return { source: pages[0] ?? '', transcript: input.rationale };
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
   const directory = join(dirname(input.runFile), 'artifacts');
   await mkdir(directory, { recursive: true });
   return Promise.all(
      input.kinds.map(async (kind) => {
         const capturedAt = new Date().toISOString();
         const extension = kind === 'screenshot' ? 'png' : 'json';
         const path = `artifacts/${input.checkId}-${kind}.${extension}`;
         const body = await buildBody(kind, input, capturedAt);
         await writeFile(join(dirname(input.runFile), path), body);
         return { kind, path, sha256: sha256(body), capturedAt };
      }),
   );
}
