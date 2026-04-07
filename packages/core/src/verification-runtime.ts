import {
  cliMessageSchema,
  interactionPatternIdSchema,
  platformSchema,
  wcagLevelSchema,
  verificationCriterionResultSchema,
  verificationEvidenceRecordSchema,
  verificationExecutionPlanSchema,
  verificationReportSchema,
  verificationUncoveredWorkItemSchema,
  type CliMessage,
  type CriterionLookupKey,
  type Platform,
  type WcagLevel,
  type VerificationCriterionResult,
  type VerificationEvidenceMode,
  type VerificationEvidenceRecord,
  type VerificationExecutionStep,
  type VerificationReport,
  type VerificationSourceReference,
  type VerificationUncoveredWorkItem
} from "@a11lied/contracts";

import { runAxe } from "./axe-runtime.js";
import { runInteractionPattern } from "./pattern-runtime.js";
import { CliUsageError, inspectCriterionUrl, listWcagCriteria, showWcagCoverage } from "./wcag-runtime.js";

type VerifyCriterionOptions = {
  criterion: CriterionLookupKey;
  url: string;
  target: string;
  wcagVersion: string;
};

type VerifyLevelOptions = {
  level: string;
  url: string;
  target: string;
  wcagVersion: string;
};

function parsePlatform(target: string): Platform {
  const parsed = platformSchema.safeParse(target);
  if (!parsed.success) {
    throw new CliUsageError("validation-error", `Target "${target}" is unsupported.`, {
      field: "target",
      value: target,
      supportedTargets: [...platformSchema.options]
    });
  }

  return parsed.data;
}

function parseLevel(level: string): WcagLevel {
  const parsed = wcagLevelSchema.safeParse(level);
  if (!parsed.success) {
    throw new CliUsageError("validation-error", `WCAG level "${level}" is unsupported.`, {
      field: "level",
      value: level,
      supportedLevels: [...wcagLevelSchema.options]
    });
  }

  return parsed.data;
}

function createStrategyId(wcagVersion: string, criterionId: string): string {
  return `wcag-${wcagVersion}:${criterionId}`;
}

function createBaseSourceReferences(criterionId: string, criterionTitle: string, wcagVersion: string): VerificationSourceReference[] {
  return [
    {
      kind: "criterion",
      id: criterionId,
      label: criterionTitle
    },
    {
      kind: "coverage-artifact",
      id: `coverage.${wcagVersion}#${criterionId}`,
      label: "Coverage artifact"
    },
    {
      kind: "strategy-artifact",
      id: `strategy.${wcagVersion}#${criterionId}`,
      label: "Verification strategy artifact"
    }
  ];
}

function createApplicabilityEvidence(args: {
  criterionId: string;
  criterionTitle: string;
  evidenceMode: VerificationEvidenceMode;
  assessment: VerificationCriterionResult["applicability"];
  sourceReferences: VerificationSourceReference[];
}): VerificationEvidenceRecord {
  return verificationEvidenceRecordSchema.parse({
    id: `applicability:${args.criterionId}`,
    kind: "applicability",
    mode: args.evidenceMode,
    collectedAt: new Date().toISOString(),
    summary: args.assessment.reasons[0] ?? "Applicability signals were collected for this criterion.",
    sourceReferences: args.sourceReferences,
    applicability: args.assessment,
    notes: args.assessment.reasons.slice(1)
  });
}

function createManualEvidence(args: {
  criterionId: string;
  summary: string;
  sourceReferences: VerificationSourceReference[];
  procedureId: string;
  notes: string[];
}): VerificationEvidenceRecord {
  return verificationEvidenceRecordSchema.parse({
    id: `manual:${args.criterionId}:${args.procedureId}`,
    kind: "manual-note",
    mode: "manual",
    procedureId: args.procedureId,
    collectedAt: new Date().toISOString(),
    summary: args.summary,
    sourceReferences: args.sourceReferences,
    notes: args.notes
  });
}

