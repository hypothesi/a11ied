import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

import type {
   AccessibilityDriverSession,
   DriverActionResult,
   Platform,
} from '@a11ied/contracts';

import type { BrokerRequest, BrokerResponse } from './broker-handlers.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';

const VIRTUAL_SOCKET_TIMEOUT_MS = 2_000;
// Must cover: guidepup op (up to 15s) + speech stabilization (5s) + retries
const REAL_TARGET_SOCKET_TIMEOUT_MS = 30_000;
const REAL_TARGET_STOP_SOCKET_TIMEOUT_MS = 20_000;
const VIRTUAL_STOP_SOCKET_TIMEOUT_MS = 7_000;
const BROKER_POLL_DELAY_MS = 100;
const DEFAULT_BROKER_READY_TIMEOUT_MS = 5_000;
const REAL_TARGET_BROKER_READY_TIMEOUT_MS = 15_000;

function delay(ms: number): Promise<void> {
   return new Promise((resolvePromise) => {
      setTimeout(resolvePromise, ms);
   });
}

export async function connectToBroker(
   socketPath: string,
   request: BrokerRequest,
   timeoutMs = VIRTUAL_SOCKET_TIMEOUT_MS,
): Promise<BrokerResponse> {
   return await new Promise<BrokerResponse>((resolvePromise, rejectPromise) => {
      const chunks: Buffer[] = [];
      const client = net.createConnection(socketPath);

      client.setTimeout(timeoutMs);

      client.on('connect', () => {
         client.write(`${JSON.stringify(request)}\n`);
      });

      client.on('data', (chunk) => {
         if (Buffer.isBuffer(chunk)) {
            chunks.push(chunk);
         } else {
            chunks.push(Buffer.from(chunk));
         }
      });

      client.on('end', () => {
         try {
            const response = JSON.parse(
               Buffer.concat(chunks).toString('utf8'),
            ) as BrokerResponse;
            resolvePromise(response);
         } catch (error) {
            rejectPromise(error);
         }
      });

      client.on('timeout', () => {
         client.destroy(new Error('Broker connection timed out.'));
      });

      client.on('error', (error) => {
         rejectPromise(error);
      });
   });
}

export function resolveBrokerSocketTimeoutMs(
   request: Pick<BrokerRequest, 'command'>,
   target?: Platform,
): number {
   const isReal = target === 'voiceover' || target === 'nvda';

   if (request.command === 'stop') {
      return isReal ? REAL_TARGET_STOP_SOCKET_TIMEOUT_MS : VIRTUAL_STOP_SOCKET_TIMEOUT_MS;
   }

   return isReal ? REAL_TARGET_SOCKET_TIMEOUT_MS : VIRTUAL_SOCKET_TIMEOUT_MS;
}

interface PollBrokerOptions {
   sessionId: string;
   cwd: string;
   startedAt: number;
   timeoutMs: number;
   readSession: (sid: string, cwd: string) => Promise<AccessibilityDriverSession>;
}

async function pollBrokerConnection(
   options: PollBrokerOptions,
): Promise<AccessibilityDriverSession> {
   if (Date.now() - options.startedAt >= options.timeoutMs) {
      throw new CliEnvironmentError(
         'driver-broker-timeout',
         'Timed out waiting for the driver broker to start.',
         { sessionId: options.sessionId },
      );
   }
   try {
      const session = await options.readSession(options.sessionId, options.cwd);
      const response = await connectToBroker(session.socketPath, {
         command: 'ping',
      });
      if (response.ok) {
         return session;
      }
   } catch {
      await delay(BROKER_POLL_DELAY_MS);
   }
   return pollBrokerConnection(options);
}

export function resolveBrokerReadyTimeoutMs(target: Platform): number {
   if (target === 'virtual') {
      return DEFAULT_BROKER_READY_TIMEOUT_MS;
   }

   return REAL_TARGET_BROKER_READY_TIMEOUT_MS;
}

export interface WaitForBrokerOptions {
   sessionId: string;
   cwd: string;
   readSession: (sid: string, cwdPath: string) => Promise<AccessibilityDriverSession>;
   timeoutMs?: number;
}

export async function waitForBroker(
   options: WaitForBrokerOptions,
): Promise<AccessibilityDriverSession> {
   return pollBrokerConnection({
      sessionId: options.sessionId,
      cwd: options.cwd,
      startedAt: Date.now(),
      timeoutMs: options.timeoutMs ?? DEFAULT_BROKER_READY_TIMEOUT_MS,
      readSession: options.readSession,
   });
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
   if (packageDir.endsWith('/dist')) {
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
   const currentFile = getCurrentModulePath();
   return resolve(dirname(currentFile), '../../..');
}

export interface BrokerSpawnOptions {
   sessionId: string;
   target: string;
   metadataFile: string;
   socketPath: string;
   recordingPath?: string;
}

function getBaseSpawnArgs(entry: string): string[] {
   if (isSourceRuntime()) {
      return ['--import', 'tsx', entry];
   }
   return [entry];
}

function brokerSpawnArgs(options: BrokerSpawnOptions): string[] {
   const entry = getBrokerEntryPath();
   const baseArgs = getBaseSpawnArgs(entry);

   const args = [
      ...baseArgs,
      '--session-id',
      options.sessionId,
      '--target',
      options.target,
      '--metadata-file',
      options.metadataFile,
      '--socket-path',
      options.socketPath,
   ];

   if (options.recordingPath) {
      args.push('--recording-path', options.recordingPath);
   }

   return args;
}

export function spawnBrokerProcess(options: BrokerSpawnOptions): void {
   const child = spawn(process.execPath, brokerSpawnArgs(options), {
      cwd: getProjectRoot(),
      detached: true,
      stdio: 'ignore',
   });
   child.unref();
}

export async function sendBrokerCommand(
   socketPath: string,
   action: DriverActionResult['action'],
   payload?: Record<string, unknown>,
): Promise<BrokerResponse> {
   const request: BrokerRequest = {
      command: 'action',
      action,
   };
   if (payload) {
      request.payload = payload;
   }
   return connectToBroker(socketPath, request);
}
