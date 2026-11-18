import { join } from 'node:path';
import { getConfig, type Audit } from './db.js';
import { failsCriterion, listFindings } from './findings.js';
import { getPassProcedure, getTestPass } from './passes.js';
import type { AuditConfig, AuditPage, StateInventory, Unit } from './schema.js';
import { getCriterionInfo, type CriterionInfo } from './scope.js';
import { listSignals } from './signals.js';
import { getStateInventory } from './states.js';
import { listPriorResults, type PriorResult } from './reopen.js';
import { getPage, listActivePages, SITE_PAGE_ID } from './pages.js';

const WCAG2MOBILE_URL = 'https://www.w3.org/TR/wcag2mobile-22/';

export interface KnownFinding {
   id: string;
   criterion: string;
   title: string;
   severity: string;
   source: string;
   /** Where it occurs on this unit's page, when it does. */
   locationHere: string | undefined;
   otherPages: number;
}

/** Everything a worker needs to carry out one unit without reading anything else. */
export interface WorkPacket {
   audit: Pick<
      AuditConfig,
      'id' | 'name' | 'target' | 'platform' | 'wcagVersion' | 'rules' | 'access'
   >;
   unit: Unit;
   page: AuditPage;
   pass: {
      id: string;
      title: string;
      goal: string;
      procedure: readonly string[];
   };
   criteria: CriterionInfo[];
   signals: Record<string, unknown>;
   knownFindings: KnownFinding[];
   /** Controls the scan found that change what the page shows; each must be accounted for. */
   stateInventory: StateInventory | undefined;
   /** What this unit recorded before it was last reopened, so a re-test starts from it. */
   priorResults: PriorResult[];
   /** Every page in the audit, for site-wide units only. */
   pages: Pick<AuditPage, 'id' | 'name' | 'locator'>[];
   evidenceDir: string;
   /** A private screen reader session directory, so parallel workers do not collide. */
   stateDir: string;
}

function listKnownFindings(audit: Audit, unit: Unit): KnownFinding[] {
   return listFindings(audit)
      .filter((finding) =>
         unit.criteria.some((criterion) => failsCriterion(finding, criterion)),
      )
      .map((finding) => {
         const here = finding.open.find((instance) => instance.pageId === unit.pageId);
         return {
            id: finding.id,
            criterion: [finding.criterion, ...finding.related].join(', '),
            title: finding.title,
            severity: finding.severity,
            source: finding.source,
            locationHere: here?.location,
            otherPages: new Set(
               finding.open
                  .filter((instance) => instance.pageId !== unit.pageId)
                  .map((instance) => instance.pageId),
            ).size,
         };
      });
}

/**
 * Gathers the signals a unit needs. A site-wide unit gets each page's signal side by
 * side, because its job is to compare them.
 */
function collectSignals(
   audit: Audit,
   unit: Unit,
   wanted: readonly string[],
): Record<string, unknown> {
   if (unit.pageId !== SITE_PAGE_ID) {
      return Object.fromEntries(
         listSignals(audit, unit.pageId)
            .filter((signal) => wanted.includes(signal.kind))
            .map((signal) => [signal.kind, signal.data]),
      );
   }
   const perPage = listSignals(audit).filter((signal) => wanted.includes(signal.kind));
   return Object.fromEntries(
      wanted
         .map((kind): [string, Record<string, unknown>] => [
            kind,
            Object.fromEntries(
               perPage
                  .filter((signal) => signal.kind === kind)
                  .map((signal) => [signal.pageId, signal.data]),
            ),
         ])
         .filter(([, byPage]) => Object.keys(byPage).length > 0),
   );
}

export function buildWorkPacket(audit: Audit, unit: Unit): WorkPacket {
   const config = getConfig(audit);
   const pass = getTestPass(unit.pass);
   const signals = collectSignals(audit, unit, pass?.signals ?? []);
   return {
      audit: {
         id: config.id,
         name: config.name,
         target: config.target,
         platform: config.platform,
         wcagVersion: config.wcagVersion,
         rules: config.rules,
         access: config.access,
      },
      unit,
      page: getPage(audit, unit.pageId),
      pass: {
         id: unit.pass,
         title: pass?.title ?? unit.pass,
         goal: pass?.goal ?? '',
         procedure: pass ? getPassProcedure(pass, config.platform) : [],
      },
      criteria: unit.criteria.map((criterion) =>
         getCriterionInfo(criterion, config.wcagVersion),
      ),
      signals,
      knownFindings: listKnownFindings(audit, unit),
      priorResults: listPriorResults(audit, unit.id),
      stateInventory:
         unit.pageId === SITE_PAGE_ID ? undefined : getStateInventory(audit, unit.pageId),
      pages:
         unit.pageId === SITE_PAGE_ID
            ? listActivePages(audit).map((page) => ({
                 id: page.id,
                 name: page.name,
                 locator: page.locator,
              }))
            : [],
      evidenceDir: join(audit.dir, 'evidence', unit.id),
      stateDir: join(audit.dir, 'workers', unit.worker ?? 'worker'),
   };
}

