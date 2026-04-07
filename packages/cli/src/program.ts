import { intro, log, outro } from "@clack/prompts";
import {
  cliExitCodes,
  cliOutputEnvelopeSchema,
  platformSchema,
  type CliCommandFamily,
  type CliMessage,
  type CliOutputEnvelope,
  type InteractionPatternResult,
  type Platform
} from "@a11lied/contracts";
import {
  CliEnvironmentError,
  CliUsageError,
  getDriverSessionStatus,
  runDriverSessionAction,
  runEphemeralDriverAction,
  runAxe,
  startDriverSession,
  stopDriverSession,
  createDoctorReport,
  inspectApplicableUrl,
  inspectCriterionUrl,
  listCliCommands,
  listWcagCriteria,
  listWcagLevels,
  renderDoctorText,
  runInteractionPattern,
  searchWcagCriteria,
  showWcagCoverage,
  showWcagCriterion,
  verifyCriterion,
  verifyLevel
} from "@a11lied/core";
import { startMcpServer } from "@a11lied/mcp-server";
import { Command } from "commander";

const cliVersion = "0.1.0";

type CommandExecution = {
  ok?: boolean;
  exitCode?: number;
  result: Record<string, unknown> | null;
  target?: Record<string, unknown> | null;
  warnings?: CliMessage[];
  errors?: CliMessage[];
};

function notReady(name: string): never {
  throw new Error(`${name} is scaffolded but not implemented yet. See plans/a11lied-cli-implementation-plan.md.`);
}

function addJsonOption(command: Command): Command {
  return command.option("--json", "Print JSON instead of human-readable text.");
}

function addVerboseOption(command: Command): Command {
  return command.option("--verbose", "Print more detail in text output.");
}

function addWcagVersionOption(command: Command): Command {
  return command.option("--version <version>", "Use a specific WCAG version. Defaults to 2.2.", "2.2");
}

function addSessionOption(command: Command): Command {
  return command.option("--session <id>", "Reuse an existing driver session.");
}

function addEphemeralOption(command: Command): Command {
  return command.option("--ephemeral", "Run one action in a temporary session and tear it down immediately.");
}

function addTargetOption(command: Command): Command {
  return command.option("--target <platform>", "Choose one target: virtual, voiceover, or nvda.");
}

function createEnvelope(args: {
  ok: boolean;
  family: CliCommandFamily;
  subcommand: string;
  wcagVersion: string | undefined;
  target: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  warnings: CliMessage[];
  errors: CliMessage[];
  startedAt: Date;
  completedAt: Date;
}): CliOutputEnvelope {
  const commandWcagVersion = args.wcagVersion === "2.1" || args.wcagVersion === "2.2" ? args.wcagVersion : undefined;

  return cliOutputEnvelopeSchema.parse({
    ok: args.ok,
    command: {
      family: args.family,
      subcommand: args.subcommand,
      version: cliVersion,
      ...(commandWcagVersion ? { wcagVersion: commandWcagVersion } : {})
    },
    target: args.target,
    result: args.result,
    warnings: args.warnings,
    errors: args.errors,
    meta: {
      schemaVersion: "1",
      startedAt: args.startedAt.toISOString(),
      completedAt: args.completedAt.toISOString(),
      durationMs: Math.max(0, args.completedAt.getTime() - args.startedAt.getTime())
    }
  });
}

function printOutput(
  json: boolean | undefined,
  verbose: boolean | undefined,
  envelope: CliOutputEnvelope,
  renderText: (envelope: CliOutputEnvelope, options: { verbose: boolean }) => string
): void {
  if (json) {
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }

  console.log(renderText(envelope, { verbose: Boolean(verbose) }));
}

function normalizeError(error: unknown): { exitCode: number; errors: CliMessage[] } {
  if (error instanceof CliUsageError) {
    return {
      exitCode: error.exitCode,
      errors: [
        {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {})
        }
      ]
    };
  }

  if (error instanceof CliEnvironmentError) {
    return {
      exitCode: error.exitCode,
      errors: [
        {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {})
        }
      ]
    };
  }

  if (error instanceof Error) {
    return {
      exitCode: cliExitCodes.internal,
      errors: [
        {
          code: "internal-error",
          message: error.message
        }
      ]
    };
  }

  return {
    exitCode: cliExitCodes.internal,
    errors: [
      {
        code: "internal-error",
        message: String(error)
      }
    ]
  };
}

async function executeCommand(
  args: {
    family: CliCommandFamily;
    subcommand: string;
    wcagVersion: string | undefined;
    json: boolean | undefined;
    verbose?: boolean | undefined;
  },
  handler: () => Promise<CommandExecution> | CommandExecution,
  renderText: (envelope: CliOutputEnvelope, options: { verbose: boolean }) => string
): Promise<void> {
  const startedAt = new Date();

  try {
    const execution = await handler();
    const completedAt = new Date();
    const ok = execution.ok ?? true;
    const envelope = createEnvelope({
      ok,
      family: args.family,
      subcommand: args.subcommand,
      wcagVersion: args.wcagVersion,
      target: execution.target ?? null,
      result: execution.result ?? null,
      warnings: execution.warnings ?? [],
      errors: execution.errors ?? [],
      startedAt,
      completedAt
    });

    process.exitCode = execution.exitCode ?? (ok ? cliExitCodes.success : cliExitCodes.internal);
    printOutput(args.json, args.verbose, envelope, renderText);
  } catch (error) {
    const completedAt = new Date();
    const normalized = normalizeError(error);
    const envelope = createEnvelope({
      ok: false,
      family: args.family,
      subcommand: args.subcommand,
      wcagVersion: args.wcagVersion,
      target: null,
      result: null,
      warnings: [],
      errors: normalized.errors,
      startedAt,
      completedAt
    });

    process.exitCode = normalized.exitCode;
    printOutput(
      args.json,
      args.verbose,
      envelope,
      (failedEnvelope) => `Error (${failedEnvelope.errors[0]?.code ?? "unknown"}): ${failedEnvelope.errors[0]?.message ?? "Unknown error"}`
    );
  }
}

