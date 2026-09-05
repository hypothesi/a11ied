import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

import type { AccessibilityDriverSession, Platform } from '@a11ied/contracts';

import type { BrokerRequest, BrokerResponse } from './broker-types.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';

const VIRTUAL_SOCKET_TIMEOUT_MS = 2000;
// Must cover: guidepup op (up to 15s) + speech stabilization (5s) + retries
const REAL_TARGET_SOCKET_TIMEOUT_MS = 30_000;
const REAL_TARGET_STOP_SOCKET_TIMEOUT_MS = 20_000;
const VIRTUAL_STOP_SOCKET_TIMEOUT_MS = 7000;
const BROKER_POLL_DELAY_MS = 100;
const DEFAULT_BROKER_READY_TIMEOUT_MS = 5000;
const REAL_TARGET_BROKER_READY_TIMEOUT_MS = 15_000;
/** Extra time the reply gets on top of a caller-supplied command timeout. */
const BROKER_RESPONSE_GRACE_MS = 6000;

function delay(ms: number): Promise<void> {
   return new Promise((resolvePromise) => {
      setTimeout(resolvePromise, ms);
   });
}

function isBrokerResponse(value: unknown): value is BrokerResponse {
   return typeof value === 'object' && value !== null && 'ok' in value;
}

function parseResponseLine(line: string): BrokerResponse {
   const parsed: unknown = JSON.parse(line);
   if (!isBrokerResponse(parsed)) {
      throw new Error('Broker replied with something other than a response object.');
   }
   return parsed;
}

/** Sends one request and resolves with the first newline-terminated response line. */
export async function connectToBroker(
   socketPath: string,
   request: BrokerRequest,
   timeoutMs = VIRTUAL_SOCKET_TIMEOUT_MS,
): Promise<BrokerResponse> {
   return await new Promise<BrokerResponse>((resolvePromise, rejectPromise) => {
      let buffered = '';
      let settled = false;
      const client = net.createConnection(socketPath);
      const settle = (run: () => void): void => {
         if (!settled) {
            settled = true;
            run();
            client.destroy();
         }
      };

      client.setTimeout(timeoutMs);
      client.on('connect', () => {
         client.write(`${JSON.stringify(request)}\n`);
      });
      client.on('data', (chunk: Buffer | string) => {
         buffered += chunk.toString();
         const newline = buffered.indexOf('\n');
         if (newline === -1) {
            return;
         }
         const line = buffered.slice(0, newline);
         settle(() => {
            try {
               resolvePromise(parseResponseLine(line));
            } catch (error) {
               rejectPromise(error);
            }
         });
      });
      client.on('end', () => {
         settle(() => rejectPromise(new Error('Broker closed the connection without a reply.')));
      });
      client.on('timeout', () => {
         settle(() => rejectPromise(new Error('Broker connection timed out.')));
      });
      client.on('error', (error) => {
         settle(() => rejectPromise(error));
      });
   });
}

export function resolveBrokerSocketTimeoutMs(
   request: Pick<BrokerRequest, 'command' | 'timeoutMs'>,
   target?: Platform,
): number {
   if (request.timeoutMs !== undefined) {
      return request.timeoutMs + BROKER_RESPONSE_GRACE_MS;
   }
   const isReal = target === 'voiceover' || target === 'nvda';
   if (request.command === 'stop') {
      return isReal ? REAL_TARGET_STOP_SOCKET_TIMEOUT_MS : VIRTUAL_STOP_SOCKET_TIMEOUT_MS;
   }
   return isReal ? REAL_TARGET_SOCKET_TIMEOUT_MS : VIRTUAL_SOCKET_TIMEOUT_MS;
}

export function resolveBrokerReadyTimeoutMs(target: Platform): number {
   if (target === 'virtual') {
      return DEFAULT_BROKER_READY_TIMEOUT_MS;
   }
   return REAL_TARGET_BROKER_READY_TIMEOUT_MS;
}

interface WaitForBrokerOptions {
   sessionId: string;
   readSession: () => Promise<AccessibilityDriverSession | undefined>;
   timeoutMs: number;
}

async function pingSession(
   session: AccessibilityDriverSession | undefined,
): Promise<AccessibilityDriverSession | undefined> {
   if (!session) {
      return undefined;
   }
   try {
      const response = await connectToBroker(session.socketPath, { command: 'ping' });
      return response.ok ? session : undefined;
   } catch {
      return undefined;
   }
}

