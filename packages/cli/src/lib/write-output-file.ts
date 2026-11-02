import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Writes a file for `--out`, creating any missing parent directories first. */
export async function writeOutputFile(path: string, contents: string): Promise<void> {
   await mkdir(dirname(path), { recursive: true });
   await writeFile(path, contents, 'utf8');
}
