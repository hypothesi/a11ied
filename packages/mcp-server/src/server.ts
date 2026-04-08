/* eslint-disable max-lines, max-lines-per-function, max-statements */
import {
   accessibilityDriverSessionSchema,
   applicabilityMatrixSchema,
   applicabilitySignalSchema,
   axeRunResultSchema,
   coverageLookupResultSchema,
   criteriaByLevelResultSchema,
   criterionApplicabilityLookupResultSchema,
   criterionLookupResultSchema,
   criterionLookupKeySchema,
   criterionSearchResponseSchema,
   doctorReportSchema,
   driverActionResultSchema,
   interactionPatternIdSchema,
   interactionPatternResultSchema,
   platformSchema,
   targetReferenceSchema,
   verificationReportSchema,
   wcagLevelSchema,
   wcagVersionSchema,
   type CriteriaByLevelResult,
   type NormalizedCriterion,
   type Platform,
} from '@a11lied/contracts';
import {
   attachDocumentToDriverSession,
   createDoctorReport,
   getDriverSessionStatus,
   inspectApplicableTarget,
   inspectCriterionTarget,
   listSupportedTargets,
   listWcagCriteria,
   resolveDocumentTarget,
   runAxe,
   runDriverSessionAction,
   runInteractionPattern,
   searchWcagCriteria,
   showWcagCoverage,
   showWcagCriterion,
   startDriverSession,
   stopDriverSession,
   verifyCriterion,
   verifyLevel,
} from '@a11lied/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const JSON_INDENT = 2;
const DEFAULT_WCAG_VERSION = '2.2' as const;
const MAX_SEARCH_RESULTS = 50;
const DEFAULT_SEARCH_RESULTS = 10;

const readOnlyAnnotations = {
   readOnlyHint: true,
   destructiveHint: false,
   openWorldHint: false,
} as const;

const activeAnnotations = {
   readOnlyHint: false,
   destructiveHint: false,
   openWorldHint: true,
} as const;

const targetInputSchema = z
   .object({
      url: z.string().url().optional(),
      storybookUrl: z.string().url().optional(),
      storyId: z.string().min(1).optional(),
   })
   .superRefine((value, ctx) => {
      const hasUrl = value.url !== undefined;
      const hasStorybook =
         value.storybookUrl !== undefined || value.storyId !== undefined;

      if (hasUrl && hasStorybook) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Choose either url or storybookUrl + storyId, not both.',
            path: ['url'],
         });
      }

      if (!hasUrl && value.storybookUrl === undefined && value.storyId === undefined) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Provide url or storybookUrl + storyId.',
            path: ['url'],
         });
      }

      if (value.storybookUrl !== undefined && value.storyId === undefined) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'storyId is required when storybookUrl is provided.',
            path: ['storyId'],
         });
      }

      if (value.storybookUrl === undefined && value.storyId !== undefined) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'storybookUrl is required when storyId is provided.',
            path: ['storybookUrl'],
         });
      }
   });

const inspectApplicableResultSchema = z.object({
   version: wcagVersionSchema,
   target: targetReferenceSchema,
   signals: z.array(applicabilitySignalSchema),
   matrix: applicabilityMatrixSchema,
});

const inspectCriterionResultSchema = criterionApplicabilityLookupResultSchema.extend({
   signals: z.array(applicabilitySignalSchema),
});

function toJsonText(value: unknown): string {
   return JSON.stringify(value, undefined, JSON_INDENT);
}

function createToolResponse<TPayload>(payload: TPayload): {
   structuredContent: TPayload;
   content: Array<{ type: 'text'; text: string }>;
} {
   return {
      structuredContent: payload,
      content: [{ type: 'text', text: toJsonText(payload) }],
   };
}

function createJsonResource(
   uri: string,
   payload: unknown,
): {
   contents: Array<{ uri: string; mimeType: string; text: string }>;
} {
   return {
      contents: [
         {
            uri,
            mimeType: 'application/json',
            text: toJsonText(payload),
         },
      ],
   };
}

