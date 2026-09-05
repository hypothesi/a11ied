import type { AxeRunResult } from '#contracts';

export interface AxeActionOptions {
   json?: boolean;
   verbose?: boolean;
   url?: string;
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

async function runAxeForSelection(args: {
   url: string;
   selection: RunAxeSelection;
   wcagVersion: string;
}): Promise<AxeRunResult> {
   const { runAxe } = await import('#core');

   if (args.selection.kind === 'criterion') {
      return runAxe(args.url, {
         url: args.url,
         wcagVersion: args.wcagVersion,
         criterion: args.selection.criterion,
      });
   }

   if (args.selection.kind === 'level') {
      return runAxe(args.url, {
         url: args.url,
         wcagVersion: args.wcagVersion,
         level: args.selection.level,
      });
   }

   if (args.selection.kind === 'all') {
      return runAxe(args.url, {
         url: args.url,
         wcagVersion: args.wcagVersion,
      });
   }

   return runAxe(args.url, {
      url: args.url,
      wcagVersion: args.wcagVersion,
      ruleIds: args.selection.ruleIds,
   });
}

export async function handleAxeAction(options: AxeActionOptions): Promise<{
   target: { kind: string; value: string };
   result: AxeRunResult;
}> {
   const [{ resolveCliTarget, resolveRunAxeSelection }, { buildCliTargetInput }] =
      await Promise.all([import('../lib/execute.js'), import('../lib/target-input.js')]);
   const resolved = await resolveCliTarget(buildCliTargetInput(options));
   const selection = resolveRunAxeSelection(options);
   const result = await runAxeForSelection({
      url: resolved.resolvedUrl,
      selection,
      wcagVersion: options.wcag,
   });

   return { target: resolved.reportTarget, result };
}
