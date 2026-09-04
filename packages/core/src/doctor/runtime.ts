import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { arch, release, tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
   BrowserAutomationPolicy,
   DoctorAction,
   DoctorCheck,
   DoctorHost,
   DoctorReport,
   DoctorTarget,
   Target,
} from '@a11ied/contracts';
import {
   checkNvdaEnvironment,
   checkVoiceOverEnvironment,
   createDefaultGuidepupEnvironmentDeps,
   GUIDEPUP_INSTALL_COMMAND,
   GUIDEPUP_SETUP_COMMAND,
   type GuidepupEnvironmentDeps,
} from '@a11ied/guidepup';

import { createBrowserAutomationPolicy } from '../browser/policy.js';

const PACKAGE_VERSION = '0.1.0';
const COMMAND_TIMEOUT_MS = 5000;
const RECORDING_PROBE_SECONDS = 1;
const RECORDING_PROBE_TIMEOUT_MS = 4000;
const SCREEN_RECORDING_PERMISSION_NOTE =
   'If the same recording command works from Terminal but fails here, grant Screen Recording permission to the current host app.';

const supportedTargets: Target[] = [
   {
      id: 'macos-voiceover',
      platform: 'voiceover',
      os: 'macOS',
      status: 'requires-setup',
      notes: [
         `Run \`${GUIDEPUP_SETUP_COMMAND}\` and \`${GUIDEPUP_INSTALL_COMMAND}\` once per machine before the first real-device session.`,
         'a11ied uses native macOS video capture without requesting microphone input.',
      ],
   },
   {
      id: 'windows-nvda',
      platform: 'nvda',
      os: 'Windows',
      status: 'requires-setup',
      notes: [
         `Run \`${GUIDEPUP_INSTALL_COMMAND}\` once per machine to download the Guidepup NVDA build.`,
      ],
   },
   {
      id: 'virtual-dom',
      platform: 'virtual',
      os: 'Cross-platform',
      status: 'ready',
      notes: ['Use the virtual screen reader for fast, local feedback loops.'],
   },
];

const requiredPlatformByTarget: Partial<Record<Target['platform'], NodeJS.Platform>> = {
   voiceover: 'darwin',
   nvda: 'win32',
};

const osNameByPlatform: Partial<Record<NodeJS.Platform, string>> = {
   darwin: 'macOS',
   win32: 'Windows',
   linux: 'Linux',
};

export interface DoctorDeps {
   platform: NodeJS.Platform;
   guidepup: GuidepupEnvironmentDeps;
   browserAutomation: () => BrowserAutomationPolicy;
   probeScreenRecording: () => DoctorCheck;
   npmVersion: () => string;
   osVersion: () => string;
}

function runCommand(command: string, args: string[]): string | undefined {
   const result = spawnSync(command, args, {
      encoding: 'utf8',
      timeout: COMMAND_TIMEOUT_MS,
   });
   if (result.error || result.status !== 0) {
      return undefined;
   }
   return result.stdout.trim() || undefined;
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

function probeScreenRecordingWithScreencapture(): DoctorCheck {
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

function resolveOsVersion(platform: NodeJS.Platform): string {
   if (platform === 'darwin') {
      return runCommand('sw_vers', ['-productVersion']) ?? release();
   }
   return release();
}

export function createDefaultDoctorDeps(): DoctorDeps {
   const { platform } = process;
   return {
      platform,
      guidepup: createDefaultGuidepupEnvironmentDeps(),
      browserAutomation: createBrowserAutomationPolicy,
      probeScreenRecording: probeScreenRecordingWithScreencapture,
      npmVersion: () => runCommand('npm', ['--version']) ?? 'unknown',
      osVersion: () => resolveOsVersion(platform),
   };
}

function runTargetChecks(target: Target, deps: DoctorDeps): DoctorCheck[] {
   if (target.platform === 'voiceover') {
      return [...checkVoiceOverEnvironment(deps.guidepup), deps.probeScreenRecording()];
   }
   if (target.platform === 'nvda') {
      return checkNvdaEnvironment(deps.guidepup);
   }
   return [];
}

function summarizeChecks(checks: DoctorCheck[]): string {
   const failures = checks.filter((check) => check.status === 'fail').length;
   if (failures === 1) {
      return '1 setup step is missing.';
   }
   if (failures > 1) {
      return `${failures} setup steps are missing.`;
   }
   return 'Ready for real screen reader sessions.';
}

function buildDoctorTarget(target: Target, deps: DoctorDeps): DoctorTarget {
   const requiredPlatform = requiredPlatformByTarget[target.platform];
   if (requiredPlatform && requiredPlatform !== deps.platform) {
      return {
         ...target,
         status: 'unsupported',
         summary: `Only available on ${target.os}.`,
         checks: [],
      };
   }

   if (target.platform === 'virtual') {
      return { ...target, summary: 'No setup needed.', checks: [] };
   }

   const checks = runTargetChecks(target, deps);
   const hasFailure = checks.some((check) => check.status === 'fail');
   return {
      ...target,
      status: hasFailure ? 'requires-setup' : 'ready',
      summary: summarizeChecks(checks),
      checks,
   };
}

function collectActions(
   targets: DoctorTarget[],
   browserAutomation: BrowserAutomationPolicy,
): DoctorAction[] {
   const actions: DoctorAction[] = [];
   const seenCommands = new Set<string>();

   for (const check of targets.flatMap((target) => target.checks)) {
      if (check.status === 'pass' || !check.action || seenCommands.has(check.action)) {
         continue;
      }
      seenCommands.add(check.action);
      actions.push({
         label: check.actionLabel ?? check.label,
         command: check.action,
         required: check.status === 'fail',
      });
   }

   if (!browserAutomation.preferredCandidate) {
      actions.push({
         label: 'Install a Chromium browser for axe scans',
         command: browserAutomation.installCommand,
         required: true,
      });
   }

   return actions.toSorted(
      (left, right) => Number(right.required) - Number(left.required),
   );
}

function buildHost(deps: DoctorDeps): DoctorHost {
   return {
      platform: deps.platform,
      osName: osNameByPlatform[deps.platform] ?? deps.platform,
      release: deps.osVersion(),
      arch: arch(),
   };
}

/** Builds the doctor report shown by the public CLI and library surface. */
export function createDoctorReport(
   deps: DoctorDeps = createDefaultDoctorDeps(),
): DoctorReport {
   const browserAutomation = deps.browserAutomation();
   const targets = supportedTargets.map((target) => buildDoctorTarget(target, deps));
   const actions = collectActions(targets, browserAutomation);

   return {
      ready: actions.every((action) => !action.required),
      host: buildHost(deps),
      packageVersion: PACKAGE_VERSION,
      nodeVersion: process.version,
      npmVersion: deps.npmVersion(),
      browserAutomation,
      targets,
      actions,
   };
}

/** Lists the supported driver targets and their setup expectations. */
export function listSupportedTargets(): Target[] {
   return supportedTargets;
}
