import type { AxeRunResult } from '#contracts';
import type { DocumentLoad } from '#core';

export interface AxeActionOptions {
   json?: boolean;
   verbose?: boolean;
   html?: string;
   timeout?: string;
   wcag: string;
   criterion?: string;
   level?: string;
   rule?: string[];
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

async function runAxeForSelection(args: {
   load: DocumentLoad;
   selection: RunAxeSelection;
   wcagVersion: string;
   timeoutMs: number | undefined;
}): Promise<AxeRunResult> {
   const { runAxe } = await import('#core');
   const base = { wcagVersion: args.wcagVersion, timeoutMs: args.timeoutMs };

   if (args.selection.kind === 'criterion') {
      return runAxe(args.load, { ...base, criterion: args.selection.criterion });
   }
   if (args.selection.kind === 'level') {
      return runAxe(args.load, { ...base, level: args.selection.level });
   }
   if (args.selection.kind === 'all') {
      return runAxe(args.load, base);
   }
   return runAxe(args.load, { ...base, ruleIds: args.selection.ruleIds });
}

export async function handleAxeAction(
   target: string | undefined,
   options: AxeActionOptions,
): Promise<{
   target: { kind: string; value: string };
   result: AxeRunResult;
}> {
   const [{ resolvePageTarget, resolveRunAxeSelection }, { buildPageTargetInput }] =
      await Promise.all([import('../lib/execute.js'), import('../lib/target-input.js')]);
   const resolved = await resolvePageTarget(buildPageTargetInput(target, options, 'axe'));
   const selection = resolveRunAxeSelection(options);
   const result = await runAxeForSelection({
      load: resolved.load,
      selection,
      wcagVersion: options.wcag,
      timeoutMs: parseTimeoutMs(options.timeout),
   });

   return { target: resolved.reportTarget, result };
}
