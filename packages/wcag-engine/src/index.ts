import {
  applicabilityInputSchema,
  applicabilityMatrixSchema,
  applicabilitySignalCategorySchema,
  applicabilityStateSchema,
  coverageArtifactSchema,
  coverageLookupResultSchema,
  criteriaByLevelArtifactSchema,
  criteriaByLevelResultSchema,
  criterionApplicabilityLookupResultSchema,
  criterionLookupResultSchema,
  criterionSearchResponseSchema,
  notFoundErrorSchema,
  normalizedCriteriaArtifactSchema,
  quickrefTagLookupResultSchema,
  strategyArtifactSchema,
  validationErrorSchema,
  verificationStrategyLookupResultSchema,
  wcagLevelSchema,
  wcagVersionSchema,
  type ApplicabilityInput,
  type ApplicabilityMatrix,
  type ApplicabilitySignal,
  type ApplicabilitySignalCategory,
  type ApplicabilityState,
  type CoverageLookupResult,
  type CriteriaByLevelResult,
  type CriterionApplicability,
  type CriterionApplicabilityLookupResult,
  type CriterionLookupKey,
  type CriterionLookupResult,
  type CriterionSearchMatch,
  type CriterionSearchResponse,
  type CriterionSearchResult,
  type EngineQueryError,
  type NormalizedCriteriaArtifact,
  type NormalizedCriterion,
  type QuickrefTagLookupResult,
  type VerificationStrategyLookupResult,
  type WcagLevel,
  type WcagVersion
} from "@a11lied/contracts";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const generatedRoot = resolve(packageRoot, "../wcag-data/data/generated");
const supportedVersions = wcagVersionSchema.options;
export const supportedApplicabilityStates = [...applicabilityStateSchema.options] as readonly ApplicabilityState[];
export const supportedApplicabilitySignalCategories = [
  ...applicabilitySignalCategorySchema.options
] as readonly ApplicabilitySignalCategory[];
const searchableFieldWeights = {
  title: 8,
  summary: 6,
  normativeText: 4,
  details: 3,
  technique: 5,
  failure: 5,
  tag: 4,
  guideline: 2,
  principle: 2
} as const;

type SearchableField = keyof typeof searchableFieldWeights;

type EngineArtifacts = {
  criteria: Record<string, NormalizedCriterion>;
  criteriaByLevel: Record<WcagLevel, string[]>;
  coverage: ReturnType<typeof coverageArtifactSchema.parse>["coverage"];
  strategies: ReturnType<typeof strategyArtifactSchema.parse>["strategies"];
  slugToId: Record<string, string>;
};

const applicabilitySignalTagHints: Record<ApplicabilitySignalCategory, string[]> = {
  auth: ["forms", "logins"],
  dialog: ["modals", "focus", "keyboard", "structure"],
  "drag-and-drop": ["controls", "events", "interaction", "keyboard"],
  form: ["forms", "controls", "labels", "errors", "auto-complete"],
  heading: ["headings", "structure", "content"],
  help: ["forms", "content", "text"],
  landmark: ["navigation", "regions", "structure", "layout", "headings"],
  "live-region": ["messaging", "errors", "forms", "progress-steps", "visual-cues", "content"],
  media: ["audio", "video", "captions", "moving-content", "streaming", "text-alternatives"],
  menu: ["menus", "navigation", "focus", "keyboard"],
  overlay: ["fixed", "sticky", "positioning", "focus", "keyboard", "menus", "navigation", "modals"],
  "repeated-form": ["forms", "progress-steps"],
  tablist: ["controls", "focus", "keyboard", "structure"],
  validation: ["errors", "forms", "labels", "messaging"],
  widget: ["controls", "focus", "keyboard", "structure", "buttons", "links"]
};

const strongApplicabilityCategories = new Set<ApplicabilitySignalCategory>([
  "auth",
  "dialog",
  "drag-and-drop",
  "live-region",
  "media",
  "overlay"
]);

const interactiveFallbackTags = new Set([
  "buttons",
  "controls",
  "focus",
  "forms",
  "keyboard",
  "links",
  "menus",
  "modals",
  "navigation",
  "structure",
  "tab-order"
]);

