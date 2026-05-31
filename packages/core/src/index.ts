import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CliCommand, DoctorReport, Target } from '../../contracts/src/index.js';
import { createBrowserAutomationPolicy } from './browser/policy.js';

export {
   CliEnvironmentError,
   CliUsageError,
   inspectApplicableTarget,
   inspectApplicableUrl,
   inspectCriterionTarget,
   inspectCriterionUrl,
   listWcagCriteria,
   listWcagLevels,
   searchWcagCriteria,
   showWcagCoverage,
   showWcagCriterion,
} from './wcag/runtime.js';
export {
   attachDocumentToDriverSession,
   cleanupStaleDriverSessions,
   getDriverSessionMetadataPath,
   getDriverSocketPath,
   getDriverSessionStatus,
   runDriverSessionAction,
   runEphemeralDriverAction,
   type SessionActionOptions,
   startDriverSession,
   stopDriverSession,
} from './driver/runtime.js';
export {
   resolveAvailableDefaultTarget,
   resolveDefaultTarget,
   resolveTargetType,
} from './driver/default-target.js';
export type { TargetType } from './driver/default-target.js';
export {
   DriverCommandError,
   driverCommandSets,
   isDriverCommandSet,
   listDriverCommands,
   parseDriverCommandSet,
   resolveDriverCommand,
   type ConcreteDriverCommandSet,
   type DriverCommandList,
   type DriverCommandSet,
   type ListDriverCommandsOptions,
   type SerializableDriverCommand,
} from '@a11ied/guidepup';
export { runAxe } from './axe/runtime.js';
export { openUrlInSystemAutomationBrowser } from './browser/helper.js';
export {
   resolveDocumentTarget,
   type ResolveDocumentTargetInput,
} from './targets/runtime.js';
export { verifyCriterion, verifyLevel } from './verification/runtime.js';
export { listInteractionPatterns, runInteractionPattern } from './patterns/runtime.js';
export type { RunPatternOptions } from './patterns/helpers.js';

const DOCTOR_RECORDING_PROBE_SECONDS = 1;
const DOCTOR_RECORDING_TIMEOUT_MS = 4000;
const SCREEN_RECORDING_PERMISSION_NOTE =
   'If the same recording command works from Terminal but fails here, check Screen Recording permission for the current host app.';

const supportedTargets: Target[] = [
   {
      id: 'macos-voiceover',
      platform: 'voiceover',
      os: 'macOS',
      status: 'requires-setup',
      notes: ['Run `npx @guidepup/setup` before the first real-device session.'],
   },
   {
      id: 'windows-nvda',
      platform: 'nvda',
      os: 'Windows',
      status: 'requires-setup',
      notes: ['Run `npx @guidepup/setup` on Windows to provision NVDA automation.'],
   },
   {
      id: 'virtual-dom',
      platform: 'virtual',
      os: 'Cross-platform',
      status: 'ready',
      notes: ['Use the virtual screen reader for fast, local feedback loops.'],
   },
];

const cliCommands: CliCommand[] = [
   {
      name: 'wcag',
      summary: 'Query pinned WCAG criteria, coverage, and testing strategy data.',
      maturity: 'ready',
   },
   {
      name: 'inspect',
      summary: 'Explain which WCAG criteria are relevant for a specific target.',
      maturity: 'ready',
   },
   {
      name: 'sr',
      summary:
         'Control VoiceOver, NVDA, or the virtual screen reader through stable screen-reader sessions.',
      maturity: 'ready',
   },
   {
      name: 'doctor',
      summary: 'Report runtime details and supported automation targets.',
      maturity: 'ready',
   },
   {
      name: 'axe',
      summary: 'Run axe-core accessibility scans.',
      maturity: 'ready',
   },
   {
      name: 'mcp',
      summary: 'Expose the runtime over an MCP stdio server.',
      maturity: 'ready',
   },
];

function getBaseVoiceOverNotes(): string[] {
   return [
      'Run `npx @guidepup/setup` before the first real-device session.',
      'a11ied uses native macOS video capture without requesting microphone input.',
   ];
}

function probeVoiceOverRecordingFailureNote(args: {
   status: number | null;
   stderr: string;
}): string {
   if (args.stderr) {
      return `Recording probe failed: ${args.stderr}`;
   }

   return `Recording probe failed: screencapture exited with code ${String(args.status ?? 'unknown')} without writing a movie file.`;
}

