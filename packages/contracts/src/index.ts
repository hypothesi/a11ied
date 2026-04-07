import { z } from "zod";

export const platformSchema = z.enum(["voiceover", "nvda", "virtual"]);
export type Platform = z.infer<typeof platformSchema>;

export const targetSchema = z.object({
  id: z.string(),
  platform: platformSchema,
  os: z.string(),
  status: z.enum(["ready", "requires-setup", "unsupported"]),
  notes: z.array(z.string())
});
export type Target = z.infer<typeof targetSchema>;

export const doctorReportSchema = z.object({
  packageVersion: z.string(),
  nodeVersion: z.string(),
  npmVersion: z.string(),
  targets: z.array(targetSchema)
});
export type DoctorReport = z.infer<typeof doctorReportSchema>;

export const cliCommandSchema = z.object({
  name: z.string(),
  summary: z.string(),
  maturity: z.enum(["planned", "scaffolded", "ready"])
});
export type CliCommand = z.infer<typeof cliCommandSchema>;

export const cliCommandFamilySchema = z.enum(["wcag", "inspect", "drive", "run", "verify", "doctor", "catalog", "mcp"]);
export type CliCommandFamily = z.infer<typeof cliCommandFamilySchema>;

export const wcagVersionSchema = z.enum(["2.1", "2.2"]);
export type WcagVersion = z.infer<typeof wcagVersionSchema>;

export const wcagLevelSchema = z.enum(["A", "AA", "AAA"]);
export type WcagLevel = z.infer<typeof wcagLevelSchema>;

export const cliCommandDescriptorSchema = z.object({
  family: cliCommandFamilySchema,
  subcommand: z.string(),
  version: z.string(),
  wcagVersion: wcagVersionSchema.optional()
});
export type CliCommandDescriptor = z.infer<typeof cliCommandDescriptorSchema>;

export const cliMessageSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional()
});
export type CliMessage = z.infer<typeof cliMessageSchema>;

export const cliEnvelopeMetaSchema = z.object({
  schemaVersion: z.literal("1"),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative()
});
export type CliEnvelopeMeta = z.infer<typeof cliEnvelopeMetaSchema>;

export const cliOutputEnvelopeSchema = z.object({
  ok: z.boolean(),
  command: cliCommandDescriptorSchema,
  target: z.record(z.string(), z.unknown()).nullable(),
  result: z.record(z.string(), z.unknown()).nullable(),
  warnings: z.array(cliMessageSchema),
  errors: z.array(cliMessageSchema),
  meta: cliEnvelopeMetaSchema
});
export type CliOutputEnvelope = z.infer<typeof cliOutputEnvelopeSchema>;

export const cliExitCodes = {
  success: 0,
  usage: 2,
  environment: 3,
  assertion: 4,
  internal: 5
} as const;

export const cliExitCodeSchema = z.union([
  z.literal(cliExitCodes.success),
  z.literal(cliExitCodes.usage),
  z.literal(cliExitCodes.environment),
  z.literal(cliExitCodes.assertion),
  z.literal(cliExitCodes.internal)
]);
export type CliExitCode = z.infer<typeof cliExitCodeSchema>;

export const driverCapabilitySchema = z.enum([
  "start",
  "stop",
  "status",
  "attach-document",
  "next",
  "previous",
  "key",
  "type",
  "interact",
  "stop-interacting",
  "click-current-item",
  "read",
  "logs",
  "clear-logs",
  "checkpoint"
]);
export type DriverCapability = z.infer<typeof driverCapabilitySchema>;

export const driverReadinessStatusSchema = z.enum(["ready", "requires-setup", "unsupported"]);
export type DriverReadinessStatus = z.infer<typeof driverReadinessStatusSchema>;

export const driverReadinessSchema = z.object({
  target: platformSchema,
  status: driverReadinessStatusSchema,
  summary: z.string(),
  details: z.array(z.string()),
  setupCommand: z.string().optional(),
  debug: z.record(z.string(), z.unknown()).optional()
});
export type DriverReadiness = z.infer<typeof driverReadinessSchema>;

