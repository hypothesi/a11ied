import axeCore from 'axe-core';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import type {
   DerivedAxeRule,
   FetchLike,
   PendingArtifact,
   QuickrefTagsPayload,
   RawArtifactWriteResult,
   RawSourceProvenance,
   SyncRawSourcesResult,
   WcagDataDirectories,
} from '../shared/types.js';
import {
   provenanceFileName,
   sha256,
   toJsonString,
   withOptionalStringProperties,
} from '../shared/utils.js';
import {
   axeCorePackage,
   ensureDataDirectories,
   ensureWcagDataDirectories,
   listApprovedUpstreamSourceUrls,
   rawSourceDefinitions,
   validateAxeRulesPayload,
} from './definitions.js';
import { fetchRemoteSource } from './fetch.js';

/** Derives local axe rule metadata from the installed axe-core package. */
export function deriveAxeRuleMetadata(): DerivedAxeRule[] {
   const rules = axeCore.getRules().map((rule) => ({
      ruleId: rule.ruleId,
      description: rule.description,
      help: rule.help,
      helpUrl: rule.helpUrl,
      tags: [...rule.tags].toSorted(),
      actIds: [...(rule.actIds ?? [])].toSorted(),
   }));
   validateAxeRulesPayload(rules);
   return rules.toSorted((left, right) => left.ruleId.localeCompare(right.ruleId));
}

function buildAxeProvenance(syncedAt: string, body: string): RawSourceProvenance {
   return withOptionalStringProperties<RawSourceProvenance>(
      {
         sourceId: 'axe-rules',
         sourceUrl: 'npm:axe-core',
         resolvedUrl: 'npm:axe-core',
         syncedAt,
         sha256: sha256(body),
         contentType: 'derived-json',
         fallbackUsed: false,
      },
      { upstreamVersion: axeCorePackage.version },
   );
}

function buildAxeArtifact(syncedAt: string): PendingArtifact {
   const rules = deriveAxeRuleMetadata();
   const body = toJsonString(rules);
   return {
      sourceId: 'axe-rules',
      fileName: 'axe-rules.json',
      body,
      provenance: buildAxeProvenance(syncedAt, body),
   };
}

async function writePendingArtifact(
   directories: WcagDataDirectories,
   artifact: PendingArtifact,
): Promise<RawArtifactWriteResult> {
   const filePath = join(directories.raw, artifact.fileName);
   const ppPath = join(directories.raw, provenanceFileName(artifact.fileName));
   await writeFile(filePath, artifact.body, 'utf8');
   await writeFile(ppPath, toJsonString(artifact.provenance), 'utf8');
   return {
      sourceId: artifact.sourceId,
      fileName: artifact.fileName,
      filePath,
      provenancePath: ppPath,
      provenance: artifact.provenance,
   };
}

export async function loadRawJson<TResult>(
   directories: WcagDataDirectories,
   fileName: string,
): Promise<TResult> {
   const raw = await readFile(join(directories.raw, fileName), 'utf8');
   return JSON.parse(raw) as TResult;
}

export async function loadQuickrefTags(
   directories: WcagDataDirectories,
): Promise<QuickrefTagsPayload> {
   const raw = await readFile(join(directories.raw, 'quickref-tags.yml'), 'utf8');
   return parseYaml(raw) as QuickrefTagsPayload;
}

async function loadSingleProvenance(
   directories: WcagDataDirectories,
   fileName: string,
): Promise<RawSourceProvenance & { fileName: string }> {
   const ppPath = join(directories.raw, provenanceFileName(fileName));
   const raw = await readFile(ppPath, 'utf8');
   const provenance = JSON.parse(raw) as RawSourceProvenance;
   return { fileName, ...provenance };
}

export async function loadRawProvenanceEntries(
   directories: WcagDataDirectories,
): Promise<Array<RawSourceProvenance & { fileName: string }>> {
   const fileNames = [
      ...rawSourceDefinitions.map((def) => def.fileName),
      'axe-rules.json',
   ];
   return Promise.all(
      fileNames.map((fileName) => loadSingleProvenance(directories, fileName)),
   );
}

/** Fetches, validates, and writes the approved raw upstream WCAG sources. */
export async function syncRawSources(options?: {
   directories?: WcagDataDirectories;
   fetchImpl?: FetchLike;
   syncedAt?: string;
}): Promise<SyncRawSourcesResult> {
   const directories = options?.directories ?? (await ensureWcagDataDirectories());
   await ensureDataDirectories(directories);
   const fetchImpl = options?.fetchImpl ?? fetch;
   const syncedAt = options?.syncedAt ?? new Date().toISOString();
   const remoteArtifacts = await Promise.all(
      rawSourceDefinitions.map((def) =>
         fetchRemoteSource({ definition: def, fetchImpl, syncedAt }),
      ),
   );
   const axeArtifact = buildAxeArtifact(syncedAt);
   const artifacts = await Promise.all(
      [...remoteArtifacts, axeArtifact].map((art) =>
         writePendingArtifact(directories, art),
      ),
   );
   return {
      fetchList: listApprovedUpstreamSourceUrls(),
      artifacts,
      axeRuleCount: JSON.parse(axeArtifact.body).length as number,
   };
}
