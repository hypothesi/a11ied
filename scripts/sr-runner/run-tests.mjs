import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadScreenReaderCatalog } from './load-cases.mjs';
import { writeEnvironmentResultFile } from './results-io.mjs';
import { runVirtualTarget } from './runners/virtual.mjs';

const ARG_START_INDEX = 2;
const DEFAULT_PORT = 4322;
const SERVER_POLL_MS = 300;
const SERVER_TIMEOUT_MS = 20_000;
const SERVER_STOP_TIMEOUT_MS = 1500;

function ignoreError(error) {
   return error;
}

function expandTargetAliases(rawTargets) {
   const expanded = [];
   for (const item of rawTargets) {
      if (item === 'talkback') {
         expanded.push('talkback-chrome', 'talkback-webview');
      } else if (item === 'voiceover') {
         expanded.push(
            'voiceover-chrome',
            'voiceover-safari',
            'voiceover-firefox',
            'voiceover-wkwebview',
         );
      } else {
         expanded.push(item);
      }
   }
   return expanded;
}

function appendCommaTargets(rawTargets, rawValue) {
   for (const part of rawValue.split(',')) {
      if (part.trim() !== '') {
         rawTargets.push(part.trim());
      }
   }
}

function parseArgs(argv) {
   const rawTargets = [];
   let caseFilter = '';
   let baseURL = '';
   let merge = false;

   for (let index = 0; index < argv.length; index += 1) {
      const arg = argv[index];
      const next = argv[index + 1];
      if (arg === '--target' && next) {
         appendCommaTargets(rawTargets, next);
         index += 1;
      } else if (arg === '--case' && next) {
         caseFilter = next.trim();
         index += 1;
      } else if (arg === '--base-url' && next) {
         baseURL = next.trim().replace(/\/$/u, '');
         index += 1;
      } else if (arg === '--merge') {
         merge = true;
      }
   }

   return {
      targets: expandTargetAliases(rawTargets.length > 0 ? rawTargets : ['virtual']),
      caseFilter,
      baseURL,
      merge,
   };
}

function delay(ms) {
   return new Promise((resolvePromise) => {
      setTimeout(resolvePromise, ms);
   });
}

async function probePrefix(url, basePrefix) {
   try {
      const response = await fetch(`${url}${basePrefix}/support/`);
      return response.ok ? `${url}${basePrefix}` : '';
   } catch {
      return '';
   }
}

async function pollServer(url, deadline) {
   const resolved = (await probePrefix(url, '/a11ied')) || (await probePrefix(url, ''));
   if (resolved) {
      return resolved;
   }
   if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for preview server at ${url}`);
   }
   await delay(SERVER_POLL_MS);
   return pollServer(url, deadline);
}

async function startPreviewServer(repoRoot, port) {
   const docsDir = resolve(repoRoot, 'packages', 'docs');
   const distDir = resolve(docsDir, 'dist');
   if (!existsSync(distDir)) {
      throw new Error(
         'packages/docs/dist/ does not exist. Run "npm run build" before running screen reader tests.',
      );
   }
   const astroBin = resolve(repoRoot, 'node_modules', '.bin', 'astro');
   const child = spawn(
      astroBin,
      ['preview', '--host', '127.0.0.1', '--port', String(port)],
      {
         cwd: docsDir,
         stdio: ['ignore', 'pipe', 'pipe'],
      },
   );
   const rawURL = `http://127.0.0.1:${String(port)}`;
   try {
      const baseURL = await pollServer(rawURL, Date.now() + SERVER_TIMEOUT_MS);
      return {
         baseURL,
         stop: () =>
            new Promise((resolveStop) => {
               child.once('exit', () => resolveStop(true));
               child.kill('SIGTERM');
               setTimeout(() => resolveStop(true), SERVER_STOP_TIMEOUT_MS);
            }),
      };
   } catch (error) {
      child.kill('SIGTERM');
      throw error;
   }
}

function isVoiceOverTarget(target) {
   return (
      target === 'voiceover-chrome' ||
      target === 'voiceover-safari' ||
      target === 'voiceover-firefox' ||
      target === 'voiceover-wkwebview'
   );
}

