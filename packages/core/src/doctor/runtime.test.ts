import { describe, expect, it, vi } from 'vitest';
import { createDoctorReport } from './runtime.js';
import { renderDoctorText } from './render.js';
import {
   APPLESCRIPT_FLAG,
   createDeps,
   ENABLED_DEFAULTS,
   LOCAL_PREFERENCES,
   NVDA_EXECUTABLE,
   READY_DARWIN_PATHS,
} from './test-fixtures.js';

describe('task-specific doctor checks', () => {
   it('checks scans without reading reader settings or probing recording', () => {
      const deps = createDeps({ platform: 'darwin' }),
         recording = vi.spyOn(deps, 'probeScreenRecording'),
         settings = vi.spyOn(deps.guidepup, 'readDefault');
      const report = createDoctorReport(deps, { task: 'scan' });

      expect(report.ready).toStrictEqual(true);
      expect(report.targets.map((target) => target.platform)).to.eql(['virtual']);
      expect(recording).not.toHaveBeenCalled();
      expect(settings).not.toHaveBeenCalled();
   });

   it('requires recording only when requested', () => {
      const deps = createDeps({
            platform: 'darwin',
            existingPaths: READY_DARWIN_PATHS,
            defaults: ENABLED_DEFAULTS,
         }),
         recording = vi.spyOn(deps, 'probeScreenRecording').mockReturnValue({
            id: 'screen-recording',
            label: 'Screen recording permission',
            status: 'warn',
            detail: 'Permission unavailable',
         });
      const ordinary = createDoctorReport(deps, { task: 'reader', target: 'voiceover' });

      expect(ordinary.ready).toStrictEqual(true);
      expect(recording).not.toHaveBeenCalled();
      const recorded = createDoctorReport(deps, {
         task: 'reader',
         target: 'voiceover',
         recording: true,
      });

      expect(recorded.ready).toStrictEqual(false);
      expect(recorded.targets[0]?.checks.at(-1)?.status).toStrictEqual('fail');
   });
});

describe('requested reader environments', () => {
   it('rejects simulated audit environments even when no setup command can fix them', () => {
      const report = createDoctorReport(createDeps({ platform: 'darwin' }), {
         task: 'audit',
         target: 'virtual',
      });

      expect(report.ready).toStrictEqual(false);
      expect(report.targets[0]?.status).toStrictEqual('requires-setup');
      expect(renderDoctorText(report)).toContain('Requested environment is unavailable');
   });

   it('rejects a requested real reader on the wrong host', () => {
      const report = createDoctorReport(createDeps({ platform: 'linux' }), {
         task: 'audit',
         target: 'voiceover',
      });

      expect(report.ready).toStrictEqual(false);
      expect(report.targets[0]?.summary).toStrictEqual('Only available on macOS.');
   });

   it('allows native reader sessions without requiring a browser', () => {
      const report = createDoctorReport(
         createDeps({
            platform: 'win32',
            existingPaths: [NVDA_EXECUTABLE],
            browserDetected: false,
         }),
         {
            task: 'reader',
            target: 'nvda',
         },
      );

      expect(report.ready).toStrictEqual(true);
      expect(report.actions).to.eql([]);
      expect(report.readerVersions?.nvda).toStrictEqual(
         'Guidepup bundle 0.2.1-2026.1.1 (manifest)',
      );
   });
});

describe('doctor prerequisite failures', () => {
   it('rejects unsupported recording requests', () => {
      const deps = createDeps({ platform: 'darwin' });

      expect(() => createDoctorReport(deps, { task: 'scan', recording: true })).toThrow(
         'Recording requires',
      );
      expect(() =>
         createDoctorReport(deps, { task: 'reader', target: 'virtual', recording: true }),
      ).toThrow('Recording requires');
   });

   it('reports unreadable reader manifests while retaining browser diagnostics', () => {
      const deps = createDeps({
         platform: 'darwin',
         existingPaths: READY_DARWIN_PATHS,
         defaults: ENABLED_DEFAULTS,
      });
      vi.spyOn(deps.guidepup, 'readManifest').mockImplementation(() => {
         throw new Error('Corrupt Guidepup manifest');
      });
      const report = createDoctorReport(deps, { task: 'reader', target: 'voiceover' });

      expect(report.ready).toStrictEqual(false);
      expect(report.targets[0]?.checks[0]).toMatchObject({
         status: 'fail',
         detail:
            'Corrupt Guidepup manifest Reinstall the a11ied package or workspace dependencies, then run a1 setup.',
      });
      expect(report.browserAutomation.preferredCandidate).toBeDefined();
   });
});

describe('doctor repair actions and recording dependencies', () => {
   it('reports recording failures without recommending reader setup', () => {
      const deps = createDeps({
         platform: 'darwin',
         existingPaths: READY_DARWIN_PATHS,
         defaults: ENABLED_DEFAULTS,
      });
      vi.spyOn(deps, 'probeScreenRecording').mockImplementation(() => {
         throw new Error('Capture directory is unavailable');
      });
      const report = createDoctorReport(deps, {
         task: 'reader',
         target: 'voiceover',
         recording: true,
      });

      expect(report.ready).toStrictEqual(false);
      expect(report.targets[0]?.checks.at(-1)).toMatchObject({
         id: 'recording-prerequisite-unreadable',
         detail: 'Capture directory is unavailable',
      });
      expect(report.actions).to.eql([]);
   });
   it('keeps a required repair action when an earlier warning uses the same command', () => {
      const report = createDoctorReport(
         createDeps({
            platform: 'darwin',
            existingPaths: [APPLESCRIPT_FLAG, LOCAL_PREFERENCES],
            defaults: { 'com.apple.VoiceOver4/default:SCREnableAppleScript': '1' },
         }),
      );

      expect(report.ready).toStrictEqual(false);
      expect(report.actions).toHaveLength(1);
      expect(report.actions[0]).toMatchObject({ command: 'a1 setup', required: true });
   });

   it('checks the Windows recorder dependency when requested', () => {
      const deps = createDeps({ platform: 'win32', existingPaths: [NVDA_EXECUTABLE] });
      const report = createDoctorReport(
         {
            ...deps,
            probeWindowsRecording: () => ({
               id: 'windows-recording',
               label: 'Windows recording binary',
               status: 'fail',
               detail: 'Binary missing',
            }),
         },
         { task: 'reader', target: 'nvda', recording: true },
      );

      expect(report.ready).toStrictEqual(false);
      expect(report.targets[0]?.checks.at(-1)?.detail).toStrictEqual('Binary missing');
   });
});
