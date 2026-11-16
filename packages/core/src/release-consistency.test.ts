/* oxlint-disable max-lines-per-function, max-statements, complexity/complexity */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { listCliCommands } from './index.js';
import { expectReadyCommands } from './release-test-helpers.js';

const repoRoot = resolve(import.meta.dirname, '../../..');

function readRepoFile(relativePath: string): string {
   return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

const PRODUCTION_ROOTS = [
   'packages/core/src',
   'packages/cli/src',
   'packages/mcp-server/src',
   'packages/knowledge/src',
   'packages/observe/src',
   'packages/verdict/src',
   'packages/report/src',
   'packages/screen-reader/src',
   'packages/review/src',
];
const EXCLUDED_PRODUCTION_FILES = new Set([
   'packages/core/src/files/store.ts',
   'packages/observe/src/files-store.ts',
]);

function listProductionFiles(rootDir: string): string[] {
   const entries = readdirSync(resolve(repoRoot, rootDir), { withFileTypes: true });
   const files: string[] = [];
   for (const entry of entries) {
      const absolute = join(rootDir, entry.name);
      if (entry.isDirectory()) {
         files.push(...listProductionFiles(absolute));
         continue;
      }
      if (!entry.isFile()) {
         continue;
      }
      if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
         continue;
      }
      if (
         /\.test\.(ts|tsx|js|jsx|mjs|cjs)$|test-fixtures\.ts$|test-helpers\.ts$/.test(
            entry.name,
         )
      ) {
         continue;
      }
      if (EXCLUDED_PRODUCTION_FILES.has(absolute)) {
         continue;
      }
      files.push(absolute);
   }
   return files;
}

function scanTsFiles(dir: string): string[] {
   try {
      const entries = readdirSync(dir, { withFileTypes: true });
      const result: string[] = [];
      for (const entry of entries) {
         const full = join(dir, entry.name);
         if (entry.isDirectory()) {
            result.push(...scanTsFiles(full));
         } else if (/\.(ts|tsx)$/.test(entry.name)) {
            result.push(full);
         }
      }
      return result;
   } catch {
      // Ignore missing or inaccessible directories
      return [];
   }
}

describe('release consistency guardrails', () => {
   it('keeps shipped CLI command metadata on ready-only surfaces', () => {
      const commands = listCliCommands();

      expectReadyCommands(commands);
   });

   it('keeps the shipped skill package map free of stale planned markers', () => {
      const skill = readRepoFile('packages/skills/a11ied/SKILL.md');

      expect(skill).not.toMatch(/^- planned:/m);
   });

   it('keeps placeholder public commands out of the CLI program source', () => {
      const programSource = readRepoFile('packages/cli/src/program.ts');

      expect(programSource).not.toContain(".command('catalog')");
      expect(programSource).not.toContain(".command('story')");
      expect(programSource).not.toContain('notReady(');
   });

   it('forbids raw writeFile and appendFile in core, cli, and mcp-server production sources outside files/store.ts', () => {
      const productionFiles = PRODUCTION_ROOTS.flatMap((root) =>
         listProductionFiles(root),
      );
      const offenders = productionFiles.filter((relativePath) => {
         const source = readRepoFile(relativePath);
         return /\b(writeFile|appendFile)\b/.test(source);
      });

      expect(offenders).toEqual([]);
   });

   it('enforces an acyclic workspace dependency DAG across all @a11ied packages and forbids deep sibling src/ imports', () => {
      const packageDirs = readdirSync(resolve(repoRoot, 'packages'), {
         withFileTypes: true,
      })
         .filter((entry) => entry.isDirectory())
         .map((entry) => entry.name);

      const requiredPackages = [
         '@a11ied/knowledge',
         '@a11ied/observe',
         '@a11ied/verdict',
         '@a11ied/report',
         '@a11ied/screen-reader',
         '@a11ied/review',
      ];

      const packageNames = new Set<string>();
      const dependencies = new Map<string, string[]>();

      for (const dir of packageDirs) {
         const pkgJsonPath = resolve(repoRoot, 'packages', dir, 'package.json');
         try {
            const content = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
               name?: string;
               dependencies?: Record<string, string>;
            };
            if (content.name?.startsWith('@a11ied/')) {
               packageNames.add(content.name);
               const a11iedDeps = Object.keys(content.dependencies ?? {}).filter((dep) =>
                  dep.startsWith('@a11ied/'),
               );
               dependencies.set(content.name, a11iedDeps);
            }
         } catch {
            // Ignore non-package directories
         }
      }

      // 1. Verify all 6 decomposed packages exist
      for (const required of requiredPackages) {
         expect(packageNames.has(required)).toBe(true);
      }

      // 2. Check for cycles in the dependency graph
      const visited = new Set<string>();
      const inStack = new Set<string>();

      function checkCycle(node: string, path: string[] = []): void {
         if (inStack.has(node)) {
            throw new Error(`Cycle detected: ${[...path, node].join(' -> ')}`);
         }
         if (visited.has(node)) {
            return;
         }
         visited.add(node);
         inStack.add(node);
         for (const dep of dependencies.get(node) ?? []) {
            checkCycle(dep, [...path, node]);
         }
         inStack.delete(node);
      }

      for (const pkg of packageNames) {
         checkCycle(pkg);
      }

      // Verify review dependencies DAG order
      const reviewDeps = dependencies.get('@a11ied/review') ?? [];
      expect(reviewDeps).toContain('@a11ied/verdict');
      expect(reviewDeps).toContain('@a11ied/observe');
      expect(reviewDeps).toContain('@a11ied/report');
      expect(reviewDeps).toContain('@a11ied/screen-reader');

      for (const child of [
         '@a11ied/verdict',
         '@a11ied/observe',
         '@a11ied/report',
         '@a11ied/screen-reader',
      ]) {
         const childDeps = dependencies.get(child) ?? [];
         expect(childDeps).not.toContain('@a11ied/review');
      }

      // 3. Scans all packages/*/src/**/*.ts files and verifies no file imports another package's internal src/ path
      const decomposedPackageNames = new Set([
         'knowledge',
         'observe',
         'verdict',
         'report',
         'screen-reader',
         'review',
      ]);
      const anyPkgSrcPattern =
         /(?:from\s+['"]|import\s*\(\s*['"])@a11ied\/[a-z-]+\/src\//u;
      const decomposedSiblingPattern =
         /(?:from\s+['"]|import\s*\(\s*['"])(?:\.\.\/)+[a-z-]+\/src\//u;
      const anyToDecomposedPattern =
         /(?:from\s+['"]|import\s*\(\s*['"])(?:\.\.\/)+(?:knowledge|observe|verdict|report|screen-reader|review)\/src\//u;

      const deepViolations: { file: string; match: string }[] = [];

      for (const pkgDir of packageDirs) {
         const srcDir = resolve(repoRoot, 'packages', pkgDir, 'src');
         const isDecomposed = decomposedPackageNames.has(pkgDir);
         for (const filePath of scanTsFiles(srcDir)) {
            const content = readFileSync(filePath, 'utf8');
            if (anyPkgSrcPattern.test(content)) {
               deepViolations.push({ file: filePath, match: '@a11ied/*/src/ import' });
            }
            if (isDecomposed && decomposedSiblingPattern.test(content)) {
               deepViolations.push({
                  file: filePath,
                  match: 'sibling ../../<pkg>/src import from decomposed package',
               });
            }
            if (anyToDecomposedPattern.test(content)) {
               deepViolations.push({
                  file: filePath,
                  match: 'import into decomposed package internal src/',
               });
            }
         }
      }

      expect(deepViolations).toEqual([]);
   });
});