function createUncoveredWork(args: {
  kind: VerificationUncoveredWorkItem["kind"];
  message: string;
  procedureId?: string;
  sourceReferences: VerificationSourceReference[];
}): VerificationUncoveredWorkItem {
  return verificationUncoveredWorkItemSchema.parse({
    kind: args.kind,
    message: args.message,
    ...(args.procedureId ? { procedureId: args.procedureId } : {}),
    sourceReferences: args.sourceReferences
  });
}

function createSummary(criteria: VerificationCriterionResult[]): VerificationReport["summary"] {
  const summary: VerificationReport["summary"] = {
    totalCriteria: criteria.length,
    verdicts: {
      pass: 0,
      fail: 0,
      "needs-manual-review": 0,
      "not-applicable": 0,
      "not-covered": 0,
      error: 0
    },
    evidenceModes: {
      automated: 0,
      hybrid: 0,
      manual: 0,
      unknown: 0
    },
    uncoveredCount: 0,
    manualOnlyCount: 0,
    failedCount: 0
  };

  for (const criterion of criteria) {
    summary.verdicts[criterion.verdict] += 1;
    summary.evidenceModes[criterion.evidenceMode] += 1;
    summary.uncoveredCount += criterion.uncoveredWork.length;
    summary.manualOnlyCount += criterion.uncoveredWork.filter((entry) => entry.kind === "manual-only").length;
    if (criterion.verdict === "fail" || criterion.verdict === "needs-manual-review" || criterion.verdict === "not-covered" || criterion.verdict === "error") {
      summary.failedCount += 1;
    }
  }

  return summary;
}

function isApplicable(state: VerificationCriterionResult["applicability"]["state"]): boolean {
  return state === "applicable" || state === "likely-applicable" || state === "unknown";
}

function deriveVerdict(args: {
  criterion: VerificationCriterionResult["criterion"];
  evidence: VerificationEvidenceRecord[];
  uncoveredWork: VerificationUncoveredWorkItem[];
  strategy: VerificationCriterionResult["strategy"];
  errors: CliMessage[];
}): VerificationCriterionResult["verdict"] {
  const hasAxeFailure = args.evidence.some((entry) => (entry.axeResult?.violations.length ?? 0) > 0);
  const hasPatternFailure = args.evidence.some((entry) =>
    entry.patternResult?.assertions.some((assertion) => assertion.status === "failed")
  );
  const hasManualOnly = args.uncoveredWork.some((entry) => entry.kind === "manual-only");
  const hasNotCovered = args.uncoveredWork.some((entry) =>
    ["not-covered", "missing-pattern", "missing-rule", "unsupported-target"].includes(entry.kind)
  );

  if (args.errors.length > 0) {
    return "error";
  }

  if (hasAxeFailure || hasPatternFailure) {
    return "fail";
  }

  if (args.strategy.preferredEvidenceMode === "manual" || hasManualOnly) {
    return "needs-manual-review";
  }

  if (hasNotCovered) {
    return "not-covered";
  }

  return "pass";
}

function createVerificationMessage(criterionId: string, verdict: VerificationCriterionResult["verdict"]): CliMessage | null {
  if (verdict === "pass" || verdict === "not-applicable") {
    return null;
  }

  return cliMessageSchema.parse({
    code: "verification-verdict",
    message: `Criterion ${criterionId} reported verdict "${verdict}".`,
    details: {
      criterionId,
      verdict
    }
  });
}

function createLevelVerificationMessage(level: WcagLevel, summary: VerificationReport["summary"]): CliMessage | null {
  if (summary.failedCount === 0) {
    return null;
  }

  return cliMessageSchema.parse({
    code: "verification-level-summary",
    message: `Level ${level} reported ${summary.failedCount} non-passing criterion verdict(s).`,
    details: {
      level,
      failedCount: summary.failedCount,
      manualOnlyCount: summary.manualOnlyCount,
      uncoveredCount: summary.uncoveredCount
    }
  });
}

