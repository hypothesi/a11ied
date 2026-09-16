#!/usr/bin/env node
/**
 * Drives one screen reader session end to end against a local fixture page and fails when
 * the reader never announces the fixture heading. CI runs this on macOS with VoiceOver
 * and on Windows with NVDA. Run it locally with `--sr virtual` to check the script itself
 * without starting a real screen reader.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

const { env: processEnv, execPath, platform } = process;

const CLI_PATH = resolve(import.meta.dirname, '..', 'packages', 'cli', 'dist', 'cli.js');
const HEADING_TEXT = 'a11ied smoke heading';
const NAVIGATION_STEPS = 8;
const LOCAL_HOST = '127.0.0.1';
const EPHEMERAL_PORT = 0;
const HTTP_OK = 200;
const FAILURE_EXIT_CODE = 1;
const FIXTURE_HTML = [
   '<!doctype html>',
   '<html lang="en">',
   '<head><meta charset="utf-8"><title>a11ied smoke</title></head>',
   '<body><main>',
   `<h1>${HEADING_TEXT}</h1>`,
   '<p>Screen reader smoke fixture.</p>',
   '<button type="button">a11ied smoke button</button>',
   '</main></body></html>',
].join('\n');

function log(message) {
   process.stdout.write(`${message}\n`);
}

function resolveScreenReader() {
   const requested = process.argv.indexOf('--sr');
   if (requested !== -1) {
      return process.argv[requested + 1];
   }
   if (platform === 'darwin') {
      return 'voiceover';
   }
   if (platform === 'win32') {
      return 'nvda';
   }
   return 'virtual';
}

function closeServer(server) {
   return new Promise((closed) => {
      server.close(() => {
         closed();
      });
   });
}

function startFixtureServer() {
   const server = createServer((_request, response) => {
      response.writeHead(HTTP_OK, { 'content-type': 'text/html; charset=utf-8' });
      response.end(FIXTURE_HTML);
   });

   return new Promise((resolveServer) => {
      server.listen(EPHEMERAL_PORT, LOCAL_HOST, () => {
         const { port } = server.address();
         resolveServer({
            url: `http://${LOCAL_HOST}:${port}/`,
            close: () => closeServer(server),
         });
      });
   });
}

function runCli(args) {
   log(`\n$ a1 ${args.join(' ')}`);
   return new Promise((resolveRun) => {
      const child = spawn(execPath, [CLI_PATH, ...args], {
         env: { ...processEnv, FORCE_COLOR: '0' },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (data) => {
         stdout += data;
      });
      child.stderr.on('data', (data) => {
         stderr += data;
      });
      child.on('close', (status) => {
         if (stdout) {
            log(stdout.trimEnd());
         }
         if (stderr) {
            log(stderr.trimEnd());
         }
         resolveRun({ status, stdout, stderr });
      });
   });
}

async function runCliOrFail(args) {
   const result = await runCli(args);
   if (result.status !== 0) {
      throw new Error(`a1 ${args.join(' ')} exited with ${result.status}`);
   }
   return result;
}

async function navigate(stepsRemaining) {
   if (stepsRemaining <= 0) {
      return;
   }
   await runCliOrFail(['sr', 'next']);
   await navigate(stepsRemaining - 1);
}

function assertHeadingAnnounced(transcriptJson) {
   if (!transcriptJson.includes(HEADING_TEXT)) {
      throw new Error(
         `The screen reader never announced "${HEADING_TEXT}". Transcript: ${transcriptJson}`,
      );
   }
   log(`\nHeading announced: "${HEADING_TEXT}"`);
}

function startOptions(screenReader) {
   if (screenReader === 'virtual') {
      return ['--sr', 'virtual', '--allow-virtual'];
   }
   return ['--sr', screenReader];
}

async function runSmoke(screenReader, url) {
   const doctorArgs = screenReader === 'virtual' ? ['doctor'] : ['doctor', '--strict'];
   await runCliOrFail(doctorArgs);
   await runCliOrFail(['sr', 'start', ...startOptions(screenReader), url]);
   if (screenReader !== 'virtual') {
      await runCliOrFail(['sr', 'wait', '--ms', '2000']);
   }
   await navigate(NAVIGATION_STEPS);
   await runCliOrFail(['sr', 'read']);
   const transcript = await runCliOrFail(['sr', 'transcript', '--json']);
   assertHeadingAnnounced(transcript.stdout);
}

async function main() {
   const screenReader = resolveScreenReader();
   const server = await startFixtureServer();
   log(`Screen reader smoke test: ${screenReader} against ${server.url}`);

   try {
      await runSmoke(screenReader, server.url);
      log('\nScreen reader smoke test passed.');
   } finally {
      await runCli(['sr', 'stop']);
      await server.close();
   }
}

try {
   await main();
} catch (error) {
   log(`\nScreen reader smoke test failed: ${error.message}`);
   process.exitCode = FAILURE_EXIT_CODE;
}
