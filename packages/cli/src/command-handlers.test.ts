import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildCli } from "./program.js";

const fixtureRoot = resolve(import.meta.dirname, "../test/fixtures");

let baseUrl = "";
let server: ReturnType<typeof createServer>;
const tempRoots: string[] = [];

async function runCli(args: string[]) {
  const output: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((value?: unknown) => {
    output.push(String(value ?? ""));
  });
  const previousExitCode = process.exitCode;
  process.exitCode = 0;

  try {
    await buildCli().parseAsync(args, { from: "user" });
    return {
      status: process.exitCode ?? 0,
      stdout: output.join("\n")
    };
  } finally {
    process.exitCode = previousExitCode;
    logSpy.mockRestore();
  }
}

function parseJsonOutput(stdout: string) {
  return JSON.parse(stdout) as Record<string, unknown>;
}

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "a11lied-cli-"));
  tempRoots.push(root);
  return root;
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const filePath = resolve(fixtureRoot, `.${requestUrl.pathname}`);

    try {
      const html = readFileSync(filePath, "utf8");
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(html);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
    }
  });

  await new Promise<void>((resolveServer) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("expected an address object");
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolveServer();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolveServer, rejectServer) => {
    server.close((error) => {
      if (error) {
        rejectServer(error);
        return;
      }
      resolveServer();
    });
  });
});

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

