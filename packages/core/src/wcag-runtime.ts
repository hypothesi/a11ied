import {
  cliExitCodes,
  applicabilityInputSchema,
  wcagLevelSchema,
  wcagVersionSchema,
  type ApplicabilityInput,
  type ApplicabilitySignal,
  type CriterionLookupKey,
  type WcagLevel,
  type WcagVersion
} from "@a11lied/contracts";
import {
  WcagEngineNotFoundError,
  WcagEngineValidationError,
  getCoverage,
  getCriterion,
  getCriterionApplicability,
  listApplicableCriteria,
  listCriteriaByLevel,
  searchCriteria
} from "@a11lied/wcag-engine";

export class CliUsageError extends Error {
  readonly exitCode = cliExitCodes.usage;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "CliUsageError";
    this.code = code;
    this.details = details;
  }
}

export class CliEnvironmentError extends Error {
  readonly exitCode = cliExitCodes.environment;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "CliEnvironmentError";
    this.code = code;
    this.details = details;
  }
}

function normalizeEngineError(error: unknown): never {
  if (error instanceof WcagEngineValidationError && error.payload.type === "validation-error") {
    throw new CliUsageError("validation-error", error.payload.message, {
      field: error.payload.field,
      value: error.payload.value,
      supportedVersions: error.payload.supportedVersions,
      supportedLevels: error.payload.supportedLevels
    });
  }

  if (error instanceof WcagEngineNotFoundError && error.payload.type === "not-found") {
    throw new CliUsageError("criterion-not-found", error.payload.message, {
      lookupKey: error.payload.lookupKey
    });
  }

  throw error;
}

