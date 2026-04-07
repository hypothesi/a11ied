import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

import {
   accessibilityDriverSessionSchema,
   driverActionResultSchema,
   type AccessibilityDriverSession,
   type DriverActionResult,
   type DriverCheckpoint,
   type Platform,
} from '@a11lied/contracts';
import { createDriverAdapter } from '@a11lied/guidepup';

import { CliEnvironmentError } from './wcag-runtime.js';

interface BrokerRequest {
   command: 'ping' | 'status' | 'stop' | 'action' | 'attach-document';
   action?: DriverActionResult['action'];
   payload?: Record<string, unknown>;
}

interface BrokerResponse {
   ok: boolean;
   result?: DriverActionResult;
   error?: {
      code: string;
      message: string;
   };
}

const stateFolder = '.a11lied';
const brokerReadyTimeoutMs = 5000;
const inMemoryBrokers = new Map<
   string,
   {
      session: AccessibilityDriverSession;
      target: Platform;
      checkpoints: DriverCheckpoint[];
      adapter: ReturnType<typeof createDriverAdapter>;
   }
>();

function delay(ms: number): Promise<void> {
   return new Promise((resolvePromise) => {
      setTimeout(resolvePromise, ms);
   });
}

function getCurrentModulePath(): string {
   if (typeof __filename === 'string') {
      return __filename;
   }

   return import.meta.filename;
}

function isSourceRuntime(): boolean {
   return getCurrentModulePath().endsWith('.ts');
}

function getBrokerEntryPath(): string {
   const currentFile = getCurrentModulePath();
   const currentDir = dirname(currentFile);
   return resolve(
      currentDir,
      isSourceRuntime() ? 'driver-broker.ts' : 'driver-broker.js',
   );
}

function getProjectRoot(): string {
   const currentFile = getCurrentModulePath();
   return resolve(dirname(currentFile), '../../..');
}

function useInMemoryBroker(): boolean {
   return process.env.VITEST === 'true';
}

function getStateRoot(cwd = process.cwd()): string {
   return resolve(cwd, stateFolder, 'state');
}

function getSessionsDirectory(cwd = process.cwd()): string {
   return resolve(getStateRoot(cwd), 'sessions');
}

function getSocketsDirectory(cwd = process.cwd()): string {
   return resolve(getStateRoot(cwd), 'broker');
}

export function getDriverSessionMetadataPath(
   sessionId: string,
   cwd = process.cwd(),
): string {
   return resolve(getSessionsDirectory(cwd), `${sessionId}.json`);
}

function getDriverSocketPath(sessionId: string, cwd = process.cwd()): string {
   if (process.platform === 'win32') {
      return `\\\\.\\pipe\\a11lied-${sessionId}`;
   }

   return resolve(getSocketsDirectory(cwd), `${sessionId}.sock`);
}

async function ensureStateDirectories(cwd = process.cwd()): Promise<void> {
   await Promise.all([
      mkdir(getSessionsDirectory(cwd), { recursive: true }),
      mkdir(getSocketsDirectory(cwd), { recursive: true }),
   ]);
}

