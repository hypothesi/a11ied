import {
   hasAssessmentCapability,
   type AssessmentCapability,
   type AssessmentEvidenceKind,
   type AssessmentProcedure,
} from '@a11ied/contracts';

export function getRequiredCapabilities(
   procedure: AssessmentProcedure,
   isInapplicable = false,
): readonly AssessmentCapability[] {
   return isInapplicable && procedure.inapplicability
      ? procedure.inapplicability.requiredCapabilities
      : procedure.requiredCapabilities;
}

export function getRequiredEvidence(
   procedure: AssessmentProcedure,
   isInapplicable = false,
): readonly AssessmentEvidenceKind[] {
   return isInapplicable && procedure.inapplicability
      ? procedure.inapplicability.requiredEvidence
      : procedure.requiredEvidence;
}

export function getMissingCapabilities(input: {
   procedure: AssessmentProcedure;
   capabilities: readonly AssessmentCapability[];
   isInapplicable?: boolean;
}): AssessmentCapability[] {
   return getRequiredCapabilities(input.procedure, input.isInapplicable).filter(
      (capability) => !hasAssessmentCapability(input.capabilities, capability),
   );
}
