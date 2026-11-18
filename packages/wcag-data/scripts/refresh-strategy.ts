import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
   strategyArtifactSchema,
   type GeneratedProvenanceManifest,
   type NormalizedCriteriaArtifact,
   type StrategyArtifact,
} from '@a11ied/contracts';
import { buildAssessmentProcedures } from '../src/test-methods/procedures.js';
import { getWcagDataDirectories } from '../src/sources/definitions.js';
import { toJsonString } from '../src/shared/utils.js';

const execFileAsync = promisify(execFile);

function sha256(content: string): string {
   return createHash('sha256').update(content).digest('hex');
}

async function refreshVersionStrategy(
   directories: { generated: string },
   version: '2.1' | '2.2',
): Promise<void> {
   const criteriaPath = join(directories.generated, `criteria.${version}.json`);
   const strategyPath = join(directories.generated, `strategy.${version}.json`);

   const criteriaArtifact = JSON.parse(
      await readFile(criteriaPath, 'utf8'),
   ) as NormalizedCriteriaArtifact;
   const strategyArtifact = JSON.parse(
      await readFile(strategyPath, 'utf8'),
   ) as StrategyArtifact;

   for (const [id, strategy] of Object.entries(strategyArtifact.strategies)) {
      const criterion = criteriaArtifact.criteria[id];
      if (!criterion) {
         continue;
      }
      const result = buildAssessmentProcedures({
         criterion,
         procedureIds: strategy.procedureIds,
      });
      strategy.procedureIds = result.procedureIds;
      strategy.procedures = result.procedures;
      if (result.coverageGap) {
         strategy.coverageGap = result.coverageGap;
      } else {
         delete strategy.coverageGap;
      }
   }

   const validated = strategyArtifactSchema.parse(strategyArtifact);
   await writeFile(strategyPath, toJsonString(validated), 'utf8');
}

async function refreshGeneratedManifest(generatedRoot: string): Promise<void> {
   const manifestPath = join(generatedRoot, 'generated-provenance.json');
   const manifest = JSON.parse(
      await readFile(manifestPath, 'utf8'),
   ) as GeneratedProvenanceManifest;
   const artifactEntries = await Promise.all(
      manifest.artifacts.map(async (artifact) => {
         const body = await readFile(join(generatedRoot, artifact.fileName), 'utf8');
         return {
            ...artifact,
            sha256: sha256(body),
         };
      }),
   );
   const nextManifest: GeneratedProvenanceManifest = {
      ...manifest,
      artifacts: artifactEntries,
   };
   await writeFile(manifestPath, toJsonString(nextManifest), 'utf8');
}

const directories = getWcagDataDirectories();
await refreshVersionStrategy(directories, '2.1');
await refreshVersionStrategy(directories, '2.2');
await execFileAsync('npx', ['oxfmt', directories.generated]);
await refreshGeneratedManifest(directories.generated);
await execFileAsync('npx', [
   'oxfmt',
   join(directories.generated, 'generated-provenance.json'),
]);
