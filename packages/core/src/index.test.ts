import { describe, expect, it } from 'vitest';

import {
   createDoctorReport,
   listCliCommands,
   listSupportedTargets,
   renderDoctorText,
} from './index.js';
import {
   APPLESCRIPT_DEFAULT,
   APPLESCRIPT_FLAG,
   ENABLED_DEFAULTS,
   INSTALL_COMMAND,
   LOCAL_PREFERENCES,
   NVDA_EXECUTABLE,
   READY_DARWIN_PATHS,
   SETUP_COMMAND,
   createDeps,
} from './doctor/test-fixtures.js';
import { expectReadyCommands } from './release-test-helpers.js';

const EXPECTED_TARGET_COUNT = 3;
const VOICEOVER_TARGET_INDEX = 0;
const NVDA_TARGET_INDEX = 1;
const VIRTUAL_TARGET_INDEX = 2;
describe('core scaffolding', () => {
   it('returns the supported target matrix', () => {
      const targets = listSupportedTargets();

      expect(targets).toHaveLength(EXPECTED_TARGET_COUNT);
      expect(targets.map((target) => target.platform)).toEqual([
         'voiceover',
         'nvda',
         'virtual',
      ]);
      expect(
         targets[VOICEOVER_TARGET_INDEX]?.notes.some((note: string) =>
            note.includes(SETUP_COMMAND),
         ),
      ).toBe(true);
   });

   it('returns only shipped ready command families in the CLI catalog data', () => {
      expectReadyCommands(listCliCommands());
   });
});

describe('doctor report on macOS', () => {
   it('reports a ready host when every VoiceOver check passes', () => {
      const report = createDoctorReport(
         createDeps({
            platform: 'darwin',
            existingPaths: READY_DARWIN_PATHS,
            defaults: ENABLED_DEFAULTS,
         }),
      );
      const statuses = report.targets.map((target) => target.status);
      const checks = report.targets[VOICEOVER_TARGET_INDEX]?.checks ?? [];

      expect(report.ready).toBe(true);
      expect(report.actions).toEqual([]);
      expect(report.host).toEqual({
         platform: 'darwin',
         osName: 'macOS',
         release: '26.0',
         arch: process.arch,
      });
      expect(statuses).toEqual(['ready', 'unsupported', 'ready']);
      expect(checks.every((check) => check.status === 'pass')).toBe(true);
      expect(renderDoctorText(report)).toContain('✓ Ready for a1 commands on macOS 26.0');
   });

   it('lists the install step when the VoiceOver preferences bundle is missing', () => {
      const report = createDoctorReport(
         createDeps({
            platform: 'darwin',
            existingPaths: [APPLESCRIPT_FLAG, LOCAL_PREFERENCES],
            defaults: ENABLED_DEFAULTS,
         }),
      );
      const text = renderDoctorText(report);

      expect(report.ready).toBe(false);
      expect(report.actions).toEqual([
         {
            label: 'Install the Guidepup VoiceOver preferences bundle',
            command: INSTALL_COMMAND,
            required: true,
         },
      ]);
      expect(report.targets[VOICEOVER_TARGET_INDEX]?.status).toBe('requires-setup');
      expect(text).toContain('✗ 1 setup step needed');
      expect(text).toContain('Action items');
      expect(text).toContain(INSTALL_COMMAND);
      expect(text).toContain('- windows-nvda     Only available on Windows.');
   });
});

describe('doctor report optional steps', () => {
   it('treats the welcome dialog setting as an optional step', () => {
      const report = createDoctorReport(
         createDeps({
            platform: 'darwin',
            existingPaths: READY_DARWIN_PATHS,
            defaults: { [APPLESCRIPT_DEFAULT]: '1' },
         }),
      );

      expect(report.ready).toBe(true);
      expect(report.targets[VOICEOVER_TARGET_INDEX]?.status).toBe('ready');
      expect(report.actions).toEqual([
         {
            label: 'Suppress the VoiceOver welcome dialog',
            command: SETUP_COMMAND,
            required: false,
         },
      ]);
      expect(renderDoctorText(report)).toContain('(optional)');
   });
});

describe('doctor report on other hosts', () => {
   it('checks the Guidepup NVDA build on Windows', () => {
      const missing = createDoctorReport(createDeps({ platform: 'win32' }));
      const installed = createDoctorReport(
         createDeps({ platform: 'win32', existingPaths: [NVDA_EXECUTABLE] }),
      );

      expect(missing.host.osName).toBe('Windows');
      expect(missing.targets[VOICEOVER_TARGET_INDEX]?.status).toBe('unsupported');
      expect(missing.targets[NVDA_TARGET_INDEX]?.status).toBe('requires-setup');
      expect(missing.actions).toEqual([
         {
            label: 'Install the Guidepup NVDA build',
            command: INSTALL_COMMAND,
            required: true,
         },
      ]);
      expect(installed.targets[NVDA_TARGET_INDEX]?.status).toBe('ready');
      expect(installed.ready).toBe(true);
   });

   it('flags a missing browser as a required action', () => {
      const report = createDoctorReport(
         createDeps({ platform: 'linux', browserDetected: false }),
      );

      expect(report.ready).toBe(false);
      expect(report.targets.map((target) => target.status)).toEqual([
         'unsupported',
         'unsupported',
         'ready',
      ]);
      expect(report.targets[VIRTUAL_TARGET_INDEX]?.summary).toBe('No setup needed.');
      expect(report.actions).toEqual([
         {
            label: 'Install a Chromium browser for axe scans',
            command: 'npx playwright install chromium',
            required: true,
         },
      ]);
      expect(renderDoctorText(report)).toContain('✗ No Chromium-family browser found');
   });
});
