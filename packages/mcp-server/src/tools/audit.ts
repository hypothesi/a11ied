import {
   addLimitation,
   listLimitations,
   removeLimitation,
   addPage,
   AuditError,
   blockUnit,
   buildWorkPacket,
   claimNext,
   closeAudit,
   conformanceLevelSchema,
   dismissFinding,
   excludePage,
   getAuditStatus,
   getFinding,
   getUnit,
   includePage,
   listAuditDirs,
   listEvents,
   listFindings,
   listSignals,
   listPages,
   listUnits,
   mergeFindings,
   openAudit,
   platformSchema,
   renderWorkPacket,
   reopenUnit,
   REPORT_FORMATS,
   reportProgress,
   resolveAuditDir,
   severitySchema,
   startAudit,
   submissionSchema,
   submitUnit,
   pageKindSchema,
   updateFinding,
   writeAuditReport,
   type Audit,
} from '@a11ied/audit';
import {
   captureSubmissionEvidence,
   discoverAuditPages,
   scanAuditPages,
} from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
   activeAnnotations,
   createToolResponse,
   readOnlyAnnotations,
} from '../lib/shared.js';

const DEFAULT_LOG_LIMIT = 50;

const auditRef = {
   audit: z
      .string()
      .min(1)
      .optional()
      .describe(
         'Audit id or directory. Defaults to $A11IED_AUDIT, then the only audit in the workspace.',
      ),
};
const workerRef = {
   ...auditRef,
   worker: z.string().min(1).describe('A stable name for this worker, such as w1.'),
};
const unitRef = { unit: z.string().min(1).describe('Unit id, such as P1.keyboard.') };

/** Lists every problem in the error message, so an agent can fix them in one attempt. */
function describeError(error: unknown): Error {
   if (error instanceof AuditError) {
      const lines = error.problems.map((problem) => `  - ${problem}`);
      return new Error([`${error.code}: ${error.message}`, ...lines].join('\n'));
   }
   return error instanceof Error ? error : new Error(String(error));
}

async function withAudit<TResult>(
   selection: string | undefined,
   work: (audit: Audit) => TResult | Promise<TResult>,
): Promise<TResult> {
   let audit: Audit | undefined = undefined;
   try {
      audit = openAudit(resolveAuditDir(selection));
      return await work(audit);
   } catch (error) {
      throw describeError(error);
   } finally {
      if (audit) {
         closeAudit(audit);
      }
   }
}

function registerSetupTools(server: McpServer): void {
   server.registerTool(
      'audit_init',
      {
         title: 'Start an audit',
         description:
            'Create a WCAG audit of a website, page, feature, or mobile app with a fixed scope. The scope is every ' +
            'criterion at the level unless criteria or passes narrows it. Add pages next with audit_discover or ' +
            'audit_page. Matches the CLI audit init command.',
         inputSchema: {
            target: z
               .string()
               .min(1)
               .describe('A URL, an app name, or a short description.'),
            name: z.string().optional(),
            id: z.string().optional(),
            platform: platformSchema.optional(),
            level: conformanceLevelSchema.optional(),
            wcagVersion: z.string().optional(),
            criteria: z.array(z.string()).optional(),
            passes: z.array(z.string()).optional(),
            rules: z
               .array(z.string())
               .optional()
               .describe('Restrictions every worker must follow.'),
            access: z.string().optional().describe('How to reach the target.'),
            page: z.boolean().optional().describe('Add the target as the only page.'),
         },
         annotations: activeAnnotations,
      },
      async (input) => {
         try {
            const audit = startAudit(input);
            try {
               if (input.page) {
                  addPage(audit, { locator: input.target });
               }
               return createToolResponse({
                  dir: audit.dir,
                  status: getAuditStatus(audit),
               });
            } finally {
               closeAudit(audit);
            }
         } catch (error) {
            throw describeError(error);
         }
      },
   );
   server.registerTool(
      'audit_list',
      {
         title: 'List audits',
         description: 'List the audits in the workspace with their progress.',
         inputSchema: {},
         annotations: readOnlyAnnotations,
      },
      async () =>
         createToolResponse({
            audits: listAuditDirs().map((dir) => {
               const audit = openAudit(dir);
               try {
                  const status = getAuditStatus(audit, 1);
                  return {
                     id: status.config.id,
                     name: status.config.name,
                     phase: status.phase,
                     percentDone: status.units.percentDone,
                     dir,
                  };
               } finally {
                  closeAudit(audit);
               }
            }),
         }),
   );
}

