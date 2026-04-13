import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
   accessibilityDriverSessionSchema,
   type AccessibilityDriverSession,
   type Platform,
   type SessionRecording,
} from '@a11ied/contracts';
import { createDriverAdapter } from '@a11ied/guidepup';

import { connectToBroker } from './broker-client.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';

const JSON_INDENT = 2;
const stateFolder = '.a11ied';
const UNIX_SOCKET_DIR = '/tmp';

const { env } = process;

export function useInMemoryBroker(): boolean {
   return env.VITEST === 'true';
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

export function getDriverSocketPath(sessionId: string, _cwd = process.cwd()): string {
   if (process.platform === 'win32') {
      return `\\\\.\\pipe\\a11ied-${sessionId}`;
   }
   return resolve(UNIX_SOCKET_DIR, `a11ied-${sessionId}.sock`);
}

export async function ensureStateDirectories(cwd = process.cwd()): Promise<void> {
   await Promise.all([
      mkdir(getSessionsDirectory(cwd), { recursive: true }),
      mkdir(getSocketsDirectory(cwd), { recursive: true }),
   ]);
}

export async function writeSessionMetadata(
   session: AccessibilityDriverSession,
): Promise<void> {
   await mkdir(dirname(session.metadataFile), { recursive: true });
   const json = JSON.stringify(session, undefined, JSON_INDENT);
   await writeFile(session.metadataFile, `${json}\n`, 'utf8');
}

export function buildEphemeralSession(args: {
   target: Platform;
   cwd: string;
   logCursor: number;
   recording?: SessionRecording;
}): AccessibilityDriverSession {
   const sessionId = `ephemeral_${crypto.randomUUID()}`;
   let targetType: AccessibilityDriverSession['targetType'] = 'real';
   if (args.target === 'virtual') {
      targetType = 'simulated';
   }
   return accessibilityDriverSessionSchema.parse({
      sessionId,
      target: args.target,
      targetType,
      startedAt: new Date().toISOString(),
      capabilities: createDriverAdapter(args.target).capabilities,
      logCursor: args.logCursor,
      brokerPid: process.pid,
      socketPath: `ephemeral://${sessionId}`,
      metadataFile: getDriverSessionMetadataPath(sessionId, args.cwd),
      recording: args.recording,
   });
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

export async function readSessionMetadata(
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

export async function removeSessionArtifacts(
   session: AccessibilityDriverSession,
): Promise<void> {
   await rm(session.metadataFile, { force: true });
   if (process.platform !== 'win32') {
      await rm(session.socketPath, { force: true });
   }
}

async function processSessionEntryInMemory(
   session: AccessibilityDriverSession,
   activeIds: Set<string>,
): Promise<string | undefined> {
   if (activeIds.has(session.sessionId)) {
      return undefined;
   }
   await removeSessionArtifacts(session);
   return session.sessionId;
}

async function removeAndReturnId(session: AccessibilityDriverSession): Promise<string> {
   await removeSessionArtifacts(session);
   return session.sessionId;
}

async function processSessionEntryLive(
   session: AccessibilityDriverSession,
): Promise<string | undefined> {
   if (!isProcessRunning(session.brokerPid)) {
      return removeAndReturnId(session);
   }
   try {
      const response = await connectToBroker(session.socketPath, {
         command: 'ping',
      });
      if (!response.ok) {
         return removeAndReturnId(session);
      }
   } catch {
      return removeAndReturnId(session);
   }
   return undefined;
}

export async function processSessionEntry(
   entry: string,
   sessionsDir: string,
   activeIds: Set<string> | undefined,
): Promise<string | undefined> {
   if (!entry.endsWith('.json')) {
      return undefined;
   }
   const metadataFile = resolve(sessionsDir, entry);
   try {
      const session = accessibilityDriverSessionSchema.parse(
         JSON.parse(await readFile(metadataFile, 'utf8')),
      );
      if (activeIds) {
         return processSessionEntryInMemory(session, activeIds);
      }
      return processSessionEntryLive(session);
   } catch {
      await rm(metadataFile, { force: true });
      return undefined;
   }
}

export async function listSessionEntries(
   cwd = process.cwd(),
): Promise<string[] | undefined> {
   const sessionsDir = getSessionsDirectory(cwd);
   try {
      await access(sessionsDir, fsConstants.F_OK);
   } catch {
      return undefined;
   }
   return await readdir(sessionsDir);
}

export function getSessionsDir(cwd = process.cwd()): string {
   return getSessionsDirectory(cwd);
}
