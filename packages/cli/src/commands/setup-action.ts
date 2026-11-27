import { cliExitCodes, type DoctorReport } from '#contracts';
import type * as Core from '#core';
import type { GuidepupSetupStep, GuidepupSetupStepResult } from '#core';
import { CLI_VERSION } from '../lib/constants.js';
import { code, dim, doctorTextStyle, heading, symbols } from '../lib/format.js';
import type { CommandExecution } from '../lib/helpers.js';
import {
   formatNpmCommand,
   hasGlobalInstall,
   listGlobalInstallArgs,
   runNpm,
} from '../lib/npm-install.js';
import { askToChoose, askYesNo, canPrompt } from '../lib/prompts.js';
import {
   detectAgentEditors,
   getEditorLabel,
   installAgentItems,
   listSkillNames,
   type AgentInstallOutcome,
   type AgentItem,
} from './setup-agents.js';

export interface SetupOptions {
   json?: boolean;
   yes?: boolean;
   skipSetup?: boolean;
   skipInstall?: boolean;
}

interface SetupStepOutcome {
   id: string;
   label: string;
   command: string;
   exitCode: number;
}

interface GlobalInstallOutcome {
   status: 'present' | 'installed' | 'skipped' | 'failed';
   command: string;
   exitCode: number | undefined;
}

type ScreenReaderStatus = 'ran' | 'skipped' | 'unsupported';

interface SetupResult {
   globalInstall: GlobalInstallOutcome;
   agents: AgentInstallOutcome[];
   screenReaders: ScreenReaderStatus;
   steps: SetupStepOutcome[];
   report?: DoctorReport;
}

const AGENT_ITEM_LABELS: Readonly<Record<AgentItem, string>> = {
   skills: 'skills',
   mcp: 'MCP server',
};

function write(text: string): void {
   process.stdout.write(`${text}\n`);
}

function announce(title: string, command: string, cwd?: string): void {
   write('');
   write(heading(title));
   write(`  ${code(command)}${cwd === undefined ? '' : `  ${dim(`in ${cwd}`)}`}`);
   write('');
}

function announceStep(step: GuidepupSetupStep, index: number, total: number): void {
   announce(`Step ${index + 1} of ${total}: ${step.label}`, step.command, step.cwd);
}

function toStepOutcome(result: GuidepupSetupStepResult): SetupStepOutcome {
   return {
      id: result.step.id,
      label: result.step.label,
      command: result.step.command,
      exitCode: result.exitCode,
   };
}

async function shouldDo(options: SetupOptions, question: string): Promise<boolean> {
   if (options.yes) {
      return true;
   }

   return canPrompt(options.json) && askYesNo(question);
}

async function setUpGlobalInstall(options: SetupOptions): Promise<GlobalInstallOutcome> {
   const args = listGlobalInstallArgs(CLI_VERSION);
   const command = formatNpmCommand(args);

   if (await hasGlobalInstall()) {
      return { status: 'present', command, exitCode: undefined };
   }

   const question =
      'a1 is not installed globally. Install it, so you can run a1 in any folder?';

   if (!(await shouldDo(options, question))) {
      return { status: 'skipped', command, exitCode: undefined };
   }

   if (!options.json) {
      announce('Install a1 globally', command);
   }

   const exitCode = await runNpm(args, options.json);

   return { status: exitCode === 0 ? 'installed' : 'failed', command, exitCode };
}

async function chooseAgentItems(options: SetupOptions): Promise<AgentItem[]> {
   const items: AgentItem[] = ['skills', 'mcp'];

   if (options.yes) {
      return items;
   }

   if (!canPrompt(options.json)) {
      return [];
   }

   const chosen = await askToChoose('Add a11ied to your AI coding agents:', [
      { value: 'skills', label: 'Agent skills', hint: listSkillNames().join(', ') },
      { value: 'mcp', label: 'MCP server', hint: 'a1 mcp' },
   ]);

   return items.filter((item) => chosen.includes(item));
}

async function chooseEditors(
   options: SetupOptions,
   detected: string[],
): Promise<string[]> {
   if (options.yes) {
      return detected;
   }

   return askToChoose(
      'Install them for:',
      detected.map((editor) => ({ value: editor, label: getEditorLabel(editor) })),
   );
}

async function setUpAgents(
   options: SetupOptions,
   globalInstall: GlobalInstallOutcome,
): Promise<AgentInstallOutcome[]> {
   const detected = await detectAgentEditors();

   if (detected.length === 0) {
      return [];
   }

   const sections = await chooseAgentItems(options);
   const editors = sections.length === 0 ? [] : await chooseEditors(options, detected);

   if (editors.length === 0) {
      return [];
   }

   return installAgentItems({
      sections,
      editors,
      hasGlobalInstall:
         globalInstall.status === 'present' || globalInstall.status === 'installed',
   });
}

function listScreenReaderSteps(
   core: typeof Core,
   options: SetupOptions,
): GuidepupSetupStep[] | undefined {
   try {
      return core.listGuidepupSetupSteps(options);
   } catch (error) {
      // Linux has no real screen reader to set up. The other setup steps still apply.
      if (
         error instanceof core.CliEnvironmentError &&
         error.code === 'setup-unsupported-platform'
      ) {
         return undefined;
      }
      throw error;
   }
}

