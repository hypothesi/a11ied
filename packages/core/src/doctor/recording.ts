import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import type { DoctorCheck } from '@a11ied/contracts';

const RECORDER_QUERY_TIMEOUT_MS = 5000;
const RECORDING_PROBE_SECONDS = 1;
const RECORDING_PROBE_TIMEOUT_MS = 4000;
const SCREEN_RECORDING_PERMISSION_NOTE =
   'If the same command works from Terminal but fails here, grant Screen Recording permission to the current host app.';

/** Check the existing recorder's binary without recording or changing OS settings. */
export function checkWindowsRecording(): DoctorCheck {
   const check: DoctorCheck = {
      id: 'windows-recording',
      label: 'Windows recording binary',
      status: 'fail',
   };
   try {
      const require = createRequire(import.meta.url);
      const recordRequire = createRequire(require.resolve('@guidepup/record'));
      const binary: unknown = recordRequire('ffmpeg-static');
      if (typeof binary !== 'string' || !existsSync(binary)) {
         return {
            ...check,
            detail:
               'The configured Windows recorder binary is missing. Resolve the recorder dependency and installation.',
         };
      }
      const result = spawnSync(binary, ['-version'], {
         encoding: 'utf8',
         timeout: RECORDER_QUERY_TIMEOUT_MS,
      });
      if (result.error || result.status !== 0) {
         return {
            ...check,
            detail:
               result.error?.message ?? 'The Windows recorder binary could not execute.',
         };
      }
      return {
         ...check,
         status: 'pass',
         detail: result.stdout.split('\n')[0] ?? 'Recorder binary responds.',
      };
   } catch (error) {
      return { ...check, detail: error instanceof Error ? error.message : String(error) };
   }
}

function describeRecordingProbeFailure(args: {
   status: number | null;
   stderr: string;
}): string {
   if (args.stderr) {
      return `Recording probe failed: ${args.stderr}`;
   }
   return `Recording probe failed: screencapture exited with code ${String(args.status ?? 'unknown')} without writing a movie file.`;
}

/** Remove the temporary capture regardless of whether the host has permission. */
export function probeScreenRecordingWithScreencapture(): DoctorCheck {
   const probeDir = mkdtempSync(join(tmpdir(), 'a11ied-doctor-'));
   const probePath = join(probeDir, 'recording-probe.mov');
   const label = 'Screen recording available to the current host app';

   try {
      const result = spawnSync(
         '/usr/sbin/screencapture',
         ['-v', '-V', String(RECORDING_PROBE_SECONDS), probePath],
         { encoding: 'utf8', timeout: RECORDING_PROBE_TIMEOUT_MS },
      );
      if (!result.error && result.status === 0 && existsSync(probePath)) {
         return { id: 'screen-recording', label, status: 'pass' };
      }

      const failure = result.error
         ? `Recording probe failed: ${result.error.message}`
         : describeRecordingProbeFailure({
              status: result.status,
              stderr: result.stderr.trim(),
           });
      return {
         id: 'screen-recording',
         label,
         status: 'warn',
         detail: `${failure} ${SCREEN_RECORDING_PERMISSION_NOTE}`,
      };
   } finally {
      rmSync(probeDir, { recursive: true, force: true });
   }
}