function isTalkBackTarget(target) {
   return (
      target === 'talkback-chrome' ||
      target === 'talkback-firefox' ||
      target === 'talkback-webview'
   );
}

async function executeTarget({ target, context }) {
   if (target === 'virtual') {
      const output = await runVirtualTarget({
         testCases: context.selectedCases,
         baseURL: context.baseURL,
         buildEnvironmentKey: context.buildEnvironmentKey,
      });
      return { output, label: 'virtual' };
   }
   if (isVoiceOverTarget(target)) {
      const { runMacOSVoiceOverTarget } = await import('./runners/voiceover-macos.mjs');
      const output = await runMacOSVoiceOverTarget({
         browser: target.replace('voiceover-', ''),
         testCases: context.selectedCases,
         baseURL: context.baseURL,
         buildEnvironmentKey: context.buildEnvironmentKey,
      });
      return { output, label: target };
   }
   if (isTalkBackTarget(target)) {
      const { runAndroidTalkBackTarget } = await import('./runners/talkback-android.mjs');
      const output = await runAndroidTalkBackTarget({
         browser: target.replace('talkback-', ''),
         testCases: context.selectedCases,
         baseURL: context.baseURL,
         buildEnvironmentKey: context.buildEnvironmentKey,
         emulatorSession: context.androidSession,
      });
      return { output, label: target };
   }
   throw new Error(
      `Unknown target "${target}". Expected virtual, voiceover-chrome, voiceover-safari, voiceover-firefox, voiceover-wkwebview, talkback-chrome, talkback-firefox, or talkback-webview.`,
   );
}

async function runTargetsSequentially(targets, context, index = 0) {
   if (index >= targets.length) {
      return;
   }
   const target = targets[index];
   const { output, label } = await executeTarget({ target, context });
   const writtenPath = writeEnvironmentResultFile({
      repoRoot: context.repoRoot,
      fileSlug: output.fileSlug,
      environmentKey: output.environmentKey,
      environment: output.environment,
      newRuns: output.runs,
      testOrder: context.allOrder,
      mergeExisting: context.mergeExisting,
      statusOverride: output.status,
      statusNote: output.statusNote,
   });
   process.stdout.write(
      `Wrote ${String(output.runs.length)} ${label} run(s) to ${writtenPath}\n`,
   );
   await runTargetsSequentially(targets, context, index + 1);
}

async function main() {
   const repoRoot = process.cwd();
   const args = parseArgs(process.argv.slice(ARG_START_INDEX));
   const { screenReaderTests, buildEnvironmentKey } =
      await loadScreenReaderCatalog(repoRoot);

   const selectedCases = args.caseFilter
      ? screenReaderTests.filter(
           (testCase) =>
              testCase.slug.includes(args.caseFilter) ||
              testCase.attribute === args.caseFilter,
        )
      : [...screenReaderTests];

   if (selectedCases.length === 0) {
      throw new Error(`No test cases matched --case "${args.caseFilter}".`);
   }

   const server = args.baseURL
      ? { baseURL: args.baseURL, stop: () => Promise.resolve(true) }
      : await startPreviewServer(repoRoot, DEFAULT_PORT);

   const allOrder = screenReaderTests.map((testCase) => testCase.slug);
   const mergeExisting = args.merge || args.caseFilter !== '';
   const needsAndroid = args.targets.some((target) => target.startsWith('talkback-'));
   let androidSession = false;

   try {
      if (needsAndroid) {
         const { ensureAndroidEmulatorSession } =
            await import('./runners/talkback-android.mjs');
         androidSession = await ensureAndroidEmulatorSession();
      }
      await runTargetsSequentially(args.targets, {
         repoRoot,
         selectedCases,
         baseURL: server.baseURL,
         buildEnvironmentKey,
         allOrder,
         mergeExisting,
         androidSession,
      });
   } finally {
      if (androidSession) {
         await androidSession.close().catch(ignoreError);
      }
      await server.stop().catch(ignoreError);
   }
}

try {
   await main();
} catch (error) {
   process.stderr.write(
      `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
   );
   process.exitCode = 1;
}
