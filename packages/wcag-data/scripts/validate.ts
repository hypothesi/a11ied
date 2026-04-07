import { validateGeneratedArtifacts, validateRawSyncState } from '../src/index.js';

const rawArtifacts = await validateRawSyncState();
const generatedArtifacts = await validateGeneratedArtifacts();

console.log('wcag-data sync validated');
console.log(`raw artifacts: ${rawArtifacts.length}`);
console.log(`generated artifacts: ${generatedArtifacts.length}`);
