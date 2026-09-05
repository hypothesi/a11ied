import { cliExitCodes, type AxeRunResult, type AxeVerdict } from '#contracts';
import type { AxeActionOptions } from './axe-actions.js';

export interface AxeTargetReport {
   target: { kind: string; value: string };
   result: AxeRunResult & { verdict: AxeVerdict };
}

/** Scans each target in turn, one report per target, and exits 4 if any one fails. */
export async function handleMultiAxeAction(
   targets: string[],
   options: AxeActionOptions,
): Promise<{
   target: { kind: string; value: string };
   result: Record<string, unknown>;
   exitCode: number;
}> {
   const { handleAxeAction } = await import('./axe-actions.js');
   const reports: AxeTargetReport[] = await Promise.all(
      targets.map((target) => handleAxeAction(target, options)),
   );

   const anyFailed = reports.some((report) => !report.result.verdict.passed);
   return {
      target: { kind: 'multi', value: targets.join(', ') },
      result: { targets: reports },
      exitCode: anyFailed ? cliExitCodes.assertion : cliExitCodes.success,
   };
}
