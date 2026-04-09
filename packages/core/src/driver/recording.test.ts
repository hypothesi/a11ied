import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

interface SpawnState {
   code: number;
   signal: NodeJS.Signals | undefined;
   stderr: string;
   onEnd: ((path: string) => Promise<void> | void) | undefined;
   path: string;
}

type ChunkListener = (chunk: Buffer) => void;
type ExitListener = (code?: number, signal?: NodeJS.Signals) => void;
type ErrorListener = (error: Error) => void;

interface MockReadable {
   on(event: 'data', listener: ChunkListener): void;
   emitData(chunk: Buffer): void;
}

interface MockChildProcess {
   stdout: MockReadable;
   stderr: MockReadable;
   stdin: {
      write: ReturnType<typeof vi.fn>;
      end: ReturnType<typeof vi.fn>;
   };
   on(event: 'error', listener: ErrorListener): void;
   on(event: 'exit', listener: ExitListener): void;
   emitError(error: Error): void;
   emitExit(code?: number, signal?: NodeJS.Signals): void;
}

function createReadable(): MockReadable {
   const listeners = new Set<ChunkListener>();

   return {
      on(event: 'data', listener: ChunkListener): void {
         if (event === 'data') {
            listeners.add(listener);
         }
      },
      emitData(chunk: Buffer): void {
         for (const listener of listeners) {
            listener(chunk);
         }
      },
   };
}

function createMockChildProcess(): MockChildProcess {
   const errorListeners = new Set<ErrorListener>();
   const exitListeners = new Set<ExitListener>();

   return {
      stdout: createReadable(),
      stderr: createReadable(),
      stdin: {
         write: vi.fn(),
         end: vi.fn(),
      },
      on(event: 'error' | 'exit', listener: ErrorListener | ExitListener): void {
         if (event === 'error') {
            errorListeners.add(listener as ErrorListener);
            return;
         }

         exitListeners.add(listener as ExitListener);
      },
      emitError(error: Error): void {
         for (const listener of errorListeners) {
            listener(error);
         }
      },
      emitExit(code?: number, signal?: NodeJS.Signals): void {
         for (const listener of exitListeners) {
            listener(code, signal);
         }
      },
   };
}

async function flushMockStop(args: {
   child: MockChildProcess;
   filePath: string;
   spawnState: SpawnState;
}): Promise<void> {
   args.spawnState.path = args.filePath;
   await args.spawnState.onEnd?.(args.filePath);
   if (args.spawnState.stderr) {
      args.child.stderr.emitData(Buffer.from(args.spawnState.stderr));
   }
   args.child.emitExit(args.spawnState.code, args.spawnState.signal);
}

const recordingMocks = vi.hoisted(() => {
   const windowsStopRecording = vi.fn();
   const spawnState: SpawnState = {
      code: 0,
      signal: undefined,
      stderr: '',
      onEnd: undefined,
      path: '',
   };

   const spawnMock = vi.fn((_command: string, args: string[]) => {
      const child = createMockChildProcess();
      child.stdin.end.mockImplementation(async (): Promise<void> => {
         const filePath = args.at(-1) ?? '';
         await flushMockStop({
            child,
            filePath,
            spawnState,
         });
      });
      return child;
   });

   return {
      spawnMock,
      spawnState,
      windowsStopRecording,
      windowsRecord: vi.fn<(path: string) => () => void>(() => windowsStopRecording),
   };
});

vi.mock('node:child_process', () => ({
   spawn: recordingMocks.spawnMock,
}));

vi.mock('@guidepup/record', () => ({
   windowsRecord: recordingMocks.windowsRecord,
}));

import { startSessionRecording, validateRecordingRequest } from './recording.js';

const originalPlatform = process.platform;
const tempRoots: string[] = [];
const RECORDING_TEST_TIMEOUT_MS = 7000;

async function createTempRoot(): Promise<string> {
   const root = await mkdtemp(resolve(tmpdir(), 'a11ied-recording-'));
   tempRoots.push(root);
   return root;
}

function setPlatform(platform: NodeJS.Platform): void {
   Object.defineProperty(process, 'platform', {
      configurable: true,
      value: platform,
   });
}

function configureMacRecordingSuccess(): void {
   recordingMocks.spawnState.code = 0;
   recordingMocks.spawnState.signal = undefined;
   recordingMocks.spawnState.stderr = '';
   recordingMocks.spawnState.onEnd = async (path: string): Promise<void> => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, 'recording', 'utf8');
   };
}

function resetRecordingMocks(): void {
   recordingMocks.spawnMock.mockClear();
   recordingMocks.spawnState.code = 0;
   recordingMocks.spawnState.signal = undefined;
   recordingMocks.spawnState.stderr = '';
   recordingMocks.spawnState.onEnd = undefined;
   recordingMocks.spawnState.path = '';
   recordingMocks.windowsRecord.mockClear();
   recordingMocks.windowsStopRecording.mockClear();
}

async function expectMacRecordingStartAndStop(cwd: string): Promise<void> {
   const recordingPath = resolve(cwd, './recordings/session.mov');
   configureMacRecordingSuccess();
   const recording = startSessionRecording('voiceover', './recordings/session.mov', cwd);

   expect(recording.metadata).toMatchObject({
      path: recordingPath,
      format: 'mov',
      status: 'active',
   });

   const completed = await recording.stop();

   expect(recordingMocks.spawnMock).toHaveBeenCalledWith('/usr/sbin/screencapture', [
      '-v',
      '-C',
      '-k',
      '-T0',
      recordingPath,
   ]);
   expect(completed).toMatchObject({
      path: recordingPath,
      format: 'mov',
      status: 'completed',
   });
}

afterEach(async () => {
   setPlatform(originalPlatform);
   resetRecordingMocks();
   await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
   tempRoots.length = 0;
});

describe('driver recording start and stop', () => {
   it(
      'starts and stops one macOS recording with normalized metadata',
      async () => {
         setPlatform('darwin');
         await expectMacRecordingStartAndStop(await createTempRoot());
      },
      RECORDING_TEST_TIMEOUT_MS,
   );

   it(
      'surfaces native command failures before claiming recording success',
      async () => {
         setPlatform('darwin');
         const cwd = await createTempRoot();
         recordingMocks.spawnState.code = 1;
         recordingMocks.spawnState.stderr =
            'screencapture: No capture audio device available.\n';
         const recording = startSessionRecording(
            'voiceover',
            './recordings/session.mov',
            cwd,
         );

         await expect(recording.stop()).rejects.toThrowError(
            /No capture audio device available/,
         );
      },
      RECORDING_TEST_TIMEOUT_MS,
   );

   it(
      'fails cleanly when the native recorder exits without writing a file',
      async () => {
         setPlatform('darwin');
         const cwd = await createTempRoot();
         recordingMocks.spawnState.code = 0;
         const recording = startSessionRecording(
            'voiceover',
            './recordings/session.mov',
            cwd,
         );

         await expect(recording.stop()).rejects.toThrowError(/stopped without writing/);
      },
      RECORDING_TEST_TIMEOUT_MS,
   );
});

describe('driver recording validation', () => {
   it('rejects virtual-target recording requests explicitly', () => {
      expect(() =>
         validateRecordingRequest('virtual', './recordings/session.mov'),
      ).toThrowError(/Recording is only available for real VoiceOver or NVDA sessions/);
   });

   it('rejects mismatched file extensions', () => {
      setPlatform('darwin');

      expect(() =>
         startSessionRecording('voiceover', './recordings/session.mp4'),
      ).toThrowError(/must end with ".mov"/);
   });
});
