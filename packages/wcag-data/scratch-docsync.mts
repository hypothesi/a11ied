import { getWcagDataDirectories, syncDocumentArtifacts } from './src/index.js';
import { curlFetch } from './src/shared/curl-fetch.js';

const directories = getWcagDataDirectories();
const result = await syncDocumentArtifacts({
   directories,
   fetchImpl: curlFetch,
   concurrency: 1,
   paceMs: 1500,
});
console.log('requestCount:', result.requestCount);
console.log('understandingCount:', result.understandingCount);
console.log('techniqueBodyCount:', result.techniqueBodyCount);
console.log('uniqueBodyCount:', result.uniqueBodyCount);
console.log('failureCount:', result.failures.length);
