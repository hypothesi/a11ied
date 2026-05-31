import type { DriverFocusResult, DriverFocusTarget } from '@a11ied/contracts';

import {
   FOCUS_COMMAND_TIMEOUT_MS,
   buildFocusResult,
   buildFocusResultFromOutput,
   escapeAppleScriptString,
   focusExecFile,
} from './focus-shared.js';

const MAC_WINDOW_FOCUS_SCRIPT_TEMPLATE = [
   'set targetTitle to "__WINDOW_TITLE__"',
   'set targetMatch to "__MATCH__"',
   'set targetAppName to "__APP_NAME__"',
   'set targetBundleId to "__BUNDLE_ID__"',
   'set matched to false',
   'tell application "System Events"',
   'repeat with p in processes',
   'if matched then exit repeat',
   'set isCandidate to true',
   'if targetAppName is not "" then',
   'if name of p is not targetAppName then',
   'set isCandidate to false',
   'end if',
   'end if',
   'if targetBundleId is not "" then',
   'try',
   'if bundle identifier of p is not targetBundleId then',
   'set isCandidate to false',
   'end if',
   'on error',
   'set isCandidate to false',
   'end try',
   'end if',
   'if isCandidate then',
   'try',
   'repeat with w in windows of p',
   'set wname to name of w',
   'if targetMatch is "exact" then',
   'if wname is targetTitle then',
   'set frontmost of p to true',
   'set matched to true',
   'exit repeat',
   'end if',
   'else',
   'if wname contains targetTitle then',
   'set frontmost of p to true',
   'set matched to true',
   'exit repeat',
   'end if',
   'end if',
   'if matched then exit repeat',
   'end repeat',
   'end try',
   'end if',
   'end repeat',
   'end tell',
   'if matched then return "focused" else return "not-found"',
];

function buildMacWindowFocusScript(args: {
   windowTitle: string;
   matchMode: 'contains' | 'exact';
   appName: string;
   bundleId: string;
}): string[] {
   return MAC_WINDOW_FOCUS_SCRIPT_TEMPLATE.map((line) =>
      line
         .replaceAll('__WINDOW_TITLE__', args.windowTitle)
         .replaceAll('__MATCH__', args.matchMode)
         .replaceAll('__APP_NAME__', args.appName)
         .replaceAll('__BUNDLE_ID__', args.bundleId),
   );
}

function resolveMacAppName(target: DriverFocusTarget): string {
   if (target.appName) {
      return escapeAppleScriptString(target.appName);
   }
   return '';
}

function resolveMacBundleId(target: DriverFocusTarget): string {
   if (target.bundleId) {
      return escapeAppleScriptString(target.bundleId);
   }
   return '';
}

function resolveMacWindowTitle(target: DriverFocusTarget): string {
   if (target.windowTitle) {
      return escapeAppleScriptString(target.windowTitle);
   }
   return '';
}

function resolveMacMatchMode(target: DriverFocusTarget): 'contains' | 'exact' {
   if (target.match === 'exact') {
      return 'exact';
   }
   return 'contains';
}

function resolveMacFocusParams(target: DriverFocusTarget): {
   appName: string;
   bundleId: string;
   windowTitle: string;
   matchMode: 'contains' | 'exact';
   pid: number | undefined;
} {
   return {
      appName: resolveMacAppName(target),
      bundleId: resolveMacBundleId(target),
      windowTitle: resolveMacWindowTitle(target),
      matchMode: resolveMacMatchMode(target),
      pid: target.pid,
   };
}

function resolveMacFocusOverride(args: {
   appName: string;
   bundleId: string;
   windowTitle: string;
   matchMode: 'contains' | 'exact';
}): string[] | undefined {
   if (args.windowTitle) {
      return buildMacWindowFocusScript({
         windowTitle: args.windowTitle,
         matchMode: args.matchMode,
         appName: args.appName,
         bundleId: args.bundleId,
      });
   }
   if (args.bundleId) {
      return [`tell application id "${args.bundleId}" to activate`, 'return "focused"'];
   }
   return undefined;
}

function buildMacPidFocusScript(pid: number): string[] {
   return [
      'try',
      `tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`,
      'return "focused"',
      'on error',
      'return "not-found"',
      'end try',
   ];
}

function buildMacProcessNameFocusScript(processName: string): string[] {
   return [
      'try',
      `tell application "System Events" to set frontmost of (first process whose name is "${processName}") to true`,
      'return "focused"',
      'on error',
      'return "not-found"',
      'end try',
   ];
}

function buildMacFocusScriptFromParams(
   params: ReturnType<typeof resolveMacFocusParams>,
   target: DriverFocusTarget,
): string[] {
   if (params.pid !== undefined) {
      return buildMacPidFocusScript(params.pid);
   }
   const override = resolveMacFocusOverride(params);
   if (override) {
      return override;
   }
   if (params.appName) {
      return [`tell application "${params.appName}" to activate`, 'return "focused"'];
   }
   if (target.processName) {
      return buildMacProcessNameFocusScript(escapeAppleScriptString(target.processName));
   }
   return ['return "not-found"'];
}

function buildMacFocusScript(target: DriverFocusTarget): string[] {
   return buildMacFocusScriptFromParams(resolveMacFocusParams(target), target);
}

function buildMacFocusArgs(target: DriverFocusTarget): string[] {
   const script = buildMacFocusScript(target);
   return ['-e', script.join('\n')];
}

export async function focusMacTarget(
   target: DriverFocusTarget,
): Promise<DriverFocusResult> {
   try {
      const { stdout, stderr } = await focusExecFile(
         'osascript',
         buildMacFocusArgs(target),
         { timeout: FOCUS_COMMAND_TIMEOUT_MS },
      );
      return buildFocusResultFromOutput({
         output: String(stdout).trim(),
         stderr: String(stderr ?? ''),
         target,
         platform: 'voiceover',
      });
   } catch (error) {
      let message = String(error);
      if (error instanceof Error) {
         message = error.message;
      }
      return buildFocusResult({
         status: 'failed',
         target,
         platform: 'voiceover',
         details: [message],
      });
   }
}