function registerPageTools(server: McpServer): void {
   server.registerTool(
      'audit_page',
      {
         title: 'Manage audit pages',
         description:
            'Add, list, exclude, or include the pages, screens, states, and flows an audit covers. For add, locator is a ' +
            'URL or how to reach the screen, and notes carries setup or flow steps. Matches the CLI audit page commands.',
         inputSchema: {
            ...auditRef,
            action: z.enum(['add', 'list', 'exclude', 'include']),
            locator: z.string().optional(),
            page: z.string().optional().describe('Page ID for exclude and include.'),
            name: z.string().optional(),
            kind: pageKindSchema.optional(),
            notes: z.string().optional(),
            group: z.string().optional(),
            passes: z.array(z.string()).optional(),
            reason: z.string().optional().describe('Required for exclude.'),
         },
         annotations: activeAnnotations,
      },
      async (input) =>
         createToolResponse(
            await withAudit(input.audit, (audit) => {
               if (input.action === 'add') {
                  return {
                     page: addPage(audit, {
                        ...input,
                        locator: input.locator ?? '',
                     }),
                  };
               }
               if (input.action === 'exclude') {
                  return {
                     page: excludePage(audit, {
                        pageId: input.page ?? '',
                        reason: input.reason ?? '',
                     }),
                  };
               }
               if (input.action === 'include') {
                  return { page: includePage(audit, input.page ?? '') };
               }
               return { pages: listPages(audit) };
            }),
         ),
   );
   server.registerTool(
      'audit_discover',
      {
         title: 'Discover pages for an audit',
         description:
            'Read the sitemap and crawl same-origin links, then add each reachable page to the audit. Matches the CLI ' +
            'audit discover command.',
         inputSchema: {
            ...auditRef,
            url: z.string().optional(),
            maxPages: z.number().int().positive().optional(),
            include: z.array(z.string()).optional(),
            exclude: z.array(z.string()).optional(),
            storageStatePath: z.string().optional(),
            dryRun: z.boolean().optional(),
         },
         annotations: activeAnnotations,
      },
      async (input) =>
         createToolResponse(
            await withAudit(input.audit, async (audit) => ({
               ...(await discoverAuditPages(audit, input)),
            })),
         ),
   );
   server.registerTool(
      'audit_scan',
      {
         title: 'Run the automated checks for an audit',
         description:
            'Run axe-core and page measurements on every web page in parallel. Failures axe is certain of become ' +
            'findings; everything else becomes signals in work packets. The scan never passes a criterion. Matches the ' +
            'CLI audit scan command.',
         inputSchema: {
            ...auditRef,
            pageIds: z.array(z.string()).optional(),
            concurrency: z.number().int().positive().optional(),
            timeoutMs: z.number().int().positive().optional(),
            storageStatePath: z.string().optional(),
         },
         annotations: activeAnnotations,
      },
      async (input) =>
         createToolResponse(
            await withAudit(input.audit, async (audit) => ({
               pages: await scanAuditPages(audit, input),
               findings: getAuditStatus(audit, 1).findings,
            })),
         ),
   );
}

function registerWorkTools(server: McpServer): void {
   server.registerTool(
      'audit_next',
      {
         title: 'Claim the next audit unit',
         description:
            'Claim one unit of audit work, a test pass on one page, and return its work packet: procedure, criteria ' +
            'to decide, scan signals, known findings, and how to submit. A worker that already has a unit gets the ' +
            'same unit back. Returns no packet when nothing is available. Matches the CLI audit next command.',
         inputSchema: {
            ...workerRef,
            passes: z.array(z.string()).optional(),
            excludePasses: z.array(z.string()).optional(),
            pageId: z.string().optional(),
            unitId: z.string().optional(),
            leaseMinutes: z.number().int().positive().optional(),
         },
         annotations: activeAnnotations,
      },
      async (input) => {
         const result = await withAudit(input.audit, (audit) => {
            const unit = claimNext(audit, input);
            return unit
               ? { packet: buildWorkPacket(audit, unit) }
               : { packet: undefined, units: getAuditStatus(audit, 1).units };
         });
         return createToolResponse(
            result,
            result.packet
               ? renderWorkPacket(result.packet)
               : 'No unit is available for this worker. Stop here.',
         );
      },
   );
   server.registerTool(
      'audit_show',
      {
         title: 'Show an audit unit',
         description: 'Return a unit and its work packet without claiming it.',
         inputSchema: { ...auditRef, ...unitRef },
         annotations: readOnlyAnnotations,
      },
      async (input) => {
         const packet = await withAudit(input.audit, (audit) =>
            buildWorkPacket(audit, getUnit(audit, input.unit)),
         );
         return createToolResponse({ packet }, renderWorkPacket(packet));
      },
   );
   server.registerTool(
      'audit_submit',
      {
         title: 'Submit an audit unit',
         description:
            'Hand in a unit: an outcome and note for every criterion, any findings, the states tested, and any ' +
            'dismissals. A finding with a screenshot spec gets a cropped picture of its element as evidence. Accepted or ' +
            'rejected as a whole; a rejection lists every problem. Matches the CLI audit submit command.',
         inputSchema: { ...workerRef, ...unitRef, submission: submissionSchema },
         annotations: activeAnnotations,
      },
      async (input) =>
         createToolResponse(
            await withAudit(input.audit, async (audit) => {
               const { submission, problems } = await captureSubmissionEvidence(audit, {
                  unitId: input.unit,
                  submission: input.submission,
               });
               return {
                  receipt: submitUnit(audit, {
                     unitId: input.unit,
                     worker: input.worker,
                     submission,
                     problems,
                  }),
                  units: getAuditStatus(audit, 1).units,
               };
            }),
         ),
   );
}