function renderPage(packet: WorkPacket): string[] {
   const { page } = packet;
   const lines = [`Page: ${page.id} ${page.name} (${page.kind})`];
   if (page.locator !== page.name) {
      lines.push(`Where: ${page.locator}`);
   }
   if (page.notes !== '') {
      lines.push(`Setup: ${page.notes}`);
   }
   if (packet.pages.length > 0) {
      lines.push('Pages to compare:');
      lines.push(
         ...packet.pages.map((each) => `  ${each.id} ${each.name} - ${each.locator}`),
      );
   }
   return lines;
}

function renderRules(packet: WorkPacket): string[] {
   const lines: string[] = [];
   if (packet.audit.access !== '') {
      lines.push(`Access: ${packet.audit.access}`);
   }
   if (packet.audit.rules.length > 0) {
      lines.push('Rules you must not break:');
      lines.push(...packet.audit.rules.map((rule) => `  - ${rule}`));
      lines.push(
         'A rule forbids an effect, such as sending a message or placing an order. Test everything short of that effect: client-side validation and error messages, confirmation steps, and cancel paths. Record cannot-tell only for what lies past the forbidden effect, and say so in the note.',
      );
   }
   return lines;
}

function renderKnownFindings(packet: WorkPacket): string[] {
   if (packet.knownFindings.length === 0) {
      return [];
   }
   return [
      '',
      '## Findings already recorded for these criteria',
      'Confirm or dismiss the ones on this page. Use sameAs for another occurrence of one.',
      ...packet.knownFindings.map((finding) => {
         const here =
            finding.locationHere === undefined
               ? 'not on this page'
               : `ON THIS PAGE at ${finding.locationHere}`;
         return `- ${finding.id} [${finding.criterion}, ${finding.severity}, ${finding.source}] ${finding.title} (${here}; ${String(finding.otherPages)} other page(s))`;
      }),
   ];
}

/** Lists the states the scan found and asks for the ones it cannot find. */
function renderStates(packet: WorkPacket): string[] {
   if (packet.unit.pageId === SITE_PAGE_ID) {
      return [];
   }
   const triggers = packet.stateInventory?.triggers ?? [];
   const omitted = packet.stateInventory?.omitted ?? 0;
   return [
      '',
      '## States to cover',
      'A page is every state it can reach, not only how it looks on load. Judge each criterion in each state: open menus, dialogs, widgets, and tabs, expanded sections, embedded frames, hover and focus content, and forms with errors showing. List every state in "states". A state you leave out needs tested: false and the reason.',
      ...(triggers.length === 0
         ? [
              packet.audit.platform === 'web'
                 ? 'The scan found no controls that change the page. Look for any it missed.'
                 : 'There is no scan for apps. Find the states yourself: sheets, dialogs, menus, expanded rows, tabs, and error states.',
           ]
         : [
              "The scan found these. Each id must appear in some state's covers. The list is a starting point; add states it missed with empty covers.",
              ...triggers.map(
                 (trigger) =>
                    `- ${trigger.id} ${trigger.kind}: "${trigger.label}" (${trigger.selector})`,
              ),
              ...(omitted > 0
                 ? [
                      `- and ${String(omitted)} more like these; cover them in a state that names them as a group.`,
                   ]
                 : []),
           ]),
   ];
}

function renderPriorResults(packet: WorkPacket): string[] {
   const [first] = packet.priorResults;
   if (first === undefined) {
      return [];
   }
   return [
      '',
      '## Prior results',
      `This unit was reopened: ${first.reopenReason}. Its earlier outcomes are below. Re-test what the reason calls into question, and carry over notes that still hold.`,
      ...packet.priorResults.map(
         (result) =>
            `- ${result.criterion} ${result.outcome} (${result.worker}): ${result.note}`,
      ),
   ];
}

function renderSignals(packet: WorkPacket): string[] {
   const kinds = Object.entries(packet.signals);
   if (kinds.length === 0) {
      return [];
   }
   return [
      '',
      '## Signals from the automated scan',
      'These are facts to check against, not conclusions. Verify before relying on one.',
      ...kinds.map(([kind, data]) => `${kind}: ${JSON.stringify(data)}`),
      'Full detail: a1 audit signals <page>',
   ];
}