function expandCriteriaForConformanceLevel(level: WcagLevel, version: string): string[] {
  const levelOrder: WcagLevel[] = ["A", "AA", "AAA"];
  const selectedIndex = levelOrder.indexOf(level);
  const expanded = levelOrder
    .slice(0, selectedIndex + 1)
    .flatMap((entryLevel) => listWcagCriteria(entryLevel, version).criteria.map((criterion) => criterion.id));

  return [...new Set(expanded)];
}

async function verifyCriterionResult(args: {
  criterion: CriterionLookupKey;
  url: string;
  parsedTarget: Platform;
  wcagVersion: string;
}): Promise<{
  criterion: VerificationCriterionResult;
  warning: CliMessage | null;
  target: VerificationReport["target"];
}> {
  const coverageLookup = showWcagCoverage(args.criterion, args.wcagVersion);
  const applicabilityLookup = await inspectCriterionUrl(coverageLookup.criterion.id, args.url, args.wcagVersion);
  const criterion = applicabilityLookup.criterion;
  const baseSourceReferences = createBaseSourceReferences(criterion.id, criterion.title, criterion.wcagVersion);
  const evidenceMode = coverageLookup.strategy.preferredEvidenceMode;
  const evidence: VerificationEvidenceRecord[] = [
    createApplicabilityEvidence({
      criterionId: criterion.id,
      criterionTitle: criterion.title,
      evidenceMode,
      assessment: applicabilityLookup.assessment,
      sourceReferences: baseSourceReferences
    })
  ];
  const uncoveredWork: VerificationUncoveredWorkItem[] = [];
  const errors: CliMessage[] = [];
  const executionSteps: VerificationExecutionStep[] = [
    {
      procedureId: `applicability:${criterion.id}`,
      kind: "applicability",
      mode: evidenceMode,
      status: "completed",
      sourceReferences: baseSourceReferences
    }
  ];
  const notes = [...coverageLookup.strategy.notes];
  const target = {
    kind: "url" as const,
    value: args.url,
    platform: args.parsedTarget,
    resolvedUrl: new URL(args.url).toString()
  };

  if (!isApplicable(applicabilityLookup.assessment.state)) {
    const result = verificationCriterionResultSchema.parse({
      criterionId: criterion.id,
      criterion,
      applicability: applicabilityLookup.assessment,
      coverage: coverageLookup.coverage,
      strategy: coverageLookup.strategy,
      executionPlan: verificationExecutionPlanSchema.parse({
        strategyId: createStrategyId(criterion.wcagVersion, criterion.id),
        preferredEvidenceMode: evidenceMode,
        selectedProcedureIds: [],
        steps: executionSteps
      }),
      verdict: "not-applicable",
      evidenceMode,
      procedureIds: [],
      evidence,
      sourceReferences: baseSourceReferences,
      uncoveredWork,
      notes: [...notes, "The criterion did not look applicable for this target."],
      errors
    });

    return {
      criterion: result,
      warning: createVerificationMessage(criterion.id, result.verdict),
      target
    };
  }

  for (const procedureId of coverageLookup.strategy.procedureIds) {
    if (procedureId === "axe_scan") {
      try {
        const axeResult = await runAxe(args.url, {
          url: args.url,
          wcagVersion: criterion.wcagVersion,
          criterion: criterion.id
        });
        const ruleReferences = coverageLookup.coverage.axeRuleIds.map((ruleId) => ({
          kind: "axe-rule" as const,
          id: ruleId,
          label: ruleId
        }));

        executionSteps.push({
          procedureId,
          kind: "axe",
          mode: "automated",
          status: "completed",
          sourceReferences: [...baseSourceReferences, ...ruleReferences]
        });
        evidence.push(
          verificationEvidenceRecordSchema.parse({
            id: `axe:${criterion.id}`,
            kind: "axe",
            mode: "automated",
            procedureId,
            collectedAt: new Date().toISOString(),
            summary:
              axeResult.violations.length > 0
                ? `Axe found ${axeResult.violations.length} violation(s) for ${criterion.id}.`
                : `Axe did not find mapped violations for ${criterion.id}.`,
            sourceReferences: [...baseSourceReferences, ...ruleReferences],
            axeResult,
            notes: []
          })
        );
      } catch (error) {
        executionSteps.push({
          procedureId,
          kind: "axe",
          mode: "automated",
          status: "error",
          reason: error instanceof Error ? error.message : String(error),
          sourceReferences: baseSourceReferences
        });
        errors.push(
          cliMessageSchema.parse({
            code: "verification-procedure-error",
            message: `Procedure "${procedureId}" failed for criterion ${criterion.id}.`,
            details: {
              criterionId: criterion.id,
              procedureId,
              cause: error instanceof Error ? error.message : String(error)
            }
          })
        );
      }
      continue;
    }

    if (procedureId === "manual_review") {
      executionSteps.push({
        procedureId,
        kind: "manual",
        mode: "manual",
        status: "skipped",
        reason: "Manual review remains required for this criterion.",
        sourceReferences: baseSourceReferences
      });
      uncoveredWork.push(
        createUncoveredWork({
          kind: "manual-only",
          message: "A human review is still required before this criterion can be signed off.",
          procedureId,
          sourceReferences: baseSourceReferences
        })
      );
      evidence.push(
        createManualEvidence({
          criterionId: criterion.id,
          summary: "Manual review is still required for this criterion.",
          sourceReferences: baseSourceReferences,
          procedureId,
          notes: coverageLookup.strategy.notes
        })
      );
      continue;
    }

    const parsedPattern = interactionPatternIdSchema.safeParse(procedureId);
    if (parsedPattern.success) {
      try {
        const patternResult = await runInteractionPattern({
          patternId: parsedPattern.data,
          url: args.url,
          target: args.parsedTarget
        });
        executionSteps.push({
          procedureId,
          kind: "pattern",
          mode: evidenceMode,
          status: "completed",
          sourceReferences: [
            ...baseSourceReferences,
            {
              kind: "pattern",
              id: procedureId,
              label: procedureId
            }
          ]
        });
        evidence.push(
          verificationEvidenceRecordSchema.parse({
            id: `pattern:${criterion.id}:${procedureId}`,
            kind: "pattern",
            mode: evidenceMode,
            procedureId,
            collectedAt: new Date().toISOString(),
            summary:
              patternResult.assertions.some((assertion) => assertion.status === "failed")
                ? `Pattern ${procedureId} produced a failing assertion.`
                : `Pattern ${procedureId} completed without failing assertions.`,
            sourceReferences: [
              ...baseSourceReferences,
              {
                kind: "pattern",
                id: procedureId,
                label: procedureId
              }
            ],
            patternResult,
            notes: []
          })
        );
      } catch (error) {
        executionSteps.push({
          procedureId,
          kind: "pattern",
          mode: evidenceMode,
          status: "error",
          reason: error instanceof Error ? error.message : String(error),
          sourceReferences: [
            ...baseSourceReferences,
            {
              kind: "pattern",
              id: procedureId,
              label: procedureId
            }
          ]
        });
        errors.push(
          cliMessageSchema.parse({
            code: "verification-procedure-error",
            message: `Procedure "${procedureId}" failed for criterion ${criterion.id}.`,
            details: {
              criterionId: criterion.id,
              procedureId,
              cause: error instanceof Error ? error.message : String(error)
            }
          })
        );
      }
      continue;
    }

    executionSteps.push({
      procedureId,
      kind: "manual",
      mode: "unknown",
      status: "skipped",
      reason: `Procedure "${procedureId}" is not implemented yet.`,
      sourceReferences: baseSourceReferences
    });
    uncoveredWork.push(
      createUncoveredWork({
        kind: "missing-pattern",
        message: `Procedure "${procedureId}" is not implemented yet.`,
        procedureId,
        sourceReferences: baseSourceReferences
      })
    );
  }

  if (coverageLookup.coverage.coverageState === "unknown" && coverageLookup.strategy.procedureIds.length === 0) {
    uncoveredWork.push(
      createUncoveredWork({
        kind: "not-covered",
        message: "No verification path is mapped for this criterion yet.",
        sourceReferences: baseSourceReferences
      })
    );
  }

  if (coverageLookup.strategy.requiresRealTarget && args.parsedTarget === "virtual") {
    uncoveredWork.push(
      createUncoveredWork({
        kind: "requires-real-target",
        message: "This criterion still needs a real assistive technology target for full confidence.",
        sourceReferences: baseSourceReferences
      })
    );
    notes.push("The generated strategy marks this criterion as better suited to a real assistive technology target.");
  }

  const verdict = deriveVerdict({
    criterion,
    evidence,
    uncoveredWork,
    strategy: coverageLookup.strategy,
    errors
  });
  const result = verificationCriterionResultSchema.parse({
    criterionId: criterion.id,
    criterion,
    applicability: applicabilityLookup.assessment,
    coverage: coverageLookup.coverage,
    strategy: coverageLookup.strategy,
    executionPlan: verificationExecutionPlanSchema.parse({
      strategyId: createStrategyId(criterion.wcagVersion, criterion.id),
      preferredEvidenceMode: evidenceMode,
      selectedProcedureIds: coverageLookup.strategy.procedureIds,
      steps: executionSteps
    }),
    verdict,
    evidenceMode,
    procedureIds: coverageLookup.strategy.procedureIds,
    evidence,
    sourceReferences: baseSourceReferences,
    uncoveredWork,
    notes,
    errors
  });
  const verificationMessage = createVerificationMessage(criterion.id, verdict);

  return {
    criterion: result,
    warning: verificationMessage,
    target
  };
}

