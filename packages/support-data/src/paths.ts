import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SupportDataDirectories {
   readonly rootDir: string;
   readonly resultsDir: string;
   readonly ariaAtDir: string;
   readonly ariaAtPlansDir: string;
   readonly ariaAtSummaryPath: string;
}

function resolveInstalledPath(specifier: string): string | undefined {
   try {
      return fileURLToPath(import.meta.resolve(specifier));
   } catch {
      return undefined;
   }
}

function resolveDataRootFromPackage(): string | undefined {
   const packageJsonPath = resolveInstalledPath('@a11ied/support-data/package.json');
   if (packageJsonPath) {
      const candidate = resolve(dirname(packageJsonPath), 'data');
      if (existsSync(candidate)) {
         return candidate;
      }
   }

   const packageEntryPath = resolveInstalledPath('@a11ied/support-data');
   if (!packageEntryPath) {
      return undefined;
   }
   const packageDir = dirname(packageEntryPath);
   const candidate = packageDir.endsWith('/dist')
      ? resolve(packageDir, '../data')
      : resolve(packageDir, 'data');
   return existsSync(candidate) ? candidate : undefined;
}

function getDataRootCandidates(): readonly string[] {
   return [
      resolve(import.meta.dirname, '../data'),
      resolve(import.meta.dirname, '../../data'),
      resolve(import.meta.dirname, '../../support-data/data'),
      resolve(import.meta.dirname, '../../../packages/support-data/data'),
      resolve(process.cwd(), 'packages/support-data/data'),
   ];
}

/** Resolves the `data/` directory containing local results and W3C ARIA-AT JSON files. */
export function resolveSupportDataRoot(): string {
   const fromPackage = resolveDataRootFromPackage();
   if (fromPackage) {
      return fromPackage;
   }

   for (const candidate of getDataRootCandidates()) {
      if (existsSync(candidate)) {
         return candidate;
      }
   }

   return resolve(process.cwd(), 'packages/support-data/data');
}

export function getSupportDataDirectories(): SupportDataDirectories {
   const rootDir = resolveSupportDataRoot();
   const ariaAtDir = resolve(rootDir, 'aria-at');
   return {
      rootDir,
      resultsDir: resolve(rootDir, 'results'),
      ariaAtDir,
      ariaAtPlansDir: resolve(ariaAtDir, 'plans'),
      ariaAtSummaryPath: resolve(ariaAtDir, 'summary.json'),
   };
}
