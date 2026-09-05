import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PAGE_SCRIPT_SPECIFIER = '@a11ied/guidepup/virtual-page.js';

/**
 * The package export first, which holds when this module is bundled into another
 * package's dist. Then the path next to this file, which holds from src and from dist.
 */
function resolvePageScriptPath(): string {
   try {
      return fileURLToPath(import.meta.resolve(PAGE_SCRIPT_SPECIFIER));
   } catch {
      return fileURLToPath(new URL('../dist/virtual-page.js', import.meta.url));
   }
}

let pageScript: Promise<string> | undefined = globalThis.undefined;

/**
 * The self-contained script that puts the virtual reader runtime on a page's `window`.
 * Read once per process from this package's dist directory.
 */
export function readVirtualPageScript(): Promise<string> {
   pageScript ??= readFile(resolvePageScriptPath(), 'utf8').catch((error: unknown) => {
      pageScript = globalThis.undefined;
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
         `The virtual reader page script is missing. Build @a11ied/guidepup to produce dist/virtual-page.js. ${reason}`,
      );
   });
   return pageScript;
}