describe("cli wcag and inspect commands", () => {
  it("implements the wcag JSON scenarios from the feature file", async () => {
    const levels = parseJsonOutput((await runCli(["wcag", "levels", "--json"])).stdout);
    expect(levels.ok).toBe(true);
    expect((levels.command as { wcagVersion?: string }).wcagVersion).toBe("2.2");
    expect((levels.result as { levels: string[] }).levels).toEqual(["A", "AA", "AAA"]);

    const criteria = parseJsonOutput((await runCli(["wcag", "criteria", "--level", "AA", "--version", "2.1", "--json"])).stdout);
    expect(criteria.ok).toBe(true);
    expect(
      (criteria.result as { criteria: Array<{ wcagVersion: string; level: string }> }).criteria.every(
        (entry) => entry.wcagVersion === "2.1" && entry.level === "AA"
      )
    ).toBe(true);

    const show = parseJsonOutput((await runCli(["wcag", "show", "status-messages", "--json"])).stdout);
    expect(show.ok).toBe(true);
    expect((show.result as { criterion: { id: string; normativeText: string; understandingUrl: string } }).criterion.id).toBe(
      "4.1.3"
    );
    expect(
      (show.result as { criterion: { normativeText: string; understandingUrl: string } }).criterion.normativeText
    ).toBeTruthy();
    expect(
      (show.result as { criterion: { normativeText: string; understandingUrl: string } }).criterion.understandingUrl
    ).toBeTruthy();

    const search = parseJsonOutput((await runCli(["wcag", "search", "status message", "--json"])).stdout);
    expect(search.ok).toBe(true);
    expect(
      (search.result as { results: Array<{ criterionId: string; matches: unknown[] }> }).results.some(
        (entry) => entry.criterionId === "4.1.3" && entry.matches.length > 0
      )
    ).toBe(true);

    const coverage = parseJsonOutput((await runCli(["wcag", "coverage", "4.1.3", "--json"])).stdout);
    expect(coverage.ok).toBe(true);
    expect((coverage.result as { coverage: { coverageState: string; axeRuleIds: string[]; actRuleIds: string[] } }).coverage).toMatchObject({
      coverageState: expect.any(String),
      axeRuleIds: expect.any(Array),
      actRuleIds: expect.any(Array)
    });
    expect((coverage.result as { strategy: { preferredEvidenceMode: string } }).strategy.preferredEvidenceMode).toBeTruthy();

    const invalidVersion = await runCli(["wcag", "criteria", "--level", "AA", "--version", "2.0", "--json"]);
    const invalidVersionJson = parseJsonOutput(invalidVersion.stdout);
    expect(invalidVersion.status).toBe(2);
    expect(invalidVersionJson.ok).toBe(false);
    expect((invalidVersionJson.errors as Array<{ message: string }>)[0]?.message).toMatch(/2.0.*unsupported/i);
  });

  it("implements the inspect JSON scenarios from the feature file", async () => {
    const applicable = await runCli(["inspect", "applicable", "--url", `${baseUrl}/status-message.html`, "--json"]);
    const applicableJson = parseJsonOutput(applicable.stdout);
    expect(applicable.status).toBe(0);
    expect(
      (
        applicableJson.result as {
          matrix: { assessments: Record<string, { state: string; reasons: string[] }> };
        }
      ).matrix.assessments["4.1.3"]?.state
    ).toBe("applicable");
    expect(
      (
        applicableJson.result as {
          matrix: { assessments: Record<string, { state: string; reasons: string[] }> };
        }
      ).matrix.assessments["4.1.3"]?.reasons.length
    ).toBeGreaterThan(0);

    const criterion = await runCli(["inspect", "criterion", "4.1.3", "--url", `${baseUrl}/status-message.html`, "--json"]);
    const criterionJson = parseJsonOutput(criterion.stdout);
    expect(criterion.status).toBe(0);
    expect((criterionJson.result as { criterion: { id: string } }).criterion.id).toBe("4.1.3");
    expect((criterionJson.result as { assessment: { state: string } }).assessment.state).toBeTruthy();
    expect((criterionJson.result as { signals: unknown[] }).signals.length).toBeGreaterThan(0);

    const storybook = await runCli(["inspect", "applicable", "--story-id", "forms-login--default", "--json"]);
    const storybookJson = parseJsonOutput(storybook.stdout);
    expect(storybook.status).toBe(2);
    expect((storybookJson.errors as Array<{ message: string }>)[0]?.message).toMatch(/storybook targets are not available/i);

    const invalidCriterion = await runCli(["inspect", "criterion", "9.9.9", "--url", `${baseUrl}/basic-page.html`, "--json"]);
    const invalidCriterionJson = parseJsonOutput(invalidCriterion.stdout);
    expect(invalidCriterion.status).toBe(2);
    expect((invalidCriterionJson.errors as Array<{ message: string }>)[0]?.message).toMatch(/9.9.9/i);
  });

  it("keeps representative text output snapshots readable", async () => {
    const show = await runCli(["wcag", "show", "status-messages"]);
    expect(show.stdout).toMatchInlineSnapshot(`
      "4.1.3  Status Messages [AA]
      
      In content implemented using markup languages, status messages can be programmatically determined through role or properties such that they can be presented to the user by assistive technologies without receiving focus.
      
      Normative text: In content implemented using markup languages, status messages can be programmatically determined through role or properties such that they can be presented to the user by assistive technologies without receiving focus.
      Understanding: https://www.w3.org/WAI/WCAG22/Understanding/status-messages"
    `);

    const search = await runCli(["wcag", "search", "status message"]);
    const searchExcerpt = search.stdout.split("\n").slice(0, 3).join("\n");
    expect(searchExcerpt).toMatchInlineSnapshot(`
      "Search: status message
      
      4.1.3  Status Messages [AA] score=35.5"
    `);

    const criterion = await runCli(["inspect", "criterion", "4.1.3", "--url", `${baseUrl}/status-message.html`]);
    expect(criterion.stdout).toMatchInlineSnapshot(`
      "4.1.3  Status Messages
      State: applicable
      Signals: landmark=landmark structure; heading=heading structure; form=form controls; live-region=aria-live region; live-region=role=status
      Reason: Detected live region signals (aria-live region and role=status) and matching criterion tags (messaging, errors, forms, progress-steps, visual-cues, and content)."
    `);

    const verboseShow = await runCli(["wcag", "show", "status-messages", "--verbose"]);
    expect(verboseShow.stdout).toContain("Slug: status-messages");

    const verboseCriterion = await runCli(["inspect", "criterion", "4.1.3", "--url", `${baseUrl}/status-message.html`, "--verbose"]);
    expect(verboseCriterion.stdout).toContain("Signals:");
  });
});

