import { join } from 'node:path';
import type { BrowserAutomationCandidate, Platform } from '@a11ied/contracts';
import type { GuidepupEnvironmentDeps } from '@a11ied/guidepup';

/** Read installed metadata without launching a browser window or a reader session. */
export function readDoctorBrowserVersion(
   candidate: BrowserAutomationCandidate | undefined,
   platform: NodeJS.Platform,
   run: (command: string, args: string[]) => string | undefined,
): string | undefined {
   const location = candidate?.location;
   if (!location) {
      return undefined;
   }
   if (platform === 'darwin') {
      const appEnd = location.indexOf('.app/');
      if (appEnd === -1) {
         return undefined;
      }
      const info = join(`${location.slice(0, appEnd)}.app`, 'Contents', 'Info.plist');
      return run('/usr/libexec/PlistBuddy', [
         '-c',
         'Print :CFBundleShortVersionString',
         info,
      ]);
   }
   if (platform === 'win32') {
      const escaped = location.replaceAll("'", "''");
      return run('powershell', [
         '-NoProfile',
         '-NonInteractive',
         '-Command',
         `(Get-Item -LiteralPath '${escaped}').VersionInfo.ProductVersion`,
      ]);
   }
   return run(location, ['--version']);
}

/** Distinguish OS reader versions from the Guidepup bundle named in its manifest. */
export function readDoctorReaderVersion(
   target: Platform,
   deps: GuidepupEnvironmentDeps,
   osVersion: string,
): string {
   if (target === 'voiceover') {
      return deps.platform === 'darwin'
         ? `Built into macOS ${osVersion}`
         : 'Unavailable on this host';
   }
   if (target === 'virtual') {
      return 'Simulated DOM reader';
   }
   if (deps.platform !== 'win32' || !deps.manifestPath) {
      return 'Unavailable on this host';
   }
   try {
      const manifest = deps.readManifest(deps.manifestPath),
         version = manifest.screenReaders.find((reader) => reader.id === 'nvda')
            ?.assets[0]?.version;
      return version ? `Guidepup bundle ${version} (manifest)` : 'Unavailable';
   } catch {
      return 'Unavailable';
   }
}