export const accessibilityDriverSessionSchema = z.object({
  sessionId: z.string().min(1),
  target: platformSchema,
  startedAt: z.string().datetime(),
  capabilities: z.array(driverCapabilitySchema),
  logCursor: z.number().int().nonnegative(),
  brokerPid: z.number().int().positive(),
  socketPath: z.string().min(1),
  metadataFile: z.string().min(1)
});
export type AccessibilityDriverSession = z.infer<typeof accessibilityDriverSessionSchema>;

export const driverCheckpointSchema = z.object({
  label: z.string(),
  createdAt: z.string().datetime()
});
export type DriverCheckpoint = z.infer<typeof driverCheckpointSchema>;

export const driverStateSnapshotSchema = z.object({
  lastSpokenPhrase: z.string().nullable(),
  currentItemText: z.string().nullable(),
  spokenPhraseLog: z.array(z.string()),
  itemTextLog: z.array(z.string()),
  logCursor: z.number().int().nonnegative(),
  checkpoints: z.array(driverCheckpointSchema)
});
export type DriverStateSnapshot = z.infer<typeof driverStateSnapshotSchema>;

export const driverActionNameSchema = z.enum([
  "start",
  "status",
  "stop",
  "attach-document",
  "next",
  "previous",
  "key",
  "type",
  "interact",
  "stop-interacting",
  "click-current-item",
  "read",
  "logs",
  "clear-logs",
  "checkpoint"
]);
export type DriverActionName = z.infer<typeof driverActionNameSchema>;

export const driverActionResultSchema = z.object({
  session: accessibilityDriverSessionSchema,
  action: driverActionNameSchema,
  state: driverStateSnapshotSchema,
  details: z.record(z.string(), z.unknown()).optional()
});
export type DriverActionResult = z.infer<typeof driverActionResultSchema>;

export const interactionPatternIdSchema = z.enum([
  "tab_sequence",
  "landmark_sequence",
  "heading_sequence",
  "form_field_walk",
  "status_message_probe",
  "dialog_probe",
  "focus_order_probe",
  "focus_visibility_probe",
  "focus_obscured_probe",
  "auth_flow_probe",
  "redundant_entry_probe"
]);
export type InteractionPatternId = z.infer<typeof interactionPatternIdSchema>;

export const interactionPatternStepStatusSchema = z.enum(["completed", "observed", "warning"]);
export type InteractionPatternStepStatus = z.infer<typeof interactionPatternStepStatusSchema>;

export const interactionPatternStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: interactionPatternStepStatusSchema,
  details: z.record(z.string(), z.unknown()).optional()
});
export type InteractionPatternStep = z.infer<typeof interactionPatternStepSchema>;

export const interactionPatternAssertionStatusSchema = z.enum(["passed", "failed", "not-run"]);
export type InteractionPatternAssertionStatus = z.infer<typeof interactionPatternAssertionStatusSchema>;

export const interactionPatternAssertionSchema = z.object({
  id: z.string(),
  status: interactionPatternAssertionStatusSchema,
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional()
});
export type InteractionPatternAssertion = z.infer<typeof interactionPatternAssertionSchema>;

export const interactionPatternBrowserEvidenceSchema = z.object({
  kind: z.enum(["focus", "visibility", "dialog", "status-message", "structure"]),
  summary: z.string(),
  details: z.record(z.string(), z.unknown()).optional()
});
export type InteractionPatternBrowserEvidence = z.infer<typeof interactionPatternBrowserEvidenceSchema>;

export const interactionPatternResultSchema = z.object({
  patternId: interactionPatternIdSchema,
  url: z.string().url(),
  target: platformSchema,
  sessionId: z.string().min(1),
  managedSession: z.boolean(),
  stepLog: z.array(interactionPatternStepSchema),
  spokenPhraseLog: z.array(z.string()),
  itemTextLog: z.array(z.string()),
  assertions: z.array(interactionPatternAssertionSchema),
  targetMetadata: z.record(z.string(), z.unknown()),
  browserEvidence: z.array(interactionPatternBrowserEvidenceSchema)
});
export type InteractionPatternResult = z.infer<typeof interactionPatternResultSchema>;

export const criterionIdSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
export type CriterionId = z.infer<typeof criterionIdSchema>;

