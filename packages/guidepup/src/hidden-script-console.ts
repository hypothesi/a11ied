import { execFile } from 'node:child_process';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { promisify } from 'node:util';

/** The output limit guidepup's own runner allows. */
const MAX_SCRIPT_OUTPUT_BYTES = 100_000_000;

const execFileAsync = promisify(execFile),
   require = createRequire(import.meta.url);

interface VbsScriptModule {
   runVbsScript: (script: string) => Promise<string>;
}

/** Runs a VBScript through cscript without showing a console window. */
async function runHiddenVbsScript(script: string): Promise<string> {
   const dir = await mkdtemp(`${await realpath(tmpdir())}${sep}`);

   try {
      const file = join(dir, 'script.vbs');

      await writeFile(file, script);
      const { stdout } = await execFileAsync('cscript', [file], {
         encoding: 'utf8',
         maxBuffer: MAX_SCRIPT_OUTPUT_BYTES,
         windowsHide: true,
      });
      return stdout.trim();
   } finally {
      await rm(dir, { recursive: true, force: true });
   }
}

/**
 * The guidepup NVDA driver types by running one VBScript per character, each in a visible
 * console. From a background process that console opens in front of the browser and takes
 * the keystroke meant for the page. guidepup's modules look the runner up on every call,
 * so replacing it here reaches all of them.
 */
export function hideScriptConsoles(): void {
   const vbsModule: VbsScriptModule = require('@guidepup/guidepup/lib/windows/runVbsScript.js');

   vbsModule.runVbsScript = runHiddenVbsScript;
}