function parseVersion(version: string): WcagVersion {
  const parsed = wcagVersionSchema.safeParse(version);
  if (!parsed.success) {
    throw new CliUsageError("validation-error", `WCAG version "${version}" is unsupported.`, {
      field: "version",
      value: version,
      supportedVersions: [...wcagVersionSchema.options]
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

function hasMatch(value: string, pattern: RegExp): boolean {
  return pattern.test(value);
}

function addSignal(
  signals: ApplicabilitySignal[],
  category: ApplicabilitySignal["category"],
  source: ApplicabilitySignal["source"],
  value: string,
  confidence: ApplicabilitySignal["confidence"]
): void {
  signals.push({
    category,
    source,
    value,
    confidence
  });
}

function deriveApplicabilityInputFromHtml(url: string, html: string): ApplicabilityInput {
  const signals: ApplicabilitySignal[] = [];

  if (hasMatch(html, /<(main|nav|header|footer|aside)\b/i) || hasMatch(html, /role=["'](?:main|navigation|banner|contentinfo|complementary)["']/i)) {
    addSignal(signals, "landmark", "dom", "landmark structure", "high");
  }

  if (hasMatch(html, /<h[1-6]\b/i) || hasMatch(html, /role=["']heading["']/i)) {
    addSignal(signals, "heading", "dom", "heading structure", "high");
  }

  if (hasMatch(html, /<form\b/i) || hasMatch(html, /<(input|select|textarea)\b/i)) {
    addSignal(signals, "form", "dom", "form controls", "high");
  }

  if (
    hasMatch(html, /type=["']password["']/i) ||
    hasMatch(html, /autocomplete=["'](?:current-password|new-password|username)["']/i) ||
    hasMatch(html, /\b(log in|login|sign in|password recovery|two-factor|otp)\b/i)
  ) {
    addSignal(signals, "auth", "dom", "authentication flow", "high");
  }

  if (hasMatch(html, /aria-live=["'][^"']+["']/i)) {
    addSignal(signals, "live-region", "dom", "aria-live region", "high");
  }

  if (hasMatch(html, /role=["']status["']/i)) {
    addSignal(signals, "live-region", "a11y-tree", "role=status", "high");
  }

  if (hasMatch(html, /role=["'](?:alert|log)["']/i)) {
    addSignal(signals, "live-region", "a11y-tree", "alert or log role", "medium");
  }

  if (hasMatch(html, /role=["'](?:dialog|alertdialog)["']/i) || hasMatch(html, /aria-modal=["']true["']/i)) {
    addSignal(signals, "dialog", "dom", "dialog structure", "high");
  }

  if (
    hasMatch(html, /\b(modal|overlay)\b/i) ||
    hasMatch(html, /position\s*:\s*(fixed|sticky)/i)
  ) {
    addSignal(signals, "overlay", "dom", "fixed or modal overlay", "medium");
  }

  if (hasMatch(html, /<(video|audio)\b/i)) {
    addSignal(signals, "media", "dom", "audio or video media", "high");
  }

  if (hasMatch(html, /\b(draggable|drag|drop)\b/i)) {
    addSignal(signals, "drag-and-drop", "dom", "drag-and-drop interaction", "medium");
  }

  if (hasMatch(html, /\b(menu|menubar)\b/i) || hasMatch(html, /role=["'](?:menu|menubar|menuitem)["']/i)) {
    addSignal(signals, "menu", "dom", "menu structure", "medium");
  }

  if (hasMatch(html, /role=["']tablist["']/i)) {
    addSignal(signals, "tablist", "dom", "tablist structure", "medium");
  }

  if (hasMatch(html, /aria-invalid=["']true["']/i) || hasMatch(html, /\b(error|invalid|required field|validation)\b/i)) {
    addSignal(signals, "validation", "dom", "validation messaging", "medium");
  }

  if (
    hasMatch(html, /tabindex=["']0["']/i) ||
    hasMatch(html, /role=["'](?:button|link|switch|slider|combobox|listbox|tree)["']/i)
  ) {
    addSignal(signals, "widget", "dom", "focusable widget", "medium");
  }

  return applicabilityInputSchema.parse({
    target: {
      kind: "url",
      value: url
    },
    signals,
    metadata: {},
    userHints: []
  });
}

async function fetchTargetHtml(url: string): Promise<string> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new CliUsageError("invalid-url", `URL "${url}" is invalid.`, { url });
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new CliUsageError("invalid-url", `URL "${url}" must use http or https.`, { url });
  }

  let response: Response;
  try {
    response = await fetch(parsedUrl, {
      headers: {
        "user-agent": "a11lied/0.1.0"
      }
    });
  } catch (error) {
    throw new CliEnvironmentError("target-unavailable", `Could not open URL "${url}".`, {
      url,
      cause: error instanceof Error ? error.message : String(error)
    });
  }

  if (!response.ok) {
    throw new CliEnvironmentError("target-unavailable", `Could not open URL "${url}".`, {
      url,
      status: response.status,
      statusText: response.statusText
    });
  }

  return response.text();
}

export function listWcagLevels(version: string): { version: WcagVersion; levels: WcagLevel[] } {
  return {
    version: parseVersion(version),
    levels: [...wcagLevelSchema.options]
  };
}

export function listWcagCriteria(level: string, version: string) {
  const parsedLevel = parseLevel(level);
  const parsedVersion = parseVersion(version);

  try {
    return listCriteriaByLevel(parsedLevel, parsedVersion);
  } catch (error) {
    normalizeEngineError(error);
  }
}

export function showWcagCriterion(lookupKey: CriterionLookupKey, version: string) {
  const parsedVersion = parseVersion(version);

  try {
    return getCriterion(lookupKey, { version: parsedVersion });
  } catch (error) {
    normalizeEngineError(error);
  }
}

export function searchWcagCriteria(query: string, options: { version: string; limit: number }) {
  const parsedVersion = parseVersion(options.version);
  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new CliUsageError("validation-error", `Search limit "${options.limit}" is invalid.`, {
      field: "limit",
      value: options.limit
    });
  }

  try {
    return searchCriteria(query, {
      version: parsedVersion,
      limit: options.limit
    });
  } catch (error) {
    normalizeEngineError(error);
  }
}

export function showWcagCoverage(lookupKey: CriterionLookupKey, version: string) {
  const parsedVersion = parseVersion(version);

  try {
    return getCoverage(lookupKey, { version: parsedVersion });
  } catch (error) {
    normalizeEngineError(error);
  }
}

export async function inspectApplicableUrl(url: string, version: string) {
  const parsedVersion = parseVersion(version);
  const html = await fetchTargetHtml(url);
  const input = deriveApplicabilityInputFromHtml(url, html);

  try {
    return {
      version: parsedVersion,
      target: input.target,
      signals: input.signals,
      matrix: listApplicableCriteria(input, { version: parsedVersion })
    };
  } catch (error) {
    normalizeEngineError(error);
  }
}

export async function inspectCriterionUrl(lookupKey: CriterionLookupKey, url: string, version: string) {
  const parsedVersion = parseVersion(version);

  try {
    getCriterion(lookupKey, { version: parsedVersion });
  } catch (error) {
    normalizeEngineError(error);
  }

  const html = await fetchTargetHtml(url);
  const input = deriveApplicabilityInputFromHtml(url, html);

  try {
    return {
      ...getCriterionApplicability(lookupKey, input, { version: parsedVersion }),
      signals: input.signals
    };
  } catch (error) {
    normalizeEngineError(error);
  }
}