/** Runs the Guidepup setup steps, then the doctor check if every step passed. */
async function setUpScreenReaders(
   core: typeof Core,
   options: SetupOptions,
): Promise<Pick<SetupResult, 'screenReaders' | 'steps' | 'report'>> {
   const steps = listScreenReaderSteps(core, options);

   if (steps === undefined) {
      return { screenReaders: 'unsupported', steps: [] };
   }

   const question =
      'Set up the real screen reader on this machine? It changes system settings. The simulated screen reader needs no setup.';
   const isAsked = canPrompt(options.json) && !options.yes && steps.length > 0;

   if (isAsked && !(await askYesNo(question))) {
      return { screenReaders: 'skipped', steps: [] };
   }

   if (steps.length === 0 && !options.json) {
      write(dim('Every screen reader setup step was skipped. Running doctor only.'));
   }

   const hooks = options.json ? {} : { onStepStart: announceStep };
   const results = await core.runGuidepupSetup(steps, hooks);
   const outcomes = results.map((result) => toStepOutcome(result));
   const isFailed = outcomes.some((outcome) => outcome.exitCode !== 0);

   if (isFailed) {
      return { screenReaders: 'ran', steps: outcomes };
   }

   return { screenReaders: 'ran', steps: outcomes, report: core.createDoctorReport() };
}

async function runSetup(core: typeof Core, options: SetupOptions): Promise<SetupResult> {
   const globalInstall = await setUpGlobalInstall(options);
   const agents = await setUpAgents(options, globalInstall);

   return { globalInstall, agents, ...(await setUpScreenReaders(core, options)) };
}

function findFailedStep(setupResult: SetupResult): SetupStepOutcome | undefined {
   return setupResult.steps.find((step) => step.exitCode !== 0);
}

function buildExecution(setupResult: SetupResult): CommandExecution {
   const isEnvironmentFailure =
      setupResult.globalInstall.status === 'failed' ||
      findFailedStep(setupResult) !== undefined ||
      (setupResult.report !== undefined && !setupResult.report.ready);

   return {
      result: { ...setupResult },
      ...(isEnvironmentFailure ? { exitCode: cliExitCodes.environment } : {}),
   };
}

function renderGlobalInstall(outcome: GlobalInstallOutcome): string {
   if (outcome.status === 'present') {
      return `${symbols.pass} a1 is installed globally.`;
   }

   if (outcome.status === 'installed') {
      return `${symbols.pass} Installed a1 globally.`;
   }

   if (outcome.status === 'failed') {
      return `${symbols.fail} ${outcome.command} exited with code ${String(outcome.exitCode)}.`;
   }

   return `${symbols.skip} Skipped the global install. Run commands with npx a11ied, or run ${code(outcome.command)}.`;
}

function renderEditorLine(
   editor: string,
   outcomes: readonly AgentInstallOutcome[],
): string[] {
   const installed = outcomes.filter((outcome) => outcome.isInstalled);
   const problems = outcomes.filter((outcome) => !outcome.isInstalled);
   const names = installed.map((outcome) =>
      outcome.section === 'skills' ? `${outcome.name} skill` : AGENT_ITEM_LABELS.mcp,
   );
   const symbol = problems.length === 0 ? symbols.pass : symbols.warn;
   const summary = names.length === 0 ? 'nothing installed' : names.join(', ');

   return [
      `${symbol} ${getEditorLabel(editor)}: ${summary}`,
      ...problems.flatMap((outcome) =>
         outcome.messages.map((message) => `    ${dim(`${outcome.name}: ${message}`)}`),
      ),
   ];
}

function renderAgents(agents: readonly AgentInstallOutcome[]): string[] {
   const editors = [...new Set(agents.map((outcome) => outcome.editor))];

   return editors.flatMap((editor) =>
      renderEditorLine(
         editor,
         agents.filter((outcome) => outcome.editor === editor),
      ),
   );
}

function renderScreenReaders(core: typeof Core, setupResult: SetupResult): string {
   const failedStep = findFailedStep(setupResult);

   if (failedStep) {
      return `${failedStep.command} exited with code ${failedStep.exitCode}. Fix the error above and run a1 setup again.`;
   }

   if (setupResult.report) {
      return core.renderDoctorText(setupResult.report, doctorTextStyle);
   }

   if (setupResult.screenReaders === 'skipped') {
      return `${symbols.skip} Skipped the screen reader setup. Run a1 setup again to do it.`;
   }

   return dim(
      'Real screen readers need macOS or Windows. The simulated screen reader works here.',
   );
}

function renderSetupResultText(core: typeof Core, setupResult: SetupResult): string {
   return [
      '',
      renderGlobalInstall(setupResult.globalInstall),
      ...renderAgents(setupResult.agents),
      '',
      renderScreenReaders(core, setupResult),
   ].join('\n');
}

export async function handleSetupAction(options: SetupOptions): Promise<void> {
   const [{ executeCommand }, core] = await Promise.all([
      import('../lib/execute.js'),
      import('#core'),
   ]);

   let setupResult: SetupResult | undefined = undefined;

   await executeCommand(
      {
         family: 'setup',
         subcommand: 'setup',
         wcagVersion: undefined,
         json: options.json,
      },
      async () => {
         setupResult = await runSetup(core, options);
         return buildExecution(setupResult);
      },
      () => (setupResult ? renderSetupResultText(core, setupResult) : ''),
   );
}