function createVoiceOverRecordingProbeNotes(): string[] {
   const probeDir = mkdtempSync(join(tmpdir(), 'a11ied-doctor-'));
   const probePath = join(probeDir, 'recording-probe.mov');

   try {
      const result = spawnSync(
         '/usr/sbin/screencapture',
         ['-v', '-V', String(DOCTOR_RECORDING_PROBE_SECONDS), probePath],
         {
            encoding: 'utf8',
            timeout: DOCTOR_RECORDING_TIMEOUT_MS,
         },
      );
      if (result.error) {
         return [
            `Recording probe failed: ${result.error.message}`,
            SCREEN_RECORDING_PERMISSION_NOTE,
         ];
      }

      if (result.status === 0 && existsSync(probePath)) {
         return ['Native screen recording probe passed for the current host app.'];
      }

      return [
         probeVoiceOverRecordingFailureNote({
            status: result.status,
            stderr: result.stderr.trim(),
         }),
         SCREEN_RECORDING_PERMISSION_NOTE,
      ];
   } finally {
      rmSync(probeDir, { recursive: true, force: true });
   }
}

function createVoiceOverNotes(): string[] {
   const notes = getBaseVoiceOverNotes();
   if (process.platform !== 'darwin') {
      return notes;
   }

   return [...notes, ...createVoiceOverRecordingProbeNotes()];
}

function createSupportedTargets(): Target[] {
   const targets: Target[] = [];

   for (const target of supportedTargets) {
      if (target.platform === 'voiceover') {
         targets.push({
            id: target.id,
            platform: target.platform,
            os: target.os,
            status: target.status,
            notes: createVoiceOverNotes(),
         });
      } else {
         targets.push(target);
      }
   }

   return targets;
}

function renderBrowserAutomationLines(report: DoctorReport): string[] {
   const detectedBrowserLines = report.browserAutomation.candidates.map((candidate) => {
      let suffix = '';
      if (candidate.location) {
         suffix = ` (${candidate.location})`;
      }
      return `  - ${candidate.label} [${candidate.launchMode}, ${candidate.source}]${suffix}`;
   });
   const lines = [
      'Browser automation:',
      `- Policy: ${report.browserAutomation.policyName}`,
      `- Preferred: ${report.browserAutomation.preferredCandidate?.label ?? 'none detected'}`,
      `- Fallback install: ${report.browserAutomation.installCommand}`,
   ];

   if (report.browserAutomation.candidates.length === 0) {
      lines.push('- Detected browsers: none');
      return lines;
   }

   return [...lines, '- Detected browsers:', ...detectedBrowserLines];
}

function renderTargetLines(report: DoctorReport): string[] {
   const lines = ['Targets:'];

   for (const target of report.targets) {
      lines.push(`- ${target.id} [${target.status}]`);
      for (const note of target.notes) {
         lines.push(`  ${note}`);
      }
   }

   return lines;
}

function resolveNpmVersion(): string {
   const result = spawnSync('npm', ['--version'], { encoding: 'utf8', timeout: 5000 });
   if (result.error || result.status !== 0) {
      return 'unknown';
   }
   return result.stdout.trim() || 'unknown';
}

/** Builds the doctor report shown by the public CLI and library surface. */
export function createDoctorReport(): DoctorReport {
   return {
      packageVersion: '0.1.0',
      nodeVersion: process.version,
      npmVersion: resolveNpmVersion(),
      browserAutomation: createBrowserAutomationPolicy(),
      targets: createSupportedTargets(),
   };
}

/** Lists the shipped top-level CLI command families and their maturity labels. */
export function listCliCommands(): CliCommand[] {
   return cliCommands;
}

/** Lists the supported driver targets and their setup expectations. */
export function listSupportedTargets(): Target[] {
   return createSupportedTargets();
}

/** Renders a plain-text doctor report for terminal output. */
export function renderDoctorText(report: DoctorReport): string {
   const lines = [
      `a11ied ${report.packageVersion}`,
      `Node ${report.nodeVersion}`,
      `npm ${report.npmVersion}`,
      '',
      ...renderBrowserAutomationLines(report),
      '',
      ...renderTargetLines(report),
   ];

   return lines.join('\n');
}
