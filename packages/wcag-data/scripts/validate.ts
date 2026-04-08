import { validateGeneratedArtifacts, validateRawSyncState } from '../src/index.js';

function log(message: string): void {
   process.stdout.write(`${message}\n`);
}

const rawArtifacts = await validateRawSyncState();
const generatedArtifacts = await validateGeneratedArtifacts();

log('wcag-data sync validated');
log(`raw artifacts: ${rawArtifacts.length}`);
log(`generated artifacts: ${generatedArtifacts.length}`);