describe("cli run axe commands", () => {
  it("implements the run-axe scenarios from the feature file", async () => {
    const criterion = await runCli([
      "run",
      "axe",
      "--url",
      `${baseUrl}/button-name-failure.html`,
      "--criterion",
      "4.1.2",
      "--json"
    ]);
    const criterionJson = parseJsonOutput(criterion.stdout);
    expect(criterion.status).toBe(0);
    expect((criterionJson.result as { violations: unknown[] }).violations.length).toBeGreaterThan(0);
    expect(
      (criterionJson.result as { violations: Array<{ id: string; helpUrl: string; nodes: Array<{ target: string[] }> }> }).violations.every(
        (entry) => Boolean(entry.helpUrl) && (entry.nodes[0]?.target.length ?? 0) > 0
      )
    ).toBe(true);

    const level = await runCli(["run", "axe", "--url", `${baseUrl}/contrast-failure.html`, "--level", "AA", "--json"]);
    const levelJson = parseJsonOutput(level.stdout);
    expect(level.status).toBe(0);
    expect(
      (levelJson.result as { violations: Array<{ id: string }> }).violations.some((entry) => entry.id === "color-contrast")
    ).toBe(true);
    expect(Array.isArray((levelJson.result as { passes: unknown[] }).passes)).toBe(true);
    expect(Array.isArray((levelJson.result as { incomplete: unknown[] }).incomplete)).toBe(true);

    const rule = await runCli(["run", "axe", "--url", `${baseUrl}/basic-page.html`, "--rule", "color-contrast", "--json"]);
    const ruleJson = parseJsonOutput(rule.stdout);
    const seenRuleIds = [
      ...(ruleJson.result as { violations: Array<{ id: string }> }).violations.map((entry) => entry.id),
      ...(ruleJson.result as { passes: Array<{ id: string }> }).passes.map((entry) => entry.id),
      ...(ruleJson.result as { incomplete: Array<{ id: string }> }).incomplete.map((entry) => entry.id),
      ...(ruleJson.result as { inapplicable: Array<{ id: string }> }).inapplicable.map((entry) => entry.id)
    ];
    expect(rule.status).toBe(0);
    expect(new Set(seenRuleIds)).toEqual(new Set(["color-contrast"]));

    const storybook = await runCli(["run", "axe", "--story-id", "forms-login--default", "--criterion", "4.1.2", "--json"]);
    const storybookJson = parseJsonOutput(storybook.stdout);
    expect(storybook.status).toBe(2);
    expect((storybookJson.errors as Array<{ message: string }>)[0]?.message).toMatch(/storybook targets are not available/i);

    const incomplete = await runCli(["run", "axe", "--url", `${baseUrl}/basic-page.html`, "--rule", "frame-tested", "--json"]);
    const incompleteJson = parseJsonOutput(incomplete.stdout);
    expect(
      (incompleteJson.result as { incomplete: Array<{ id: string }> }).incomplete.some((entry) => entry.id === "frame-tested")
    ).toBe(true);
  }, 30_000);

  it("keeps representative run-axe text output readable", async () => {
    const output = await runCli(["run", "axe", "--url", `${baseUrl}/button-name-failure.html`, "--criterion", "4.1.2"]);

    expect(output.stdout).toMatchInlineSnapshot(`
      "Selection: criterion=4.1.2
      Violations: button-name (critical)
      Passes: aria-hidden-body, nested-interactive
      Incomplete: none"
    `);

    const verbose = await runCli(["run", "axe", "--url", `${baseUrl}/button-name-failure.html`, "--criterion", "4.1.2", "--verbose"]);
    expect(verbose.stdout).toContain(`URL: ${baseUrl}/button-name-failure.html`);
    expect(verbose.stdout).toContain("Rule ids:");
  }, 30_000);
});