export const criterionSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export type CriterionSlug = z.infer<typeof criterionSlugSchema>;

export const criterionLookupKeySchema = z.union([criterionIdSchema, criterionSlugSchema]);
export type CriterionLookupKey = z.infer<typeof criterionLookupKeySchema>;

export const axeImpactSchema = z.enum(["minor", "moderate", "serious", "critical"]).nullable();
export type AxeImpact = z.infer<typeof axeImpactSchema>;

export const axeNodeResultSchema = z.object({
  target: z.array(z.string()),
  html: z.string(),
  failureSummary: z.string().nullable()
});
export type AxeNodeResult = z.infer<typeof axeNodeResultSchema>;

export const axeRuleResultSchema = z.object({
  id: z.string(),
  impact: axeImpactSchema,
  description: z.string(),
  help: z.string(),
  helpUrl: z.string().url(),
  tags: z.array(z.string()),
  nodes: z.array(axeNodeResultSchema)
});
export type AxeRuleResult = z.infer<typeof axeRuleResultSchema>;

export const axeSelectionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("criterion"),
    criterion: criterionLookupKeySchema,
    resolvedRuleIds: z.array(z.string())
  }),
  z.object({
    kind: z.literal("level"),
    level: wcagLevelSchema,
    resolvedRuleIds: z.array(z.string())
  }),
  z.object({
    kind: z.literal("rule"),
    ruleIds: z.array(z.string())
  })
]);
export type AxeSelection = z.infer<typeof axeSelectionSchema>;

export const axeRunResultSchema = z.object({
  url: z.string().url(),
  wcagVersion: wcagVersionSchema,
  selection: axeSelectionSchema,
  ruleIds: z.array(z.string()),
  violations: z.array(axeRuleResultSchema),
  passes: z.array(axeRuleResultSchema),
  incomplete: z.array(axeRuleResultSchema),
  inapplicable: z.array(axeRuleResultSchema)
});
export type AxeRunResult = z.infer<typeof axeRunResultSchema>;

export const coverageStateSchema = z.enum(["automated", "hybrid", "manual", "unknown"]);
export type CoverageState = z.infer<typeof coverageStateSchema>;

export const preferredEvidenceModeSchema = z.enum(["automated", "hybrid", "manual", "unknown"]);
export type PreferredEvidenceMode = z.infer<typeof preferredEvidenceModeSchema>;

export const applicabilityStateSchema = z.enum([
  "applicable",
  "likely-applicable",
  "not-detected",
  "out-of-scope",
  "unknown"
]);
export type ApplicabilityState = z.infer<typeof applicabilityStateSchema>;

export const normalizedTechniqueSchema = z.object({
  key: z.string(),
  id: z.string().optional(),
  title: z.string(),
  technology: z.string().optional(),
  kind: z.enum(["sufficient", "advisory", "failure"]),
  groupTitle: z.string().optional(),
  groupNote: z.string().optional(),
  suffix: z.string().optional(),
  relatedKeys: z.array(z.string()),
  isSynthetic: z.boolean()
});
export type NormalizedTechnique = z.infer<typeof normalizedTechniqueSchema>;

export const normalizedCriterionSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  level: wcagLevelSchema,
  wcagVersion: wcagVersionSchema,
  normativeText: z.string(),
  understandingUrl: z.string().url(),
  versions: z.array(z.string()),
  altIds: z.array(z.string()),
  details: z.array(z.string()),
  tags: z.array(z.string()),
  principle: z.object({
    id: z.string(),
    number: z.string(),
    title: z.string()
  }),
  guideline: z.object({
    id: z.string(),
    number: z.string(),
    title: z.string()
  }),
  techniques: z.array(normalizedTechniqueSchema),
  advisoryTechniques: z.array(normalizedTechniqueSchema),
  failures: z.array(normalizedTechniqueSchema)
});
export type NormalizedCriterion = z.infer<typeof normalizedCriterionSchema>;

export const normalizedCriteriaArtifactSchema = z.object({
  version: wcagVersionSchema,
  criteria: z.record(z.string(), normalizedCriterionSchema)
});
export type NormalizedCriteriaArtifact = z.infer<typeof normalizedCriteriaArtifactSchema>;

