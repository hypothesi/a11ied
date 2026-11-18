import { randomUUID } from 'node:crypto';
import {
   link,
   mkdir,
   open,
   readFile,
   realpath,
   rename,
   rm,
   type FileHandle,
} from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { lock } from 'proper-lockfile';

/** Atomic rename so external callers do not import `rename` from `node:fs/promises`. */
export async function renameAtomicPath(from: string, to: string): Promise<void> {
   await rename(from, to);
}

/** Lock configuration shared by all primitives; total retry budget >= 10s. */
export const LOCK_CONFIG = {
   stale: 30_000,
   retries: {
      retries: 40,
      factor: 1.25,
      minTimeout: 25,
      maxTimeout: 500,
      randomize: true,
   },
} as const;

const PRIVATE_FILE_MODE = 0o600;
const JSON_INDENT = 3;
const waitingFiles = new Map<string, Promise<unknown>>();

/** Resolve filesystem aliases even when the destination has not been created yet. */
export async function getCanonicalPath(path: string): Promise<string> {
   const input = resolve(path);
   try {
      return await realpath(input);
   } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
         const parent = dirname(input);
         if (parent !== input) {
            return resolve(await getCanonicalPath(parent), basename(input));
         }
      }
      throw error;
   }
}

/** Serialize filesystem mutations with stale-lock recovery and bounded contention retries. */
async function withFilesystemLock<TResult>(
   lockTargetPath: string,
   fn: () => Promise<TResult>,
): Promise<TResult> {
   await mkdir(dirname(lockTargetPath), { recursive: true });
   const release = await lock(lockTargetPath, {
      realpath: false,
      stale: LOCK_CONFIG.stale,
      retries: LOCK_CONFIG.retries,
   }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to acquire lock on ${lockTargetPath}: ${message}`, {
         cause: error,
      });
   });
   try {
      return await fn();
   } finally {
      await release();
   }
}

/**
 * Primitive 2 — Queue in-process callers on the same path, then acquire the filesystem
 * lock. LOCK ORDERING: acquire `run.json` before `evidence.jsonl`, never the reverse.
 */
export async function withPathLock<TResult>(
   lockTargetPath: string,
   fn: () => Promise<TResult>,
): Promise<TResult> {
   const key = resolve(lockTargetPath);
   const previous = waitingFiles.get(key) ?? Promise.resolve();
   const pending = (async (): Promise<TResult> => {
      await Promise.allSettled([previous]);
      return withFilesystemLock(lockTargetPath, fn);
   })();
   waitingFiles.set(key, pending);
   try {
      return await pending;
   } finally {
      if (waitingFiles.get(key) === pending) {
         waitingFiles.delete(key);
      }
   }
}

/** Backwards-compatible alias for `withPathLock`. */
export async function withFileLock<TResult>(
   path: string,
   run: () => Promise<TResult>,
): Promise<TResult> {
   return withPathLock(path, run);
}

/** Write options for `writeAtomic`. */
export interface WriteAtomicOptions {
   overwrite?: boolean;
   mode?: number;
}

function serializePayload(data: string | Uint8Array | object): string | Uint8Array {
   return typeof data === 'string' || data instanceof Uint8Array
      ? data
      : `${JSON.stringify(data, undefined, JSON_INDENT)}\n`;
}

async function flushToHandle(
   handle: FileHandle,
   payload: string | Uint8Array,
): Promise<void> {
   await (typeof payload === 'string'
      ? handle.writeFile(payload, 'utf8')
      : handle.writeFile(payload));
   await handle.sync();
}

/**
 * Primitive 1 — Atomic write of text, bytes, or JSON-serializable object. Writes to a
 * unique temporary file, fsyncs, then renames or links atomically.
 */
export async function writeAtomic(
   path: string,
   data: string | Uint8Array | object,
   options: WriteAtomicOptions = {},
): Promise<void> {
   const { overwrite = true, mode = PRIVATE_FILE_MODE } = options;
   const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
   await mkdir(dirname(path), { recursive: true });

   const payload = serializePayload(data);
   const handle = await open(temporaryPath, 'wx', mode);
   try {
      try {
         await flushToHandle(handle, payload);
      } finally {
         await handle.close();
      }
      await (overwrite ? rename(temporaryPath, path) : link(temporaryPath, path));
   } finally {
      await rm(temporaryPath, { force: true });
   }
}

/** Replace text files without exposing partial writes or following leaf links. */
export async function writeTextAtomic(
   value: string,
   path: string,
   overwrite = true,
): Promise<void> {
   return writeAtomic(path, value, { overwrite });
}

/** Replace binary files without exposing partial writes or following leaf links. */
export async function writeBytesAtomic(value: Uint8Array, path: string): Promise<void> {
   return writeAtomic(path, value);
}

/**
 * Replace JSON-serializable files without exposing partially written content or following
 * leaf links.
 */
export async function writeJsonAtomic(
   value: unknown,
   path: string,
   overwrite = true,
): Promise<void> {
   return writeTextAtomic(
      `${JSON.stringify(value, undefined, JSON_INDENT)}\n`,
      path,
      overwrite,
   );
}

async function readOptionalFile(path: string): Promise<string | undefined> {
   try {
      return await readFile(path, 'utf8');
   } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
         return;
      }
      throw error;
   }
}

/** Read-modify-write helper that transforms while holding the path lock. */
export async function updateJsonAtomic<TData>(
   path: string,
   update: (current: TData | undefined) => TData | Promise<TData>,
): Promise<TData> {
   return withPathLock(path, async () => {
      const raw = await readOptionalFile(path);
      const current = raw ? (JSON.parse(raw) as TData) : undefined;
      const next = await update(current);
      await writeAtomic(path, next as object);
      return next;
   });
}

/** Options for locked file read-modify-write operations. */
export interface LockedFileOptions<TState> {
   /** Parse raw file content (undefined if file doesn't exist) into state. */
   parse: (raw: string | undefined) => TState;
   /** Serialize state for atomic write. Defaults to JSON with indentation. */
   serialize?: (state: TState) => string | Uint8Array | object;
}

/**
 * Primitive 3 — Single-file read-modify-write under lock. Reads, transforms via `mutate`,
 * and writes atomically unless `write === false`.
 */
export async function withLockedFile<TState, TResult>(
   path: string,
   options: LockedFileOptions<TState>,
   mutate: (
      state: TState,
   ) =>
      | Promise<{ state: TState; result: TResult; write?: boolean }>
      | { state: TState; result: TResult; write?: boolean },
): Promise<TResult> {
   return withPathLock(path, async () => {
      const raw = await readOptionalFile(path);
      const currentState = options.parse(raw);
      const next = await mutate(currentState);

      if (next.write !== false) {
         const payload = options.serialize
            ? options.serialize(next.state)
            : (next.state as string | Uint8Array | object);
         await writeAtomic(path, payload);
      }

      return next.result;
   });
}

function formatLineRecord(record: string | object): string {
   if (typeof record === 'string') {
      return record.endsWith('\n') ? record : `${record}\n`;
   }
   return `${JSON.stringify(record)}\n`;
}

/**
 * Append a single newline-terminated line without acquiring a lock. Use inside
 * `withPathLock` or `withRunTransaction` to avoid deadlock.
 */
export async function appendLineUnlocked(
   path: string,
   record: string | object,
): Promise<void> {
   await mkdir(dirname(path), { recursive: true });
   const line = formatLineRecord(record);
   const handle = await open(path, 'a', PRIVATE_FILE_MODE);
   try {
      await handle.writeFile(line, 'utf8');
      await handle.sync();
   } finally {
      await handle.close();
   }
}

/** Primitive 4 — Append a single newline-terminated line atomically under lock. */
export async function appendLine(path: string, record: string | object): Promise<void> {
   return withPathLock(path, () => appendLineUnlocked(path, record));
}

async function swapDirectory(stagingDir: string, targetDir: string): Promise<void> {
   const targetExists = await realpath(targetDir)
      .then(() => true)
      .catch(() => false);
   const backupDir = `${targetDir}.bak-${process.pid}-${randomUUID()}`;
   if (targetExists) {
      await rename(targetDir, backupDir);
   }
   try {
      await rename(stagingDir, targetDir);
   } catch (error) {
      if (targetExists) {
         await rename(backupDir, targetDir);
      }
      throw error;
   }
   if (targetExists) {
      await rm(backupDir, { recursive: true, force: true });
   }
}

/** Options for directory commit customization. */
export interface DirectoryCommitOptions {
   lockPath?: string | undefined;
   stagePath?: string | undefined;
   beforeCreateStage?: () => Promise<void>;
   afterCreateStage?: (stageDir: string) => Promise<void>;
   commitStage?: (stageDir: string, targetDir: string) => Promise<void>;
   discardStage?: (stageDir: string, targetDir: string) => Promise<void>;
}

/** Primitive 5 — Multi-file directory commit under lock; stage then swap into place. */
export async function withDirectoryCommit<TResult>(
   targetDir: string,
   populate: (stagingDir: string) => Promise<TResult>,
   options?: DirectoryCommitOptions,
): Promise<TResult> {
   const resolvedTargetDir = resolve(targetDir);
   return withPathLock(options?.lockPath ?? targetDir, async () => {
      await options?.beforeCreateStage?.();
      const stagingDir =
         options?.stagePath ??
         `${resolvedTargetDir}.stage-${process.pid}-${randomUUID()}`;
      await mkdir(stagingDir, { recursive: options?.stagePath === undefined });
      await options?.afterCreateStage?.(stagingDir);
      const commitStage = options?.commitStage ?? swapDirectory,
         discardStage =
            options?.discardStage ??
            ((stage: string): Promise<void> =>
               rm(stage, { recursive: true, force: true }));
      let committed = false;
      try {
         const result = await populate(stagingDir);
         await commitStage(stagingDir, resolvedTargetDir);
         committed = true;
         return result;
      } finally {
         if (!committed) {
            await discardStage(stagingDir, resolvedTargetDir);
         }
      }
   });
}

/** Build an `<stem>.attempt-<attempt>.<ext>` artifact path. */
export function attemptArtifactPath(
   dir: string,
   stem: string,
   ...rest: [attempt: number | string, ext: string]
): string {
   const [attempt, ext] = rest;
   const safeStem = stem.replaceAll(/[^a-zA-Z0-9._-]+/gu, '-');
   const cleanExt = ext.replace(/^\.+/u, '');
   return resolve(dir, `${safeStem}.attempt-${attempt}.${cleanExt}`);
}
