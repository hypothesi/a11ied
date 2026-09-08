import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** The fetch prints progress to stderr; 64 MB of it is far more than git produces. */
const GIT_OUTPUT_BUFFER_BYTES = 67_108_864;

/**
 * The commit the corpus is pinned to. Bump it deliberately, then re-run the conformance
 * check, because new test cases can introduce contradictions.
 */
export const CORPUS_COMMIT = '800c3b49aa394ed62bc9676e3067c58ebedb788e';

export const CORPUS_REPO = 'https://github.com/w3c/wcag-act-rules.git';

/**
 * The path the test cases use in their own asset references, so the server must mount
 * here.
 */
export const CORPUS_MOUNT_PATH = '/WAI/content-assets/wcag-act-rules';

const CORPUS_SUBDIR = 'content-assets/wcag-act-rules';

const packageRoot = resolve(import.meta.dirname, '..');

export interface CorpusPaths {
   root: string;
   assets: string;
   indexFile: string;
}

/** Resolves where the corpus lives on disk. Nothing is fetched. */
export function getCorpusPaths(): CorpusPaths {
   const root = join(packageRoot, '.cache', CORPUS_COMMIT);
   return {
      root,
      assets: join(root, CORPUS_SUBDIR),
      indexFile: join(root, CORPUS_SUBDIR, 'testcases.json'),
   };
}

async function isPresent(path: string): Promise<boolean> {
   try {
      await stat(path);
      return true;
   } catch {
      return false;
   }
}

/**
 * Fetches the ACT test cases with a blobless sparse clone pinned to `CORPUS_COMMIT`. A
 * full clone is 105 MB; this pulls the test cases and their assets only.
 *
 * `includeVideoAssets` adds `perspective-video` and `rabbit-video`, 84 MB between them.
 * Their test cases cover ACT rules `eac66b`, `80f0bf`, and `8fc3b6`, which axe does
 * claim, so a submission run needs them even though a quick local run does not.
 */
export async function fetchCorpus(options: {
   includeVideoAssets: boolean;
}): Promise<CorpusPaths> {
   const paths = getCorpusPaths();
   if (await isPresent(paths.indexFile)) {
      return paths;
   }

   await rm(paths.root, { recursive: true, force: true });
   await mkdir(paths.root, { recursive: true });

   await run('git', ['init', '--quiet'], { cwd: paths.root });
   await run('git', ['remote', 'add', 'origin', CORPUS_REPO], { cwd: paths.root });
   await run('git', ['config', 'extensions.partialClone', 'origin'], { cwd: paths.root });

   const sparsePaths = [
      `${CORPUS_SUBDIR}/testcases`,
      `${CORPUS_SUBDIR}/testcases.json`,
      `${CORPUS_SUBDIR}/test-assets`,
   ];
   const excludes = options.includeVideoAssets
      ? []
      : [
           `!${CORPUS_SUBDIR}/test-assets/perspective-video`,
           `!${CORPUS_SUBDIR}/test-assets/rabbit-video`,
        ];

   await run('git', ['sparse-checkout', 'init', '--no-cone'], { cwd: paths.root });
   await run(
      'git',
      ['sparse-checkout', 'set', '--no-cone', ...sparsePaths, ...excludes],
      {
         cwd: paths.root,
      },
   );
   await run(
      'git',
      ['fetch', '--depth', '1', '--filter=blob:none', 'origin', CORPUS_COMMIT],
      { cwd: paths.root, maxBuffer: GIT_OUTPUT_BUFFER_BYTES },
   );
   await run('git', ['checkout', '--quiet', CORPUS_COMMIT], { cwd: paths.root });

   return paths;
}

export interface ActTestCase {
   ruleId: string;
   ruleName: string;
   expected: 'passed' | 'failed' | 'inapplicable';
   testcaseId: string;
   testcaseTitle: string;
   relativePath: string;
   url: string;
   rulePage: string;
   approved?: boolean;
}

/** Reads the pinned test case index. */
export async function readTestCases(paths: CorpusPaths): Promise<ActTestCase[]> {
   const parsed: unknown = JSON.parse(await readFile(paths.indexFile, 'utf8'));
   if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('testcases' in parsed) ||
      !Array.isArray(parsed.testcases)
   ) {
      throw new Error(`expected testcases[] in ${paths.indexFile}`);
   }
   return parsed.testcases;
}