function registerUnitStateTools(server: McpServer): void {
   server.registerTool(
      'audit_note',
      {
         title: 'Report progress on an audit unit',
         description: 'Keep a claim alive and log what the worker is doing.',
         inputSchema: { ...workerRef, ...unitRef, message: z.string().optional() },
         annotations: activeAnnotations,
      },
      async (input) =>
         createToolResponse(
            await withAudit(input.audit, (audit) => ({
               unit: reportProgress(audit, {
                  unitId: input.unit,
                  worker: input.worker,
                  message: input.message,
               }),
            })),
         ),
   );
   server.registerTool(
      'audit_block',
      {
         title: 'Block an audit unit',
         description:
            'Park a unit that cannot be tested until a person acts. When only some criteria are affected, submit the ' +
            'unit with those criteria as cannot-tell instead.',
         inputSchema: {
            ...auditRef,
            ...unitRef,
            reason: z.string().min(1),
            worker: z.string().optional(),
         },
         annotations: activeAnnotations,
      },
      async (input) =>
         createToolResponse(
            await withAudit(input.audit, (audit) => ({
               unit: blockUnit(audit, {
                  unitId: input.unit,
                  actor: input.worker ?? 'lead',
                  reason: input.reason,
               }),
            })),
         ),
   );
   server.registerTool(
      'audit_limitation',
      {
         title: 'Record an audit limitation',
         description:
            'Record something the whole audit could not test, such as no screen reader or no physical device. ' +
            'The report lists it under Not verified. For a gap on one page, submit the criterion as cannot-tell instead. ' +
            'Pass remove (a 1-based position) instead of text to drop a limitation once that testing is done.',
         inputSchema: {
            ...auditRef,
            text: z.string().min(1).optional(),
            criterion: z.string().optional(),
            remove: z.number().int().positive().optional(),
         },
         annotations: activeAnnotations,
      },
      async (input) =>
         createToolResponse(
            await withAudit(input.audit, (audit) => ({
               limitation:
                  input.remove === undefined
                     ? addLimitation(audit, {
                          text: input.text ?? '',
                          criterion: input.criterion,
                       })
                     : removeLimitation(audit, { position: input.remove }),
               limitations: listLimitations(audit),
            })),
         ),
   );
   server.registerTool(
      'audit_reopen',
      {
         title: 'Reopen an audit unit',
         description: 'Put a blocked or finished unit back in the queue.',
         inputSchema: { ...auditRef, ...unitRef, reason: z.string().min(1) },
         annotations: activeAnnotations,
      },
      async (input) =>
         createToolResponse(
            await withAudit(input.audit, (audit) => ({
               unit: reopenUnit(audit, {
                  unitId: input.unit,
                  actor: 'lead',
                  reason: input.reason,
               }),
            })),
         ),
   );
}

