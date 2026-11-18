import type {
   AuditEvent,
   AuditStatus,
   FindingRecord,
   AuditPage,
   Unit,
} from '@a11ied/audit';
import { dim, fields, heading, listItems, section, table } from '../../lib/format.js';

const TIME_START = 11;
const TIME_END = 19;
const BAR_WIDTH = 30;
const PERCENT = 100;

const PHASE_TEXT: Readonly<Record<AuditStatus['phase'], string>> = {
   setup: 'Setting up. Add pages with a1 audit page add or a1 audit discover.',
   'in-progress': 'In progress',
   'needs-attention': 'Stopped: every remaining unit is blocked and needs a person',
   complete: 'Complete. Build the report with a1 audit report.',
};

function bar(percent: number): string {
   const filled = Math.round((percent / PERCENT) * BAR_WIDTH);
   return `[${'#'.repeat(filled)}${'.'.repeat(BAR_WIDTH - filled)}] ${String(percent)}%`;
}

function renderEta(status: AuditStatus): string {
   if (status.phase !== 'in-progress' || status.etaMinutes === undefined) {
      return '';
   }
   return `, about ${String(status.etaMinutes)} min left`;
}

export function renderEvents(events: readonly AuditEvent[]): string[] {
   return events.map(
      (event) =>
         `${dim(event.at.slice(TIME_START, TIME_END))} ${event.actor}: ${event.message}`,
   );
}

/** Renders the progress summary an operator or lead agent checks. */
export function renderStatus(status: AuditStatus): string {
   const { config, units, findings, criteria } = status;
   const lines = [
      heading(`${config.name} (${config.id})`),
      ...fields([
         ['Target', `${config.target} (${config.platform})`],
         [
            'Scope',
            `WCAG ${config.wcagVersion} ${config.level}, ${String(criteria.total)} criteria, ${String(status.pages.active)} ${config.platform === 'web' ? 'pages' : 'screens'}`,
         ],
         ['Phase', PHASE_TEXT[status.phase]],
         [
            'Units',
            `${bar(units.percentDone)}  ${String(units.done)}/${String(units.total)} done, ${String(units.claimed)} in progress, ${String(units.pending)} queued, ${String(units.blocked)} blocked${renderEta(status)}`,
         ],
         [
            'Criteria',
            `${String(criteria.fail)} fail, ${String(criteria.pass)} pass, ${String(criteria['not-applicable'])} not applicable, ${String(criteria['cannot-tell'])} not verified, ${String(criteria.pending)} in progress, ${String(criteria['not-evaluated'])} not evaluated`,
         ],
         [
            'Findings',
            `${String(findings.total)} (${String(findings.critical)} critical, ${String(findings.serious)} serious, ${String(findings.moderate)} moderate, ${String(findings.minor)} minor)`,
         ],
      ]),
      ...section(
         'Test passes',
         table(
            ['Pass', 'Done', 'Working', 'Queued', 'Blocked'],
            status.passes.map((pass) => [
               pass.pass,
               `${String(pass.done)}/${String(pass.total)}`,
               String(pass.claimed),
               String(pass.pending),
               String(pass.blocked),
            ]),
         ),
      ),
   ];
   if (status.workers.length > 0) {
      lines.push(
         ...section(
            'Active workers',
            table(
               ['Worker', 'Unit', 'Working for', 'Claim expires in'],
               status.workers.map((worker) => [
                  worker.worker,
                  worker.unitId,
                  `${String(worker.minutesActive)} min`,
                  `${String(worker.leaseMinutesLeft)} min`,
               ]),
            ),
         ),
      );
   }
   if (status.blocked.length > 0) {
      lines.push(
         ...section(
            'Blocked: needs a person, then a1 audit reopen <unit>',
            listItems(status.blocked.map((unit) => `${unit.id}: ${unit.reason}`)),
         ),
      );
   }
   lines.push(...section('Recent activity (UTC)', renderEvents(status.recentEvents)));
   return lines.join('\n');
}

export function renderUnits(units: readonly Unit[]): string {
   return table(
      ['Unit', 'Status', 'Worker', 'Attempts', 'Criteria', 'Note'],
      units.map((unit) => [
         unit.id,
         unit.status,
         unit.worker ?? '',
         String(unit.attempts),
         String(unit.criteria.length),
         unit.status === 'blocked' ? unit.reason : unit.summary,
      ]),
   ).join('\n');
}

export function renderPages(pages: readonly AuditPage[]): string {
   if (pages.length === 0) {
      return 'No pages yet. Add one with a1 audit page add <url-or-description>.';
   }
   return table(
      ['ID', 'Kind', 'Status', 'Name', 'Location'],
      pages.map((page) => [
         page.id,
         page.kind,
         page.status === 'excluded' ? `excluded: ${page.excludeReason}` : page.status,
         page.name,
         page.locator,
      ]),
   ).join('\n');
}

export function renderFindingList(findings: readonly FindingRecord[]): string {
   if (findings.length === 0) {
      return 'No findings.';
   }
   return table(
      ['ID', 'Severity', 'WCAG', 'Source', 'Pages', 'Issue'],
      findings.map((finding) => [
         finding.id,
         finding.severity,
         [finding.criterion, ...finding.related].join(', '),
         finding.source,
         [...new Set(finding.open.map((instance) => instance.pageId))].join(' '),
         finding.title,
      ]),
   ).join('\n');
}

export function renderFinding(finding: FindingRecord): string {
   return [
      heading(`${finding.id}: ${finding.title}`),
      ...fields([
         ['Severity', finding.severity],
         ['Criteria', [finding.criterion, ...finding.related].join(', ')],
         ['Source', finding.source],
         ['Problem', finding.description],
         ['Impact', finding.impact],
         ['Fix', finding.recommendation],
      ]),
      ...section(
         'Occurrences',
         listItems(
            finding.instances.map((instance) => {
               const state =
                  instance.status === 'dismissed'
                     ? ` [dismissed: ${instance.dismissReason}]`
                     : '';
               const evidence =
                  instance.evidence.length === 0
                     ? ''
                     : ` (${instance.evidence.join(', ')})`;
               return `${instance.pageId}: ${instance.location} ${instance.detail}${evidence}${state}`;
            }),
         ),
      ),
   ].join('\n');
}
