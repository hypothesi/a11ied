import { writeAtomic } from '@a11ied/core';

/** Writes a file for `--out`, creating any missing parent directories first. */
export async function writeOutputFile(path: string, contents: string): Promise<void> {
   await writeAtomic(path, contents);
}