function buildTargetInput(input: z.infer<typeof targetInputSchema>): {
   url?: string;
   storybookUrl?: string;
   storyId?: string;
} {
   if (input.url) {
      return { url: input.url };
   }
   const targetInput: {
      storybookUrl?: string;
      storyId?: string;
   } = {};
   if (input.storybookUrl) {
      targetInput.storybookUrl = input.storybookUrl;
   }
   if (input.storyId) {
      targetInput.storyId = input.storyId;
   }
   return targetInput;
}

async function resolveExecutionTarget(input: z.infer<typeof targetInputSchema>): Promise<{
   resolvedUrl: string;
   reportTarget: {
      kind: 'url' | 'story';
      value: string;
      resolvedUrl: string;
      storybookBaseUrl?: string;
   };
   html: string;
}> {
   const targetInput = buildTargetInput(input);
   const resolved = await resolveDocumentTarget(targetInput);
   if (resolved.target.kind === 'story') {
      const reportTarget: {
         kind: 'story';
         value: string;
         resolvedUrl: string;
         storybookBaseUrl?: string;
      } = {
         kind: 'story',
         value: resolved.target.value,
         resolvedUrl: resolved.resolvedUrl,
      };
      if (input.storybookUrl) {
         reportTarget.storybookBaseUrl = input.storybookUrl;
      }
      return {
         resolvedUrl: resolved.resolvedUrl,
         reportTarget,
         html: resolved.html,
      };
   }

   return {
      resolvedUrl: resolved.resolvedUrl,
      reportTarget: {
         kind: 'url',
         value: resolved.target.value,
         resolvedUrl: resolved.resolvedUrl,
      },
      html: resolved.html,
   };
}

function dedupeCriteria(
   criteria: CriteriaByLevelResult['criteria'],
): CriteriaByLevelResult['criteria'] {
   const index = new Map<string, NormalizedCriterion>(
      criteria.map((criterion: NormalizedCriterion) => [criterion.id, criterion]),
   );
   return [...index.values()].toSorted((left, right) => left.id.localeCompare(right.id));
}

function listAllCriteria(version: '2.1' | '2.2'): CriteriaByLevelResult['criteria'] {
   return dedupeCriteria(
      (['A', 'AA', 'AAA'] as const).flatMap(
         (level) => listWcagCriteria(level, version).criteria,
      ),
   );
}

function buildCriteriaResource(version: '2.1' | '2.2'): {
   version: '2.1' | '2.2';
   criteria: CriteriaByLevelResult['criteria'];
} {
   return {
      version,
      criteria: listAllCriteria(version),
   };
}

function buildLevelsResource(version: '2.1' | '2.2'): {
   version: '2.1' | '2.2';
   levels: Array<{
      level: 'A' | 'AA' | 'AAA';
      criteria: CriteriaByLevelResult['criteria'];
   }>;
} {
   return {
      version,
      levels: (['A', 'AA', 'AAA'] as const).map((level) => ({
         level,
         criteria: listWcagCriteria(level, version).criteria,
      })),
   };
}

function buildCoverageResource(version: '2.1' | '2.2'): {
   version: '2.1' | '2.2';
   coverage: Array<z.infer<typeof coverageLookupResultSchema>>;
} {
   return {
      version,
      coverage: listAllCriteria(version).map((criterion: NormalizedCriterion) =>
         showWcagCoverage(criterion.id, version),
      ),
   };
}

function buildStrategyResource(version: '2.1' | '2.2'): {
   version: '2.1' | '2.2';
   strategies: Array<{
      criterionId: string;
      title: string;
      level: string;
      preferredEvidenceMode: string;
      procedureIds: string[];
      requiresRealTarget: boolean;
      notes: string[];
   }>;
} {
   return {
      version,
      strategies: listAllCriteria(version).map((criterion: NormalizedCriterion) => {
         const lookup = showWcagCoverage(criterion.id, version);
         return {
            criterionId: criterion.id,
            title: criterion.title,
            level: criterion.level,
            preferredEvidenceMode: lookup.strategy.preferredEvidenceMode,
            procedureIds: lookup.strategy.procedureIds,
            requiresRealTarget: lookup.strategy.requiresRealTarget,
            notes: lookup.strategy.notes,
         };
      }),
   };
}

