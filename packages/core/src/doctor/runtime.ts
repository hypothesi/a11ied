import { spawnSync } from 'node:child_process';
import { arch, release } from 'node:os';

import {
   doctorRequestSchema,
   type BrowserAutomationCandidate,
   type BrowserAutomationPolicy,
   type DoctorAction,
   type DoctorCheck,
   type DoctorHost,
   type DoctorReport,
   type DoctorRequest,
   type DoctorTarget,
   type Target,
} from '@a11ied/contracts';
import {
   checkNvdaEnvironment,
   checkVoiceOverEnvironment,
   createDefaultGuidepupEnvironmentDeps,
   A11IED_SETUP_COMMAND,
   type GuidepupEnvironmentDeps,
} from '@a11ied/guidepup';

import { createBrowserAutomationPolicy } from '../browser/policy.js';
import { readDoctorBrowserVersion, readDoctorReaderVersion } from './versions.js';
import {
   checkWindowsRecording,
   probeScreenRecordingWithScreencapture,
} from './recording.js';

const PACKAGE_VERSION = '0.1.0';
const COMMAND_TIMEOUT_MS = 5000;

const supportedTargets: Target[] = [
   {
      id: 'macos-voiceover',
      platform: 'voiceover',
      os: 'macOS',
      status: 'requires-setup',
      notes: [
         `Run \`${A11IED_SETUP_COMMAND}\` once per machine before the first real session.`,
         'a11ied uses native macOS video capture without requesting microphone input.',
      ],
   },
   {
      id: 'windows-nvda',
      platform: 'nvda',
      os: 'Windows',
      status: 'requires-setup',
      notes: [
         `Run \`${A11IED_SETUP_COMMAND}\` once per machine to download the Guidepup NVDA build.`,
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
   probeWindowsRecording?: () => DoctorCheck;
   npmVersion: () => string;
   osVersion: () => string;
   browserVersion?: (
      candidate: BrowserAutomationCandidate | undefined,
   ) => string | undefined;
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
      probeWindowsRecording: checkWindowsRecording,
      npmVersion: () => runCommand('npm', ['--version']) ?? 'unknown',
      osVersion: () => resolveOsVersion(platform),
      browserVersion: (candidate) =>
         readDoctorBrowserVersion(candidate, platform, runCommand),
   };
}

function getRecordingCheck(target: Target, deps: DoctorDeps): DoctorCheck {
   try {
      const check =
         target.platform === 'voiceover'
            ? deps.probeScreenRecording()
            : (deps.probeWindowsRecording?.() ?? {
                 id: 'windows-recording',
                 label: 'Windows recording dependency',
                 status: 'fail',
                 detail: 'The recorder prerequisite check is unavailable.',
              });

      return { ...check, status: check.status === 'pass' ? 'pass' : 'fail' };
   } catch (error) {
      return {
         id: 'recording-prerequisite-unreadable',
         label: 'Recording prerequisite check could not complete',
         status: 'fail',
         detail: error instanceof Error ? error.message : String(error),
      };
   }
}

function runTargetChecks(
   target: Target,
   deps: DoctorDeps,
   request: DoctorRequest,
): DoctorCheck[] {
   if (target.platform === 'voiceover') {
      const checks = checkVoiceOverEnvironment(deps.guidepup);
      if (!request.recording) {
         return checks;
      }
      return [...checks, getRecordingCheck(target, deps)];
   }
   if (target.platform === 'nvda') {
      const checks = checkNvdaEnvironment(deps.guidepup);
      if (!request.recording) {
         return checks;
      }
      return [...checks, getRecordingCheck(target, deps)];
   }
   return [];
}

function getTargetChecks(
   target: Target,
   deps: DoctorDeps,
   request: DoctorRequest,
): DoctorCheck[] {
   try {
      return runTargetChecks(target, deps, request);
   } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return [
         {
            id: 'reader-environment-unreadable',
            label: 'Reader prerequisite check could not complete',
            status: 'fail',
            detail: `${detail} Reinstall the a11ied package or workspace dependencies, then run ${A11IED_SETUP_COMMAND}.`,
         },
      ];
   }
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

function buildDoctorTarget(
   target: Target,
   deps: DoctorDeps,
   request: DoctorRequest,
): DoctorTarget {
   const requiredPlatform = requiredPlatformByTarget[target.platform];
   if (requiredPlatform && requiredPlatform !== deps.platform) {
      return {
         ...target,
         status: 'unsupported',
         summary: `Only available on ${target.os}.`,
         checks: [],
      };
   }

   if (target.platform === 'virtual' && request.task === 'audit') {
      return {
         ...target,
         status: 'requires-setup',
         summary: 'Select a real desktop reader for an audit.',
         checks: [
            {
               id: 'real-audit-reader',
               label: 'A desktop audit requires VoiceOver or NVDA',
               status: 'fail',
               detail:
                  'Select --sr voiceover on macOS or --sr nvda on Windows. Virtual output is simulated evidence.',
            },
         ],
      };
   }
   if (target.platform === 'virtual') {
      return { ...target, summary: 'No setup needed.', checks: [] };
   }

   const checks = getTargetChecks(target, deps, request);
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
   browserRequired: boolean,
): DoctorAction[] {
   const actions: DoctorAction[] = [];
   const seenCommands = new Set<string>();

   const checks = targets
      .flatMap((target) => target.checks)
      .toSorted(
         (left, right) =>
            Number(right.status === 'fail') - Number(left.status === 'fail'),
      );
   for (const check of checks) {
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

   if (browserRequired && !browserAutomation.preferredCandidate) {
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

function selectDoctorTargets(
   platform: NodeJS.Platform,
   request: DoctorRequest,
): Target[] {
   if (request.task === 'scan') {
      return supportedTargets.filter((target) => target.platform === 'virtual');
   }
   if (request.task === 'all' && request.target === undefined) {
      return supportedTargets;
   }
   const target = request.target ?? (platform === 'darwin' ? 'voiceover' : 'nvda');
   return supportedTargets.filter((entry) => entry.platform === target);
}

/** Builds the doctor report shown by the public CLI and library surface. */
export function createDoctorReport(
   deps: DoctorDeps = createDefaultDoctorDeps(),
   input: Partial<DoctorRequest> = {},
): DoctorReport {
   const browserAutomation = deps.browserAutomation(),
      request = doctorRequestSchema.parse(input),
      targets = selectDoctorTargets(deps.platform, request).map((target) =>
         buildDoctorTarget(target, deps, request),
      );
   const actions = collectActions(targets, browserAutomation, request.task !== 'reader');
   const targetsReady = targets.every(
      (target) =>
         !target.checks.some((check) => check.status === 'fail') &&
         ((request.task === 'all' && request.target === undefined) ||
            target.status !== 'unsupported'),
   );

   return {
      ready: targetsReady && actions.every((action) => !action.required),
      request,
      browserVersion:
         deps.browserVersion?.(browserAutomation.preferredCandidate) ?? 'Unavailable',
      readerVersions: Object.fromEntries(
         targets.map((target) => [
            target.platform,
            readDoctorReaderVersion(target.platform, deps.guidepup, deps.osVersion()),
         ]),
      ),
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
