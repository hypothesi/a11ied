import { cliExitCodes, type AxeVerdict } from '#contracts';
import type * as Core from '#core';
import type { AuditReport } from '#core';

export interface AuditActionOptions {
   json?: boolean;
   verbose?: boolean;
   html?: string;
   timeout?: string;
   waitFor?: string;
   click?: string;
   wcag: string;
   failOn?: string;
   baseline?: string;
   updateBaseline?: boolean;
   results?: string;
}

function parseTimeoutMs(timeout: string | undefined): number | undefined {
   if (timeout === undefined) {
      return undefined;
   }
   return Number.parseInt(timeout, 10);
}

async function resolveBaseline(
   core: typeof Core,
   report: AuditReport,
   options: AuditActionOptions,
): Promise<ReturnType<typeof core.buildBaselineFromViolations> | undefined> {
   if (!options.baseline) {
      return undefined;
   }

   const { readAxeBaseline, writeAxeBaseline } = await import('./axe-baseline.js');
   if (!options.updateBaseline) {
      return readAxeBaseline(options.baseline);
   }

   const baseline = core.buildBaselineFromViolations(report.axe.violations);
   await writeAxeBaseline(options.baseline, baseline);
   return baseline;
}

async function buildVerdict(
   core: typeof Core,
   report: AuditReport,
   options: AuditActionOptions,
): Promise<AxeVerdict> {
   const { axeFailOnImpactSchema } = await import('#contracts');
   const failOn = options.failOn
      ? axeFailOnImpactSchema.parse(options.failOn)
      : core.DEFAULT_FAIL_ON_IMPACT;
   const baseline = await resolveBaseline(core, report, options);

   return core.evaluateAxeVerdict({
      violations: report.axe.violations,
      failOn,
      ...(baseline ? { baseline } : {}),
   });
}

export interface AuditRun {
   target: { kind: string; value: string };
   report: AuditReport;
   verdict: AxeVerdict;
   nextCommands: string[];
   exitCode: number;
}

/**
 * Runs the audit and returns the typed report. `handleAuditAction` wraps this for the
 * envelope; `--format earl` needs the `AuditReport` itself.
 */
export async function runAudit(
   target: string | undefined,
   options: AuditActionOptions,
): Promise<AuditRun> {
   const [{ resolvePageTarget }, { buildPageTargetInput }, core] = await Promise.all([
      import('../lib/execute.js'),
      import('../lib/target-input.js'),
      import('#core'),
   ]);
   const resolved = await resolvePageTarget(
      buildPageTargetInput(target, options, 'audit'),
   );

   const report = await core.buildAuditReport({
      load: resolved.load,
      readHtml: resolved.readHtml,
      target: resolved.target,
      metadata: resolved.metadata,
      userHints: resolved.userHints,
      wcagVersion: options.wcag,
      timeoutMs: parseTimeoutMs(options.timeout),
      waitFor: options.waitFor,
      click: options.click,
      subject: core.stripFragment(resolved.reportTarget.resolvedUrl),
      evidenceFile: options.results,
   });
   const verdict = await buildVerdict(core, report, options);

   return {
      target: resolved.reportTarget,
      report,
      verdict,
      nextCommands: core.buildNextCommands({
         axe: report.axe,
         criteria: report.criteria,
         target: resolved.reportTarget.value,
         roles: report.tree.roles,
      }),
      exitCode: verdict.passed ? cliExitCodes.success : cliExitCodes.assertion,
   };
}

export async function handleAuditAction(
   target: string | undefined,
   options: AuditActionOptions,
): Promise<{
   target: { kind: string; value: string };
   result: Record<string, unknown>;
   exitCode: number;
}> {
   const run = await runAudit(target, options);

   return {
      target: run.target,
      result: { ...run.report, verdict: run.verdict, nextCommands: run.nextCommands },
      exitCode: run.exitCode,
   };
}
