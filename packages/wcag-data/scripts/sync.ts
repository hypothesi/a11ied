import { SyncValidationError, runWcagDataSync } from '../src/index.js';

try {
   const result = await runWcagDataSync();

   console.log('wcag-data sync complete');
   console.log(`sources: ${result.fetchList.length}`);
   console.log(`raw artifacts: ${result.rawArtifacts.length}`);
   console.log(`axe rules: ${result.axeRuleCount}`);
   console.log(`generated artifacts: ${result.generatedArtifacts.length}`);
   console.log(
      `criteria counts: ${Object.entries(result.criteriaCountByVersion)
         .map(([version, count]) => `${version}=${count}`)
         .join(', ')}`,
   );
} catch (error) {
   if (error instanceof SyncValidationError) {
      console.error(error.message);
      process.exit(error.exitCode);
   }

   throw error;
}
