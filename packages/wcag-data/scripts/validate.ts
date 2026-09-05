import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
   getWcagDataDirectories,
   validateDocumentArtifacts,
   validateGeneratedArtifacts,
   validateRawSyncState,
} from '../src/index.js';

function log(message: string): void {
   process.stdout.write(`${message}\n`);
}

/*
 * Raw inputs are ignored by git and only exist after `npm run wcag:sync`, so a fresh
 * checkout validates the committed generated artifacts alone.
 */
const directories = getWcagDataDirectories(),
   hasRawInputs = existsSync(join(directories.raw, 'wcag.2.2.json'));

const generatedArtifacts = await validateGeneratedArtifacts(directories);
const documentArtifacts = await validateDocumentArtifacts(directories);

log('wcag-data sync validated');
if (hasRawInputs) {
   const rawArtifacts = await validateRawSyncState(directories);
   log(`raw artifacts: ${rawArtifacts.length}`);
} else {
   log('raw artifacts: not synced locally (run npm run wcag:sync to validate them)');
}
log(`generated artifacts: ${generatedArtifacts.length}`);
log(`document artifacts: ${documentArtifacts.length}`);