function registerFindingTools(server: McpServer): void {
   server.registerTool(
      'audit_findings',
      {
         title: 'List or show audit findings',
         description:
            'List the findings recorded so far, or show one with its occurrences when finding is given.',
         inputSchema: {
            ...auditRef,
            finding: z.string().optional(),
            criterion: z.string().optional(),
            pageId: z.string().optional(),
            includeDismissed: z.boolean().optional(),
         },
         annotations: readOnlyAnnotations,
      },
      async (input) =>
         createToolResponse(
            await withAudit(input.audit, (audit) =>
               input.finding
                  ? { finding: getFinding(audit, input.finding) }
                  : { findings: listFindings(audit, input) },
            ),
         ),
   );
   server.registerTool(
      'audit_finding',
      {
         title: 'Curate an audit finding',
         description:
            'Dismiss a finding as wrong, merge duplicates into it, or rewrite its title, severity, text, or the reason it fails each criterion.',
         inputSchema: {
            ...auditRef,
            action: z.enum(['dismiss', 'merge', 'update']),
            finding: z.string().min(1),
            reason: z.string().optional().describe('Required for dismiss.'),
            pageId: z.string().optional().describe('Dismiss on this page only.'),
            from: z
               .array(z.string())
               .optional()
               .describe('Findings to merge into this one.'),
            title: z.string().optional(),
            severity: severitySchema.optional(),
            description: z.string().optional(),
            impact: z.string().optional(),
            recommendation: z.string().optional(),
            reasons: z
               .record(z.string(), z.string().min(1))
               .optional()
               .describe(
                  'How the defect fails each criterion, by criterion id: what the criterion requires and what the page does instead.',
               ),
         },
         annotations: activeAnnotations,
      },
      async (input) =>
         createToolResponse(
            await withAudit(input.audit, (audit) => {
               if (input.action === 'dismiss') {
                  return {
                     finding: dismissFinding(audit, {
                        findingId: input.finding,
                        reason: input.reason ?? '',
                        pageId: input.pageId,
                        actor: 'lead',
                     }),
                  };
               }
               if (input.action === 'merge') {
                  return {
                     finding: mergeFindings(audit, {
                        into: input.finding,
                        from: input.from ?? [],
                        actor: 'lead',
                     }),
                  };
               }
               return {
                  finding: updateFinding(audit, {
                     findingId: input.finding,
                     actor: 'lead',
                     changes: {
                        ...(input.title === undefined ? {} : { title: input.title }),
                        ...(input.severity === undefined
                           ? {}
                           : { severity: input.severity }),
                        ...(input.description === undefined
                           ? {}
                           : { description: input.description }),
                        ...(input.impact === undefined ? {} : { impact: input.impact }),
                        ...(input.recommendation === undefined
                           ? {}
                           : { recommendation: input.recommendation }),
                        ...(input.reasons === undefined
                           ? {}
                           : { reasons: input.reasons }),
                     },
                  }),
               };
            }),
         ),
   );
}

function registerInspectTools(server: McpServer): void {
   server.registerTool(
      'audit_status',
      {
         title: 'Audit status',
         description:
            'Progress of an audit: units done, active workers, blocked units and why, findings, criteria standings, and ' +
            'recent activity. Set units to list every unit, or log to return more of the activity log.',
         inputSchema: {
            ...auditRef,
            units: z.boolean().optional(),
            log: z.boolean().optional(),
            unitId: z.string().optional().describe('Limit the log to one unit.'),
            limit: z.number().int().positive().optional(),
         },
         annotations: readOnlyAnnotations,
      },
      async (input) =>
         createToolResponse(
            await withAudit(input.audit, (audit) => ({
               status: getAuditStatus(audit),
               ...(input.units ? { units: listUnits(audit) } : {}),
               ...(input.log
                  ? {
                       events: listEvents(audit, {
                          unitId: input.unitId,
                          limit: input.limit ?? DEFAULT_LOG_LIMIT,
                       }),
                    }
                  : {}),
            })),
         ),
   );
   server.registerTool(
      'audit_signals',
      {
         title: 'Audit scan signals',
         description: 'The facts the automated scan collected for one page.',
         inputSchema: {
            ...auditRef,
            page: z.string().min(1),
            kind: z.string().optional(),
         },
         annotations: readOnlyAnnotations,
      },
      async (input) =>
         createToolResponse(
            await withAudit(input.audit, (audit) => ({
               signals: listSignals(audit, input.page).filter(
                  (signal) => input.kind === undefined || signal.kind === input.kind,
               ),
            })),
         ),
   );
   server.registerTool(
      'audit_report',
      {
         title: 'Build the audit report',
         description:
            'Write the audit report as HTML, Markdown, and JSON and return the file paths. Before every unit is done ' +
            'the report is marked interim. Matches the CLI audit report command.',
         inputSchema: {
            ...auditRef,
            formats: z.array(z.enum(REPORT_FORMATS)).optional(),
            outDir: z.string().optional(),
            embedEvidence: z.boolean().optional(),
         },
         annotations: activeAnnotations,
      },
      async (input) =>
         createToolResponse(
            await withAudit(input.audit, (audit) => {
               const written = writeAuditReport(audit, input);
               return {
                  files: written.files,
                  final: written.report.final,
                  verdict: written.report.verdict,
                  findings: written.report.findings.length,
                  gaps: written.report.gaps.length,
               };
            }),
         ),
   );
}

/** Registers the tools that start, run, track, and report an audit. */
export function registerAuditTools(server: McpServer): void {
   registerSetupTools(server);
   registerPageTools(server);
   registerWorkTools(server);
   registerUnitStateTools(server);
   registerFindingTools(server);
   registerInspectTools(server);
}
