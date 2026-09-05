import { access } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

import {
   sessionRecordingSchema,
   type Platform,
   type SessionRecording,
} from '@a11ied/contracts';
import { windowsRecord } from '@guidepup/record';

import { CliEnvironmentError, CliUsageError } from '../errors/cli-errors.js';
import { createMacOSStopRecording } from './recording-command.js';

type RealRecordingTarget = Extract<Platform, 'voiceover' | 'nvda'>;
type StopRecording = () => void | Promise<void>;
const RECORDING_FILE_TIMEOUT_MS = 5000;
const RECORDING_FILE_POLL_MS = 100;
export interface ActiveSessionRecording {
   metadata: SessionRecording;
   stop(): Promise<SessionRecording>;
}

function requireRealRecordingTarget(target: Platform): RealRecordingTarget {
   if (target === 'virtual') {
      throw new CliUsageError(
         'recording-target-unsupported',
         'Recording is only available for real VoiceOver or NVDA sessions.',
         { target },
      );
   }

   return target;
}

function resolveRecordingFormat(target: RealRecordingTarget): 'mov' | 'mp4' {
   if (target === 'voiceover') {
      return 'mov';
   }

   return 'mp4';
}

function resolveExpectedPlatform(target: RealRecordingTarget): NodeJS.Platform {
   if (target === 'voiceover') {
      return 'darwin';
   }

   return 'win32';
}

function resolvePlatformLabel(platform: NodeJS.Platform): string {
   if (platform === 'darwin') {
      return 'macOS';
   }

   if (platform === 'win32') {
      return 'Windows';
   }

   return platform;
}

function assertRecordingHost(target: RealRecordingTarget): void {
   const expectedPlatform = resolveExpectedPlatform(target);
   if (process.platform !== expectedPlatform) {
      throw new CliEnvironmentError(
         'recording-host-unsupported',
         `Recording for ${target} is only available on ${resolvePlatformLabel(expectedPlatform)}.`,
         {
            target,
            hostPlatform: process.platform,
            expectedPlatform,
         },
      );
   }
}

function assertRecordingExtension(
   target: RealRecordingTarget,
   absolutePath: string,
): 'mov' | 'mp4' {
   const format = resolveRecordingFormat(target);
   const extension = extname(absolutePath).toLowerCase();
   const expectedExtension = `.${format}`;

   if (extension !== expectedExtension) {
      throw new CliUsageError(
         'recording-extension-mismatch',
         `Recording path "${absolutePath}" must end with "${expectedExtension}" for ${target}.`,
         {
            target,
            path: absolutePath,
            expectedExtension,
         },
      );
   }

   return format;
}

function createStopRecording(
   target: RealRecordingTarget,
   absolutePath: string,
): StopRecording {
   if (target === 'voiceover') {
      return createMacOSStopRecording(absolutePath);
   }
   return windowsRecord(absolutePath);
}

function delay(ms: number): Promise<void> {
   return new Promise((resolvePromise) => {
      setTimeout(resolvePromise, ms);
   });
}

async function fileExists(path: string): Promise<boolean> {
   try {
      await access(path);
      return true;
   } catch {
      return false;
   }
}

async function waitForRecordingFile(
   path: string,
   startedAt = Date.now(),
): Promise<boolean> {
   if (await fileExists(path)) {
      return true;
   }

   if (Date.now() - startedAt >= RECORDING_FILE_TIMEOUT_MS) {
      return false;
   }

   await delay(RECORDING_FILE_POLL_MS);
   return waitForRecordingFile(path, startedAt);
}

/** Validates one requested recording path before any broker or driver session starts. */
export function validateRecordingRequest(
   target: Platform,
   recordingPath: string,
   cwd = process.cwd(),
): { absolutePath: string; format: 'mov' | 'mp4' } {
   const realTarget = requireRealRecordingTarget(target);
   assertRecordingHost(realTarget);

   const absolutePath = resolve(cwd, recordingPath);
   const format = assertRecordingExtension(realTarget, absolutePath);

   return { absolutePath, format };
}

/** Starts one host-native screen recording and returns its lifecycle handle. */
export function startSessionRecording(
   target: Platform,
   recordingPath: string,
   cwd = process.cwd(),
): ActiveSessionRecording {
   const realTarget = requireRealRecordingTarget(target);
   const validated = validateRecordingRequest(target, recordingPath, cwd);
   const startedAt = new Date().toISOString();
   const stopNativeRecording = createStopRecording(realTarget, validated.absolutePath);

   const activeRecording = sessionRecordingSchema.parse({
      path: validated.absolutePath,
      format: validated.format,
      status: 'active',
      startedAt,
   });

   let completedRecording: SessionRecording | undefined = undefined;

   return {
      metadata: activeRecording,
      async stop(): Promise<SessionRecording> {
         if (completedRecording) {
            return completedRecording;
         }

         await stopNativeRecording();
         const recordingCaptured = await waitForRecordingFile(validated.absolutePath);
         if (!recordingCaptured) {
            throw new CliEnvironmentError(
               'recording-file-missing',
               `The native recorder stopped without writing "${validated.absolutePath}".`,
               {
                  target,
                  path: validated.absolutePath,
               },
            );
         }
         completedRecording = sessionRecordingSchema.parse({
            ...activeRecording,
            status: 'completed',
            stoppedAt: new Date().toISOString(),
         });
         return completedRecording;
      },
   };
}