const directCriterionCategoryHints: Partial<Record<string, ApplicabilitySignalCategory[]>> = {
  "1.2.1": ["media"],
  "1.2.2": ["media"],
  "1.2.3": ["media"],
  "1.2.5": ["media"],
  "2.1.1": ["widget", "dialog", "drag-and-drop", "form", "menu", "tablist", "media"],
  "2.1.2": ["widget", "dialog", "drag-and-drop", "form", "menu", "tablist", "media"],
  "2.4.3": ["dialog", "menu", "tablist", "overlay", "form", "widget"],
  "2.4.11": ["overlay", "dialog", "menu"],
  "2.4.12": ["overlay", "dialog", "menu"],
  "3.3.8": ["auth"],
  "4.1.2": ["widget", "dialog", "menu", "form"],
  "4.1.3": ["live-region", "validation", "form"]
};

const categoryReasonLabels: Record<ApplicabilitySignalCategory, string> = {
  auth: "authentication-flow",
  dialog: "dialog structure",
  "drag-and-drop": "drag-and-drop",
  form: "form",
  heading: "heading",
  help: "help",
  landmark: "landmark",
  "live-region": "live region",
  media: "media",
  menu: "menu",
  overlay: "fixed or overlay",
  "repeated-form": "repeated-form",
  tablist: "tablist",
  validation: "validation",
  widget: "custom widget"
};

export class WcagEngineNotFoundError extends Error {
  readonly payload: EngineQueryError;

  constructor(lookupKey: CriterionLookupKey) {
    const payload = notFoundErrorSchema.parse({
      type: "not-found",
      message: `Criterion lookup failed for "${lookupKey}".`,
      lookupKey
    });
    super(payload.message);
    this.name = "WcagEngineNotFoundError";
    this.payload = payload;
  }
}

export class WcagEngineValidationError extends Error {
  readonly payload: EngineQueryError;

  constructor(field: string, value: string, options?: { supportedVersions?: WcagVersion[]; supportedLevels?: WcagLevel[] }) {
    const payload = validationErrorSchema.parse({
      type: "validation-error",
      message:
        field === "version"
          ? `WCAG version "${value}" is unsupported.`
          : field === "level"
            ? `WCAG level "${value}" is unsupported.`
            : `Invalid value "${value}" for field "${field}".`,
      field,
      value,
      supportedVersions: options?.supportedVersions,
      supportedLevels: options?.supportedLevels
    });
    super(payload.message);
    this.name = "WcagEngineValidationError";
    this.payload = payload;
  }
}

const artifactsCache = new Map<WcagVersion, EngineArtifacts>();

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeToken(value: string): string {
  const normalized = normalizeText(value);
  if (normalized.endsWith("ies") && normalized.length > 3) {
    return `${normalized.slice(0, -3)}y`;
  }
  if (normalized.endsWith("es") && normalized.length > 3) {
    return normalized.slice(0, -2);
  }
  if (normalized.endsWith("s") && normalized.length > 2) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .map((token) => normalizeToken(token))
    .filter((token) => token.length > 0);
}

function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function getArtifacts(version: WcagVersion): EngineArtifacts {
  const cached = artifactsCache.get(version);
  if (cached) {
    return cached;
  }

  const criteriaArtifact = normalizedCriteriaArtifactSchema.parse(
    JSON.parse(readFileSync(resolve(generatedRoot, `criteria.${version}.json`), "utf8")) as unknown
  );
  const criteriaByLevelArtifact = criteriaByLevelArtifactSchema.parse(
    JSON.parse(readFileSync(resolve(generatedRoot, `criteria-by-level.${version}.json`), "utf8")) as unknown
  );
  const coverageArtifact = coverageArtifactSchema.parse(
    JSON.parse(readFileSync(resolve(generatedRoot, `coverage.${version}.json`), "utf8")) as unknown
  );
  const strategyArtifact = strategyArtifactSchema.parse(
    JSON.parse(readFileSync(resolve(generatedRoot, `strategy.${version}.json`), "utf8")) as unknown
  );
  const criteriaEntries = Object.values(criteriaArtifact.criteria) as NormalizedCriteriaArtifact["criteria"][string][];

  const nextArtifacts: EngineArtifacts = {
    criteria: criteriaArtifact.criteria,
    criteriaByLevel: criteriaByLevelArtifact.levels,
    coverage: coverageArtifact.coverage,
    strategies: strategyArtifact.strategies,
    slugToId: Object.fromEntries(criteriaEntries.map((criterion) => [criterion.slug, criterion.id] as const))
  };

  artifactsCache.set(version, nextArtifacts);
  return nextArtifacts;
}