export async function verifyCriterion(options: VerifyCriterionOptions): Promise<VerificationReport> {
  const parsedTarget = parsePlatform(options.target);
  const verification = await verifyCriterionResult({
    criterion: options.criterion,
    url: options.url,
    parsedTarget,
    wcagVersion: options.wcagVersion
  });

  return verificationReportSchema.parse({
    target: verification.target,
    wcagVersion: verification.criterion.criterion.wcagVersion,
    requestedScope: {
      kind: "criterion",
      criterion: options.criterion
    },
    summary: createSummary([verification.criterion]),
    criteria: [verification.criterion],
    warnings: verification.warning ? [verification.warning] : [],
    errors: []
  });
}

export async function verifyLevel(options: VerifyLevelOptions): Promise<VerificationReport> {
  const parsedTarget = parsePlatform(options.target);
  const parsedLevel = parseLevel(options.level);
  const criterionIds = expandCriteriaForConformanceLevel(parsedLevel, options.wcagVersion);
  const criteria: VerificationCriterionResult[] = [];
  const warnings: CliMessage[] = [];
  let target: VerificationReport["target"] | null = null;

  for (const criterionId of criterionIds) {
    const verification = await verifyCriterionResult({
      criterion: criterionId,
      url: options.url,
      parsedTarget,
      wcagVersion: options.wcagVersion
    });

    target = verification.target;
    criteria.push(verification.criterion);
    if (verification.warning) {
      warnings.push(verification.warning);
    }
  }

  const summary = createSummary(criteria);
  const levelWarning = createLevelVerificationMessage(parsedLevel, summary);
  if (levelWarning) {
    warnings.unshift(levelWarning);
  }

  return verificationReportSchema.parse({
    target:
      target ??
      ({
        kind: "url",
        value: options.url,
        platform: parsedTarget,
        resolvedUrl: new URL(options.url).toString()
      } satisfies VerificationReport["target"]),
    wcagVersion: criteria[0]?.criterion.wcagVersion ?? (options.wcagVersion as "2.1" | "2.2"),
    requestedScope: {
      kind: "level",
      level: parsedLevel
    },
    summary,
    criteria,
    warnings,
    errors: []
  });
}
