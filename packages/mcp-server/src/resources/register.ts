import { listSupportedTargets } from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
   SUPPORTED_WCAG_VERSIONS,
   buildCoverageResource,
   buildCriteriaResource,
   buildLevelsResource,
   createJsonResource,
   type SupportedWcagVersion,
} from '../lib/shared.js';

interface VersionedResourceDefinition {
   key: 'criteria' | 'levels' | 'coverage';
   title: (version: SupportedWcagVersion) => string;
   description: string;
   buildPayload: (version: SupportedWcagVersion) => unknown;
}

const versionedResourceDefinitions: VersionedResourceDefinition[] = [
   {
      key: 'criteria',
      title: (version) => `WCAG ${version} criteria`,
      description: 'Read-only criteria index for a WCAG version.',
      buildPayload: buildCriteriaResource,
   },
   {
      key: 'levels',
      title: (version) => `WCAG ${version} levels`,
      description: 'Read-only level-to-criteria lists for a WCAG version.',
      buildPayload: buildLevelsResource,
   },
   {
      key: 'coverage',
      title: (version) => `WCAG ${version} coverage`,
      description:
         'Read-only coverage lookup data for every criterion in a WCAG version.',
      buildPayload: buildCoverageResource,
   },
];

function registerTargetsResource(server: McpServer): void {
   server.registerResource(
      'targets',
      'a11ied://targets',
      {
         title: 'Supported targets',
         description: 'Read-only list of supported accessibility targets.',
         mimeType: 'application/json',
      },
      async () => createJsonResource('a11ied://targets', listSupportedTargets()),
   );
}

function registerVersionedResource(
   server: McpServer,
   version: SupportedWcagVersion,
   definition: VersionedResourceDefinition,
): void {
   const uri = `a11ied://wcag/${definition.key}/${version}`;
   server.registerResource(
      `${definition.key}-${version}`,
      uri,
      {
         title: definition.title(version),
         description: definition.description,
         mimeType: 'application/json',
      },
      async () => createJsonResource(uri, definition.buildPayload(version)),
   );
}

export function registerResources(server: McpServer): void {
   registerTargetsResource(server);
   for (const version of SUPPORTED_WCAG_VERSIONS) {
      for (const definition of versionedResourceDefinitions) {
         registerVersionedResource(server, version, definition);
      }
   }
}
