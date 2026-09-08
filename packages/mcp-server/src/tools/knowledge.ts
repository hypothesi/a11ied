import {
   axeRuleLookupResultSchema,
   criterionShowResultSchema,
   searchResultKindSchema,
   unifiedSearchResultSchema,
   doctorReportSchema,
   techniqueLookupResultSchema,
   wcagLevelSchema,
   wcagVersionSchema,
   type CriterionShowResult,
   type UnderstandingDocumentEntry,
   type WcagVersion,
} from '@a11ied/contracts';
import {
   createDoctorReport,
   listWcagCriteria,
   searchAll,
   showWcagAxeRule,
   showWcagTestMethodSummary,
   showWcagCriterion,
   showWcagTechnique,
   showWcagUnderstanding,
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

const TECHNIQUE_ID_PATTERN = /^[A-Z]+\d+$/u;

type CriterionShowResponse = CriterionShowResult & {
   understanding?: { document: UnderstandingDocumentEntry; body: string };
};

function buildCriterionShowResponse(input: {
   criterion: string;
   version: WcagVersion;
   includeUnderstanding: boolean;
}): CriterionShowResponse {
   const result = criterionShowResultSchema.parse(
      showWcagCriterion(input.criterion, input.version),
   );
   if (!input.includeUnderstanding) {
      return result;
   }
   const understanding = showWcagUnderstanding(input.criterion, input.version);
   return {
      ...result,
      understanding: { document: understanding.document, body: understanding.body },
   };
}

function registerWcagShowTool(server: McpServer): void {
   server.registerTool(
      'wcag_show',
      {
         title: 'WCAG show',
         description:
            'Show one WCAG criterion by id (such as "1.4.3") or slug (such as "contrast-minimum"), ' +
            'with its techniques, failures, test method, testing strategy, and a short excerpt of ' +
            'its Understanding document. Set includeUnderstanding to true for the full Understanding ' +
            'document text, the primary source for how to fix a violation. A technique or failure id ' +
            '(such as "G18" or "F65") returns the technique, the criteria that list it, and the ' +
            "technique's full body text when the sync fetched one. Matches the CLI wcag show " +
            '<criterion> and wcag understanding <criterion> commands.',
         inputSchema: z.object({
            criterion: z.string().min(1),
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
            includeUnderstanding: z
               .boolean()
               .default(false)
               .describe(
                  'Include the full Understanding document text and its source metadata.',
               ),
         }),
         annotations: readOnlyAnnotations,
      },
      async ({ criterion, version, includeUnderstanding }) => {
         if (TECHNIQUE_ID_PATTERN.test(criterion)) {
            return createToolResponse(
               techniqueLookupResultSchema.parse(showWcagTechnique(criterion, version)),
            );
         }
         return createToolResponse(
            buildCriterionShowResponse({ criterion, version, includeUnderstanding }),
         );
      },
   );
}

function registerWcagCriteriaTool(server: McpServer): void {
   server.registerTool(
      'wcag_criteria',
      {
         title: 'WCAG criteria',
         description:
            'List WCAG criteria. Omit level to list every criterion. Set level to A, AA, or AAA to filter. ' +
            'Set summary to return how many criteria are automated, hybrid, and manual per level instead of the list. ' +
            'Matches the CLI wcag criteria [--level] [--summary] command.',
         inputSchema: z.object({
            level: wcagLevelSchema.optional(),
            summary: z.boolean().default(false),
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
         }),
         annotations: readOnlyAnnotations,
      },
      async ({ level, summary, version }) => {
         if (summary) {
            return createToolResponse(showWcagTestMethodSummary(version));
         }
         return createToolResponse(listWcagCriteria(level, version));
      },
   );
}

function registerSearchTool(server: McpServer): void {
   server.registerTool(
      'search',
      {
         title: 'Search',
         description:
            'Search the pinned WCAG corpus and the ARIA Authoring Practices Guide together and ' +
            'return one ranked list. Each row says which corpus it came from in kind: criterion, ' +
            'technique, failure, axe-rule, pattern, or example. Use kind to scope the search to ' +
            'one of those. Use this when you have a description rather than an id. Matches the ' +
            'CLI search command.',
         inputSchema: z.object({
            query: z.string().min(1),
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
            kind: searchResultKindSchema.optional(),
            limit: z
               .number()
               .int()
               .positive()
               .max(MAX_SEARCH_RESULTS)
               .default(DEFAULT_SEARCH_RESULTS),
         }),
         outputSchema: unifiedSearchResultSchema,
         annotations: readOnlyAnnotations,
      },
      async ({ query, version, kind, limit }) =>
         createToolResponse(
            unifiedSearchResultSchema.parse(
               searchAll(query, {
                  version,
                  limit,
                  ...(kind === undefined ? {} : { kind }),
               }),
            ),
         ),
   );
}

function registerWcagRuleTool(server: McpServer): void {
   server.registerTool(
      'wcag_rule',
      {
         title: 'WCAG rule',
         description:
            'Map one axe-core rule id (such as "color-contrast") to the WCAG criteria it covers, ' +
            "the techniques and failures for those criteria, and the rule's fix guidance from axe-core. " +
            'Matches the CLI wcag rule <ruleId> command.',
         inputSchema: z.object({
            ruleId: z.string().min(1),
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
         }),
         outputSchema: axeRuleLookupResultSchema,
         annotations: readOnlyAnnotations,
      },
      async ({ ruleId, version }) =>
         createToolResponse(
            axeRuleLookupResultSchema.parse(await showWcagAxeRule(ruleId, version)),
         ),
   );
}

export function registerKnowledgeTools(server: McpServer): void {
   registerDoctorTool(server);
   registerWcagShowTool(server);
   registerWcagCriteriaTool(server);
   registerSearchTool(server);
   registerWcagRuleTool(server);
}