function parseVersion(version: string | undefined): WcagVersion {
  const resolvedVersion = version ?? "2.2";
  const result = wcagVersionSchema.safeParse(resolvedVersion);
  if (!result.success) {
    throw new WcagEngineValidationError("version", resolvedVersion, {
      supportedVersions: [...supportedVersions]
    });
  }
  return result.data;
}

function parseLevel(level: string): WcagLevel {
  const result = wcagLevelSchema.safeParse(level);
  if (!result.success) {
    throw new WcagEngineValidationError("level", level, {
      supportedLevels: [...wcagLevelSchema.options]
    });
  }
  return result.data;
}

function resolveCriterion(version: WcagVersion, lookupKey: CriterionLookupKey): NormalizedCriterion {
  const artifacts = getArtifacts(version);
  const direct = artifacts.criteria[lookupKey];
  if (direct) {
    return direct;
  }

  const criterionId = artifacts.slugToId[lookupKey];
  if (criterionId) {
    const resolved = artifacts.criteria[criterionId];
    if (resolved) {
      return resolved;
    }
  }

  throw new WcagEngineNotFoundError(lookupKey);
}

function createFieldMatch(
  field: SearchableField,
  value: string,
  queryTokens: string[],
  normalizedQuery: string
): CriterionSearchMatch | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const fieldTokens = tokenize(value);
  const matchedCount = queryTokens.filter((token) => fieldTokens.includes(token)).length;
  const normalizedValue = normalizeText(value);

  if (matchedCount === 0 && !normalizedValue.includes(normalizedQuery)) {
    return undefined;
  }

  const phraseBonus = normalizedValue.includes(normalizedQuery) ? 0.5 : 0;
  const rawScore = searchableFieldWeights[field] * (matchedCount / Math.max(queryTokens.length, 1) + phraseBonus);

  return {
    field,
    text: value,
    score: Number(rawScore.toFixed(4))
  };
}

function buildSearchMatches(criterion: NormalizedCriterion, query: string): CriterionSearchMatch[] {
  const normalizedQuery = normalizeText(query);
  const queryTokens = tokenize(query);

  const fieldValues: Array<[SearchableField, string[]]> = [
    ["title", [criterion.title]],
    ["summary", [criterion.summary]],
    ["normativeText", [criterion.normativeText]],
    ["details", criterion.details],
    ["technique", [...criterion.techniques, ...criterion.advisoryTechniques].map((entry) => entry.title)],
    ["failure", criterion.failures.map((entry) => entry.title)],
    ["tag", criterion.tags],
    ["guideline", [criterion.guideline.title]],
    ["principle", [criterion.principle.title]]
  ];

  const matches = fieldValues.flatMap(([field, values]) =>
    values
      .map((value) => createFieldMatch(field, value, queryTokens, normalizedQuery))
      .filter((value): value is CriterionSearchMatch => value !== undefined)
  );

  return matches.sort((left, right) => right.score - left.score || left.field.localeCompare(right.field));
}

