import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { runInteractionPattern } from "./pattern-runtime.js";
import { startDriverSession, stopDriverSession } from "./driver-runtime.js";

const fixtureRoot = resolve(import.meta.dirname, "../../cli/test/fixtures");
const repoRoot = process.cwd();

let baseUrl = "";
let server: ReturnType<typeof createServer>;
const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "a11lied-pattern-"));
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

describe("interaction pattern runtime", () => {
  it("returns landmark logs and heading order evidence", async () => {
    const cwd = await createTempRoot();
    process.chdir(cwd);

    try {
      const landmarks = await runInteractionPattern({
        patternId: "landmark_sequence",
        url: `${baseUrl}/basic-page.html`,
        target: "virtual"
      });

      expect(landmarks.stepLog.length).toBeGreaterThan(0);
      expect(landmarks.spokenPhraseLog.length).toBeGreaterThan(0);
      expect(landmarks.itemTextLog.length).toBeGreaterThan(0);

      const headings = await runInteractionPattern({
        patternId: "heading_sequence",
        url: `${baseUrl}/basic-page.html`,
        target: "virtual"
      });

      expect((headings.targetMetadata.headings as Array<{ text: string }>)[0]?.text).toBe("Basic content page");
      expect(headings.assertions.some((entry) => entry.id === "heading-order" && entry.status === "passed")).toBe(true);
    } finally {
      process.chdir(repoRoot);
    }
  }, 60_000);

  it("captures status message, dialog, and focus visibility evidence", async () => {
    const cwd = await createTempRoot();
    process.chdir(cwd);

    try {
      const status = await runInteractionPattern({
        patternId: "status_message_probe",
        url: `${baseUrl}/status-message.html`,
        target: "virtual"
      });
      expect(status.stepLog.some((entry) => entry.id === "trigger-status-message")).toBe(true);
      expect(status.spokenPhraseLog).toContain("Profile saved successfully.");
      expect(status.targetMetadata.focusChangedUnexpectedly).toBe(false);

      const dialog = await runInteractionPattern({
        patternId: "dialog_probe",
        url: `${baseUrl}/dialog.html`,
        target: "virtual"
      });
      expect(dialog.assertions.find((entry) => entry.id === "focus-entry")?.status).toBe("passed");
      expect(dialog.assertions.find((entry) => entry.id === "focus-containment")?.status).toBe("passed");
      expect(dialog.assertions.find((entry) => entry.id === "close-behavior")?.status).toBe("passed");

      const focus = await runInteractionPattern({
        patternId: "focus_visibility_probe",
        url: `${baseUrl}/focus-obscured.html`,
        target: "virtual"
      });
      expect(focus.assertions.length).toBeGreaterThan(0);
      expect(focus.assertions.find((entry) => entry.id === "focus-visible")?.status).toBe("passed");
      expect(focus.assertions.find((entry) => entry.id === "focus-geometry-collected")?.status).toBe("passed");
      expect((focus.targetMetadata as { overlapPixels?: number }).overlapPixels).toBeGreaterThan(0);
      expect(focus.browserEvidence.length).toBeGreaterThan(0);
    } finally {
      process.chdir(repoRoot);
    }
  }, 60_000);

  it("reuses an existing session when one is provided", async () => {
    const cwd = await createTempRoot();
    process.chdir(cwd);

    try {
      const session = await startDriverSession("virtual");
      const result = await runInteractionPattern({
        patternId: "landmark_sequence",
        url: `${baseUrl}/basic-page.html`,
        target: "virtual",
        sessionId: session.sessionId
      });

      expect(result.sessionId).toBe(session.sessionId);
      expect(result.managedSession).toBe(false);

      await stopDriverSession(session.sessionId);
    } finally {
      process.chdir(repoRoot);
    }
  }, 30_000);
});
