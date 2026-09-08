import { resolve } from 'node:path';

/** Overrides where recorded results are written. */
export const EVIDENCE_FILE_ENV_VAR = 'A11IED_EVIDENCE';

const DEFAULT_EVIDENCE_FILE = '.a11ied/evidence.jsonl';

const { env } = process;

/**
 * Resolves the evidence file: an explicit path, else `$A11IED_EVIDENCE`, else
 * `.a11ied/evidence.jsonl` under the working directory.
 *
 * This is deliberately per project, not per user, and does not go through
 * `resolveStateRoot()`. Screen reader session state belongs to the machine, but a
 * recorded accessibility result belongs to the site being tested, the way a test runner
 * writes its results next to the project it tested.
 */
export function resolveEvidenceFile(
   explicitPath: string | undefined,
   overrides: NodeJS.ProcessEnv = env,
): string {
   const configured = explicitPath ?? overrides[EVIDENCE_FILE_ENV_VAR];
   return resolve(configured ?? DEFAULT_EVIDENCE_FILE);
}
