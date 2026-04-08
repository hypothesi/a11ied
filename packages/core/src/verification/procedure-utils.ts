import type { VerificationSourceReference } from '@a11lied/contracts';

export function formatAxeSummary(violationCount: number, criterionId: string): string {
   if (violationCount > 0) {
      return `Axe found ${violationCount} violation(s) for ${criterionId}.`;
   }
   return `Axe did not find mapped violations for ${criterionId}.`;
}

export function formatPatternSummary(
   assertions: Array<{ status: string }>,
   procedureId: string,
): string {
   if (assertions.some((assertion) => assertion.status === 'failed')) {
      return `Pattern ${procedureId} produced a failing assertion.`;
   }
   return `Pattern ${procedureId} completed without failing assertions.`;
}

export function buildPatternSourceReferences(
   baseSourceReferences: VerificationSourceReference[],
   procedureId: string,
): VerificationSourceReference[] {
   return [
      ...baseSourceReferences,
      {
         kind: 'pattern',
         id: procedureId,
         label: procedureId,
      },
   ];
}