function registerResources(server: McpServer): void {
   server.registerResource(
      'targets',
      'a11lied://targets',
      {
         title: 'Supported targets',
         description: 'Read-only list of supported accessibility targets.',
         mimeType: 'application/json',
      },
      async () => createJsonResource('a11lied://targets', listSupportedTargets()),
   );

   for (const version of ['2.1', '2.2'] as const) {
      server.registerResource(
         `criteria-${version}`,
         `a11lied://wcag/criteria/${version}`,
         {
            title: `WCAG ${version} criteria`,
            description: 'Read-only criteria index for a WCAG version.',
            mimeType: 'application/json',
         },
         async () =>
            createJsonResource(
               `a11lied://wcag/criteria/${version}`,
               buildCriteriaResource(version),
            ),
      );

      server.registerResource(
         `levels-${version}`,
         `a11lied://wcag/levels/${version}`,
         {
            title: `WCAG ${version} levels`,
            description: 'Read-only level-to-criteria lists for a WCAG version.',
            mimeType: 'application/json',
         },
         async () =>
            createJsonResource(
               `a11lied://wcag/levels/${version}`,
               buildLevelsResource(version),
            ),
      );

      server.registerResource(
         `coverage-${version}`,
         `a11lied://wcag/coverage/${version}`,
         {
            title: `WCAG ${version} coverage`,
            description:
               'Read-only coverage lookup data for every criterion in a WCAG version.',
            mimeType: 'application/json',
         },
         async () =>
            createJsonResource(
               `a11lied://wcag/coverage/${version}`,
               buildCoverageResource(version),
            ),
      );

      server.registerResource(
         `verification-strategies-${version}`,
         `a11lied://wcag/verification-strategies/${version}`,
         {
            title: `WCAG ${version} verification strategies`,
            description:
               'Read-only verification strategy summaries for every criterion in a WCAG version.',
            mimeType: 'application/json',
         },
         async () =>
            createJsonResource(
               `a11lied://wcag/verification-strategies/${version}`,
               buildStrategyResource(version),
            ),
      );
   }
}

