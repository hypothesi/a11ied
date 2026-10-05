import type { ReportFinding, ReportModel } from '@a11ied/contracts';
import { escapeHtml, renderLink } from './outcome-html.js';

function renderGuidanceGroup(group: string): string {
   const lines = group
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim());
   const instruction = lines[0] ?? '',
      steps = lines
         .slice(1)
         .filter(Boolean)
         .map((step) => `<li>${escapeHtml(step)}</li>`)
         .join('');
   return `<p>${escapeHtml(instruction)}</p>${steps ? `<ul>${steps}</ul>` : ''}`;
}

function renderGuidance(guidance: string): string {
   const groups = guidance
      .split(/\r?\n\s*\r?\n/)
      .map((group) => renderGuidanceGroup(group));
   return `<div class="guidance"><h5>How to fix</h5>${groups.join('')}</div>`;
}

function renderFindingEvidence(finding: ReportFinding): string {
   const provenance = finding.evidence?.provenance;
   const context = finding.context;
   return [
      provenance
         ? `<p>Collected through ${escapeHtml(provenance.source)} by ${escapeHtml(provenance.actor.name)} (${escapeHtml(provenance.actor.kind)}).</p><p>Assessment rationale: ${escapeHtml(provenance.rationale)}</p>`
         : '',
      context
         ? `<p>Scope: ${escapeHtml(context.scope)}. Environment: ${escapeHtml(context.environment)}.</p><p>States: ${escapeHtml(context.states.join(', '))}.</p>${context.journeys.length > 0 ? `<p>Journeys: ${escapeHtml(context.journeys.join(', '))}.</p>` : ''}`
         : '',
      context?.setup.length
         ? `<p>Setup recorded for the observed states:</p><ol>${context.setup.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`
         : '',
      context?.limitations.length
         ? `<p>Environment limitations: ${escapeHtml(context.limitations.join('; '))}</p>`
         : '',
      finding.reproduction.length > 0
         ? `<p>Steps recorded during the assessment:</p><ol>${finding.reproduction.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`
         : '',
      finding.artifactLinks.length > 0
         ? `<ul>${finding.artifactLinks.map((artifact) => `<li>${renderLink(artifact.href, artifact.kind)}</li>`).join('')}</ul>`
         : '',
   ].join('');
}

/** Keep scanner and behavioral findings in the same primary findings section. */
export function renderFindings(page: ReportModel['pages'][number]): string {
   if (page.findings.length === 0) {
      return '<p>No accessibility findings were recorded for this page.</p>';
   }
   return page.findings
      .map(
         (finding) => `<article class="finding finding--${escapeHtml(finding.impact)}">
         <h4>${escapeHtml(finding.title ?? finding.ruleId ?? 'Accessibility finding')}</h4>
         <p>Severity: ${escapeHtml(finding.impact === 'unknown' ? 'Not assessed' : finding.impact)}. Source: ${finding.source === 'behavioral' ? 'Behavioral assessment' : 'Automated scan'}.</p>
         <p>${escapeHtml(finding.description)}</p>
         <p><strong>WCAG:</strong> ${escapeHtml(finding.criterionIds.join(', ') || 'No mapped criterion')}</p>
         <p><strong>Elements:</strong> <code>${escapeHtml(finding.selectors.join(', ') || 'Page')}</code></p>
         ${finding.evidence ? renderFindingEvidence(finding) : ''}
         ${finding.guidance ? renderGuidance(finding.guidance) : '<p>Remediation was not recorded.</p>'}
         ${finding.helpUrl ? `<p>${renderLink(finding.helpUrl, 'Rule documentation')}</p>` : ''}
      </article>`,
      )
      .join('');
}
