export function createStrategyId(wcagVersion: string, criterionId: string): string {
   return `wcag-${wcagVersion}:${criterionId}`;
}
