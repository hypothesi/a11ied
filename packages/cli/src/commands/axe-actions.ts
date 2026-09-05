import {
   axeFailOnImpactSchema,
   cliExitCodes,
   type AxeBaseline,
   type AxeFailOnImpact,
   type AxeRunResult,
   type AxeVerdict,
} from '#contracts';
import type * as Core from '#core';
import type { DocumentLoad } from '#core';
import {
   parseCookies,
   parseHeaders,
   parseViewport,
   type AxeScanCliOptions,
} from './axe-scan-options.js';

export interface AxeActionOptions extends AxeScanCliOptions {
   json?: boolean;
   verbose?: boolean;
   html?: string;
   timeout?: string;
   wcag: string;
   criterion?: string;
   level?: string;
   rule?: string[];
   failOn?: string;
   baseline?: string;
   updateBaseline?: boolean;
}

type RunAxeSelection =
   | { kind: 'all' }
   | { kind: 'criterion'; criterion: string }
   | { kind: 'level'; level: string }
   | { kind: 'rule'; ruleIds: string[] };

function parseTimeoutMs(timeout: string | undefined): number | undefined {
   if (timeout === undefined) {
      return undefined;
   }
   return Number.parseInt(timeout, 10);
}

function buildScanOptions(
   core: typeof Core,
   options: AxeActionOptions,
   load: DocumentLoad,
): {
   timeoutMs: number | undefined;
   selector: string | undefined;
   exclude: string | undefined;
   waitFor: string | undefined;
   viewport: { width: number; height: number } | undefined;
   extraHeaders: Record<string, string> | undefined;
   cookies: Array<{ name: string; value: string; url: string }> | undefined;
} {
   const url = load.kind === 'goto' ? load.url : undefined;
   return {
      timeoutMs: parseTimeoutMs(options.timeout),
      selector: options.selector,
      exclude: options.exclude,
      waitFor: options.waitFor,
      viewport: parseViewport(core.CliUsageError, options.viewport),
      extraHeaders: parseHeaders(core.CliUsageError, options.header),
      cookies: parseCookies(core.CliUsageError, options.cookie, url),
   };
}

async function runAxeForSelection(args: {
   core: typeof Core;
   load: DocumentLoad;
   selection: RunAxeSelection;
   wcagVersion: string;
   scanOptions: ReturnType<typeof buildScanOptions>;
}): Promise<AxeRunResult> {
   const base = { wcagVersion: args.wcagVersion, ...args.scanOptions };

   if (args.selection.kind === 'criterion') {
      return args.core.runAxe(args.load, {
         ...base,
         criterion: args.selection.criterion,
      });
   }
   if (args.selection.kind === 'level') {
      return args.core.runAxe(args.load, { ...base, level: args.selection.level });
   }
   if (args.selection.kind === 'all') {
      return args.core.runAxe(args.load, base);
   }
   return args.core.runAxe(args.load, { ...base, ruleIds: args.selection.ruleIds });
}

function parseFailOn(core: typeof Core, failOn: string | undefined): AxeFailOnImpact {
   if (failOn === undefined) {
      return 'minor';
   }
   const parsed = axeFailOnImpactSchema.safeParse(failOn);
   if (parsed.success) {
      return parsed.data;
   }
   throw new core.CliUsageError(
      'validation-error',
      `--fail-on "${failOn}" is unsupported.`,
      { field: 'failOn', value: failOn, supportedValues: axeFailOnImpactSchema.options },
   );
}

async function resolveBaseline(
   core: typeof Core,
   result: AxeRunResult,
   options: AxeActionOptions,
): Promise<AxeBaseline | undefined> {
   if (!options.baseline) {
      if (options.updateBaseline) {
         throw new core.CliUsageError(
            'missing-baseline-path',
            '--update-baseline requires --baseline <file>.',
         );
      }
      return undefined;
   }

   const { readAxeBaseline, writeAxeBaseline } = await import('./axe-baseline.js');
   if (options.updateBaseline) {
      const baseline = core.buildBaselineFromViolations(result.violations);
      await writeAxeBaseline(options.baseline, baseline);
      return baseline;
   }

   return readAxeBaseline(options.baseline);
}

async function buildVerdict(
   core: typeof Core,
   result: AxeRunResult,
   options: AxeActionOptions,
): Promise<AxeVerdict> {
   const baseline = await resolveBaseline(core, result, options);
   const input: Parameters<typeof core.evaluateAxeVerdict>[0] = {
      violations: result.violations,
      failOn: parseFailOn(core, options.failOn),
   };
   if (baseline) {
      input.baseline = baseline;
   }
   return core.evaluateAxeVerdict(input);
}

export async function handleAxeAction(
   target: string | undefined,
   options: AxeActionOptions,
): Promise<{
   target: { kind: string; value: string };
   result: AxeRunResult & { verdict: AxeVerdict };
   exitCode: number;
}> {
   const [{ resolvePageTarget, resolveRunAxeSelection }, { buildPageTargetInput }, core] =
      await Promise.all([
         import('../lib/execute.js'),
         import('../lib/target-input.js'),
         import('#core'),
      ]);
   const resolved = await resolvePageTarget(buildPageTargetInput(target, options, 'axe'));
   const selection = resolveRunAxeSelection(options);
   const result = await runAxeForSelection({
      core,
      load: resolved.load,
      selection,
      wcagVersion: options.wcag,
      scanOptions: buildScanOptions(core, options, resolved.load),
   });
   const verdict = await buildVerdict(core, result, options);

   return {
      target: resolved.reportTarget,
      result: { ...result, verdict },
      exitCode: verdict.passed ? cliExitCodes.success : cliExitCodes.assertion,
   };
}
