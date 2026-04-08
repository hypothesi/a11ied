import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
   RawArtifactWriteResult,
   RawSourceProvenance,
   WcagDataDirectories,
} from './types.js';
import { parseSourcePayload, provenanceFileName } from './utils.js';
import {
   getWcagDataDirectories,
   rawSourceDefinitions,
   validateAxeRulesPayload,
} from './source-definitions.js';

async function validateSingleDefinition(
   definition: (typeof rawSourceDefinitions)[number],
   directories: WcagDataDirectories,
): Promise<RawArtifactWriteResult> {
   const filePath = join(directories.raw, definition.fileName);
   const ppPath = join(directories.raw, provenanceFileName(definition.fileName));
   const [sourceText, provenanceText] = await Promise.all([
      readFile(filePath, 'utf8'),
      readFile(ppPath, 'utf8'),
   ]);
   const payload = parseSourcePayload(definition.format, sourceText);
   definition.validate(payload);
   const provenance = JSON.parse(provenanceText) as RawSourceProvenance;
   if (
      provenance.sourceId !== definition.id ||
      provenance.sourceUrl !== definition.primaryUrl
   ) {
      throw new Error(`invalid provenance for ${definition.id}`);
   }
   return {
      sourceId: definition.id,
      fileName: definition.fileName,
      filePath,
      provenancePath: ppPath,
      provenance,
   };
}

async function validateAxeRawArtifact(
   directories: WcagDataDirectories,
): Promise<RawArtifactWriteResult> {
   const axeFileName = 'axe-rules.json';
   const axeFilePath = join(directories.raw, axeFileName);
   const axePpPath = join(directories.raw, provenanceFileName(axeFileName));
   const [axeBody, axePpText] = await Promise.all([
      readFile(axeFilePath, 'utf8'),
      readFile(axePpPath, 'utf8'),
   ]);
   validateAxeRulesPayload(JSON.parse(axeBody) as unknown);
   const axePp = JSON.parse(axePpText) as RawSourceProvenance;
   if (axePp.sourceId !== 'axe-rules' || axePp.sourceUrl !== 'npm:axe-core') {
      throw new Error('invalid provenance for axe-rules');
   }
   return {
      sourceId: 'axe-rules',
      fileName: axeFileName,
      filePath: axeFilePath,
      provenancePath: axePpPath,
      provenance: axePp,
   };
}

function checkDefinitionFilesExist(sourceEntries: string[]): void {
   for (const def of rawSourceDefinitions) {
      if (
         !sourceEntries.includes(def.fileName) ||
         !sourceEntries.includes(provenanceFileName(def.fileName))
      ) {
         throw new Error(`missing raw sync outputs for ${def.id}`);
      }
   }
}

export async function validateRawSyncState(
   directories: WcagDataDirectories = getWcagDataDirectories(),
): Promise<RawArtifactWriteResult[]> {
   const sourceEntries = await readdir(directories.raw);
   checkDefinitionFilesExist(sourceEntries);
   const definitionResults = await Promise.all(
      rawSourceDefinitions.map((def) => validateSingleDefinition(def, directories)),
   );
   const axeResult = await validateAxeRawArtifact(directories);
   return [...definitionResults, axeResult];
}
