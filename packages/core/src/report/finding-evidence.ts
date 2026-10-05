import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import {
   assessmentArtifactEnvelopeSchema,
   type EvidenceRecord,
   type ReportFinding,
   type ReportModel,
} from '@a11ied/contracts';
import { z } from 'zod';
import { writeBytesAtomic } from '../files/atomic-json.js';
import type { AuditAssessmentSnapshot } from '../audit/run-status.js';

const recordedActionsSchema = z.array(
   z.object({
      index: z.number().int().nonnegative(),
      action: z.string(),
      checkpoint: z.string().optional(),
   }),
);

function applyFindingContext(
   finding: ReportFinding,
   assessment: AuditAssessmentSnapshot,
): void {
   const run = assessment.status.run;
   const check = run.checks.find(
      (entry) => entry.checkId === finding.evidence?.provenance?.checkId,
   );
   if (!check) {
      throw new Error('A behavioral finding has no current assessment check.');
   }
   const environment = run.environments.find(
      (entry) => entry.environmentId === check.environmentId,
   );
   const stateIds =
      check.stateIds.length > 0
         ? check.stateIds
         : (finding.evidence?.provenance?.states ?? []).map((state) => state.stateId);
   const states = stateIds.flatMap((id) => {
      const state = run.states.find((entry) => entry.stateId === id);
      return state ? [state] : [];
   });
   finding.context = {
      scope: check.scope,
      states: states.map((state) => state.label),
      setup: states.flatMap((state) => state.setup),
      limitations: environment?.limitations ?? [],
      journeys: run.journeys
         .filter((journey) => check.journeyId === journey.journeyId)
         .map((journey) => journey.label),
      environment: environment
         ? [environment.os, environment.browser, environment.readerVersion]
              .filter(Boolean)
              .join(', ')
         : check.environmentId,
   };
}

function listReproduction(body: Buffer, record: EvidenceRecord): string[] {
   const envelope = assessmentArtifactEnvelopeSchema.parse(
      JSON.parse(body.toString('utf8')),
   );
   const range = record.provenance?.actions;
   return recordedActionsSchema
      .parse(envelope.content)
      .filter(
         (action) => range && action.index >= range.start && action.index <= range.end,
      )
      .map((action) =>
         action.checkpoint ? `${action.action}: ${action.checkpoint}` : action.action,
      );
}

async function exportFindingArtifact(input: {
   artifact: NonNullable<EvidenceRecord['provenance']>['artifacts'][number];
   root: string;
   outDir: string;
}): Promise<{ body: Buffer; href: string }> {
   const { artifact, root, outDir } = input;
   const path = await realpath(resolve(root, artifact.path));
   const inside = relative(root, path);
   if (inside.startsWith('..') || isAbsolute(inside)) {
      throw new Error('An evidence artifact is outside the assessment run directory.');
   }
   const body = await readFile(path);
   if (createHash('sha256').update(body).digest('hex') !== artifact.sha256) {
      throw new Error(
         'An evidence artifact changed after the report snapshot was captured.',
      );
   }
   const href = `artifacts/${artifact.sha256}.${artifact.kind === 'screenshot' ? 'png' : 'json'}`;
   await writeBytesAtomic(body, resolve(outDir, href));
   return { body, href };
}

async function exportSingleFinding(input: {
   finding: ReportFinding;
   assessment: AuditAssessmentSnapshot;
   root: string;
   outDir: string;
}): Promise<string[]> {
   const { finding, assessment, root, outDir } = input;
   const record = finding.evidence;
   if (!record?.provenance) {
      return [];
   }
   applyFindingContext(finding, assessment);
   const exported = await Promise.all(
      record.provenance.artifacts.map(async (artifact) => ({
         ...(await exportFindingArtifact({ artifact, root, outDir })),
         kind: artifact.kind,
      })),
   );
   finding.artifactLinks = exported.map((artifact) => ({
      kind: artifact.kind,
      href: artifact.href,
   }));
   finding.reproduction = exported
      .filter((artifact) => artifact.kind === 'action-trace')
      .flatMap((artifact) => listReproduction(artifact.body, record));
   return exported.map((artifact) => resolve(outDir, artifact.href));
}

/** Bundle the exact validated bytes; original run-relative paths are never report links. */
export async function exportFindingEvidence(input: {
   model: ReportModel;
   assessment?: AuditAssessmentSnapshot | undefined;
   runFile?: string | undefined;
   outDir: string;
}): Promise<string[]> {
   const { model, assessment, runFile, outDir } = input;
   if (!assessment || !runFile) {
      return [];
   }
   const root = await realpath(dirname(runFile));
   await mkdir(resolve(outDir, 'artifacts'), { recursive: true });
   const files = await Promise.all(
      model.pages
         .flatMap((page) => page.findings)
         .map((finding) => exportSingleFinding({ finding, assessment, root, outDir })),
   );
   return [...new Set(files.flat())];
}
