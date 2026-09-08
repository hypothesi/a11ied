import { fetchCorpus, readTestCases } from '../src/corpus.js';

const includeVideoAssets = process.argv.includes('--video');

const paths = await fetchCorpus({ includeVideoAssets });
const testCases = await readTestCases(paths);

process.stdout.write(`corpus at ${paths.root}\n`);
process.stdout.write(`${String(testCases.length)} test cases\n`);
if (!includeVideoAssets) {
   process.stdout.write(
      'video assets skipped (84 MB). Pass --video before a W3C submission.\n',
   );
}
