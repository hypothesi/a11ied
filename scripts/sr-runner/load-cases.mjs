import { resolve } from 'node:path';
import { build } from 'esbuild';

export async function loadScreenReaderCatalog(repoRoot) {
   const dataRoot = resolve(repoRoot, 'packages', 'support-data', 'src');
   const entryPoint = resolve(dataRoot, 'cases', 'index.ts');
   const typesEntryPoint = resolve(dataRoot, 'types.ts');
   const assertionsEntryPoint = resolve(dataRoot, 'assertions.ts');

   const [casesBundle, typesBundle, assertionsBundle] = await Promise.all([
      build({
         entryPoints: [entryPoint],
         bundle: true,
         write: false,
         format: 'esm',
         platform: 'node',
      }),
      build({
         entryPoints: [typesEntryPoint],
         bundle: true,
         write: false,
         format: 'esm',
         platform: 'node',
      }),
      build({
         entryPoints: [assertionsEntryPoint],
         bundle: true,
         write: false,
         format: 'esm',
         platform: 'node',
      }),
   ]);

   const casesCode = casesBundle.outputFiles[0]?.text ?? '';
   const typesCode = typesBundle.outputFiles[0]?.text ?? '';
   const assertionsCode = assertionsBundle.outputFiles[0]?.text ?? '';

   const [casesMod, typesMod, assertionsMod] = await Promise.all([
      import(`data:text/javascript;base64,${Buffer.from(casesCode).toString('base64')}`),
      import(`data:text/javascript;base64,${Buffer.from(typesCode).toString('base64')}`),
      import(
         `data:text/javascript;base64,${Buffer.from(assertionsCode).toString('base64')}`
      ),
   ]);

   const enrichedTests = [];
   for (const testCase of casesMod.screenReaderTests) {
      enrichedTests.push({
         ...testCase,
         assertions: assertionsMod.resolveCaseAssertions(testCase),
      });
   }

   return {
      screenReaderTests: enrichedTests,
      getTestCaseBySlug: (slug) => enrichedTests.find((tc) => tc.slug === slug),
      buildEnvironmentKey: typesMod.buildEnvironmentKey,
   };
}
