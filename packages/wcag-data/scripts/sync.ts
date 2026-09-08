import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
   SyncValidationError,
   getWcagDataDirectories,
   runWcagDataSync,
   syncApgPatterns,
   syncDocumentArtifacts,
   syncMobileGuidance,
   type GeneratedProvenanceManifest,
} from '../src/index.js';
import { curlFetch } from '../src/shared/curl-fetch.js';
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
   const result = await runWcagDataSync({ directories, fetchImpl: curlFetch });
   const documentResult = await syncDocumentArtifacts({
      directories,
      fetchImpl: curlFetch,
   });
   const mobileResult = await syncMobileGuidance({ directories, fetchImpl: curlFetch });
   const apgResult = await syncApgPatterns({ directories, fetchImpl: curlFetch });
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
   log(
      `Understanding documents: ${documentResult.understandingCount}, ` +
         `technique bodies: ${documentResult.techniqueBodyCount}, ` +
         `unique bodies stored: ${documentResult.uniqueBodyCount}`,
   );
   log(
      `mobile guidance: ${mobileResult.guidanceCount} written, ` +
         `${mobileResult.placeholderCount} still placeholders, ` +
         `${mobileResult.requestCount} criteria requested`,
   );
   log(
      `APG patterns: ${apgResult.patternCount}, examples: ${apgResult.exampleCount}, ` +
         `keyboard rows: ${apgResult.keyboardRowCount}, ` +
         `attribute rows: ${apgResult.attributeRowCount}, ` +
         `examples with no tables: ${apgResult.tablelessExampleCount}, ` +
         `${apgResult.requestCount} requests`,
   );
   if (apgResult.failures.length > 0) {
      log(`APG fetch failures: ${apgResult.failures.length}`);
      for (const failure of apgResult.failures) {
         log(`  ${failure.url}: ${failure.message}`);
      }
   }
   if (mobileResult.failures.length > 0) {
      log(`mobile guidance fetch failures: ${mobileResult.failures.length}`);
      for (const failure of mobileResult.failures) {
         log(`  ${failure.url}: ${failure.message}`);
      }
   }
   if (documentResult.failures.length > 0) {
      log(`document fetch failures: ${documentResult.failures.length}`);
      for (const failure of documentResult.failures) {
         log(`  ${failure.request.url}: ${failure.message}`);
      }
   }
} catch (error) {
   if (error instanceof SyncValidationError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = error.exitCode;
   } else {
      throw error;
   }
}
