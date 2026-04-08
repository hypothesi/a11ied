import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
   SyncValidationError,
   getWcagDataDirectories,
   runWcagDataSync,
   type GeneratedProvenanceManifest,
} from '../src/index.js';
import { toJsonString } from '../src/shared/utils.js';

const execFileAsync = promisify(execFile);

function log(message: string): void {
   process.stdout.write(`${message}\n`);
}

function sha256(content: string): string {
   return createHash('sha256').update(content).digest('hex');
}

async function formatGeneratedArtifacts(generatedRoot: string): Promise<void> {
   await execFileAsync('npx', ['oxfmt', generatedRoot]);
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
   await execFileAsync('npx', ['oxfmt', manifestPath]);
}

try {
   const directories = getWcagDataDirectories();
   const result = await runWcagDataSync({ directories });
   const generatedEntries = await readdir(directories.generated);

   if (generatedEntries.length > 0) {
      await formatGeneratedArtifacts(directories.generated);
      await refreshGeneratedManifest(directories.generated);
   }

   log('wcag-data sync complete');
   log(`sources: ${result.fetchList.length}`);
   log(`raw artifacts: ${result.rawArtifacts.length}`);
   log(`axe rules: ${result.axeRuleCount}`);
   log(`generated artifacts: ${result.generatedArtifacts.length}`);
   log(
      `criteria counts: ${Object.entries(result.criteriaCountByVersion)
         .map(([version, count]) => `${version}=${count}`)
         .join(', ')}`,
   );
} catch (error) {
   if (error instanceof SyncValidationError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = error.exitCode;
   } else {
      throw error;
   }
}