async function executeDriveActionCommand(
  subcommand: string,
  action: "next" | "previous" | "key" | "type" | "interact" | "stop-interacting" | "click-current-item" | "read" | "logs" | "clear-logs" | "checkpoint",
  options: {
    json?: boolean;
    verbose?: boolean;
    session?: string;
    target?: string;
    ephemeral?: boolean;
  },
  payload: Record<string, unknown> | undefined,
  renderText: (envelope: CliOutputEnvelope, options: { verbose: boolean }) => string
): Promise<void> {
  await executeCommand(
    {
      family: "drive",
      subcommand,
      wcagVersion: undefined,
      json: options.json,
      verbose: options.verbose
    },
    async () => {
      const resolved = resolveDriveSession(options);
      const result = resolved.ephemeral
        ? await runEphemeralDriverAction(resolved.target!, action, payload)
        : await runDriverSessionAction(resolved.sessionId!, action, payload);

      return {
        target: {
          kind: resolved.ephemeral ? "driver-target" : "driver-session",
          value: resolved.ephemeral ? resolved.target : resolved.sessionId
        },
        result
      };
    },
    renderText
  );
}

function ensureUrlTarget(url: string | undefined, storyId: string | undefined): string {
  if (storyId) {
    throw new CliUsageError(
      "storybook-targets-unavailable",
      "Storybook targets are not available in this milestone slice.",
      { storyId }
    );
  }

  if (!url) {
    throw new CliUsageError("missing-url", "A URL target is required for this command in this milestone slice.");
  }

  return url;
}

function ensureRunAxeTarget(url: string | undefined, storyId: string | undefined): string {
  if (storyId) {
    throw new CliUsageError(
      "storybook-targets-unavailable",
      "Storybook targets are not available in this slice.",
      { storyId }
    );
  }

  if (!url) {
    throw new CliUsageError("missing-url", "A URL target is required for this command in this milestone slice.");
  }

  return url;
}

function parsePlatform(target: string | undefined): Platform {
  const parsed = platformSchema.safeParse(target);
  if (!parsed.success) {
    throw new CliUsageError("validation-error", `Driver target "${target ?? ""}" is unsupported.`, {
      field: "target",
      value: target ?? null,
      supportedTargets: [...platformSchema.options]
    });
  }

  return parsed.data;
}

function resolveDriveSession(options: {
  session?: string;
  target?: string;
  ephemeral?: boolean;
}): { sessionId?: string; target?: Platform; ephemeral: boolean } {
  if (options.ephemeral && options.session) {
    throw new CliUsageError(
      "ephemeral-session-conflict",
      "Use either --session or --ephemeral, not both.",
      {
        session: options.session
      }
    );
  }

  if (options.ephemeral) {
    if (!options.target) {
      throw new CliUsageError("missing-target", "A driver target is required when --ephemeral is present.");
    }

    return {
      ephemeral: true,
      target: parsePlatform(options.target)
    };
  }

  if (!options.session) {
    throw new CliUsageError("missing-session", "A session id is required unless --ephemeral is present.");
  }

  return {
    ephemeral: false,
    sessionId: options.session
  };
}

function resolveRunAxeSelection(options: {
  criterion?: string;
  level?: string;
  rule?: string[];
}): { kind: "criterion"; criterion: string } | { kind: "level"; level: string } | { kind: "rule"; ruleIds: string[] } {
  const selectors = [options.criterion ? 1 : 0, options.level ? 1 : 0, options.rule && options.rule.length > 0 ? 1 : 0].reduce(
    (sum, value) => sum + value,
    0
  );

  if (selectors !== 1) {
    throw new CliUsageError("invalid-selection", "Choose exactly one of --criterion, --level, or --rule.");
  }

  if (options.criterion) {
    return {
      kind: "criterion",
      criterion: options.criterion
    };
  }

  if (options.level) {
    return {
      kind: "level",
      level: options.level
    };
  }

  const ruleIds = options.rule ?? [];
  return {
    kind: "rule",
    ruleIds
  };
}