describe("cli verify criterion commands", () => {
  it("implements the criterion-level verify scenarios from the feature file", async () => {
    const tempRoot = await createTempRoot();
    const previousCwd = process.cwd();
    process.chdir(tempRoot);

    try {
      const automated = await runCli([
        "verify",
        "criterion",
        "4.1.2",
        "--url",
        `${baseUrl}/button-name-failure.html`,
        "--target",
        "virtual",
        "--json"
      ]);
      const automatedJson = parseJsonOutput(automated.stdout);
      expect(automated.status).toBe(4);
      expect((automatedJson.result as { requestedScope: { kind: string } }).requestedScope.kind).toBe("criterion");
      expect((automatedJson.result as { wcagVersion: string }).wcagVersion).toBe("2.2");
      expect(
        (automatedJson.result as { criteria: Array<{ criterionId: string; verdict: string; evidenceMode: string; evidence: unknown[]; sourceReferences: unknown[] }> }).criteria[0]
      ).toMatchObject({
        criterionId: "4.1.2",
        verdict: "fail",
        evidenceMode: "automated"
      });
      expect((automatedJson.result as { criteria: Array<{ evidence: unknown[] }> }).criteria[0]?.evidence.length).toBeGreaterThan(0);
      expect((automatedJson.result as { criteria: Array<{ sourceReferences: unknown[] }> }).criteria[0]?.sourceReferences.length).toBeGreaterThan(0);

      const hybrid = await runCli([
        "verify",
        "criterion",
        "4.1.3",
        "--url",
        `${baseUrl}/status-message.html`,
        "--target",
        "virtual",
        "--json"
      ]);
      const hybridJson = parseJsonOutput(hybrid.stdout);
      expect(hybrid.status).toBe(0);
      expect(
        (hybridJson.result as { criteria: Array<{ criterionId: string; verdict: string; evidenceMode: string; procedureIds: string[]; evidence: Array<{ patternResult?: { spokenPhraseLog: string[] } }> }> }).criteria[0]
      ).toMatchObject({
        criterionId: "4.1.3",
        verdict: "pass",
        evidenceMode: "hybrid",
        procedureIds: ["status_message_probe"]
      });
      expect(
        (hybridJson.result as { criteria: Array<{ evidence: Array<{ patternResult?: { spokenPhraseLog: string[] } }> }> }).criteria[0]?.evidence.some((entry) =>
          entry.patternResult?.spokenPhraseLog.includes("Profile saved successfully.")
        )
      ).toBe(true);

      const manual = await runCli([
        "verify",
        "criterion",
        "3.3.8",
        "--url",
        `${baseUrl}/auth-login.html`,
        "--target",
        "virtual",
        "--json"
      ]);
      const manualJson = parseJsonOutput(manual.stdout);
      expect(manual.status).toBe(4);
      expect(
        (manualJson.result as { criteria: Array<{ criterionId: string; verdict: string; uncoveredWork: Array<{ message: string }>; evidence: unknown[] }> }).criteria[0]
      ).toMatchObject({
        criterionId: "3.3.8",
        verdict: "needs-manual-review"
      });
      expect((manualJson.result as { criteria: Array<{ evidence: unknown[] }> }).criteria[0]?.evidence.length).toBeGreaterThan(0);
      expect((manualJson.result as { criteria: Array<{ uncoveredWork: Array<{ message: string }> }> }).criteria[0]?.uncoveredWork.length).toBeGreaterThan(0);

      const invalid = await runCli([
        "verify",
        "criterion",
        "9.9.9",
        "--url",
        `${baseUrl}/basic-page.html`,
        "--target",
        "virtual",
        "--json"
      ]);
      const invalidJson = parseJsonOutput(invalid.stdout);
      expect(invalid.status).toBe(2);
      expect((invalidJson.errors as Array<{ details?: { lookupKey?: string } }>)[0]?.details?.lookupKey).toBe("9.9.9");

      const level = await runCli([
        "verify",
        "level",
        "AA",
        "--url",
        `${baseUrl}/auth-login.html`,
        "--target",
        "virtual",
        "--json"
      ]);
      const levelJson = parseJsonOutput(level.stdout);
      expect(level.status).toBe(4);
      expect((levelJson.result as { wcagVersion: string }).wcagVersion).toBe("2.2");
      expect((levelJson.result as { requestedScope: { kind: string; level: string } }).requestedScope).toMatchObject({
        kind: "level",
        level: "AA"
      });
      expect((levelJson.result as { summary: { totalCriteria: number; failedCount: number } }).summary.totalCriteria).toBeGreaterThan(24);
      expect((levelJson.result as { summary: { failedCount: number } }).summary.failedCount).toBeGreaterThan(0);
      expect((levelJson.result as { criteria: Array<{ criterionId: string }> }).criteria.length).toBeGreaterThan(24);
      expect((levelJson.result as { criteria: Array<{ criterionId: string }> }).criteria.some((entry) => entry.criterionId === "3.3.8")).toBe(
        true
      );
      expect((levelJson.result as { criteria: Array<{ criterionId: string }> }).criteria.some((entry) => entry.criterionId === "4.1.2")).toBe(
        true
      );
      expect(
        (levelJson.result as { criteria: Array<{ uncoveredWork: Array<{ kind?: string }> }> }).criteria.some((entry) =>
          entry.uncoveredWork.some((work) => work.kind === "manual-only" || work.kind === "requires-real-target")
        )
      ).toBe(true);
    } finally {
      process.chdir(previousCwd);
    }
  }, 120_000);

  it("keeps representative verify text output readable", async () => {
    const tempRoot = await createTempRoot();
    const previousCwd = process.cwd();
    process.chdir(tempRoot);

    try {
      const output = await runCli([
        "verify",
        "criterion",
        "4.1.2",
        "--url",
        `${baseUrl}/button-name-failure.html`,
        "--target",
        "virtual"
      ]);

      expect(output.stdout).toMatchInlineSnapshot(`
        "Scope: criterion=4.1.2
        WCAG: 2.2
        4.1.2  Name, Role, Value
        Verdict: fail [automated]
        Procedures: axe_scan
        Evidence: applicability, axe
        Warnings: verification-verdict"
      `);

      const verbose = await runCli([
        "verify",
        "criterion",
        "3.3.8",
        "--url",
        `${baseUrl}/auth-login.html`,
        "--target",
        "virtual",
        "--verbose"
      ]);
      expect(verbose.stdout).toContain("Uncovered work:");
      expect(verbose.stdout).toContain("Notes:");

      const level = await runCli([
        "verify",
        "level",
        "AA",
        "--url",
        `${baseUrl}/auth-login.html`,
        "--target",
        "virtual"
      ]);

      expect(level.stdout).toContain("Scope: level=AA");
      expect(level.stdout).toContain("Summary: total=");
      expect(level.stdout).toContain("Rows:");
      expect(level.stdout).toContain("3.3.8");
    } finally {
      process.chdir(previousCwd);
    }
  }, 120_000);
});

