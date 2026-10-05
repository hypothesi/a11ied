import { describe, expect, it, vi } from 'vitest';
import { readDoctorBrowserVersion } from './versions.js';

describe('browser version metadata', () => {
   it('reads macOS bundle metadata instead of launching the browser', () => {
      const run = vi.fn().mockReturnValue('146.0.1');
      const version = readDoctorBrowserVersion(
         {
            id: 'chrome',
            label: 'Chrome',
            source: 'system',
            launchMode: 'executable-path',
            location: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
         },
         'darwin',
         run,
      );

      expect(version).toStrictEqual('146.0.1');
      expect(run).toHaveBeenCalledWith('/usr/libexec/PlistBuddy', [
         '-c',
         'Print :CFBundleShortVersionString',
         '/Applications/Google Chrome.app/Contents/Info.plist',
      ]);
   });

   it('quotes Windows literal paths and requests a noninteractive metadata query', () => {
      const run = vi.fn().mockReturnValue('146.0.1');
      readDoctorBrowserVersion(
         {
            id: 'chrome',
            label: 'Chrome',
            source: 'system',
            launchMode: 'executable-path',
            location: "C:\\Browser's Folder\\chrome.exe",
         },
         'win32',
         run,
      );

      expect(run).toHaveBeenCalledWith('powershell', [
         '-NoProfile',
         '-NonInteractive',
         '-Command',
         String.raw`(Get-Item -LiteralPath 'C:\Browser''s Folder\chrome.exe').VersionInfo.ProductVersion`,
      ]);
   });

   it('leaves an unavailable browser version unknown', () => {
      const run = vi.fn();
      const version = readDoctorBrowserVersion(undefined, 'darwin', run);

      expect(version).toBeUndefined();
      expect(run).not.toHaveBeenCalled();
   });
});