function renderSubmission(packet: WorkPacket): string[] {
   const { unit } = packet;
   const results = unit.criteria.map(
      (criterion) =>
         `  {"criterion": "${criterion}", "outcome": "pass | fail | not-applicable | cannot-tell", "note": "what you checked and saw"}`,
   );
   const template = [
      '{',
      ' "results": [',
      results.join(',\n'),
      ' ],',
      ' "findings": [',
      `  {"criterion": "${unit.criteria[0] ?? ''}", "title": "short defect name, same wording on every page", "severity": "critical | serious | moderate | minor", "description": "what is wrong, as an observed fact", "impact": "who is affected and how", "recommendation": "the change that fixes it", "location": "visible label plus selector", "alsoFails": [], "detail": "optional measurements", "screenshot": {"selector": "css or role=button[name=\\"Menu\\"]", "viewport": "320x800", "click": [], "press": [], "hover": "optional"}, "evidence": []}`,
      ' ],',
      ' "dismiss": [{"finding": "F1", "reason": "why it is not a failure here"}],',
      ' "states": [{"name": "Menu open", "covers": ["S1"], "tested": true, "note": "how you reached it and what you checked"}],',
      ' "summary": "one sentence"',
      '}',
   ];
   const worker = unit.worker ?? '<worker>';
   return [
      '',
      '## Submit',
      `Save screenshots and other evidence under ${packet.evidenceDir}`,
      `Write the JSON below to a file and run: a1 audit submit ${unit.id} --worker ${worker} --file <file>`,
      'Every criterion needs an outcome. fail needs a finding. A new finding needs title, severity, description, impact, recommendation, and location; another occurrence of a known finding needs only sameAs, criterion, and location. When one defect fails several criteria, file it once and list the others in alsoFails.',
      ...(packet.audit.platform === 'web'
         ? [
              'Every occurrence needs evidence. Give screenshot with a selector for the failing element and whatever viewport, zoom, textSpacing, click, press, or hover puts the page in the failing state; submit then saves a cropped picture with the element outlined. Attach your own image in evidence when the state cannot be reproduced that way.',
           ]
         : [
              'Attach a screenshot of each failing element in evidence where one helps a reader see the defect.',
           ]),
      `If you cannot do any of this unit, run: a1 audit block ${unit.id} --worker ${worker} --reason "<what a person must provide>"`,
      `During long work, run: a1 audit note ${unit.id} --worker ${worker} "<what you are doing>" to keep your claim alive.`,
      'Template (delete the example finding and dismissal when you have none):',
      ...template,
   ];
}

function renderEnvironment(packet: WorkPacket): string[] {
   if (packet.audit.platform !== 'web') {
      return [
         '',
         `a1 wcag <id> prints what changes for a mobile app. Full guidance: ${WCAG2MOBILE_URL}`,
      ];
   }
   return [
      '',
      `Before using a1 sr, run: export A11IED_STATE_DIR=${packet.stateDir}`,
      'That gives you a private screen reader session that other workers cannot disturb.',
   ];
}

function renderCriterion(criterion: CriterionInfo): string[] {
   if (criterion.failsWhen === '') {
      return [
         `- ${criterion.id} ${criterion.title} (${criterion.level}): ${criterion.summary}`,
      ];
   }
   return [
      `- ${criterion.id} ${criterion.title} (${criterion.level})`,
      `    Applies to: ${criterion.appliesTo}`,
      `    Check: ${criterion.checks.join(' ')}`,
      `    Fails when: ${criterion.failsWhen}`,
      `    Not applicable when: ${criterion.notApplicableWhen}`,
   ];
}

/** Renders a work packet as the plain text an agent reads. */
export function renderWorkPacket(packet: WorkPacket): string {
   const { audit, unit, pass } = packet;
   return [
      `# Unit ${unit.id}: ${pass.title}`,
      `Audit: ${audit.name} (${audit.target}), ${audit.platform}, WCAG ${audit.wcagVersion}`,
      ...renderPage(packet),
      ...renderRules(packet),
      ...renderEnvironment(packet),
      '',
      `## Goal`,
      pass.goal,
      '',
      '## Procedure',
      ...pass.procedure.map((step, index) => `${String(index + 1)}. ${step}`),
      '',
      '## Criteria to decide',
      'Look one up with: a1 wcag <id>',
      ...packet.criteria.flatMap(renderCriterion),
      ...renderStates(packet),
      ...renderKnownFindings(packet),
      ...renderPriorResults(packet),
      ...renderSignals(packet),
      ...renderSubmission(packet),
   ].join('\n');
}