/** Polls the session file and the socket until the broker answers a ping or time runs out. */
export async function waitForBroker(
   options: WaitForBrokerOptions,
): Promise<AccessibilityDriverSession> {
   const startedAt = Date.now();
   while (Date.now() - startedAt < options.timeoutMs) {
      const session = await options.readSession();
      const live = await pingSession(session?.sessionId === options.sessionId ? session : undefined);
      if (live) {
         return live;
      }
      await delay(BROKER_POLL_DELAY_MS);
   }
   throw new CliEnvironmentError(
      'driver-broker-timeout',
      'Timed out waiting for the driver broker to start.',
      { sessionId: options.sessionId },
   );
}

function getCurrentModulePath(): string {
   return import.meta.filename;
}

function isSourceRuntime(): boolean {
   return getCurrentModulePath().endsWith('.ts');
}

function resolveInstalledPackagePath(specifier: string): string | undefined {
   try {
      return fileURLToPath(import.meta.resolve(specifier));
   } catch {
      return undefined;
   }
}

function resolveCorePackageRoot(): string | undefined {
   const packageJsonPath = resolveInstalledPackagePath('@a11ied/core/package.json');
   if (packageJsonPath) {
      return dirname(packageJsonPath);
   }
   const packageEntryPath = resolveInstalledPackagePath('@a11ied/core');
   if (!packageEntryPath) {
      return undefined;
   }
   const packageDir = dirname(packageEntryPath);
   if (basename(packageDir) === 'dist') {
      return dirname(packageDir);
   }
   return packageDir;
}

export function getBrokerEntryFromPackageRoot(packageRoot: string): string | undefined {
   const entries = [
      resolve(packageRoot, 'dist/driver/broker.js'),
      resolve(packageRoot, 'src/driver/broker.ts'),
   ];

   return entries.find((entry) => existsSync(entry));
}

function getBrokerEntryFromCurrentModule(): string {
   const currentDir = dirname(getCurrentModulePath());
   if (isSourceRuntime()) {
      return resolve(currentDir, 'broker.ts');
   }
   return resolve(currentDir, 'driver/broker.js');
}

function getBrokerEntryPath(): string {
   const packageRoot = resolveCorePackageRoot();
   if (packageRoot) {
      const packageEntry = getBrokerEntryFromPackageRoot(packageRoot);
      if (packageEntry) {
         return packageEntry;
      }
   }
   return getBrokerEntryFromCurrentModule();
}

function getProjectRoot(): string {
   const packageRoot = resolveCorePackageRoot();
   if (packageRoot) {
      return resolve(packageRoot, '../..');
   }
   return resolve(dirname(getCurrentModulePath()), '../../..');
}

export interface BrokerSpawnOptions {
   sessionId: string;
   target: Platform;
   metadataFile: string;
   socketPath: string;
   idleTimeoutMs: number;
   recordingPath?: string | undefined;
   url?: string | undefined;
   app?: AccessibilityDriverSession['app'] | undefined;
}

function getBaseSpawnArgs(entry: string): string[] {
   if (isSourceRuntime()) {
      return ['--import', 'tsx', entry];
   }
   return [entry];
}

function brokerSpawnArgs(options: BrokerSpawnOptions): string[] {
   const args = [
      ...getBaseSpawnArgs(getBrokerEntryPath()),
      '--session-id',
      options.sessionId,
      '--target',
      options.target,
      '--metadata-file',
      options.metadataFile,
      '--socket-path',
      options.socketPath,
      '--idle-timeout-ms',
      String(options.idleTimeoutMs),
   ];
   if (options.recordingPath) {
      args.push('--recording-path', options.recordingPath);
   }
   if (options.url) {
      args.push('--url', options.url);
   }
   if (options.app) {
      args.push('--app', JSON.stringify(options.app));
   }
   return args;
}

/** Spawns the detached broker process that owns the screen reader for one session. */
export function spawnBrokerProcess(options: BrokerSpawnOptions): void {
   const child = spawn(process.execPath, brokerSpawnArgs(options), {
      cwd: getProjectRoot(),
      detached: true,
      stdio: 'ignore',
   });
   child.unref();
}
