import type { ReportModel } from '@a11ied/contracts';
import { escapeHtml } from './outcome-html.js';

const ISSUE_DESCRIPTIONS = new Map([
   [
      'audit-check-active',
      [
         'Assessment currently running',
         'Finish the active procedure and save its evidence before claiming another check.',
      ],
   ],
   [
      'audit-check-running',
      [
         'Assessment currently running',
         'Finish the active procedure and save its evidence before claiming another check.',
      ],
   ],
   [
      'audit-journey-incomplete',
      [
         'User process unfinished',
         'Complete the remaining process steps or retain the specific authorization boundary and its impact on coverage.',
      ],
   ],
   [
      'audit-check-evidence-invalid',
      [
         'Evidence needs correction',
         'Recapture the required observations and validate their state, attempt, timestamps, and artifact integrity.',
      ],
   ],
   [
      'audit-check-identity-invalid',
      [
         'Check scope needs correction',
         'Requeue the procedure for the current state and environment, then assess it with fresh evidence.',
      ],
   ],
   [
      'audit-procedure-missing',
      [
         'Assessment procedure unavailable',
         'Define and validate a procedure covering the criterion before judging it.',
      ],
   ],
   [
      'audit-states-missing',
      [
         'No page or screen observed',
         'Visit the target and register its actual initial state and applicable interactive states.',
      ],
   ],
   [
      'audit-journeys-missing',
      [
         'User processes not yet observed',
         'Identify the complete user processes and register the states and steps they require.',
      ],
   ],
   [
      'audit-obligation-missing',
      [
         'Checks not yet registered for the current scope',
         'Queue the required checks for the observed pages and states, then execute them. This is unfinished work, not a website failure.',
      ],
   ],
   [
      'audit-check-queued',
      [
         'Checks awaiting execution',
         'Run the remaining procedures, completing each page before moving on.',
      ],
   ],
   [
      'audit-check-unsupported',
      [
         'Checks needing an unavailable capability',
         'Use a verified environment with the required capability. Results remain unknown.',
      ],
   ],
   [
      'audit-check-blocked',
      [
         'Checks blocked during execution',
         'Preserve documented scope and authorization limits. Retry execution blockers only after their saved recovery conditions are met.',
      ],
   ],
   [
      'audit-check-stale',
      [
         'Checks needing reassessment',
         'The observed scope changed. Reassess the current state with fresh evidence.',
      ],
   ],
   [
      'audit-check-uncertain',
      [
         'Attempted checks with inconclusive evidence',
         'Complete the missing observations before judging the criterion.',
      ],
   ],
   [
      'audit-discovery-incomplete',
      [
         'Discovery requires attention',
         'Resolve the discovery failures or limits before claiming complete site coverage.',
      ],
   ],
]);

function renderBlockedReasons(model: ReportModel): string {
   const reasons = new Map<string, number>();
   for (const issue of model.assessment?.issues ?? []) {
      if (issue.code === 'audit-check-blocked') {
         reasons.set(issue.message, (reasons.get(issue.message) ?? 0) + 1);
      }
   }
   if (reasons.size === 0) {
      return '';
   }
   const items = [...reasons]
      .map(([reason, count]) => {
         const text = `${String(count)} checks: ${escapeHtml(reason)}`;
         return `<li>${text}</li>`;
      })
      .join('');

   return `<details open><summary>Recorded authorization and execution blockers</summary><ul>${items}</ul></details>`;
}

/** Summarize repeated coordinator diagnostics without hiding their original JSON. */
export function renderAssessmentIssues(model: ReportModel): string {
   const groups = new Map<string, { count: number; message: string }>();
   for (const issue of model.assessment?.issues ?? []) {
      const previous = groups.get(issue.code);
      groups.set(issue.code, {
         count: (previous?.count ?? 0) + 1,
         message: previous?.message ?? issue.message,
      });
   }
   if (groups.size === 0) {
      return '';
   }
   const rows = [...groups]
      .map(([code, group]) => {
         const [label, action] = ISSUE_DESCRIPTIONS.get(code) ?? [code, group.message];

         return `<tr><th scope="row">${escapeHtml(label ?? code)}</th><td>${String(group.count)}</td><td>${escapeHtml(action ?? group.message)}</td></tr>`;
      })
      .join('');

   return `<p>These are coverage gaps, not accessibility findings. Counts describe checks or scope requirements, not unique defects. Page progress is shown below; individual check IDs and original diagnostics remain in report.json.</p>${renderBlockedReasons(model)}<details><summary>Assessment gaps by reason (${String(groups.size)} groups)</summary><div class="table-scroll" tabindex="0" role="region" aria-label="Assessment gaps table"><table><caption>What remains to be assessed</caption><thead><tr><th scope="col">Reason</th><th scope="col">Count</th><th scope="col">Next action</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}
