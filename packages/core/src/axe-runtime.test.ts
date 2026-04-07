import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getCoverage } from "@a11lied/wcag-engine";

import { runAxe } from "./axe-runtime.js";

const fixtureRoot = resolve(import.meta.dirname, "../../cli/test/fixtures");

let baseUrl = "";
let server: ReturnType<typeof createServer>;

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

describe("axe runtime", () => {
  it("runs criterion-mapped axe rules and preserves normalized details", async () => {
    const result = await runAxe(`${baseUrl}/button-name-failure.html`, {
      url: `${baseUrl}/button-name-failure.html`,
      wcagVersion: "2.2",
      criterion: "4.1.2"
    });

    expect(result.selection.kind).toBe("criterion");
    expect(result.violations.length).toBeGreaterThan(0);

    const mappedRuleIds = new Set(getCoverage("4.1.2", { version: "2.2" }).coverage.axeRuleIds);
    expect(result.violations.every((entry) => mappedRuleIds.has(entry.id))).toBe(true);
    expect(result.violations[0]?.helpUrl).toMatch(/^https:\/\//);
    expect(result.violations[0]?.nodes[0]?.target.length).toBeGreaterThan(0);
  });

  it("runs level-based scans and preserves result collections", async () => {
    const contrast = await runAxe(`${baseUrl}/contrast-failure.html`, {
      url: `${baseUrl}/contrast-failure.html`,
      wcagVersion: "2.2",
      level: "AA"
    });
    expect(contrast.selection.kind).toBe("level");
    expect(contrast.violations.some((entry) => entry.id === "color-contrast")).toBe(true);
    expect(Array.isArray(contrast.passes)).toBe(true);
    expect(Array.isArray(contrast.incomplete)).toBe(true);
  });

  it("preserves incomplete results when the selected rule reports them", async () => {
    const incomplete = await runAxe(`${baseUrl}/basic-page.html`, {
      url: `${baseUrl}/basic-page.html`,
      wcagVersion: "2.2",
      ruleIds: ["frame-tested"]
    });
    expect(incomplete.incomplete.some((entry) => entry.id === "frame-tested")).toBe(true);
  });

  it("limits explicit rule execution to the requested ids", async () => {
    const result = await runAxe(`${baseUrl}/basic-page.html`, {
      url: `${baseUrl}/basic-page.html`,
      wcagVersion: "2.2",
      ruleIds: ["color-contrast"]
    });

    const seenRuleIds = [
      ...result.violations.map((entry) => entry.id),
      ...result.passes.map((entry) => entry.id),
      ...result.incomplete.map((entry) => entry.id),
      ...result.inapplicable.map((entry) => entry.id)
    ];

    expect(new Set(seenRuleIds)).toEqual(new Set(["color-contrast"]));
  });
});