export const criteriaByLevelArtifactSchema = z.object({
  version: wcagVersionSchema,
  levels: z.object({
    A: z.array(z.string()),
    AA: z.array(z.string()),
    AAA: z.array(z.string())
  })
});
export type CriteriaByLevelArtifact = z.infer<typeof criteriaByLevelArtifactSchema>;

export const slugIndexArtifactSchema = z.object({
  version: wcagVersionSchema,
  slugs: z.record(z.string(), z.string())
});
export type SlugIndexArtifact = z.infer<typeof slugIndexArtifactSchema>;

export const techniqueIndexEntrySchema = z.object({
  key: z.string(),
  id: z.string().optional(),
  title: z.string(),
  technology: z.string().optional(),
  kind: z.enum(["sufficient", "advisory", "failure"]),
  criterionIds: z.array(z.string())
});
export type TechniqueIndexEntry = z.infer<typeof techniqueIndexEntrySchema>;

export const techniqueIndexArtifactSchema = z.object({
  version: wcagVersionSchema,
  techniques: z.record(z.string(), techniqueIndexEntrySchema)
});
export type TechniqueIndexArtifact = z.infer<typeof techniqueIndexArtifactSchema>;

export const failureIndexArtifactSchema = z.object({
  version: wcagVersionSchema,
  failures: z.record(z.string(), techniqueIndexEntrySchema)
});
export type FailureIndexArtifact = z.infer<typeof failureIndexArtifactSchema>;

export const tagIndexArtifactSchema = z.object({
  version: wcagVersionSchema,
  tags: z.record(z.string(), z.array(z.string()))
});
export type TagIndexArtifact = z.infer<typeof tagIndexArtifactSchema>;

export const criterionCoverageSchema = z.object({
  criterionId: z.string(),
  coverageState: coverageStateSchema,
  axeRuleIds: z.array(z.string()),
  actRuleIds: z.array(z.string()),
  sourceAttribution: z.array(z.string()),
  notes: z.array(z.string()),
  updatedAt: z.string().datetime()
});
export type CriterionCoverage = z.infer<typeof criterionCoverageSchema>;

export const coverageArtifactSchema = z.object({
  version: wcagVersionSchema,
  coverage: z.record(z.string(), criterionCoverageSchema)
});
export type CoverageArtifact = z.infer<typeof coverageArtifactSchema>;

export const verificationStrategySchema = z.object({
  criterionId: z.string(),
  preferredEvidenceMode: preferredEvidenceModeSchema,
  procedureIds: z.array(z.string()),
  requiresRealTarget: z.boolean(),
  notes: z.array(z.string())
});
export type VerificationStrategy = z.infer<typeof verificationStrategySchema>;

export const strategyArtifactSchema = z.object({
  version: wcagVersionSchema,
  strategies: z.record(z.string(), verificationStrategySchema)
});
export type StrategyArtifact = z.infer<typeof strategyArtifactSchema>;

const coverageSummaryBucketSchema = z.object({
  criteria: z.number().int().nonnegative(),
  automated: z.number().int().nonnegative(),
  hybrid: z.number().int().nonnegative(),
  manual: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative()
});

export const coverageSummaryArtifactSchema = z.object({
  version: wcagVersionSchema,
  updatedAt: z.string().datetime(),
  totals: coverageSummaryBucketSchema,
  byLevel: z.object({
    A: coverageSummaryBucketSchema,
    AA: coverageSummaryBucketSchema,
    AAA: coverageSummaryBucketSchema
  }),
  coverageSources: z.object({
    criteriaWithAxe: z.number().int().nonnegative(),
    criteriaWithAct: z.number().int().nonnegative(),
    criteriaWithBoth: z.number().int().nonnegative()
  }),
  representativeCriterionIds: z.object({
    automated: z.array(z.string()),
    hybrid: z.array(z.string()),
    manual: z.array(z.string()),
    unknown: z.array(z.string())
  })
});
export type CoverageSummaryArtifact = z.infer<typeof coverageSummaryArtifactSchema>;