async function writeSessionMetadata(session: AccessibilityDriverSession): Promise<void> {
   await mkdir(dirname(session.metadataFile), { recursive: true });
   await writeFile(session.metadataFile, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
}

function buildEphemeralSession(
   target: Platform,
   cwd: string,
   logCursor: number,
): AccessibilityDriverSession {
   const sessionId = `ephemeral_${randomUUID()}`;
   return accessibilityDriverSessionSchema.parse({
      sessionId,
      target,
      startedAt: new Date().toISOString(),
      capabilities: createDriverAdapter(target).capabilities,
      logCursor,
      brokerPid: process.pid,
      socketPath: `ephemeral://${sessionId}`,
      metadataFile: getDriverSessionMetadataPath(sessionId, cwd),
   });
}

async function runEphemeralAction(
   target: Platform,
   action: DriverActionResult['action'],
   payload: Record<string, unknown> | undefined,
   cwd: string,
): Promise<DriverActionResult> {
   const adapter = createDriverAdapter(target);
   const checkpoints: DriverCheckpoint[] = [];
   await adapter.start();

   try {
      switch (action) {
         case 'next': {
            await adapter.next();
            break;
         }
         case 'previous': {
            await adapter.previous();
            break;
         }
         case 'key': {
            await adapter.press(String(payload?.keys ?? ''));
            break;
         }
         case 'type': {
            await adapter.type(String(payload?.text ?? ''));
            break;
         }
         case 'interact': {
            await adapter.interact();
            break;
         }
         case 'stop-interacting': {
            await adapter.stopInteracting();
            break;
         }
         case 'click-current-item': {
            await adapter.activateCurrentItem();
            break;
         }
         case 'clear-logs': {
            await adapter.clearLogs(checkpoints);
            break;
         }
         case 'checkpoint': {
            checkpoints.push({
               label: String(payload?.label ?? 'checkpoint'),
               createdAt: new Date().toISOString(),
            });
            break;
         }
         case 'read':
         case 'logs':
         case 'status':
         case 'start':
         case 'attach-document':
         case 'stop': {
            break;
         }
      }

      const state =
         action === 'clear-logs'
            ? await adapter.clearLogs(checkpoints)
            : await adapter.readState(checkpoints);
      return driverActionResultSchema.parse({
         session: buildEphemeralSession(target, cwd, state.logCursor),
         action,
         state,
         details: payload,
      });
   } finally {
      await adapter.stop().catch(() => {});
   }
}

function isProcessRunning(pid: number): boolean {
   try {
      process.kill(pid, 0);
      return true;
   } catch (error) {
      if (error instanceof Error && 'code' in error) {
         const code = String(error.code);
         return code === 'EPERM';
      }

      return false;
   }
}

async function readSessionMetadata(
   sessionId: string,
   cwd = process.cwd(),
): Promise<AccessibilityDriverSession> {
   const metadataFile = getDriverSessionMetadataPath(sessionId, cwd);

   try {
      const raw = await readFile(metadataFile, 'utf8');
      return accessibilityDriverSessionSchema.parse(JSON.parse(raw));
   } catch {
      throw new CliEnvironmentError(
         'session-not-found',
         `Driver session "${sessionId}" was not found.`,
         { sessionId },
      );
   }
}

async function removeSessionArtifacts(
   session: AccessibilityDriverSession,
): Promise<void> {
   await rm(session.metadataFile, { force: true });
   if (process.platform !== 'win32') {
      await rm(session.socketPath, { force: true });
   }
}

async function connectToBroker(
   socketPath: string,
   request: BrokerRequest,
): Promise<BrokerResponse> {
   return await new Promise<BrokerResponse>((resolvePromise, rejectPromise) => {
      const chunks: Buffer[] = [];
      const client = net.createConnection(socketPath);

      client.setTimeout(1000);

      client.on('connect', () => {
         client.write(`${JSON.stringify(request)}\n`);
      });

      client.on('data', (chunk) => {
         chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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

async function waitForBroker(
   sessionId: string,
   cwd = process.cwd(),
): Promise<AccessibilityDriverSession> {
   const startedAt = Date.now();

   while (Date.now() - startedAt < brokerReadyTimeoutMs) {
      try {
         const session = await readSessionMetadata(sessionId, cwd);
         const response = await connectToBroker(session.socketPath, { command: 'ping' });
         if (response.ok) {
            return session;
         }
      } catch {
         await delay(100);
      }
   }

   throw new CliEnvironmentError(
      'driver-broker-timeout',
      'Timed out waiting for the driver broker to start.',
      {
         sessionId,
      },
   );
}

function brokerSpawnArgs(
   sessionId: string,
   target: Platform,
   metadataFile: string,
   socketPath: string,
): string[] {
   const entry = getBrokerEntryPath();
   const baseArgs = isSourceRuntime() ? ['--import', 'tsx', entry] : [entry];

   return [
      ...baseArgs,
      '--session-id',
      sessionId,
      '--target',
      target,
      '--metadata-file',
      metadataFile,
      '--socket-path',
      socketPath,
   ];
}

export async function cleanupStaleDriverSessions(cwd = process.cwd()): Promise<string[]> {
   const sessionsDir = getSessionsDirectory(cwd);

   try {
      await access(sessionsDir, fsConstants.F_OK);
   } catch {
      return [];
   }

   const removedSessionIds: string[] = [];
   const entries = await readdir(sessionsDir);

   for (const entry of entries) {
      if (!entry.endsWith('.json')) {
         continue;
      }

      const metadataFile = resolve(sessionsDir, entry);

      try {
         const session = accessibilityDriverSessionSchema.parse(
            JSON.parse(await readFile(metadataFile, 'utf8')),
         );
         if (useInMemoryBroker()) {
            if (!inMemoryBrokers.has(session.sessionId)) {
               await removeSessionArtifacts(session);
               removedSessionIds.push(session.sessionId);
            }
            continue;
         }

         if (!isProcessRunning(session.brokerPid)) {
            await removeSessionArtifacts(session);
            removedSessionIds.push(session.sessionId);
            continue;
         }

         try {
            const response = await connectToBroker(session.socketPath, {
               command: 'ping',
            });
            if (!response.ok) {
               await removeSessionArtifacts(session);
               removedSessionIds.push(session.sessionId);
            }
         } catch {
            await removeSessionArtifacts(session);
            removedSessionIds.push(session.sessionId);
         }
      } catch {
         await rm(metadataFile, { force: true });
      }
   }

   return removedSessionIds;
}

export async function startDriverSession(
   target: Platform,
   cwd = process.cwd(),
): Promise<AccessibilityDriverSession> {
   await ensureStateDirectories(cwd);
   await cleanupStaleDriverSessions(cwd);

   const readiness = await createDriverAdapter(target).checkReadiness();
   if (readiness.status !== 'ready') {
      throw new CliEnvironmentError('target-not-ready', readiness.summary, {
         target,
         status: readiness.status,
         details: readiness.details,
         setupCommand: readiness.setupCommand,
      });
   }

   const sessionId = `drv_${randomUUID()}`;
   const metadataFile = getDriverSessionMetadataPath(sessionId, cwd);
   const socketPath = getDriverSocketPath(sessionId, cwd);

   if (useInMemoryBroker()) {
      const adapter = createDriverAdapter(target);
      const checkpoints: DriverCheckpoint[] = [];
      await adapter.start();
      const state = await adapter.readState(checkpoints);
      const session = accessibilityDriverSessionSchema.parse({
         sessionId,
         target,
         startedAt: new Date().toISOString(),
         capabilities: adapter.capabilities,
         logCursor: state.logCursor,
         brokerPid: process.pid,
         socketPath: `in-memory://${sessionId}`,
         metadataFile,
      });

      inMemoryBrokers.set(sessionId, {
         session,
         target,
         checkpoints,
         adapter,
      });
      await writeSessionMetadata(session);
      return session;
   }

   const child = spawn(
      process.execPath,
      brokerSpawnArgs(sessionId, target, metadataFile, socketPath),
      {
         cwd: getProjectRoot(),
         detached: true,
         stdio: 'ignore',
      },
   );

   child.unref();

   return await waitForBroker(sessionId, cwd);
}

export async function getDriverSessionStatus(
   sessionId: string,
   cwd = process.cwd(),
): Promise<DriverActionResult> {
   if (useInMemoryBroker()) {
      const broker = inMemoryBrokers.get(sessionId);
      if (!broker) {
         throw new CliEnvironmentError(
            'session-not-found',
            `Driver session "${sessionId}" was not found.`,
            { sessionId },
         );
      }

      const state = await broker.adapter.readState(broker.checkpoints);
      return driverActionResultSchema.parse({
         session: {
            ...broker.session,
            logCursor: state.logCursor,
         },
         action: 'status',
         state,
      });
   }

   const session = await readSessionMetadata(sessionId, cwd);

   try {
      const response = await connectToBroker(session.socketPath, { command: 'status' });
      if (!response.ok || !response.result) {
         throw new CliEnvironmentError(
            response.error?.code ?? 'driver-broker-error',
            response.error?.message ?? `Could not read driver session "${sessionId}".`,
            { sessionId },
         );
      }

      return driverActionResultSchema.parse(response.result);
   } catch {
      throw new CliEnvironmentError(
         'session-not-found',
         `Driver session "${sessionId}" was not found.`,
         { sessionId },
      );
   }
}

export async function stopDriverSession(
   sessionId: string,
   cwd = process.cwd(),
): Promise<DriverActionResult> {
   if (useInMemoryBroker()) {
      const broker = inMemoryBrokers.get(sessionId);
      if (!broker) {
         throw new CliEnvironmentError(
            'session-not-found',
            `Driver session "${sessionId}" was not found.`,
            { sessionId },
         );
      }

      const state = await broker.adapter.readState(broker.checkpoints);
      await broker.adapter.stop();
      inMemoryBrokers.delete(sessionId);
      await removeSessionArtifacts(broker.session);

      return driverActionResultSchema.parse({
         session: {
            ...broker.session,
            logCursor: state.logCursor,
         },
         action: 'stop',
         state,
      });
   }

   const session = await readSessionMetadata(sessionId, cwd);

   try {
      const response = await connectToBroker(session.socketPath, { command: 'stop' });
      if (!response.ok || !response.result) {
         throw new CliEnvironmentError(
            response.error?.code ?? 'driver-broker-error',
            response.error?.message ?? `Could not stop driver session "${sessionId}".`,
            { sessionId },
         );
      }

      await removeSessionArtifacts(session);
      return driverActionResultSchema.parse(response.result);
   } catch {
      await removeSessionArtifacts(session);
      throw new CliEnvironmentError(
         'session-not-found',
         `Driver session "${sessionId}" was not found.`,
         { sessionId },
      );
   }
}

export async function attachDocumentToDriverSession(
   sessionId: string,
   document: { html: string; url: string },
   cwd = process.cwd(),
): Promise<void> {
   if (useInMemoryBroker()) {
      const broker = inMemoryBrokers.get(sessionId);
      if (!broker) {
         throw new CliEnvironmentError(
            'session-not-found',
            `Driver session "${sessionId}" was not found.`,
            { sessionId },
         );
      }

      await broker.adapter.attachDocument(document);
      const state = await broker.adapter.readState(broker.checkpoints);
      const updatedSession = {
         ...broker.session,
         logCursor: state.logCursor,
      };
      broker.session = updatedSession;
      await writeSessionMetadata(updatedSession);
      return;
   }

   const session = await readSessionMetadata(sessionId, cwd);

   try {
      const response = await connectToBroker(session.socketPath, {
         command: 'attach-document',
         payload: document,
      });

      if (!response.ok) {
         throw new CliEnvironmentError(
            response.error?.code ?? 'driver-broker-error',
            response.error?.message ??
               `Could not attach document to driver session "${sessionId}".`,
            { sessionId },
         );
      }
   } catch {
      throw new CliEnvironmentError(
         'session-not-found',
         `Driver session "${sessionId}" was not found.`,
         { sessionId },
      );
   }
}

export async function runDriverSessionAction(
   sessionId: string,
   action: DriverActionResult['action'],
   payload?: Record<string, unknown>,
   cwd = process.cwd(),
): Promise<DriverActionResult> {
   if (useInMemoryBroker()) {
      const broker = inMemoryBrokers.get(sessionId);
      if (!broker) {
         throw new CliEnvironmentError(
            'session-not-found',
            `Driver session "${sessionId}" was not found.`,
            { sessionId },
         );
      }

      switch (action) {
         case 'next': {
            await broker.adapter.next();
            break;
         }
         case 'previous': {
            await broker.adapter.previous();
            break;
         }
         case 'key': {
            await broker.adapter.press(String(payload?.keys ?? ''));
            break;
         }
         case 'type': {
            await broker.adapter.type(String(payload?.text ?? ''));
            break;
         }
         case 'interact': {
            await broker.adapter.interact();
            break;
         }
         case 'stop-interacting': {
            await broker.adapter.stopInteracting();
            break;
         }
         case 'click-current-item': {
            await broker.adapter.activateCurrentItem();
            break;
         }
         case 'clear-logs': {
            await broker.adapter.clearLogs(broker.checkpoints);
            break;
         }
         case 'checkpoint': {
            broker.checkpoints.push({
               label: String(payload?.label ?? 'checkpoint'),
               createdAt: new Date().toISOString(),
            });
            break;
         }
         case 'read':
         case 'logs': {
            break;
         }
         default: {
            throw new CliEnvironmentError(
               'unsupported-action',
               `Driver action "${action}" is unsupported in this lifecycle.`,
               {
                  action,
               },
            );
         }
      }

      const state = await broker.adapter.readState(broker.checkpoints);
      const updatedSession = {
         ...broker.session,
         logCursor: state.logCursor,
      };
      broker.session = updatedSession;
      await writeSessionMetadata(updatedSession);

      return driverActionResultSchema.parse({
         session: updatedSession,
         action,
         state,
         details: payload,
      });
   }

   const session = await readSessionMetadata(sessionId, cwd);

   try {
      const response = await connectToBroker(session.socketPath, {
         command: 'action',
         action,
         ...(payload ? { payload } : {}),
      });
      if (!response.ok || !response.result) {
         throw new CliEnvironmentError(
            response.error?.code ?? 'driver-broker-error',
            response.error?.message ??
               `Could not run driver action "${action}" for session "${sessionId}".`,
            { sessionId, action },
         );
      }

      return driverActionResultSchema.parse(response.result);
   } catch {
      throw new CliEnvironmentError(
         'session-not-found',
         `Driver session "${sessionId}" was not found.`,
         { sessionId },
      );
   }
}

export async function runEphemeralDriverAction(
   target: Platform,
   action: DriverActionResult['action'],
   payload?: Record<string, unknown>,
   cwd = process.cwd(),
): Promise<DriverActionResult> {
   const readiness = await createDriverAdapter(target).checkReadiness();
   if (readiness.status !== 'ready') {
      throw new CliEnvironmentError('target-not-ready', readiness.summary, {
         target,
         status: readiness.status,
         details: readiness.details,
         setupCommand: readiness.setupCommand,
      });
   }

   return await runEphemeralAction(target, action, payload, cwd);
}
