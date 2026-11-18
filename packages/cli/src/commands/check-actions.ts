import { cliExitCodes, wcagLevelSchema, type AxeVerdict } from '#contracts';
import type * as Core from '#core';
import type { PageCheck } from '#core';

export interface CheckActionOptions {
   json?: boolean;
   verbose?: boolean;
   html?: string;
   timeout?: string;
   waitFor?: string;
   click?: string;
   wcag: string;
   level?: string;
   failOn?: string;
   baseline?: string;
   updateBaseline?: boolean;
   storageState?: string;
}

function parseTimeoutMs(timeout: string | undefined): number | undefined {
   if (timeout === undefined) {
      return undefined;
   }
   return Number.parseInt(timeout, 10);
}

async function resolveBaseline(
   core: typeof Core,
   report: PageCheck,
   options: CheckActionOptions,
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
   report: PageCheck,
   options: CheckActionOptions,
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

export interface CheckRun {
   target: { kind: string; value: string };
   check: PageCheck;
   verdict: AxeVerdict;
   nextCommands: string[];
   exitCode: number;
}

/**
 * Runs the check and returns the typed result. `handleCheckAction` wraps this for the
 * envelope; `--format earl` needs the `PageCheck` itself.
 */
export async function runCheck(
   target: string | undefined,
   options: CheckActionOptions,
): Promise<CheckRun> {
   const [{ resolvePageTarget }, { buildPageTargetInput }, core] = await Promise.all([
      import('../lib/execute.js'),
      import('../lib/target-input.js'),
      import('#core'),
   ]);
   const resolved = await resolvePageTarget(
      buildPageTargetInput(target, options, 'check'),
   );

   const check = await core.runPageCheck({
      load: resolved.load,
      target: resolved.target,
      metadata: resolved.metadata,
      userHints: resolved.userHints,
      wcagVersion: options.wcag,
      ...(options.level ? { level: wcagLevelSchema.parse(options.level) } : {}),
      timeoutMs: parseTimeoutMs(options.timeout),
      waitFor: options.waitFor,
      click: options.click,
      storageStatePath: options.storageState,
   });
   const verdict = await buildVerdict(core, check, options);

   return {
      target: resolved.reportTarget,
      check,
      verdict,
      nextCommands: core.buildNextCommands({
         axe: check.axe,
         criteria: check.criteria,
         target: resolved.reportTarget.value,
         roles: check.tree.roles,
      }),
      exitCode: verdict.passed ? cliExitCodes.success : cliExitCodes.assertion,
   };
}

export async function handleCheckAction(
   target: string | undefined,
   options: CheckActionOptions,
): Promise<{
   target: { kind: string; value: string };
   result: Record<string, unknown>;
   exitCode: number;
}> {
   const run = await runCheck(target, options);

   return {
      target: run.target,
      result: { ...run.check, verdict: run.verdict, nextCommands: run.nextCommands },
      exitCode: run.exitCode,
   };
}