function formatList(values: string[]): string {
  if (values.length === 0) {
    return "";
  }
  if (values.length === 1) {
    return values[0]!;
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function getMatchedCategories(
  criterion: NormalizedCriterion,
  signals: ApplicabilitySignal[]
): ApplicabilitySignalCategory[] {
  const categories = dedupe(signals.map((signal) => signal.category));
  const tagDriven = categories.filter((category) =>
    applicabilitySignalTagHints[category].some((tag) => criterion.tags.includes(tag))
  );
  const direct = (directCriterionCategoryHints[criterion.id] ?? []).filter((category) => categories.includes(category));

  return dedupe([...tagDriven, ...direct]);
}

function getMatchedTags(
  criterion: NormalizedCriterion,
  matchedCategories: ApplicabilitySignalCategory[]
): string[] {
  return dedupe(
    matchedCategories.flatMap((category) =>
      applicabilitySignalTagHints[category].filter((tag) => criterion.tags.includes(tag))
    )
  );
}

function getInteractiveUnknownAssessment(
  criterion: NormalizedCriterion,
  matchedTags: string[]
): CriterionApplicability | undefined {
  const criterionLooksInteractive = criterion.tags.some((tag) => interactiveFallbackTags.has(tag));

  if (!criterionLooksInteractive) {
    return undefined;
  }

  return {
    criterionId: criterion.id,
    state: "unknown",
    reasons: [
      `Detected a custom widget signal, but no recognized form, dialog, media, menu, or authentication-flow signals. Applicability for this interactive criterion stays unresolved.`
    ],
    matchedSignalCategories: ["widget"],
    matchedTags
  };
}

function evaluateCriterionApplicability(criterion: NormalizedCriterion, input: ApplicabilityInput): CriterionApplicability {
  const signals = input.signals;
  const matchedCategories = getMatchedCategories(criterion, signals);
  const matchedSignals = signals.filter((signal) => matchedCategories.includes(signal.category));
  const matchedTags = getMatchedTags(criterion, matchedCategories);
  const signalValues = dedupe(matchedSignals.map((signal) => signal.value)).slice(0, 4);
  const signalLabels = dedupe(matchedCategories.map((category) => categoryReasonLabels[category]));
  const onlyWidgetSignals = signals.length > 0 && signals.every((signal) => signal.category === "widget");

  if (criterion.id === "3.3.8") {
    const authSignals = signals.filter((signal) => signal.category === "auth");
    const authTags = getMatchedTags(criterion, ["auth"]);

    if (authSignals.length > 0) {
      return {
        criterionId: criterion.id,
        state: "applicable",
        reasons: [
          `Detected authentication signals (${formatList(authSignals.map((signal) => signal.value))}) and matching criterion tags (${formatList(authTags)}).`
        ],
        matchedSignalCategories: ["auth"],
        matchedTags: authTags
      };
    }

    return {
      criterionId: criterion.id,
      state: "not-detected",
      reasons: ["No authentication-flow signals were detected for this target."],
      matchedSignalCategories: [],
      matchedTags: []
    };
  }

  if (criterion.id === "4.1.3") {
    const statusSignals = signals.filter((signal) => signal.category === "live-region");
    const statusTags = getMatchedTags(criterion, ["live-region", "form", "validation"]);

    if (statusSignals.length > 0) {
      return {
        criterionId: criterion.id,
        state: "applicable",
        reasons: [
          `Detected live region signals (${formatList(statusSignals.map((signal) => signal.value))}) and matching criterion tags (${formatList(statusTags)}).`
        ],
        matchedSignalCategories: dedupe(statusSignals.map((signal) => signal.category).concat(matchedCategories)),
        matchedTags: statusTags
      };
    }

    if (matchedCategories.includes("form") || matchedCategories.includes("validation")) {
      return {
        criterionId: criterion.id,
        state: "likely-applicable",
        reasons: [
          `Detected form or validation signals (${formatList(signalValues)}) and matching criterion tags (${formatList(statusTags)}), but no explicit live region or status role signal yet.`
        ],
        matchedSignalCategories: dedupe(matchedCategories),
        matchedTags: statusTags
      };
    }

    return {
      criterionId: criterion.id,
      state: "not-detected",
      reasons: ["No live region or equivalent status signal was detected for this target."],
      matchedSignalCategories: [],
      matchedTags: []
    };
  }

  if (onlyWidgetSignals) {
    const unknownAssessment = getInteractiveUnknownAssessment(criterion, matchedTags);
    if (unknownAssessment) {
      return unknownAssessment;
    }
  }

  if (matchedCategories.length > 0) {
    const state = matchedCategories.some((category) => strongApplicabilityCategories.has(category))
      ? "applicable"
      : "likely-applicable";

    return {
      criterionId: criterion.id,
      state,
      reasons: [
        `Detected ${formatList(signalLabels)} signals (${formatList(signalValues)})${matchedTags.length > 0 ? ` and matching criterion tags (${formatList(matchedTags)}).` : "."}`
      ],
      matchedSignalCategories: matchedCategories,
      matchedTags
    };
  }

  return {
    criterionId: criterion.id,
    state: "not-detected",
    reasons: ["No matching applicability signals were detected for this criterion."],
    matchedSignalCategories: [],
    matchedTags: []
  };
}

export function getCriterion(lookupKey: CriterionLookupKey, options?: { version?: string }): CriterionLookupResult {
  const version = parseVersion(options?.version);
  const criterion = resolveCriterion(version, lookupKey);

  return criterionLookupResultSchema.parse({
    lookupKey,
    criterion
  });
}

export function listCriteriaByLevel(level: string, version: string): CriteriaByLevelResult {
  const parsedVersion = parseVersion(version);
  const parsedLevel = parseLevel(level);
  const artifacts = getArtifacts(parsedVersion);
  const criterionIds = artifacts.criteriaByLevel[parsedLevel] ?? [];

  return criteriaByLevelResultSchema.parse({
    version: parsedVersion,
    level: parsedLevel,
    criteria: criterionIds.map((criterionId) => artifacts.criteria[criterionId])
  });
}

export function searchCriteria(query: string, options?: { version?: string; limit?: number }): CriterionSearchResponse {
  const version = parseVersion(options?.version);
  const limit = options?.limit ?? 10;
  const artifacts = getArtifacts(version);

  const results = Object.values(artifacts.criteria)
    .map((criterion) => {
      const matches = buildSearchMatches(criterion, query);
      const score = matches.reduce((total, match) => total + match.score, 0);

      if (matches.length === 0 || score <= 0) {
        return undefined;
      }

      return {
        criterionId: criterion.id,
        slug: criterion.slug,
        title: criterion.title,
        level: criterion.level,
        wcagVersion: criterion.wcagVersion,
        score: Number(score.toFixed(4)),
        matches
      } satisfies CriterionSearchResult;
    })
    .filter((entry): entry is CriterionSearchResult => entry !== undefined)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.matches.length - left.matches.length ||
        left.criterionId.localeCompare(right.criterionId, undefined, { numeric: true })
    )
    .slice(0, limit);

  return criterionSearchResponseSchema.parse({
    query,
    results
  });
}

export function getCoverage(lookupKey: CriterionLookupKey, options?: { version?: string }): CoverageLookupResult {
  const version = parseVersion(options?.version);
  const criterion = resolveCriterion(version, lookupKey);
  const artifacts = getArtifacts(version);
  const coverage = artifacts.coverage[criterion.id];
  const strategy = artifacts.strategies[criterion.id];

  if (!coverage || !strategy) {
    throw new WcagEngineNotFoundError(lookupKey);
  }

  return coverageLookupResultSchema.parse({
    lookupKey,
    criterion,
    coverage,
    strategy
  });
}

export function getQuickrefTags(
  lookupKey: CriterionLookupKey,
  options?: { version?: string }
): QuickrefTagLookupResult {
  const version = parseVersion(options?.version);
  const criterion = resolveCriterion(version, lookupKey);

  return quickrefTagLookupResultSchema.parse({
    lookupKey,
    criterionId: criterion.id,
    tags: criterion.tags
  });
}

export function getVerificationStrategy(
  lookupKey: CriterionLookupKey,
  options?: { version?: string }
): VerificationStrategyLookupResult {
  const version = parseVersion(options?.version);
  const criterion = resolveCriterion(version, lookupKey);
  const strategy = getArtifacts(version).strategies[criterion.id];

  if (!strategy) {
    throw new WcagEngineNotFoundError(lookupKey);
  }

  return verificationStrategyLookupResultSchema.parse({
    lookupKey,
    criterionId: criterion.id,
    strategy
  });
}

export function getCriterionApplicability(
  lookupKey: CriterionLookupKey,
  input: ApplicabilityInput,
  options?: { version?: string }
): CriterionApplicabilityLookupResult {
  const version = parseVersion(options?.version);
  const parsedInput = applicabilityInputSchema.parse(input);
  const criterion = resolveCriterion(version, lookupKey);
  const assessment = evaluateCriterionApplicability(criterion, parsedInput);

  return criterionApplicabilityLookupResultSchema.parse({
    lookupKey,
    version,
    target: parsedInput.target,
    criterion,
    assessment
  });
}

export function listApplicableCriteria(input: ApplicabilityInput, options?: { version?: string }): ApplicabilityMatrix {
  const version = parseVersion(options?.version);
  const parsedInput = applicabilityInputSchema.parse(input);
  const artifacts = getArtifacts(version);
  const relevantAssessments = Object.values(artifacts.criteria)
    .map((criterion) => evaluateCriterionApplicability(criterion, parsedInput))
    .filter((assessment) => assessment.state !== "not-detected" && assessment.state !== "out-of-scope")
    .sort((left, right) => left.criterionId.localeCompare(right.criterionId, undefined, { numeric: true }));

  return applicabilityMatrixSchema.parse({
    version,
    target: parsedInput.target,
    assessments: Object.fromEntries(relevantAssessments.map((assessment) => [assessment.criterionId, assessment]))
  });
}

export function resetWcagEngineCache(): void {
  artifactsCache.clear();
}