function registerKnowledgeTools(server: McpServer): void {
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

   server.registerTool(
      'criterion_lookup',
      {
         title: 'Criterion lookup',
         description: 'Resolve one WCAG criterion by id or slug.',
         inputSchema: z.object({
            criterion: criterionLookupKeySchema,
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
         }),
         outputSchema: criterionLookupResultSchema,
         annotations: readOnlyAnnotations,
      },
      async ({ criterion, version }) =>
         createToolResponse(
            criterionLookupResultSchema.parse(showWcagCriterion(criterion, version)),
         ),
   );

   server.registerTool(
      'level_lookup',
      {
         title: 'Level lookup',
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

   server.registerTool(
      'search',
      {
         title: 'Search criteria',
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

   server.registerTool(
      'coverage_lookup',
      {
         title: 'Coverage lookup',
         description: 'Return coverage and verification-strategy data for one criterion.',
         inputSchema: z.object({
            criterion: criterionLookupKeySchema,
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
         }),
         outputSchema: coverageLookupResultSchema,
         annotations: readOnlyAnnotations,
      },
      async ({ criterion, version }) =>
         createToolResponse(
            coverageLookupResultSchema.parse(showWcagCoverage(criterion, version)),
         ),
   );
}

function registerInspectTools(server: McpServer): void {
   server.registerTool(
      'inspect_applicable',
      {
         title: 'Inspect applicable criteria',
         description:
            'Explain which WCAG criteria look relevant for a URL or Storybook story target.',
         inputSchema: targetInputSchema.extend({
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
         }),
         outputSchema: inspectApplicableResultSchema,
         annotations: { ...readOnlyAnnotations, openWorldHint: true },
      },
      async ({ version, ...targetInput }) =>
         createToolResponse(
            inspectApplicableResultSchema.parse(
               await inspectApplicableTarget(buildTargetInput(targetInput), version),
            ),
         ),
   );

   server.registerTool(
      'inspect_criterion',
      {
         title: 'Inspect criterion applicability',
         description: 'Explain one criterion against a URL or Storybook story target.',
         inputSchema: targetInputSchema.extend({
            criterion: criterionLookupKeySchema,
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
         }),
         outputSchema: inspectCriterionResultSchema,
         annotations: { ...readOnlyAnnotations, openWorldHint: true },
      },
      async ({ criterion, version, ...targetInput }) =>
         createToolResponse(
            inspectCriterionResultSchema.parse(
               await inspectCriterionTarget(
                  criterion,
                  buildTargetInput(targetInput),
                  version,
               ),
            ),
         ),
   );
}

function registerDriverTools(server: McpServer): void {
   server.registerTool(
      'driver_start_session',
      {
         title: 'Start driver session',
         description:
            'Start a persistent accessibility-driver session. This may launch or drive assistive technology and persist local session state.',
         inputSchema: z.object({
            target: platformSchema.default('virtual'),
            url: z.string().url().optional(),
            storybookUrl: z.string().url().optional(),
            storyId: z.string().min(1).optional(),
         }),
         outputSchema: accessibilityDriverSessionSchema,
         annotations: activeAnnotations,
      },
      async ({ target, ...targetInput }) => {
         const session = await startDriverSession(target);
         const hasDocumentTarget =
            targetInput.url !== undefined ||
            targetInput.storybookUrl !== undefined ||
            targetInput.storyId !== undefined;

         if (hasDocumentTarget) {
            const resolved = await resolveExecutionTarget(
               targetInputSchema.parse(targetInput),
            );
            await attachDocumentToDriverSession(session.sessionId, {
               html: resolved.html,
               url: resolved.resolvedUrl,
            });
         }

         return createToolResponse(accessibilityDriverSessionSchema.parse(session));
      },
   );

   server.registerTool(
      'driver_get_session',
      {
         title: 'Get driver session',
         description: 'Read driver session state and logs for an existing session.',
         inputSchema: z.object({
            sessionId: z.string().min(1),
         }),
         outputSchema: driverActionResultSchema,
         annotations: activeAnnotations,
      },
      async ({ sessionId }) =>
         createToolResponse(
            driverActionResultSchema.parse(await getDriverSessionStatus(sessionId)),
         ),
   );

   server.registerTool(
      'driver_stop_session',
      {
         title: 'Stop driver session',
         description:
            'Stop a persistent accessibility-driver session and remove its local session state.',
         inputSchema: z.object({
            sessionId: z.string().min(1),
         }),
         outputSchema: driverActionResultSchema,
         annotations: activeAnnotations,
      },
      async ({ sessionId }) =>
         createToolResponse(
            driverActionResultSchema.parse(await stopDriverSession(sessionId)),
         ),
   );

   const registerSimpleDriverAction = (
      name: string,
      action:
         | 'next'
         | 'previous'
         | 'interact'
         | 'stop-interacting'
         | 'click-current-item'
         | 'read'
         | 'logs'
         | 'clear-logs',
      description: string,
   ): void => {
      server.registerTool(
         name,
         {
            title: name,
            description,
            inputSchema: z.object({
               sessionId: z.string().min(1),
            }),
            outputSchema: driverActionResultSchema,
            annotations: activeAnnotations,
         },
         async ({ sessionId }) =>
            createToolResponse(
               driverActionResultSchema.parse(
                  await runDriverSessionAction(sessionId, action),
               ),
            ),
      );
   };

   registerSimpleDriverAction(
      'driver_next_item',
      'next',
      'Move to the next item in the current accessibility-driver session. This may drive assistive technology.',
   );
   registerSimpleDriverAction(
      'driver_previous_item',
      'previous',
      'Move to the previous item in the current accessibility-driver session. This may drive assistive technology.',
   );
   registerSimpleDriverAction(
      'driver_interact',
      'interact',
      'Enter interaction mode in the current accessibility-driver session. This may drive assistive technology.',
   );
   registerSimpleDriverAction(
      'driver_stop_interacting',
      'stop-interacting',
      'Leave interaction mode in the current accessibility-driver session. This may drive assistive technology.',
   );
   registerSimpleDriverAction(
      'driver_click_current_item',
      'click-current-item',
      'Activate the current item in the accessibility-driver session. This may drive assistive technology.',
   );
   registerSimpleDriverAction(
      'driver_read',
      'read',
      'Read the current driver snapshot, including spoken and item-text logs.',
   );
   registerSimpleDriverAction(
      'driver_logs',
      'logs',
      'Read the current spoken and item-text logs for a driver session.',
   );
   registerSimpleDriverAction(
      'driver_clear_logs',
      'clear-logs',
      'Clear accumulated spoken and item-text logs for a driver session.',
   );

   server.registerTool(
      'driver_key',
      {
         title: 'Send key',
         description:
            'Send a key chord through the current accessibility-driver session. This may drive assistive technology.',
         inputSchema: z.object({
            sessionId: z.string().min(1),
            key: z.string().min(1),
         }),
         outputSchema: driverActionResultSchema,
         annotations: activeAnnotations,
      },
      async ({ sessionId, key }) =>
         createToolResponse(
            driverActionResultSchema.parse(
               await runDriverSessionAction(sessionId, 'key', {
                  payload: { key },
               }),
            ),
         ),
   );

   server.registerTool(
      'driver_type',
      {
         title: 'Type text',
         description:
            'Type text through the current accessibility-driver session. This may drive assistive technology.',
         inputSchema: z.object({
            sessionId: z.string().min(1),
            text: z.string(),
         }),
         outputSchema: driverActionResultSchema,
         annotations: activeAnnotations,
      },
      async ({ sessionId, text }) =>
         createToolResponse(
            driverActionResultSchema.parse(
               await runDriverSessionAction(sessionId, 'type', {
                  payload: { text },
               }),
            ),
         ),
   );

   server.registerTool(
      'driver_checkpoint',
      {
         title: 'Create checkpoint',
         description:
            'Create a named checkpoint in the current accessibility-driver session.',
         inputSchema: z.object({
            sessionId: z.string().min(1),
            label: z.string().min(1),
         }),
         outputSchema: driverActionResultSchema,
         annotations: activeAnnotations,
      },
      async ({ sessionId, label }) =>
         createToolResponse(
            driverActionResultSchema.parse(
               await runDriverSessionAction(sessionId, 'checkpoint', {
                  payload: { label },
               }),
            ),
         ),
   );
}

function registerExecutionTools(server: McpServer): void {
   server.registerTool(
      'run_axe',
      {
         title: 'Run axe',
         description: 'Run axe-core against a URL or Storybook story target.',
         inputSchema: targetInputSchema
            .extend({
               version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
               criterion: criterionLookupKeySchema.optional(),
               level: wcagLevelSchema.optional(),
               ruleIds: z.array(z.string()).min(1).optional(),
            })
            .superRefine((value, ctx) => {
               const selections = [
                  value.criterion !== undefined,
                  value.level !== undefined,
                  value.ruleIds !== undefined,
               ].filter(Boolean).length;
               if (selections !== 1) {
                  ctx.addIssue({
                     code: z.ZodIssueCode.custom,
                     message: 'Choose exactly one of criterion, level, or ruleIds.',
                     path: ['criterion'],
                  });
               }
            }),
         outputSchema: axeRunResultSchema,
         annotations: { ...readOnlyAnnotations, openWorldHint: true },
      },
      async ({ version, criterion, level, ruleIds, ...targetInput }) => {
         const resolved = await resolveExecutionTarget(targetInput);
         if (criterion) {
            return createToolResponse(
               axeRunResultSchema.parse(
                  await runAxe(resolved.resolvedUrl, {
                     url: resolved.resolvedUrl,
                     wcagVersion: version,
                     criterion,
                  }),
               ),
            );
         }
         if (level) {
            return createToolResponse(
               axeRunResultSchema.parse(
                  await runAxe(resolved.resolvedUrl, {
                     url: resolved.resolvedUrl,
                     wcagVersion: version,
                     level,
                  }),
               ),
            );
         }
         return createToolResponse(
            axeRunResultSchema.parse(
               await runAxe(resolved.resolvedUrl, {
                  url: resolved.resolvedUrl,
                  wcagVersion: version,
                  ruleIds: ruleIds ?? [],
               }),
            ),
         );
      },
   );

   server.registerTool(
      'run_pattern',
      {
         title: 'Run pattern',
         description:
            'Run a built-in interaction pattern against a URL or Storybook story target. This may launch browsers or drive assistive technology.',
         inputSchema: targetInputSchema.extend({
            patternId: interactionPatternIdSchema,
            target: platformSchema.default('virtual'),
            sessionId: z.string().min(1).optional(),
         }),
         outputSchema: interactionPatternResultSchema,
         annotations: activeAnnotations,
      },
      async ({ patternId, target, sessionId, ...targetInput }) => {
         const resolved = await resolveExecutionTarget(targetInput);
         const patternInput: {
            patternId: z.infer<typeof interactionPatternIdSchema>;
            url: string;
            target: Platform;
            sessionId?: string;
         } = {
            patternId,
            url: resolved.resolvedUrl,
            target,
         };
         if (sessionId) {
            patternInput.sessionId = sessionId;
         }
         return createToolResponse(
            interactionPatternResultSchema.parse(
               await runInteractionPattern(patternInput),
            ),
         );
      },
   );
}

function registerVerificationTools(server: McpServer): void {
   server.registerTool(
      'verify_criterion',
      {
         title: 'Verify criterion',
         description:
            'Verify one WCAG criterion against a URL or Storybook story target. This may launch browsers, run automation, and drive assistive technology.',
         inputSchema: targetInputSchema.extend({
            criterion: criterionLookupKeySchema,
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
            target: platformSchema.default('virtual'),
         }),
         outputSchema: verificationReportSchema,
         annotations: activeAnnotations,
      },
      async ({ criterion, version, target, ...targetInput }) => {
         const resolved = await resolveExecutionTarget(targetInput);
         return createToolResponse(
            verificationReportSchema.parse(
               await verifyCriterion({
                  criterion,
                  url: resolved.resolvedUrl,
                  target,
                  wcagVersion: version,
                  reportTarget: {
                     ...resolved.reportTarget,
                     platform: target,
                  },
               }),
            ),
         );
      },
   );

   server.registerTool(
      'verify_level',
      {
         title: 'Verify level',
         description:
            'Verify a WCAG conformance level against a URL or Storybook story target. This may launch browsers, run automation, and drive assistive technology.',
         inputSchema: targetInputSchema.extend({
            level: wcagLevelSchema,
            version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
            target: platformSchema.default('virtual'),
         }),
         outputSchema: verificationReportSchema,
         annotations: activeAnnotations,
      },
      async ({ level, version, target, ...targetInput }) => {
         const resolved = await resolveExecutionTarget(targetInput);
         return createToolResponse(
            verificationReportSchema.parse(
               await verifyLevel({
                  level,
                  url: resolved.resolvedUrl,
                  target,
                  wcagVersion: version,
                  reportTarget: {
                     ...resolved.reportTarget,
                     platform: target,
                  },
               }),
            ),
         );
      },
   );
}

export function createMcpServer(): McpServer {
   const server = new McpServer({
      name: 'a11lied',
      version: '0.1.0',
   });

   registerResources(server);
   registerKnowledgeTools(server);
   registerInspectTools(server);
   registerDriverTools(server);
   registerExecutionTools(server);
   registerVerificationTools(server);

   return server;
}