describe("cli run pattern commands", () => {
  it("implements the run-pattern scenarios from the feature file", async () => {
    const tempRoot = await createTempRoot();
    const previousCwd = process.cwd();
    process.chdir(tempRoot);

    try {
      const landmarks = await runCli([
        "run",
        "pattern",
        "landmark_sequence",
        "--url",
        `${baseUrl}/basic-page.html`,
        "--target",
        "virtual",
        "--json"
      ]);
      const landmarksJson = parseJsonOutput(landmarks.stdout);
      expect(landmarks.status).toBe(0);
      expect((landmarksJson.result as { stepLog: unknown[] }).stepLog.length).toBeGreaterThan(0);
      expect((landmarksJson.result as { spokenPhraseLog: unknown[] }).spokenPhraseLog.length).toBeGreaterThan(0);
      expect((landmarksJson.result as { itemTextLog: unknown[] }).itemTextLog.length).toBeGreaterThan(0);

      const headings = await runCli([
        "run",
        "pattern",
        "heading_sequence",
        "--url",
        `${baseUrl}/basic-page.html`,
        "--target",
        "virtual",
        "--json"
      ]);
      const headingsJson = parseJsonOutput(headings.stdout);
      expect(headings.status).toBe(0);
      expect(
        ((headingsJson.result as { targetMetadata: { headings: Array<{ text: string }> } }).targetMetadata.headings[0]?.text ?? "")
      ).toBe("Basic content page");
      expect(
        (headingsJson.result as { assertions: Array<{ id: string; status: string }> }).assertions.some(
          (entry) => entry.id === "heading-order" && entry.status === "passed"
        )
      ).toBe(true);

      const status = await runCli([
        "run",
        "pattern",
        "status_message_probe",
        "--url",
        `${baseUrl}/status-message.html`,
        "--target",
        "virtual",
        "--json"
      ]);
      const statusJson = parseJsonOutput(status.stdout);
      expect(status.status).toBe(0);
      expect(
        (statusJson.result as { stepLog: Array<{ id: string }> }).stepLog.some((entry) => entry.id === "trigger-status-message")
      ).toBe(true);
      expect((statusJson.result as { spokenPhraseLog: string[] }).spokenPhraseLog).toContain("Profile saved successfully.");
      expect((statusJson.result as { targetMetadata: { focusChangedUnexpectedly: boolean } }).targetMetadata.focusChangedUnexpectedly).toBe(
        false
      );

      const dialog = await runCli([
        "run",
        "pattern",
        "dialog_probe",
        "--url",
        `${baseUrl}/dialog.html`,
        "--target",
        "virtual",
        "--json"
      ]);
      const dialogJson = parseJsonOutput(dialog.stdout);
      expect(dialog.status).toBe(0);
      expect(
        (dialogJson.result as { assertions: Array<{ id: string; status: string }> }).assertions.find((entry) => entry.id === "focus-entry")
          ?.status
      ).toBe("passed");
      expect(
        (dialogJson.result as { assertions: Array<{ id: string; status: string }> }).assertions.find(
          (entry) => entry.id === "focus-containment"
        )?.status
      ).toBe("passed");
      expect(
        (dialogJson.result as { assertions: Array<{ id: string; status: string }> }).assertions.find(
          (entry) => entry.id === "close-behavior"
        )?.status
      ).toBe("passed");

      const focus = await runCli([
        "run",
        "pattern",
        "focus_visibility_probe",
        "--url",
        `${baseUrl}/focus-obscured.html`,
        "--target",
        "virtual",
        "--json"
      ]);
      const focusJson = parseJsonOutput(focus.stdout);
      expect(focus.status).toBe(0);
      expect((focusJson.result as { assertions: unknown[] }).assertions.length).toBeGreaterThan(0);
      expect(
        (focusJson.result as { assertions: Array<{ id: string; status: string }> }).assertions.find(
          (entry) => entry.id === "focus-geometry-collected"
        )?.status
      ).toBe("passed");
      expect((focusJson.result as { targetMetadata: { overlapPixels: number } }).targetMetadata.overlapPixels).toBeGreaterThan(0);
      expect((focusJson.result as { browserEvidence: unknown[] }).browserEvidence.length).toBeGreaterThan(0);

      const failed = await runCli([
        "run",
        "pattern",
        "focus_obscured_probe",
        "--url",
        `${baseUrl}/focus-obscured.html`,
        "--target",
        "virtual",
        "--json"
      ]);
      const failedJson = parseJsonOutput(failed.stdout);
      expect(failed.status).toBe(4);
      expect(failedJson.ok).toBe(false);
      expect(
        (failedJson.result as { assertions: Array<{ id: string; status: string }> }).assertions.find(
          (entry) => entry.id === "focus-obscured"
        )?.status
      ).toBe("failed");
      expect((failedJson.result as { targetMetadata: { overlapPixels: number } }).targetMetadata.overlapPixels).toBeGreaterThan(0);
      expect((failedJson.errors as Array<{ code: string }>)[0]?.code).toBe("pattern-assertion-failed");

      const started = await runCli(["drive", "start", "--target", "virtual", "--json"]);
      const startedJson = parseJsonOutput(started.stdout);
      const session = (startedJson.result as { session: { sessionId: string } }).session;

      const reused = await runCli([
        "run",
        "pattern",
        "landmark_sequence",
        "--url",
        `${baseUrl}/basic-page.html`,
        "--target",
        "virtual",
        "--session",
        session.sessionId,
        "--json"
      ]);
      const reusedJson = parseJsonOutput(reused.stdout);
      expect(reused.status).toBe(0);
      expect((reusedJson.result as { sessionId: string; managedSession: boolean }).sessionId).toBe(session.sessionId);
      expect((reusedJson.result as { sessionId: string; managedSession: boolean }).managedSession).toBe(false);

      await runCli(["drive", "stop", "--session", session.sessionId, "--json"]);
    } finally {
      process.chdir(previousCwd);
    }
  }, 60_000);

  it("keeps representative run-pattern text output readable", async () => {
    const tempRoot = await createTempRoot();
    const previousCwd = process.cwd();
    process.chdir(tempRoot);

    try {
      const output = await runCli([
        "run",
        "pattern",
        "landmark_sequence",
        "--url",
        `${baseUrl}/basic-page.html`,
        "--target",
        "virtual"
      ]);

      const lines = output.stdout.split("\n");
      expect(lines[0]).toBe("Pattern: landmark_sequence");
      expect(lines[1]).toMatch(/^Session: drv_[a-f0-9-]+ \(managed\)$/);
      expect(lines[2]).toContain("landmark-count=passed");
      expect(lines[3]).toContain("Spoken phrases:");
      expect(lines[4]).toContain("Item text:");

      const verbose = await runCli([
        "run",
        "pattern",
        "landmark_sequence",
        "--url",
        `${baseUrl}/basic-page.html`,
        "--target",
        "virtual",
        "--verbose"
      ]);
      expect(verbose.stdout).toContain("Steps:");
    } finally {
      process.chdir(previousCwd);
    }
  }, 30_000);
});

