import type {
   BrowserAutomationCandidate,
   DoctorAction,
   DoctorCheck,
   DoctorReport,
   DoctorTarget,
} from '@a11ied/contracts';

/** Optional text decorators so a terminal can color the plain doctor report. */
export interface DoctorTextStyle {
   pass: (text: string) => string;
   fail: (text: string) => string;
   warn: (text: string) => string;
   skip: (text: string) => string;
   heading: (text: string) => string;
   dim: (text: string) => string;
   command: (text: string) => string;
}

const INDENT = '  ';
const CHECK_DEPTH = 2;
const MARKERS = { pass: '✓', fail: '✗', warn: '!', skip: '-' } as const;

function identity(text: string): string {
   return text;
}

const plainStyle: DoctorTextStyle = {
   pass: identity,
   fail: identity,
   warn: identity,
   skip: identity,
   heading: identity,
   dim: identity,
   command: identity,
};

function marker(status: keyof typeof MARKERS, style: DoctorTextStyle): string {
   return style[status](MARKERS[status]);
}

function indent(lines: string[], depth = 1): string[] {
   return lines.map((line) => {
      if (!line) {
         return line;
      }
      return `${INDENT.repeat(depth)}${line}`;
   });
}

function describeHost(report: DoctorReport): string {
   return `${report.host.osName} ${report.host.release} (${report.host.arch})`;
}

function renderHeadline(report: DoctorReport, style: DoctorTextStyle): string {
   if (report.ready) {
      return style.pass(
         `${MARKERS.pass} Ready for a1 commands on ${describeHost(report)}`,
      );
   }

   const required = report.actions.filter((action) => action.required).length;
   const steps = required === 1 ? '1 setup step' : `${required} setup steps`;
   return style.fail(
      `${MARKERS.fail} ${steps} needed before a1 is fully usable on ${describeHost(report)}`,
   );
}

function renderAction(
   action: DoctorAction,
   index: number,
   style: DoctorTextStyle,
): string[] {
   const optional = action.required ? '' : style.dim(' (optional)');
   return [
      `${index + 1}. ${action.label}${optional}`,
      `   ${style.command(action.command)}`,
   ];
}

function renderActions(report: DoctorReport, style: DoctorTextStyle): string[] {
   if (report.actions.length === 0) {
      return [];
   }

   return [
      '',
      style.heading('Action items'),
      ...indent(
         report.actions.flatMap((action, index) => renderAction(action, index, style)),
      ),
   ];
}

function renderCheck(check: DoctorCheck, style: DoctorTextStyle): string[] {
   const lines = [`${marker(check.status, style)} ${check.label}`];
   if (check.detail) {
      lines.push(`  ${style.dim(check.detail)}`);
   }
   return lines;
}

function renderTarget(
   target: DoctorTarget,
   width: number,
   style: DoctorTextStyle,
): string[] {
   const name = target.id.padEnd(width);

   if (target.status === 'unsupported') {
      return [`${marker('skip', style)} ${name}  ${style.dim(target.summary)}`];
   }

   const status =
      target.status === 'ready' ? marker('pass', style) : marker('fail', style);
   const statusLabel =
      target.status === 'ready' ? style.pass('ready') : style.warn('requires setup');
   return [
      `${status} ${name}  ${statusLabel}  ${style.dim(target.summary)}`,
      ...indent(
         target.checks.flatMap((check) => renderCheck(check, style)),
         CHECK_DEPTH,
      ),
   ];
}

function renderTargets(report: DoctorReport, style: DoctorTextStyle): string[] {
   const width = Math.max(...report.targets.map((target) => target.id.length));
   return [
      '',
      style.heading('Targets'),
      ...indent(report.targets.flatMap((target) => renderTarget(target, width, style))),
   ];
}

function describeLaunch(candidate: BrowserAutomationCandidate): string {
   if (candidate.launchMode === 'playwright-bundled') {
      return "Playwright's bundled Chromium";
   }
   if (candidate.launchMode === 'channel') {
      return `system install, opened through the "${candidate.id}" browser channel`;
   }
   return 'system install, opened by executable path';
}

function renderPreferredBrowser(
   browserAutomation: DoctorReport['browserAutomation'],
   style: DoctorTextStyle,
): string[] {
   const { preferredCandidate, candidates } = browserAutomation;
   if (!preferredCandidate) {
      return [
         `${marker('fail', style)} No Chromium-family browser found  ${style.warn('requires setup')}  ${style.dim('a1 axe needs one.')}`,
      ];
   }

   const details = [`Launch  ${describeLaunch(preferredCandidate)}`];
   if (preferredCandidate.location) {
      details.unshift(`Path    ${preferredCandidate.location}`);
   }
   const others = candidates
      .filter((candidate) => candidate !== preferredCandidate)
      .map((candidate) => candidate.label);
   if (others.length > 0) {
      details.push(`Others  ${others.join(', ')}`);
   }

   return [
      `${marker('pass', style)} ${preferredCandidate.label}  ${style.pass('ready')}  ${style.dim('Used for a1 axe scans.')}`,
      ...indent(
         details.map((detail) => style.dim(detail)),
         CHECK_DEPTH,
      ),
   ];
}

function renderBrowserAutomation(report: DoctorReport, style: DoctorTextStyle): string[] {
   const { policyName, installCommand } = report.browserAutomation;

   return [
      '',
      style.heading('Browser automation'),
      ...indent([
         ...renderPreferredBrowser(report.browserAutomation, style),
         '',
         `Policy    ${policyName}${style.dim(": an installed Chrome, Edge, Brave, or Chromium is used before Playwright's Chromium")}`,
         `Fallback  ${style.command(installCommand)}`,
      ]),
   ];
}

function renderEnvironment(report: DoctorReport, style: DoctorTextStyle): string[] {
   return [
      '',
      style.heading('Environment'),
      ...indent([
         `a11ied  ${report.packageVersion}`,
         `Node    ${report.nodeVersion}`,
         `npm     ${report.npmVersion}`,
         `Host    ${describeHost(report)}${style.dim(` [${report.host.platform}]`)}`,
      ]),
   ];
}

/** Renders a plain-text doctor report for terminal output. */
export function renderDoctorText(
   report: DoctorReport,
   style: DoctorTextStyle = plainStyle,
): string {
   return [
      renderHeadline(report, style),
      ...renderActions(report, style),
      ...renderTargets(report, style),
      ...renderBrowserAutomation(report, style),
      ...renderEnvironment(report, style),
   ].join('\n');
}
