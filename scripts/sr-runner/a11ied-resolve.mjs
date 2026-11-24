import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const { env: processEnv } = process;

export function resolveA11iedDir() {
   const configured = processEnv.A11IED_DIR;
   const candidate = configured
      ? resolve(configured)
      : resolve(import.meta.dirname, '..', '..');
   if (!existsSync(candidate)) {
      throw new Error(
         `Could not find a11ied directory at ${candidate}. Set A11IED_DIR to override.`,
      );
   }
   return candidate;
}

export function resolveA11iedPaths() {
   const root = resolveA11iedDir();
   return {
      root,
      coreEntry: resolve(root, 'packages', 'core', 'dist', 'index.js'),
      cliEntry: resolve(root, 'packages', 'cli', 'dist', 'cli.js'),
      guidepupEntry: resolve(
         root,
         'node_modules',
         '@guidepup',
         'guidepup',
         'lib',
         'index.js',
      ),
      guidepupPkg: resolve(root, 'node_modules', '@guidepup', 'guidepup', 'package.json'),
      virtualSrPkg: resolve(
         root,
         'node_modules',
         '@guidepup',
         'virtual-screen-reader',
         'package.json',
      ),
      playwrightEntry: resolve(root, 'node_modules', 'playwright', 'index.mjs'),
   };
}
