export { AuditError } from './errors.js';
export {
   addEvent,
   closeAudit,
   getConfig,
   isAuditDir,
   openAudit,
   saveConfig,
   type Audit,
   type OpenAuditOptions,
} from './db.js';
export {
   addLimitation,
   listLimitations,
   removeLimitation,
   type AuditLimitation,
} from './limitations.js';
export { startAudit, type StartAuditInput } from './init.js';
export * from './schema.js';
export {
   getPassIdForCriterion,
   getPassProcedure,
   getTestPass,
   listTestPassIds,
   TEST_PASSES,
   type TestPass,
} from './passes.js';
export {
   compareCriteria,
   getCriterionInfo,
   resolveScopeCriteria,
   type CriterionInfo,
} from './scope.js';
export {
   addPage,
   excludePage,
   getPage,
   includePage,
   listActivePages,
   listPages,
   SITE_PAGE_ID,
   type PageInput,
} from './pages.js';
export {
   blockUnit,
   claimNext,
   DEFAULT_LEASE_MINUTES,
   getUnit,
   listUnits,
   MAX_ATTEMPTS,
   recoverExpiredLeases,
   reopenUnit,
   reportProgress,
   type ClaimRequest,
} from './units.js';
export {
   dismissFinding,
   getFinding,
   listFindings,
   mergeFindings,
   recordAutomatedFinding,
   SEVERITY_ORDER,
   updateFinding,
   type FindingEdit,
   type FindingRecord,
} from './findings.js';
export { parseSubmission, submitUnit, type SubmitReceipt } from './submit.js';
export { listSignals, putSignal } from './signals.js';
export {
   getStateInventory,
   listPageStates,
   STATE_SIGNAL_KIND,
   type PageState,
} from './states.js';
export {
   getAuditStatus,
   listCriterionRollups,
   listEvents,
   listResults,
   listPageOutcomes,
   type AuditStatus,
   type CriterionRollup,
   type CriterionStanding,
   type PageOutcome,
} from './status.js';
export { buildWorkPacket, renderWorkPacket, type WorkPacket } from './packet.js';
export {
   AUDIT_ENV_VAR,
   AUDITS_DIR_ENV_VAR,
   listAuditDirs,
   resolveAuditDir,
   resolveAuditsRoot,
   slugify,
} from './workspace.js';
export { buildAuditReport, type AuditReport } from './report/model.js';
export { renderHtmlReport } from './report/html.js';
export { renderMarkdownReport } from './report/markdown.js';
export {
   REPORT_FORMATS,
   writeAuditReport,
   type ReportFormat,
   type WrittenReport,
} from './report/write.js';
export { renderDashboardHtml, type UpdateNotice } from './dashboard/render.js';
export { startDashboardServer, type DashboardServer } from './dashboard/server.js';