export const applicabilitySignalCategorySchema = z.enum([
  "auth",
  "dialog",
  "drag-and-drop",
  "form",
  "heading",
  "help",
  "landmark",
  "live-region",
  "media",
  "menu",
  "overlay",
  "repeated-form",
  "tablist",
  "validation",
  "widget"
]);
export type ApplicabilitySignalCategory = z.infer<typeof applicabilitySignalCategorySchema>;

export const applicabilitySignalSourceSchema = z.enum(["dom", "a11y-tree", "metadata", "quickref-tag", "user-hint"]);
export type ApplicabilitySignalSource = z.infer<typeof applicabilitySignalSourceSchema>;

export const applicabilitySignalSchema = z.object({
  category: applicabilitySignalCategorySchema,
  source: applicabilitySignalSourceSchema,
  value: z.string(),
  confidence: z.enum(["high", "medium", "low"])
});
export type ApplicabilitySignal = z.infer<typeof applicabilitySignalSchema>;

export const targetReferenceSchema = z.object({
  kind: z.enum(["url", "story"]),
  value: z.string()
});
export type TargetReference = z.infer<typeof targetReferenceSchema>;

export const applicabilityInputSchema = z.object({
  target: targetReferenceSchema,
  signals: z.array(applicabilitySignalSchema),
  metadata: z.record(z.string(), z.string()),
  userHints: z.array(z.string())
});
export type ApplicabilityInput = z.infer<typeof applicabilityInputSchema>;

export const criterionApplicabilitySchema = z.object({
  criterionId: criterionIdSchema,
  state: applicabilityStateSchema,
  reasons: z.array(z.string()),
  matchedSignalCategories: z.array(applicabilitySignalCategorySchema),
  matchedTags: z.array(z.string())
});
export type CriterionApplicability = z.infer<typeof criterionApplicabilitySchema>;

export const applicabilityMatrixSchema = z.object({
  version: wcagVersionSchema,
  target: targetReferenceSchema,
  assessments: z.record(z.string(), criterionApplicabilitySchema)
});
export type ApplicabilityMatrix = z.infer<typeof applicabilityMatrixSchema>;

export const criterionApplicabilityLookupResultSchema = z.object({
  lookupKey: criterionLookupKeySchema,
  version: wcagVersionSchema,
  target: targetReferenceSchema,
  criterion: normalizedCriterionSchema,
  assessment: criterionApplicabilitySchema
});
export type CriterionApplicabilityLookupResult = z.infer<typeof criterionApplicabilityLookupResultSchema>;

export const searchMatchFieldSchema = z.enum([
  "title",
  "summary",
  "normativeText",
  "details",
  "technique",
  "failure",
  "tag",
  "guideline",
  "principle"
]);
export type SearchMatchField = z.infer<typeof searchMatchFieldSchema>;

export const criterionSearchMatchSchema = z.object({
  field: searchMatchFieldSchema,
  text: z.string(),
  score: z.number().nonnegative()
});
export type CriterionSearchMatch = z.infer<typeof criterionSearchMatchSchema>;

export const criterionSearchResultSchema = z.object({
  criterionId: criterionIdSchema,
  slug: criterionSlugSchema,
  title: z.string(),
  level: wcagLevelSchema,
  wcagVersion: wcagVersionSchema,
  score: z.number().nonnegative(),
  matches: z.array(criterionSearchMatchSchema)
});
export type CriterionSearchResult = z.infer<typeof criterionSearchResultSchema>;

export const criterionSearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(criterionSearchResultSchema)
});
export type CriterionSearchResponse = z.infer<typeof criterionSearchResponseSchema>;

export const criterionLookupResultSchema = z.object({
  lookupKey: criterionLookupKeySchema,
  criterion: normalizedCriterionSchema
});
export type CriterionLookupResult = z.infer<typeof criterionLookupResultSchema>;

export const criteriaByLevelResultSchema = z.object({
  version: wcagVersionSchema,
  level: wcagLevelSchema,
  criteria: z.array(normalizedCriterionSchema)
});
export type CriteriaByLevelResult = z.infer<typeof criteriaByLevelResultSchema>;

export const quickrefTagLookupResultSchema = z.object({
  lookupKey: criterionLookupKeySchema,
  criterionId: criterionIdSchema,
  tags: z.array(z.string())
});
export type QuickrefTagLookupResult = z.infer<typeof quickrefTagLookupResultSchema>;