function renderWcagLevelsText(envelope: CliOutputEnvelope, options: { verbose: boolean }): string {
  void options;
  const result = envelope.result as { version: string; levels: string[] };
  return [`WCAG ${result.version}`, `Levels: ${result.levels.join(", ")}`].join("\n");
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function renderCriteriaText(envelope: CliOutputEnvelope, options: { verbose: boolean }): string {
  void options;
  const result = envelope.result as { version: string; level: string; criteria: Array<{ id: string; title: string }> };
  const lines = [`WCAG ${result.version} ${result.level}`, ""];

  for (const criterion of result.criteria) {
    lines.push(`${criterion.id}  ${criterion.title}`);
  }

  return lines.join("\n");
}

function renderShowCriterionText(envelope: CliOutputEnvelope, options: { verbose: boolean }): string {
  const result = envelope.result as {
    criterion: {
      id: string;
      slug?: string;
      title: string;
      level: string;
      wcagVersion?: string;
      summary: string;
      normativeText: string;
      understandingUrl: string;
      tags?: string[];
    };
  };

  const lines = [
    `${result.criterion.id}  ${result.criterion.title} [${result.criterion.level}]`,
    "",
    result.criterion.summary,
    "",
    `Normative text: ${stripHtml(result.criterion.normativeText)}`,
    `Understanding: ${result.criterion.understandingUrl}`
  ];

  if (options.verbose) {
    lines.push(
      `Slug: ${result.criterion.slug ?? "none"}`,
      `WCAG version: ${result.criterion.wcagVersion ?? "unknown"}`,
      `Tags: ${result.criterion.tags?.join(", ") || "none"}`
    );
  }

  return lines.join("\n");
}

function renderSearchText(envelope: CliOutputEnvelope, options: { verbose: boolean }): string {
  const result = envelope.result as {
    query: string;
    results: Array<{ criterionId: string; title: string; level: string; score: number; matches?: Array<{ field: string; snippet: string }> }>;
  };
  const lines = [`Search: ${result.query}`, ""];

  for (const entry of result.results) {
    lines.push(`${entry.criterionId}  ${entry.title} [${entry.level}] score=${entry.score}`);
    if (options.verbose && entry.matches && entry.matches.length > 0) {
      for (const match of entry.matches) {
        lines.push(`  ${match.field}: ${match.snippet}`);
      }
    }
  }

  return lines.join("\n");
}

function renderCoverageText(envelope: CliOutputEnvelope, options: { verbose: boolean }): string {
  const result = envelope.result as {
    criterion: { id: string; title: string };
    coverage: { coverageState: string; axeRuleIds: string[]; actRuleIds: string[] };
    strategy: { preferredEvidenceMode: string; procedureIds: string[]; notes?: string[] };
  };

  const lines = [
    `${result.criterion.id}  ${result.criterion.title}`,
    `Coverage: ${result.coverage.coverageState}`,
    `axe: ${result.coverage.axeRuleIds.join(", ") || "none"}`,
    `ACT: ${result.coverage.actRuleIds.join(", ") || "none"}`,
    `Strategy: ${result.strategy.preferredEvidenceMode} (${result.strategy.procedureIds.join(", ")})`
  ];

  if (options.verbose) {
    lines.push(`Strategy notes: ${result.strategy.notes?.join(" | ") || "none"}`);
  }

  return lines.join("\n");
}

function renderApplicableText(envelope: CliOutputEnvelope, options: { verbose: boolean }): string {
  const result = envelope.result as {
    target: { value: string };
    matrix: { assessments: Record<string, { state: string; reasons: string[] }> };
  };
  const lines = [`Applicable criteria for ${result.target.value}`, ""];

  for (const [criterionId, assessment] of Object.entries(result.matrix.assessments)) {
    lines.push(`${criterionId}  ${assessment.state}`);
    if (assessment.reasons[0]) {
      lines.push(`  ${assessment.reasons[0]}`);
    }
    if (options.verbose && assessment.reasons.length > 1) {
      for (const reason of assessment.reasons.slice(1)) {
        lines.push(`  ${reason}`);
      }
    }
  }

  return lines.join("\n");
}

function renderCriterionApplicabilityText(envelope: CliOutputEnvelope, options: { verbose: boolean }): string {
  const result = envelope.result as {
    criterion: { id: string; title: string };
    assessment: { state: string; reasons: string[] };
    signals: Array<{ category: string; value: string }>;
  };

  const lines = [
    `${result.criterion.id}  ${result.criterion.title}`,
    `State: ${result.assessment.state}`,
    `Signals: ${result.signals.map((signal) => `${signal.category}=${signal.value}`).join("; ") || "none"}`,
    `Reason: ${result.assessment.reasons[0] ?? "none"}`
  ];

  if (options.verbose && result.assessment.reasons.length > 1) {
    lines.push(`More reasons: ${result.assessment.reasons.slice(1).join(" | ")}`);
  }

  return lines.join("\n");
}

function renderDriveSessionText(envelope: CliOutputEnvelope, options: { verbose: boolean }): string {
  void options;
  const result = envelope.result as {
    session: { sessionId: string; target: string; startedAt: string; brokerPid: number; socketPath: string };
  };

  return [
    `Session: ${result.session.sessionId}`,
    `Target: ${result.session.target}`,
    `Started: ${result.session.startedAt}`,
    `Broker PID: ${result.session.brokerPid}`,
    `Socket: ${result.session.socketPath}`
  ].join("\n");
}

function renderDriveStatusText(envelope: CliOutputEnvelope, options: { verbose: boolean }): string {
  const result = envelope.result as {
    action: string;
    session: { sessionId: string; target: string };
    state: { lastSpokenPhrase: string | null; currentItemText: string | null; logCursor: number; checkpoints?: Array<{ label: string }> };
  };

  const lines = [
    `Action: ${result.action}`,
    `Session: ${result.session.sessionId}`,
    `Target: ${result.session.target}`,
    `Last spoken phrase: ${result.state.lastSpokenPhrase ?? "none"}`,
    `Current item text: ${result.state.currentItemText ?? "none"}`,
    `Log cursor: ${result.state.logCursor}`
  ];

  if (options.verbose) {
    lines.push(`Checkpoints: ${result.state.checkpoints?.map((entry) => entry.label).join(", ") || "none"}`);
  }

  return lines.join("\n");
}

function renderDriveLogsText(envelope: CliOutputEnvelope, options: { verbose: boolean }): string {
  const result = envelope.result as {
    action: string;
    session: { sessionId: string; target: string };
    state: { spokenPhraseLog: string[]; itemTextLog: string[]; logCursor: number; checkpoints?: Array<{ label: string }> };
  };

  const lines = [
    `Action: ${result.action}`,
    `Session: ${result.session.sessionId}`,
    `Target: ${result.session.target}`,
    `Spoken phrases: ${result.state.spokenPhraseLog.join(" | ") || "none"}`,
    `Item text: ${result.state.itemTextLog.join(" | ") || "none"}`,
    `Log cursor: ${result.state.logCursor}`
  ];

  if (options.verbose) {
    lines.push(`Checkpoints: ${result.state.checkpoints?.map((entry) => entry.label).join(", ") || "none"}`);
  }

  return lines.join("\n");
}

function renderRunAxeText(envelope: CliOutputEnvelope, options: { verbose: boolean }): string {
  const result = envelope.result as {
    url: string;
    selection: { kind: string; criterion?: string; level?: string; ruleIds?: string[] };
    ruleIds: string[];
    violations: Array<{ id: string; impact: string | null }>;
    passes: Array<{ id: string }>;
    incomplete: Array<{ id: string }>;
  };

  const selector =
    result.selection.kind === "criterion"
      ? `criterion=${result.selection.criterion}`
      : result.selection.kind === "level"
        ? `level=${result.selection.level}`
        : `rules=${result.selection.ruleIds?.join(",")}`;

  const lines = [
    `Selection: ${selector}`,
    `Violations: ${result.violations.map((entry) => `${entry.id}${entry.impact ? ` (${entry.impact})` : ""}`).join(", ") || "none"}`,
    `Passes: ${result.passes.map((entry) => entry.id).join(", ") || "none"}`,
    `Incomplete: ${result.incomplete.map((entry) => entry.id).join(", ") || "none"}`
  ];

  if (options.verbose) {
    lines.push(`URL: ${result.url}`, `Rule ids: ${result.ruleIds.join(", ") || "none"}`);
  }

  return lines.join("\n");
}

function renderPatternText(envelope: CliOutputEnvelope, options: { verbose: boolean }): string {
  const result = envelope.result as InteractionPatternResult;
  const lines = [
    `Pattern: ${result.patternId}`,
    `Session: ${result.sessionId}${result.managedSession ? " (managed)" : " (reused)"}`,
    `Assertions: ${result.assertions.map((entry) => `${entry.id}=${entry.status}`).join(", ") || "none"}`,
    `Spoken phrases: ${result.spokenPhraseLog.join(" | ") || "none"}`,
    `Item text: ${result.itemTextLog.join(" | ") || "none"}`
  ];

  if (options.verbose) {
    lines.push(
      `Steps: ${result.stepLog.map((entry) => entry.id).join(", ") || "none"}`,
      `Browser evidence: ${result.browserEvidence.map((entry) => entry.kind).join(", ") || "none"}`
    );
  }

  if (!envelope.ok) {
    lines.push(`Errors: ${envelope.errors.map((entry) => entry.code).join(", ") || "none"}`);
  }

  return lines.join("\n");
}

function renderVerificationText(envelope: CliOutputEnvelope, options: { verbose: boolean }): string {
  const result = envelope.result as {
    requestedScope: { kind: string; criterion?: string; level?: string };
    wcagVersion: string;
    criteria: Array<{
      criterionId: string;
      criterion: { title: string };
      verdict: string;
      evidenceMode: string;
      procedureIds: string[];
      notes: string[];
      uncoveredWork: Array<{ kind?: string; message: string }>;
      evidence: Array<{ kind: string }>;
    }>;
    summary: {
      totalCriteria: number;
      failedCount: number;
      verdicts: Record<string, number>;
      evidenceModes: Record<string, number>;
    };
  };
  const scopeLabel =
    result.requestedScope.kind === "criterion"
      ? `criterion=${result.requestedScope.criterion}`
      : result.requestedScope.kind === "level"
        ? `level=${result.requestedScope.level}`
        : result.requestedScope.kind;

  if (result.requestedScope.kind === "level") {
    const manualOnlyIds = result.criteria
      .filter((row) => row.uncoveredWork.some((entry) => entry.kind === "manual-only"))
      .map((row) => row.criterionId);
    const uncoveredIds = result.criteria
      .filter((row) => row.uncoveredWork.some((entry) => entry.kind !== "manual-only"))
      .map((row) => row.criterionId);
    const lines = [
      `Scope: ${scopeLabel}`,
      `WCAG: ${result.wcagVersion}`,
      `Summary: total=${result.summary.totalCriteria} failed=${result.summary.failedCount}`,
      `Verdicts: pass=${result.summary.verdicts.pass}, fail=${result.summary.verdicts.fail}, needs-manual-review=${result.summary.verdicts["needs-manual-review"]}, not-applicable=${result.summary.verdicts["not-applicable"]}, not-covered=${result.summary.verdicts["not-covered"]}, error=${result.summary.verdicts.error}`,
      `Evidence modes: automated=${result.summary.evidenceModes.automated}, hybrid=${result.summary.evidenceModes.hybrid}, manual=${result.summary.evidenceModes.manual}, unknown=${result.summary.evidenceModes.unknown}`,
      `Manual-only criteria: ${manualOnlyIds.join(", ") || "none"}`,
      `Uncovered criteria: ${uncoveredIds.join(", ") || "none"}`,
      "Rows:",
      ...result.criteria.map(
        (row) => `${row.criterionId} ${row.verdict} [${row.evidenceMode}] procedures=${row.procedureIds.join(",") || "none"}`
      )
    ];

    if (options.verbose) {
      const uncoveredDetails = result.criteria
        .filter((row) => row.uncoveredWork.length > 0)
        .map((row) => `${row.criterionId}: ${row.uncoveredWork.map((entry) => entry.message).join(" | ")}`);
      lines.push(`Warnings: ${envelope.warnings.map((entry) => entry.code).join(", ") || "none"}`);
      if (uncoveredDetails.length > 0) {
        lines.push("Uncovered work:", ...uncoveredDetails);
      }
    } else if (!envelope.ok) {
      lines.push(`Warnings: ${envelope.warnings.map((entry) => entry.code).join(", ") || "none"}`);
    }

    return lines.join("\n");
  }

  const row = result.criteria[0];

  if (!row) {
    return `Scope: ${result.requestedScope.kind}\nWCAG: ${result.wcagVersion}\nNo criteria were returned.`;
  }

  const lines = [
    `Scope: ${scopeLabel}`,
    `WCAG: ${result.wcagVersion}`,
    `${row.criterionId}  ${row.criterion.title}`,
    `Verdict: ${row.verdict} [${row.evidenceMode}]`,
    `Procedures: ${row.procedureIds.join(", ") || "none"}`,
    `Evidence: ${row.evidence.map((entry) => entry.kind).join(", ") || "none"}`
  ];

  if (row.uncoveredWork.length > 0) {
    lines.push(`Uncovered work: ${row.uncoveredWork.map((entry) => entry.message).join(" | ")}`);
  }

  if (options.verbose) {
    lines.push(`Notes: ${row.notes.join(" | ") || "none"}`, `Failed rows: ${result.summary.failedCount}`);
  }

  if (!envelope.ok) {
    lines.push(`Warnings: ${envelope.warnings.map((entry) => entry.code).join(", ") || "none"}`);
  }

  return lines.join("\n");
}

export function buildCli(): Command {
  const program = new Command();

  program
    .name("a11lied")
    .description("CLI-first accessibility automation for VoiceOver, NVDA, Storybook, and MCP.")
    .version(cliVersion)
    .enablePositionalOptions()
    .configureHelp({
      sortOptions: false,
      sortSubcommands: false
    });

  const wcagCommand = program.command("wcag").description("Look up pinned WCAG requirements and coverage data.");

  addVerboseOption(addJsonOption(addWcagVersionOption(wcagCommand.command("levels").description("List the available conformance levels.")))).action(
    async (options: { json?: boolean; verbose?: boolean; version: string }) => {
      await executeCommand(
        { family: "wcag", subcommand: "levels", wcagVersion: options.version, json: options.json, verbose: options.verbose },
        () => ({
          result: listWcagLevels(options.version)
        }),
        renderWcagLevelsText
      );
    }
  );

  addVerboseOption(addJsonOption(
    addWcagVersionOption(
      wcagCommand
        .command("criteria")
        .description("List criteria for a specific conformance level.")
        .requiredOption("--level <level>", "Filter criteria to one WCAG level: A, AA, or AAA.")
    )
  )).action(async (options: { json?: boolean; verbose?: boolean; version: string; level: string }) => {
    await executeCommand(
      { family: "wcag", subcommand: "criteria", wcagVersion: options.version, json: options.json, verbose: options.verbose },
      () => ({
        result: listWcagCriteria(options.level, options.version)
      }),
      renderCriteriaText
    );
  });

  addVerboseOption(addJsonOption(addWcagVersionOption(wcagCommand.command("show <criterion>").description("Show one criterion by id or slug.")))).action(
    async (criterion: string, options: { json?: boolean; verbose?: boolean; version: string }) => {
      await executeCommand(
        { family: "wcag", subcommand: "show", wcagVersion: options.version, json: options.json, verbose: options.verbose },
        () => ({
          result: showWcagCriterion(criterion, options.version)
        }),
        renderShowCriterionText
      );
    }
  );

  addVerboseOption(addJsonOption(
    addWcagVersionOption(
      wcagCommand
        .command("search <query>")
        .description("Search criterion titles, summaries, techniques, failures, and tags.")
        .option("--limit <count>", "Limit the number of returned rows.", "10")
    )
  )).action(async (query: string, options: { json?: boolean; verbose?: boolean; version: string; limit: string }) => {
    await executeCommand(
      { family: "wcag", subcommand: "search", wcagVersion: options.version, json: options.json, verbose: options.verbose },
      () => ({
        result: searchWcagCriteria(query, {
          version: options.version,
          limit: Number.parseInt(options.limit, 10)
        })
      }),
      renderSearchText
    );
  });

  addVerboseOption(addJsonOption(
    addWcagVersionOption(
      wcagCommand.command("coverage <criterion>").description("Show automation coverage and preferred strategy for one criterion.")
    )
  )).action(async (criterion: string, options: { json?: boolean; verbose?: boolean; version: string }) => {
    await executeCommand(
      { family: "wcag", subcommand: "coverage", wcagVersion: options.version, json: options.json, verbose: options.verbose },
      () => ({
        result: showWcagCoverage(criterion, options.version)
      }),
      renderCoverageText
    );
  });

  const inspectCommand = program.command("inspect").description("Explain criterion applicability for a target.");

  addVerboseOption(addJsonOption(
    addWcagVersionOption(
      inspectCommand
        .command("applicable")
        .description("List criteria that look relevant for a URL target.")
        .option("--url <url>", "Inspect a live URL target in this milestone slice.")
        .option("--story-id <storyId>", "Reserved for Storybook targets in a later milestone.")
    )
  )).action(async (options: { json?: boolean; verbose?: boolean; version: string; url?: string; storyId?: string }) => {
    await executeCommand(
      {
        family: "inspect",
        subcommand: "applicable",
        wcagVersion: options.version,
        json: options.json,
        verbose: options.verbose
      },
      async () => {
        const url = ensureUrlTarget(options.url, options.storyId);
        const result = await inspectApplicableUrl(url, options.version);
        return {
          target: {
            kind: "url",
            value: url
          },
          result
        };
      },
      renderApplicableText
    );
  });

  addVerboseOption(addJsonOption(
    addWcagVersionOption(
      inspectCommand
        .command("criterion <criterion>")
        .description("Explain one criterion for a URL target.")
        .option("--url <url>", "Inspect a live URL target in this milestone slice.")
        .option("--story-id <storyId>", "Reserved for Storybook targets in a later milestone.")
    )
  )).action(async (criterion: string, options: { json?: boolean; verbose?: boolean; version: string; url?: string; storyId?: string }) => {
    await executeCommand(
      {
        family: "inspect",
        subcommand: "criterion",
        wcagVersion: options.version,
        json: options.json,
        verbose: options.verbose
      },
      async () => {
        const url = ensureUrlTarget(options.url, options.storyId);
        const result = await inspectCriterionUrl(criterion, url, options.version);
        return {
          target: {
            kind: "url",
            value: url
          },
          result
        };
      },
      renderCriterionApplicabilityText
    );
  });

  const driveCommand = program.command("drive").description("Control a target screen reader through stable sessions.");
  addJsonOption(
    driveCommand.command("start").description("Start a persistent driver session.").requiredOption(
      "--target <platform>",
      "Choose one target: virtual, voiceover, or nvda."
    )
  ).action(async (options: { json?: boolean; target: string }) => {
    await executeCommand(
      {
        family: "drive",
        subcommand: "start",
        wcagVersion: undefined,
        json: options.json
      },
      async () => {
        const session = await startDriverSession(parsePlatform(options.target));
        return {
          target: {
            kind: "driver-target",
            value: session.target
          },
          result: {
            session
          }
        };
      },
      renderDriveSessionText
    );
  });

  addVerboseOption(addJsonOption(
    driveCommand.command("status").description("Show persisted session state and capability metadata.").requiredOption(
      "--session <id>",
      "Reuse an existing driver session."
    )
  )).action(async (options: { json?: boolean; verbose?: boolean; session: string }) => {
    await executeCommand(
      {
        family: "drive",
        subcommand: "status",
        wcagVersion: undefined,
        json: options.json,
        verbose: options.verbose
      },
      async () => {
        const result = await getDriverSessionStatus(options.session);
        return {
          target: {
            kind: "driver-session",
            value: options.session
          },
          result
        };
      },
      renderDriveStatusText
    );
  });

  addJsonOption(
    driveCommand.command("stop").description("Stop a persistent driver session and remove its state file.").requiredOption(
      "--session <id>",
      "Reuse an existing driver session."
    )
  ).action(async (options: { json?: boolean; session: string }) => {
    await executeCommand(
      {
        family: "drive",
        subcommand: "stop",
        wcagVersion: undefined,
        json: options.json
      },
      async () => {
        const result = await stopDriverSession(options.session);
        return {
          target: {
            kind: "driver-session",
            value: options.session
          },
          result
        };
      },
      renderDriveStatusText
    );
  });
  addVerboseOption(addJsonOption(addEphemeralOption(addTargetOption(addSessionOption(driveCommand.command("next").description("Move to the next item.")))))).action(
    async (options: { json?: boolean; verbose?: boolean; session?: string; target?: string; ephemeral?: boolean }) => {
      await executeDriveActionCommand("next", "next", options, undefined, renderDriveStatusText);
    }
  );
  addVerboseOption(addJsonOption(
    addEphemeralOption(addTargetOption(addSessionOption(driveCommand.command("previous").description("Move to the previous item."))))
  )).action(async (options: { json?: boolean; verbose?: boolean; session?: string; target?: string; ephemeral?: boolean }) => {
    await executeDriveActionCommand("previous", "previous", options, undefined, renderDriveStatusText);
  });
  addVerboseOption(addJsonOption(
    addEphemeralOption(
      addTargetOption(
        addSessionOption(
          driveCommand.command("key").description("Send one or more target-specific key chords.").requiredOption(
            "--keys <keys>",
            "Send keys such as VO+RightArrow or Tab."
          )
        )
      )
    )
  )).action(async (options: { json?: boolean; verbose?: boolean; session?: string; target?: string; ephemeral?: boolean; keys: string }) => {
    await executeDriveActionCommand("key", "key", options, { keys: options.keys }, renderDriveStatusText);
  });
  addVerboseOption(addJsonOption(
    addEphemeralOption(
      addTargetOption(
        addSessionOption(
          driveCommand.command("type").description("Type text through the active driver target.").requiredOption(
            "--text <text>",
            "Text to type into the target."
          )
        )
      )
    )
  )).action(async (options: { json?: boolean; verbose?: boolean; session?: string; target?: string; ephemeral?: boolean; text: string }) => {
    await executeDriveActionCommand("type", "type", options, { text: options.text }, renderDriveStatusText);
  });
  addVerboseOption(addJsonOption(addEphemeralOption(addTargetOption(addSessionOption(driveCommand.command("interact").description("Enter interaction mode.")))))).action(
    async (options: { json?: boolean; verbose?: boolean; session?: string; target?: string; ephemeral?: boolean }) => {
      await executeDriveActionCommand("interact", "interact", options, undefined, renderDriveStatusText);
    }
  );
  addVerboseOption(addJsonOption(
    addEphemeralOption(addTargetOption(addSessionOption(driveCommand.command("stop-interacting").description("Leave interaction mode."))))
  )).action(async (options: { json?: boolean; verbose?: boolean; session?: string; target?: string; ephemeral?: boolean }) => {
    await executeDriveActionCommand("stop-interacting", "stop-interacting", options, undefined, renderDriveStatusText);
  });
  addVerboseOption(addJsonOption(
    addEphemeralOption(addTargetOption(addSessionOption(driveCommand.command("click-current-item").description("Activate the current item."))))
  )).action(async (options: { json?: boolean; verbose?: boolean; session?: string; target?: string; ephemeral?: boolean }) => {
    await executeDriveActionCommand("click-current-item", "click-current-item", options, undefined, renderDriveStatusText);
  });
  addVerboseOption(addJsonOption(addEphemeralOption(addTargetOption(addSessionOption(driveCommand.command("read").description("Read the current driver state.")))))).action(
    async (options: { json?: boolean; verbose?: boolean; session?: string; target?: string; ephemeral?: boolean }) => {
      await executeDriveActionCommand("read", "read", options, undefined, renderDriveStatusText);
    }
  );
  addVerboseOption(addJsonOption(
    addEphemeralOption(addTargetOption(addSessionOption(driveCommand.command("logs").description("Read captured speech and action logs."))))
  )).action(async (options: { json?: boolean; verbose?: boolean; session?: string; target?: string; ephemeral?: boolean }) => {
    await executeDriveActionCommand("logs", "logs", options, undefined, renderDriveLogsText);
  });
  addVerboseOption(addJsonOption(
    driveCommand.command("clear-logs").description("Clear captured speech and action logs.").requiredOption(
      "--session <id>",
      "Reuse an existing driver session."
    )
  )).action(async (options: { json?: boolean; verbose?: boolean; session: string }) => {
    await executeDriveActionCommand("clear-logs", "clear-logs", options, undefined, renderDriveLogsText);
  });
  addVerboseOption(addJsonOption(
    addEphemeralOption(
      addTargetOption(
        addSessionOption(
          driveCommand.command("checkpoint").description("Record a named checkpoint in the current session.").requiredOption(
            "--label <label>",
            "Attach a label to this checkpoint."
          )
        )
      )
    )
  )).action(async (options: { json?: boolean; verbose?: boolean; session?: string; target?: string; ephemeral?: boolean; label: string }) => {
    await executeDriveActionCommand("checkpoint", "checkpoint", options, { label: options.label }, renderDriveStatusText);
  });

  program
    .command("doctor")
    .description("Report runtime details and supported automation targets.")
    .option("--json", "Print JSON instead of human-readable text.")
    .action((options: { json?: boolean }) => {
      const report = createDoctorReport();
      const output = options.json ? JSON.stringify(report, null, 2) : renderDoctorText(report);
      log.message(output);
    });

  program
    .command("catalog")
    .description("List the planned command surface for the CLI.")
    .action(() => {
      intro("a11lied command catalog");
      for (const command of listCliCommands()) {
        log.message(`${command.name}: ${command.summary} [${command.maturity}]`);
      }
      outro("Catalog complete.");
    });

  const runCommand = program
    .command("run")
    .description("Execute automated rule scans and named interaction patterns.")
    .configureHelp({
      sortOptions: false,
      sortSubcommands: false
    });

  addVerboseOption(addJsonOption(
    addWcagVersionOption(
      runCommand
        .command("axe")
        .description("Run axe-core against a URL target.")
        .option("--url <url>", "Run against one live URL target.")
        .option("--story-id <storyId>", "Reserved for Storybook targets in a later milestone.")
        .option("--level <level>", "Limit the run to one WCAG level.")
        .option("--criterion <criterion>", "Limit the run to one WCAG criterion id or slug.")
        .option("--rule <ruleId...>", "Limit the run to one or more explicit axe rule ids.")
    )
  )).action(
    async (options: {
      json?: boolean;
      verbose?: boolean;
      version: string;
      url?: string;
      storyId?: string;
      level?: string;
      criterion?: string;
      rule?: string[];
    }) => {
      await executeCommand(
        {
          family: "run",
          subcommand: "axe",
          wcagVersion: options.version,
          json: options.json,
          verbose: options.verbose
        },
        async () => {
          const url = ensureRunAxeTarget(options.url, options.storyId);
          const selection = resolveRunAxeSelection(options);
          const result =
            selection.kind === "criterion"
              ? await runAxe(url, {
                  url,
                  wcagVersion: options.version,
                  criterion: selection.criterion
                })
              : selection.kind === "level"
                ? await runAxe(url, {
                    url,
                    wcagVersion: options.version,
                    level: selection.level
                  })
                : await runAxe(url, {
                    url,
                    wcagVersion: options.version,
                    ruleIds: selection.ruleIds
                  });

          return {
            target: {
              kind: "url",
              value: url
            },
            result
          };
        },
        renderRunAxeText
      );
    }
  );
  addVerboseOption(addJsonOption(
    addTargetOption(
      addSessionOption(
        runCommand
          .command("pattern <patternId>")
          .description("Run a named built-in interaction pattern.")
          .requiredOption("--url <url>", "Run the pattern against one live URL target.")
      )
    )
  )).action(async (patternId: string, options: { json?: boolean; verbose?: boolean; url: string; target?: string; session?: string }) => {
    await executeCommand(
      {
        family: "run",
        subcommand: "pattern",
        wcagVersion: undefined,
        json: options.json,
        verbose: options.verbose
      },
      async () => {
        const parsedTarget = options.target ? parsePlatform(options.target) : undefined;
        const result = await runInteractionPattern({
          patternId,
          url: options.url,
          ...(parsedTarget ? { target: parsedTarget } : {}),
          ...(options.session ? { sessionId: options.session } : {})
        });

        return {
          ok: !result.assertions.some((entry) => entry.status === "failed"),
          exitCode: result.assertions.some((entry) => entry.status === "failed") ? cliExitCodes.assertion : cliExitCodes.success,
          errors: result.assertions.some((entry) => entry.status === "failed")
            ? [
                {
                  code: "pattern-assertion-failed",
                  message: "One or more pattern assertions failed.",
                  details: {
                    failedAssertionIds: result.assertions.filter((entry) => entry.status === "failed").map((entry) => entry.id)
                  }
                }
              ]
            : [],
          target: {
            kind: options.session ? "driver-session" : "driver-target",
            value: options.session ?? result.target
          },
          result
        };
      },
      renderPatternText
    );
  });

  const verifyCommand = program
    .command("verify")
    .description("Turn collected evidence into explicit WCAG verification results.")
    .configureHelp({
      sortOptions: false,
      sortSubcommands: false
    });

  addVerboseOption(addJsonOption(
    addTargetOption(
      addWcagVersionOption(
        verifyCommand
          .command("criterion <criterion>")
          .description("Verify one WCAG criterion for a live URL target.")
          .requiredOption("--url <url>", "Run the verification against one live URL target.")
      )
    )
  )).action(
    async (criterion: string, options: { json?: boolean; verbose?: boolean; version: string; target?: string; url: string }) => {
      await executeCommand(
        {
          family: "verify",
          subcommand: "criterion",
          wcagVersion: options.version,
          json: options.json,
          verbose: options.verbose
        },
        async () => {
          if (!options.target) {
            throw new CliUsageError("validation-error", "Choose one target: virtual, voiceover, or nvda.", {
              field: "target",
              value: options.target
            });
          }

          const result = await verifyCriterion({
            criterion,
            url: options.url,
            target: options.target,
            wcagVersion: options.version
          });
          const row = result.criteria[0];
          const verdict = row?.verdict ?? "error";
          const ok = verdict === "pass" || verdict === "not-applicable";

          return {
            ok,
            exitCode: ok ? cliExitCodes.success : cliExitCodes.assertion,
            warnings: result.warnings,
            errors: ok
              ? []
              : [
                  {
                    code: "verification-verdict",
                    message: `Criterion ${row?.criterionId ?? criterion} reported verdict "${verdict}".`,
                    details: {
                      criterionId: row?.criterionId ?? criterion,
                      verdict
                    }
                  }
                ],
            target: result.target,
            result
          };
        },
        renderVerificationText
      );
    }
  );

  addVerboseOption(addJsonOption(
    addTargetOption(
      addWcagVersionOption(
        verifyCommand
          .command("level <level>")
          .description("Verify a WCAG conformance level against a live URL target.")
          .requiredOption("--url <url>", "Run the verification against one live URL target.")
      )
    )
  )).action(
    async (level: string, options: { json?: boolean; verbose?: boolean; version: string; target?: string; url: string }) => {
      await executeCommand(
        {
          family: "verify",
          subcommand: "level",
          wcagVersion: options.version,
          json: options.json,
          verbose: options.verbose
        },
        async () => {
          if (!options.target) {
            throw new CliUsageError("validation-error", "Choose one target: virtual, voiceover, or nvda.", {
              field: "target",
              value: options.target
            });
          }

          const result = await verifyLevel({
            level,
            url: options.url,
            target: options.target,
            wcagVersion: options.version
          });
          const ok = result.summary.failedCount === 0;

          return {
            ok,
            exitCode: ok ? cliExitCodes.success : cliExitCodes.assertion,
            warnings: result.warnings,
            errors: ok
              ? []
              : [
                  {
                    code: "verification-level-summary",
                    message: `Level ${level} reported ${result.summary.failedCount} non-passing criterion verdict(s).`,
                    details: {
                      level,
                      failedCount: result.summary.failedCount
                    }
                  }
                ],
            target: result.target,
            result
          };
        },
        renderVerificationText
      );
    }
  );

  program
    .command("story")
    .description("Run a Storybook scenario against a local dev server.")
    .action(() => {
      notReady("story");
    });

  program
    .command("mcp")
    .description("Start the MCP stdio server.")
    .action(async () => {
      await startMcpServer();
    });

  return program;
}
