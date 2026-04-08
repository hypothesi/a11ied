import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import net from 'node:net';

import type { AccessibilityDriverSession, DriverActionResult } from '@a11lied/contracts';

import type { BrokerRequest, BrokerResponse } from './broker-handlers.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';

const SOCKET_TIMEOUT_MS = 1000;
const BROKER_POLL_DELAY_MS = 100;
const BROKER_READY_TIMEOUT_MS = 5000;
const require = createRequire(import.meta.url);

function delay(ms: number): Promise<void> {
   return new Promise((resolvePromise) => {
      setTimeout(resolvePromise, ms);
   });
}

export async function connectToBroker(
   socketPath: string,
   request: BrokerRequest,
): Promise<BrokerResponse> {
   return await new Promise<BrokerResponse>((resolvePromise, rejectPromise) => {
      const chunks: Buffer[] = [];
      const client = net.createConnection(socketPath);

      client.setTimeout(SOCKET_TIMEOUT_MS);

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

interface PollBrokerOptions {
   sessionId: string;
   cwd: string;
   startedAt: number;
   readSession: (sid: string, cwd: string) => Promise<AccessibilityDriverSession>;
}

async function pollBrokerConnection(
   options: PollBrokerOptions,
): Promise<AccessibilityDriverSession> {
   if (Date.now() - options.startedAt >= BROKER_READY_TIMEOUT_MS) {
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

export async function waitForBroker(
   sessionId: string,
   cwd: string,
   readSession: (sid: string, cwdPath: string) => Promise<AccessibilityDriverSession>,
): Promise<AccessibilityDriverSession> {
   return pollBrokerConnection({
      sessionId,
      cwd,
      startedAt: Date.now(),
      readSession,
   });
}

function getCurrentModulePath(): string {
   return import.meta.filename;
}

function isSourceRuntime(): boolean {
   return getCurrentModulePath().endsWith('.ts');
}

function resolveCorePackageRoot(): string | undefined {
   try {
      const packageEntryPath = require.resolve('@a11lied/core');
      const packageDir = dirname(packageEntryPath);
      if (packageDir.endsWith('/dist')) {
         return dirname(packageDir);
      }
      return packageDir;
   } catch {
      try {
         const packageJsonPath = require.resolve('@a11lied/core/package.json');
         return dirname(packageJsonPath);
      } catch {
         return undefined;
      }
   }
}

function getBrokerEntryFromPackageRoot(packageRoot: string): string | undefined {
   const entries = [
      resolve(packageRoot, 'dist/broker.js'),
      resolve(packageRoot, 'src/driver/broker.ts'),
   ];

   return entries.find((entry) => existsSync(entry));
}

function getBrokerEntryFromCurrentModule(): string {
   const currentDir = dirname(getCurrentModulePath());
   if (isSourceRuntime()) {
      return resolve(currentDir, 'broker.ts');
   }

   return resolve(currentDir, 'broker.js');
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

   return [
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
