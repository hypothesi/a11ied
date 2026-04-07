import type { CliCommand, DoctorReport, Target } from '@a11lied/contracts';

export {
   CliEnvironmentError,
   CliUsageError,
   inspectApplicableUrl,
   inspectCriterionUrl,
   listWcagCriteria,
   listWcagLevels,
   searchWcagCriteria,
   showWcagCoverage,
   showWcagCriterion,
} from './wcag-runtime.js';
export {
   attachDocumentToDriverSession,
   cleanupStaleDriverSessions,
   getDriverSessionMetadataPath,
   getDriverSessionStatus,
   runDriverSessionAction,
   runEphemeralDriverAction,
   startDriverSession,
   stopDriverSession,
} from './driver-runtime.js';
export { runAxe } from './axe-runtime.js';
export { runInteractionPattern } from './pattern-runtime.js';
export { verifyCriterion, verifyLevel } from './verification-runtime.js';

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
      summary: 'Query pinned WCAG criteria, coverage, and verification strategy data.',
      maturity: 'planned',
   },
   {
      name: 'inspect',
      summary: 'Explain which WCAG criteria are relevant for a specific target.',
      maturity: 'planned',
   },
   {
      name: 'drive',
      summary:
         'Control VoiceOver, NVDA, or the virtual screen reader through stable sessions.',
      maturity: 'scaffolded',
   },
   {
      name: 'doctor',
      summary: 'Report runtime details and supported automation targets.',
      maturity: 'scaffolded',
   },
   {
      name: 'run',
      summary: 'Execute a saved or inline accessibility scenario.',
      maturity: 'planned',
   },
   {
      name: 'verify',
      summary:
         'Turn collected accessibility evidence into explicit WCAG criterion and level verdicts.',
      maturity: 'ready',
   },
   {
      name: 'story',
      summary: 'Run a Storybook scenario against a local dev server.',
      maturity: 'planned',
   },
   {
      name: 'mcp',
      summary: 'Expose the runtime over an MCP stdio server.',
      maturity: 'scaffolded',
   },
];

export function createDoctorReport(): DoctorReport {
   return {
      packageVersion: '0.1.0',
      nodeVersion: process.version,
      npmVersion: process.env.npm_config_user_agent ?? 'unknown',
      targets: supportedTargets,
   };
}

export function listCliCommands(): CliCommand[] {
   return cliCommands;
}

export function listSupportedTargets(): Target[] {
   return supportedTargets;
}

export function renderDoctorText(report: DoctorReport): string {
   const lines = [
      `a11lied ${report.packageVersion}`,
      `Node ${report.nodeVersion}`,
      `npm ${report.npmVersion}`,
      '',
      'Targets:',
   ];

   for (const target of report.targets) {
      lines.push(`- ${target.id} [${target.status}]`);
      for (const note of target.notes) {
         lines.push(`  ${note}`);
      }
   }

   return lines.join('\n');
}