describe("cli drive lifecycle commands", () => {
  it("implements the session lifecycle scenarios from the drive feature file", async () => {
    const tempRoot = await createTempRoot();
    const previousCwd = process.cwd();
    process.chdir(tempRoot);

    try {
      const started = await runCli(["drive", "start", "--target", "virtual", "--json"]);
      const startedJson = parseJsonOutput(started.stdout);
      const session = (startedJson.result as { session: { sessionId: string; metadataFile: string; target: string } }).session;

      expect(started.status).toBe(0);
      expect(session.sessionId).toMatch(/^drv_/);
      expect(session.target).toBe("virtual");

      const status = await runCli(["drive", "status", "--session", session.sessionId, "--json"]);
      const statusJson = parseJsonOutput(status.stdout);
      expect(status.status).toBe(0);
      expect((statusJson.result as { state: { logCursor: number } }).state.logCursor).toBeGreaterThan(0);
      expect((statusJson.result as { state: { lastSpokenPhrase: string | null } }).state.lastSpokenPhrase).toBeTruthy();

      const stopped = await runCli(["drive", "stop", "--session", session.sessionId, "--json"]);
      const stoppedJson = parseJsonOutput(stopped.stdout);
      expect(stopped.status).toBe(0);
      expect((stoppedJson.result as { session: { sessionId: string } }).session.sessionId).toBe(session.sessionId);

      const missing = await runCli(["drive", "status", "--session", "missing-session", "--json"]);
      const missingJson = parseJsonOutput(missing.stdout);
      expect(missing.status).toBe(3);
      expect((missingJson.errors as Array<{ message: string }>)[0]?.message).toMatch(/missing-session/i);
    } finally {
      process.chdir(previousCwd);
    }
  }, 20_000);

  it("implements the action and ephemeral scenarios from the drive feature file", async () => {
    const tempRoot = await createTempRoot();
    const previousCwd = process.cwd();
    process.chdir(tempRoot);

    try {
      const missingSession = await runCli(["drive", "next", "--target", "virtual", "--json"]);
      const missingSessionJson = parseJsonOutput(missingSession.stdout);
      expect(missingSession.status).toBe(2);
      expect((missingSessionJson.errors as Array<{ message: string }>)[0]?.message).toMatch(/session id is required/i);

      const ephemeral = await runCli(["drive", "next", "--target", "virtual", "--ephemeral", "--json"]);
      const ephemeralJson = parseJsonOutput(ephemeral.stdout);
      expect(ephemeral.status).toBe(0);
      expect((ephemeralJson.result as { action: string }).action).toBe("next");

      const sessionsDir = resolve(tempRoot, ".a11lied/state/sessions");
      let entries: string[] = [];
      try {
        entries = await readdir(sessionsDir);
      } catch {
        entries = [];
      }
      expect(entries).toEqual([]);

      const started = await runCli(["drive", "start", "--target", "virtual", "--json"]);
      const startedJson = parseJsonOutput(started.stdout);
      const session = (startedJson.result as { session: { sessionId: string } }).session;

      const read = await runCli(["drive", "read", "--session", session.sessionId, "--json"]);
      const readJson = parseJsonOutput(read.stdout);
      expect(read.status).toBe(0);
      expect((readJson.result as { state: { logCursor: number } }).state.logCursor).toBeGreaterThanOrEqual(1);
      expect((readJson.result as { state: { lastSpokenPhrase: string | null } }).state.lastSpokenPhrase).toBeTruthy();

      await runCli(["drive", "next", "--session", session.sessionId, "--json"]);
      const cleared = await runCli(["drive", "clear-logs", "--session", session.sessionId, "--json"]);
      const clearedJson = parseJsonOutput(cleared.stdout);
      expect(cleared.status).toBe(0);
      expect((clearedJson.result as { action: string }).action).toBe("clear-logs");

      const logs = await runCli(["drive", "logs", "--session", session.sessionId, "--json"]);
      const logsJson = parseJsonOutput(logs.stdout);
      expect(logs.status).toBe(0);
      expect((logsJson.result as { state: { spokenPhraseLog: string[] } }).state.spokenPhraseLog).toEqual([]);

      const verboseLogs = await runCli(["drive", "logs", "--session", session.sessionId, "--verbose"]);
      expect(verboseLogs.stdout).toContain("Checkpoints:");

      await runCli(["drive", "stop", "--session", session.sessionId, "--json"]);
    } finally {
      process.chdir(previousCwd);
    }
  }, 20_000);
});