export const coverageLookupResultSchema = z.object({
  lookupKey: criterionLookupKeySchema,
  criterion: normalizedCriterionSchema,
  coverage: criterionCoverageSchema,
  strategy: verificationStrategySchema
});
export type CoverageLookupResult = z.infer<typeof coverageLookupResultSchema>;

export const verificationStrategyLookupResultSchema = z.object({
  lookupKey: criterionLookupKeySchema,
  criterionId: criterionIdSchema,
  strategy: verificationStrategySchema
});
export type VerificationStrategyLookupResult = z.infer<typeof verificationStrategyLookupResultSchema>;

export const verificationVerdictSchema = z.enum([
  "pass",
  "fail",
  "needs-manual-review",
  "not-applicable",
  "not-covered",
  "error"
]);
export type VerificationVerdict = z.infer<typeof verificationVerdictSchema>;

export const verificationEvidenceModeSchema = preferredEvidenceModeSchema;
export type VerificationEvidenceMode = z.infer<typeof verificationEvidenceModeSchema>;

export const verificationRequestedScopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("criterion"),
    criterion: criterionLookupKeySchema
  }),
  z.object({
    kind: z.literal("level"),
    level: wcagLevelSchema
  })
]);
export type VerificationRequestedScope = z.infer<typeof verificationRequestedScopeSchema>;

export const verificationSourceKindSchema = z.enum([
  "criterion",
  "coverage-artifact",
  "strategy-artifact",
  "axe-rule",
  "act-rule",
  "pattern",
  "driver-session",
  "applicability",
  "target",
  "manual-note",
  "spec"
]);
export type VerificationSourceKind = z.infer<typeof verificationSourceKindSchema>;

export const verificationSourceReferenceSchema = z.object({
  kind: verificationSourceKindSchema,
  id: z.string(),
  label: z.string(),
  locator: z.string().optional()
});
export type VerificationSourceReference = z.infer<typeof verificationSourceReferenceSchema>;

export const verificationEvidenceKindSchema = z.enum([
  "axe",
  "pattern",
  "driver",
  "applicability",
  "manual-note"
]);
export type VerificationEvidenceKind = z.infer<typeof verificationEvidenceKindSchema>;

export const verificationEvidenceRecordSchema = z.object({
  id: z.string(),
  kind: verificationEvidenceKindSchema,
  mode: verificationEvidenceModeSchema,
  procedureId: z.string().optional(),
  collectedAt: z.string().datetime(),
  summary: z.string(),
  sourceReferences: z.array(verificationSourceReferenceSchema),
  axeResult: axeRunResultSchema.optional(),
  patternResult: interactionPatternResultSchema.optional(),
  driverResult: driverActionResultSchema.optional(),
  applicability: criterionApplicabilitySchema.optional(),
  notes: z.array(z.string())
});
export type VerificationEvidenceRecord = z.infer<typeof verificationEvidenceRecordSchema>;

export const verificationUncoveredWorkKindSchema = z.enum([
  "manual-only",
  "not-covered",
  "requires-real-target",
  "missing-pattern",
  "missing-rule",
  "unsupported-target"
]);
export type VerificationUncoveredWorkKind = z.infer<typeof verificationUncoveredWorkKindSchema>;

export const verificationUncoveredWorkItemSchema = z.object({
  kind: verificationUncoveredWorkKindSchema,
  message: z.string(),
  procedureId: z.string().optional(),
  sourceReferences: z.array(verificationSourceReferenceSchema)
});
export type VerificationUncoveredWorkItem = z.infer<typeof verificationUncoveredWorkItemSchema>;

export const verificationProcedureKindSchema = z.enum([
  "applicability",
  "axe",
  "pattern",
  "driver",
  "manual"
]);
export type VerificationProcedureKind = z.infer<typeof verificationProcedureKindSchema>;

export const verificationExecutionStepSchema = z.object({
  procedureId: z.string(),
  kind: verificationProcedureKindSchema,
  mode: verificationEvidenceModeSchema,
  status: z.enum(["planned", "completed", "skipped", "error"]),
  reason: z.string().optional(),
  sourceReferences: z.array(verificationSourceReferenceSchema)
});
export type VerificationExecutionStep = z.infer<typeof verificationExecutionStepSchema>;

