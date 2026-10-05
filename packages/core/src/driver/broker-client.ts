import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

import {
   DEFAULT_WAIT_TIMEOUT_MS,
   accessibilityDriverSessionSchema,
   type AccessibilityDriverSession,
   type Platform,
   type VirtualEngine,
} from '@a11ied/contracts';

import { getDriverSocketPath } from './session-utils.js';

import type { BrokerRequest, BrokerResponse } from './broker-types.js';
import { delay } from './delay.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';
import { throwIfBrokerStartupFailed } from './broker-startup.js';

const VIRTUAL_SOCKET_TIMEOUT_MS = 2000;
const REAL_TARGET_SOCKET_TIMEOUT_MS = 30_000;
const REAL_TARGET_STOP_SOCKET_TIMEOUT_MS = 20_000;
const VIRTUAL_STOP_SOCKET_TIMEOUT_MS = 7000;
const ATTACH_DOCUMENT_SOCKET_TIMEOUT_MS = 30_000;
const BROKER_POLL_DELAY_MS = 100;
const DEFAULT_BROKER_READY_TIMEOUT_MS = 15_000;
const REAL_TARGET_BROKER_READY_TIMEOUT_MS = 120_000;
const BROKER_RESPONSE_GRACE_MS = 6000;

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
   timeoutMs = request.command === 'stop'
      ? REAL_TARGET_STOP_SOCKET_TIMEOUT_MS
      : VIRTUAL_SOCKET_TIMEOUT_MS,
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
         settle(() =>
            rejectPromise(new Error('Broker closed the connection without a reply.')),
         );
      });
      client.on('timeout', () => {
         settle(() => rejectPromise(new Error('Broker connection timed out.')));
      });
      client.on('error', (error) => {
         settle(() => rejectPromise(error));
      });
   });
}

/** Actions that step up to `payload.max` times, so their reply budget scales with it. */
const LOOP_ACTIONS: ReadonlySet<string> = new Set(['elements', 'read-all', 'goto']);
const REAL_TARGET_LOOP_STEP_MS = 1500;
const VIRTUAL_LOOP_STEP_MS = 50;

function readPayloadMax(
   payload: Record<string, unknown> | undefined,
): number | undefined {
   const max = payload?.max;
   return typeof max === 'number' ? max : undefined;
}

/** Include the pause or phrase timeout; batches may omit the default phrase timeout. */
function readWaitBudget(payload: Record<string, unknown> | undefined): number {
   const ms = payload?.ms,
      timeoutMs = payload?.timeoutMs;
   if (typeof ms === 'number') {
      return ms;
   }
   return typeof timeoutMs === 'number' ? timeoutMs : DEFAULT_WAIT_TIMEOUT_MS;
}

export function resolveBrokerSocketTimeoutMs(
   request: Pick<BrokerRequest, 'command' | 'action' | 'payload' | 'timeoutMs'>,
   target?: Platform,
): number {
   if (request.timeoutMs !== undefined) {
      return request.timeoutMs + BROKER_RESPONSE_GRACE_MS;
   }
   const isReal = target === 'voiceover' || target === 'nvda';
   if (request.command === 'stop') {
      return isReal ? REAL_TARGET_STOP_SOCKET_TIMEOUT_MS : VIRTUAL_STOP_SOCKET_TIMEOUT_MS;
   }
   if (request.command === 'attach-document') {
      return ATTACH_DOCUMENT_SOCKET_TIMEOUT_MS;
   }
   const base = isReal ? REAL_TARGET_SOCKET_TIMEOUT_MS : VIRTUAL_SOCKET_TIMEOUT_MS;
   if (request.action === 'wait') {
      return base + readWaitBudget(request.payload);
   }
   const max = readPayloadMax(request.payload);
   if (
      request.action !== undefined &&
      LOOP_ACTIONS.has(request.action) &&
      max !== undefined
   ) {
      return base + max * (isReal ? REAL_TARGET_LOOP_STEP_MS : VIRTUAL_LOOP_STEP_MS);
   }
   return base;
}

export function resolveBrokerReadyTimeoutMs(target: Platform): number {
   return target === 'virtual'
      ? DEFAULT_BROKER_READY_TIMEOUT_MS
      : REAL_TARGET_BROKER_READY_TIMEOUT_MS;
}

interface WaitForBrokerOptions {
   sessionId: string;
   readSession: () => Promise<AccessibilityDriverSession | undefined>;
   timeoutMs: number;
}

async function pingSession(
   session: AccessibilityDriverSession | undefined,
   sessionId: string,
): Promise<AccessibilityDriverSession | undefined> {
   try {
      const socketPath = session?.socketPath ?? getDriverSocketPath(sessionId);
      const response = await connectToBroker(socketPath, { command: 'ping' });
      if (response.error?.code === 'session-starting') {
         return undefined;
      }
      if (response.error) {
         throw new CliEnvironmentError(
            response.error.code,
            response.error.message,
            response.error.details,
         );
      }
      const parsed = accessibilityDriverSessionSchema.safeParse(
         response.session ?? session,
      );
      return response.ok && parsed.success && parsed.data.sessionId === sessionId
         ? parsed.data
         : undefined;
   } catch (error) {
      if (error instanceof CliEnvironmentError) {
         throw error;
      }
      return undefined;
   }
}

async function pollForBroker(
   options: WaitForBrokerOptions,
   startedAt: number,
): Promise<AccessibilityDriverSession> {
   await throwIfBrokerStartupFailed(options.sessionId);
   if (Date.now() - startedAt >= options.timeoutMs) {
      throw new CliEnvironmentError(
         'driver-broker-timeout',
         'Timed out waiting for the driver broker to start.',
         { sessionId: options.sessionId },
      );
   }
   const session = await options.readSession();
   const live = await pingSession(
      session?.sessionId === options.sessionId ? session : undefined,
      options.sessionId,
   );
   if (live) {
      return live;
   }
   await delay(BROKER_POLL_DELAY_MS);
   return pollForBroker(options, startedAt);
}

/** Poll metadata or the known broker socket until startup answers. */
export async function waitForBroker(
   options: WaitForBrokerOptions,
): Promise<AccessibilityDriverSession> {
   return pollForBroker(options, Date.now());
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
   return basename(packageDir) === 'dist' ? dirname(packageDir) : packageDir;
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
   browser?: string | undefined;
   nativeInput?: AccessibilityDriverSession['nativeInput'];
   engine?: VirtualEngine | undefined;
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
      '--native-input',
      options.nativeInput ?? 'guarded',
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
   if (options.engine) {
      args.push('--engine', options.engine);
   }
   if (options.browser) {
      args.push('--browser', options.browser);
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
