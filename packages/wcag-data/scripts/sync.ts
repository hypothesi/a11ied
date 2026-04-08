import { SyncValidationError, runWcagDataSync } from '../src/index.js';

function log(message: string): void {
   process.stdout.write(`${message}\n`);
}

try {
   const result = await runWcagDataSync();

   log('wcag-data sync complete');
   log(`sources: ${result.fetchList.length}`);
   log(`raw artifacts: ${result.rawArtifacts.length}`);
   log(`axe rules: ${result.axeRuleCount}`);
   log(`generated artifacts: ${result.generatedArtifacts.length}`);
   log(
      `criteria counts: ${Object.entries(result.criteriaCountByVersion)
         .map(([version, count]) => `${version}=${count}`)
         .join(', ')}`,
   );
} catch (error) {
   if (error instanceof SyncValidationError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = error.exitCode;
   } else {
      throw error;
   }
}