export const verificationExecutionPlanSchema = z.object({
  strategyId: z.string(),
  preferredEvidenceMode: verificationEvidenceModeSchema,
  selectedProcedureIds: z.array(z.string()),
  steps: z.array(verificationExecutionStepSchema)
});
export type VerificationExecutionPlan = z.infer<typeof verificationExecutionPlanSchema>;

export const verificationCriterionResultSchema = z.object({
  criterionId: criterionIdSchema,
  criterion: normalizedCriterionSchema,
  applicability: criterionApplicabilitySchema,
  coverage: criterionCoverageSchema,
  strategy: verificationStrategySchema,
  executionPlan: verificationExecutionPlanSchema,
  verdict: verificationVerdictSchema,
  evidenceMode: verificationEvidenceModeSchema,
  procedureIds: z.array(z.string()),
  evidence: z.array(verificationEvidenceRecordSchema),
  sourceReferences: z.array(verificationSourceReferenceSchema),
  uncoveredWork: z.array(verificationUncoveredWorkItemSchema),
  notes: z.array(z.string()),
  errors: z.array(cliMessageSchema)
});
export type VerificationCriterionResult = z.infer<typeof verificationCriterionResultSchema>;

const verificationVerdictCountSchema = z.object({
  pass: z.number().int().nonnegative(),
  fail: z.number().int().nonnegative(),
  "needs-manual-review": z.number().int().nonnegative(),
  "not-applicable": z.number().int().nonnegative(),
  "not-covered": z.number().int().nonnegative(),
  error: z.number().int().nonnegative()
});

const verificationEvidenceModeCountSchema = z.object({
  automated: z.number().int().nonnegative(),
  hybrid: z.number().int().nonnegative(),
  manual: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative()
});

export const verificationReportSummarySchema = z.object({
  totalCriteria: z.number().int().nonnegative(),
  verdicts: verificationVerdictCountSchema,
  evidenceModes: verificationEvidenceModeCountSchema,
  uncoveredCount: z.number().int().nonnegative(),
  manualOnlyCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative()
});
export type VerificationReportSummary = z.infer<typeof verificationReportSummarySchema>;

export const levelVerificationResultSchema = z.object({
  level: wcagLevelSchema,
  wcagVersion: wcagVersionSchema,
  summary: verificationReportSummarySchema,
  criteria: z.array(verificationCriterionResultSchema),
  uncoveredCriterionIds: z.array(criterionIdSchema),
  manualOnlyCriterionIds: z.array(criterionIdSchema)
});
export type LevelVerificationResult = z.infer<typeof levelVerificationResultSchema>;

export const verificationTargetSchema = targetReferenceSchema.extend({
  platform: platformSchema.optional(),
  resolvedUrl: z.string().url().optional(),
  storybookBaseUrl: z.string().url().optional()
});
export type VerificationTarget = z.infer<typeof verificationTargetSchema>;

export const verificationReportSchema = z.object({
  target: verificationTargetSchema,
  wcagVersion: wcagVersionSchema,
  requestedScope: verificationRequestedScopeSchema,
  summary: verificationReportSummarySchema,
  criteria: z.array(verificationCriterionResultSchema),
  warnings: z.array(cliMessageSchema),
  errors: z.array(cliMessageSchema)
});
export type VerificationReport = z.infer<typeof verificationReportSchema>;

export const notFoundErrorSchema = z.object({
  type: z.literal("not-found"),
  message: z.string(),
  lookupKey: criterionLookupKeySchema
});
export type NotFoundError = z.infer<typeof notFoundErrorSchema>;

export const validationErrorSchema = z.object({
  type: z.literal("validation-error"),
  message: z.string(),
  field: z.string(),
  value: z.string(),
  supportedVersions: z.array(wcagVersionSchema).optional(),
  supportedLevels: z.array(wcagLevelSchema).optional()
});
export type ValidationError = z.infer<typeof validationErrorSchema>;

export const engineQueryErrorSchema = z.union([notFoundErrorSchema, validationErrorSchema]);
export type EngineQueryError = z.infer<typeof engineQueryErrorSchema>;
