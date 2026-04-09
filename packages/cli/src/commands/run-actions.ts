import { cliExitCodes } from '#contracts';

export interface AxeActionOptions {
   json?: boolean;
   verbose?: boolean;
   url?: string;
   storybookUrl?: string;
   storyId?: string;
   version: string;
   criterion?: string;
   level?: string;
   rule?: string[];
}

export interface PatternActionOptions {
   json?: boolean;
   verbose?: boolean;
   url?: string;
   storybookUrl?: string;
   storyId?: string;
   target?: string;
   session?: string;
   recording?: string;
}

type RunAxeSelection =
   | { kind: 'criterion'; criterion: string }
   | { kind: 'level'; level: string }
   | { kind: 'rule'; ruleIds: string[] };

async function runAxeForSelection(args: {
   url: string;
   selection: RunAxeSelection;
   wcagVersion: string;
}): Promise<Record<string, unknown>> {
   const { runAxe } = await import('#core');

   if (args.selection.kind === 'criterion') {
      return runAxe(args.url, {
         url: args.url,
         wcagVersion: args.wcagVersion,
         criterion: args.selection.criterion,
      });
   }

   if (args.selection.kind === 'level') {
      return runAxe(args.url, {
         url: args.url,
         wcagVersion: args.wcagVersion,
         level: args.selection.level,
      });
   }

   return runAxe(args.url, {
      url: args.url,
      wcagVersion: args.wcagVersion,
      ruleIds: args.selection.ruleIds,
   });
}

export async function handleAxeAction(options: AxeActionOptions): Promise<{
   target: { kind: string; value: string };
   result: Record<string, unknown>;
}> {
   const [{ resolveCliTarget, resolveRunAxeSelection }, { buildCliTargetInput }] =
      await Promise.all([import('../lib/execute.js'), import('../lib/target-input.js')]);

   const resolved = await resolveCliTarget(buildCliTargetInput(options));
   const selection = resolveRunAxeSelection(options);
   const result = await runAxeForSelection({
      url: resolved.resolvedUrl,
      selection,
      wcagVersion: options.version,
   });

   return { target: resolved.reportTarget, result };
}

function buildPatternErrors(result: {
   assertions: Array<{ id: string; status: string }>;
}): Array<{ code: string; message: string; details: { failedAssertionIds: string[] } }> {
   const hasFailed = result.assertions.some((entry) => entry.status === 'failed');
   if (!hasFailed) {
      return [];
   }

   return [
      {
         code: 'pattern-assertion-failed',
         message: 'One or more pattern assertions failed.',
         details: {
            failedAssertionIds: result.assertions
               .filter((entry) => entry.status === 'failed')
               .map((entry) => entry.id),
         },
      },
   ];
}

async function resolvePatternTarget(
   target: string | undefined,
): Promise<string | undefined> {
   if (!target) {
      return undefined;
   }

   const { parsePlatform } = await import('../lib/execute.js');
   return parsePlatform(target);
}

function resolvePatternExitCode(hasFailed: boolean): number {
   if (hasFailed) {
      return cliExitCodes.assertion;
   }

   return cliExitCodes.success;
}

function buildPatternInput(args: {
   patternId: string;
   url: string;
   target?: string;
   session?: string;
   recording?: string;
}): Record<string, unknown> {
   const input: Record<string, unknown> = {
      patternId: args.patternId,
      url: args.url,
   };

   if (args.target) {
      input.target = args.target;
   }
   if (args.session) {
      input.sessionId = args.session;
   }
   if (args.recording) {
      input.recordingPath = args.recording;
   }

   return input;
}

async function buildPatternRuntimeInput(args: {
   patternId: string;
   url: string;
   target?: string;
   session?: string;
   recording?: string;
}): Promise<Record<string, unknown>> {
   const parsedTarget = await resolvePatternTarget(args.target);
   const inputArgs: {
      patternId: string;
      url: string;
      target?: string;
      session?: string;
      recording?: string;
   } = {
      patternId: args.patternId,
      url: args.url,
   };
   if (parsedTarget) {
      inputArgs.target = parsedTarget;
   }
   if (args.session) {
      inputArgs.session = args.session;
   }
   if (args.recording) {
      inputArgs.recording = args.recording;
   }

   return buildPatternInput(inputArgs);
}

function buildPatternRuntimeArgs(args: {
   patternId: string;
   url: string;
   options: PatternActionOptions;
}): {
   patternId: string;
   url: string;
   target?: string;
   session?: string;
   recording?: string;
} {
   const inputArgs: {
      patternId: string;
      url: string;
      target?: string;
      session?: string;
      recording?: string;
   } = {
      patternId: args.patternId,
      url: args.url,
   };

   if (args.options.target) {
      inputArgs.target = args.options.target;
   }
   if (args.options.session) {
      inputArgs.session = args.options.session;
   }
   if (args.options.recording) {
      inputArgs.recording = args.options.recording;
   }

   return inputArgs;
}

function buildPatternCommandResult(args: {
   resolvedTarget: { kind: string; value: string };
   result: {
      assertions: Array<{ id: string; status: string }>;
   } & Record<string, unknown>;
}): {
   ok: boolean;
   exitCode: number;
   errors: Array<{ code: string; message: string; details: Record<string, unknown> }>;
   target: { kind: string; value: string };
   result: Record<string, unknown>;
} {
   const hasFailed = args.result.assertions.some((entry) => entry.status === 'failed');

   return {
      ok: !hasFailed,
      exitCode: resolvePatternExitCode(hasFailed),
      errors: buildPatternErrors(args.result),
      target: args.resolvedTarget,
      result: args.result,
   };
}

export async function handlePatternAction(
   patternId: string,
   options: PatternActionOptions,
): Promise<{
   ok: boolean;
   exitCode: number;
   errors: Array<{ code: string; message: string; details: Record<string, unknown> }>;
   target: { kind: string; value: string };
   result: Record<string, unknown>;
}> {
   const [{ resolveCliTarget }, { buildCliTargetInput }, core] = await Promise.all([
      import('../lib/execute.js'),
      import('../lib/target-input.js'),
      import('#core'),
   ]);

   const resolved = await resolveCliTarget(buildCliTargetInput(options));
   const input = await buildPatternRuntimeInput(
      buildPatternRuntimeArgs({
         patternId,
         url: resolved.resolvedUrl,
         options,
      }),
   );
   const result = await core.runInteractionPattern(
      input as unknown as Parameters<typeof core.runInteractionPattern>[0],
   );
   return buildPatternCommandResult({
      resolvedTarget: resolved.reportTarget,
      result,
   });
}
