import {
   coverageLookupResultSchema,
   criteriaByLevelResultSchema,
   criterionLookupKeySchema,
   criterionLookupResultSchema,
   criterionSearchResponseSchema,
   doctorReportSchema,
   wcagLevelSchema,
   wcagLookupResultSchema,
   wcagVersionSchema,
} from '@a11ied/contracts';
import {
   createDoctorReport,
   listWcagCriteria,
   searchWcagCriteria,
   showWcagCoverage,
   showWcagCriterion,
} from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
   DEFAULT_SEARCH_RESULTS,
   DEFAULT_WCAG_VERSION,
   MAX_SEARCH_RESULTS,
   createToolResponse,
   readOnlyAnnotations,
} from '../lib/shared.js';

function registerDoctorTool(server: McpServer): void {
   server.registerTool(
      'doctor',
      {
         title: 'Doctor',
         description: 'Return runtime details and the current support matrix.',
         inputSchema: z.object({}),
         outputSchema: doctorReportSchema,
         annotations: readOnlyAnnotations,
      },
      async () => createToolResponse(doctorReportSchema.parse(createDoctorReport())),
   );
}

function registerWcagLookupTool(server: McpServer): void {
   server.registerTool(
      'wcag_lookup',
      {
         title: 'WCAG lookup',
         description:
            'Look up one WCAG criterion by id or slug. ' +
            'Set include_coverage to true to also return coverage and testing-strategy data.',
         inputSchema: z.object({
            criterion: criterionLookupKeySchema,
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
            include_coverage: z.boolean().default(false),
         }),
         outputSchema: wcagLookupResultSchema,
         annotations: readOnlyAnnotations,
      },
      async ({ criterion, version, include_coverage }) => {
         const base = criterionLookupResultSchema.parse(
            showWcagCriterion(criterion, version),
         );
         if (!include_coverage) {
            return createToolResponse(wcagLookupResultSchema.parse(base));
         }
         const coverage = coverageLookupResultSchema.parse(
            showWcagCoverage(criterion, version),
         );
         return createToolResponse(
            wcagLookupResultSchema.parse({
               ...base,
               coverage: coverage.coverage,
               strategy: coverage.strategy,
            }),
         );
      },
   );
}

function registerWcagLevelsTool(server: McpServer): void {
   server.registerTool(
      'wcag_levels',
      {
         title: 'WCAG levels',
         description: 'List all WCAG criteria at one level for a WCAG version.',
         inputSchema: z.object({
            level: wcagLevelSchema,
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
         }),
         outputSchema: criteriaByLevelResultSchema,
         annotations: readOnlyAnnotations,
      },
      async ({ level, version }) =>
         createToolResponse(
            criteriaByLevelResultSchema.parse(listWcagCriteria(level, version)),
         ),
   );
}

function registerWcagSearchTool(server: McpServer): void {
   server.registerTool(
      'wcag_search',
      {
         title: 'WCAG search',
         description: 'Search the local WCAG corpus and return ranked criterion matches.',
         inputSchema: z.object({
            query: z.string().min(1),
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
            limit: z
               .number()
               .int()
               .positive()
               .max(MAX_SEARCH_RESULTS)
               .default(DEFAULT_SEARCH_RESULTS),
         }),
         outputSchema: criterionSearchResponseSchema,
         annotations: readOnlyAnnotations,
      },
      async ({ query, version, limit }) =>
         createToolResponse(
            criterionSearchResponseSchema.parse(
               searchWcagCriteria(query, { version, limit }),
            ),
         ),
   );
}

export function registerKnowledgeTools(server: McpServer): void {
   registerDoctorTool(server);
   registerWcagLookupTool(server);
   registerWcagLevelsTool(server);
   registerWcagSearchTool(server);
}
