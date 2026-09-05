import {
   driverFocusResultSchema,
   driverReadinessSchema,
   driverStateSnapshotSchema,
   type DriverCheckpoint,
   type DriverFocusTarget,
   type DriverNavigateRequest,
   type DriverPerformPayload,
   type DriverReadiness,
   type DriverStateSnapshot,
   type PortableDriverVerb,
} from '@a11ied/contracts';

import { driverCapabilities, type DriverAdapter } from './adapter-shared.js';
import type { SerializableDriverCommand } from './command-registry.js';
import { DriverCommandError } from './driver-command-error.js';
import { createScreenshotUnsupportedError } from './screenshot-unsupported.js';
import type { VirtualHost } from './virtual-host.js';

/** The document a virtual session reads before a page is attached. */
export const defaultVirtualDocument = {
   html: `
<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>a11ied virtual target</h1>
      <p>No live page is attached to this driver session yet.</p>
      <button type="button">Continue</button>
    </main>
  </body>
</html>
`,
   url: 'about:a11ied-virtual',
};

/** What a named command resolved to: its description plus the portable step to run. */
export interface VirtualCommandResolution {
   command: SerializableDriverCommand & { requestedCommand: string };
   navigation?: DriverNavigateRequest;
   verb?: PortableDriverVerb;
}

/**
 * Resolves `sr do <name>` for the virtual target. The Node adapter passes the command
 * registry. The browser runner passes nothing, because the registry imports Guidepup's
 * Node-only command tables.
 */
export type VirtualCommandResolver = (
   command: DriverPerformPayload,
) => VirtualCommandResolution;

export interface VirtualAdapterOptions {
   resolveCommand?: VirtualCommandResolver | undefined;
}

async function virtualCheckReadiness(): Promise<DriverReadiness> {
   return driverReadinessSchema.parse({
      target: 'virtual',
      status: 'ready',
      summary: 'Virtual screen reader is ready.',
      details: [
         'Runs the page in a headless Chromium when one is installed, and in an in-memory DOM otherwise.',
      ],
   });
}

async function virtualReadState(
   host: VirtualHost,
   checkpoints: DriverCheckpoint[],
): Promise<DriverStateSnapshot> {
   const [speech, current] = await Promise.all([
      host.readSpeech(),
      host.readCurrentItem(),
   ]);
   return driverStateSnapshotSchema.parse({
      lastSpokenPhrase: speech.lastSpokenPhrase || undefined,
      currentItemText: speech.itemText || undefined,
      spokenPhraseLog: speech.spokenPhraseLog,
      itemTextLog: speech.itemTextLog,
      logCursor: speech.spokenPhraseLog.length,
      checkpoints,
      currentItem: current.item,
   });
}

async function virtualFocus(
   target: DriverFocusTarget,
): Promise<ReturnType<typeof driverFocusResultSchema.parse>> {
   return driverFocusResultSchema.parse({
      status: 'skipped',
      target,
      platform: 'virtual',
      details: ['Virtual target has no OS window to focus.'],
   });
}

async function virtualWaitForSpeech(): Promise<void> {
   // The virtual screen reader speaks synchronously, so there is nothing to wait for.
}

async function performVirtualCommand(
   host: VirtualHost,
   resolveCommand: VirtualCommandResolver | undefined,
   payload: DriverPerformPayload,
): Promise<VirtualCommandResolution['command']> {
   if (!resolveCommand) {
      throw new DriverCommandError(
         'driver-command-unsupported',
         'Named commands need the command registry, which the browser runner does not load. Call the typed method for the move instead.',
         { command: payload.command },
      );
   }
   const resolution = resolveCommand(payload);
   if (resolution.navigation) {
      await host.navigate(resolution.navigation);
   } else if (resolution.verb) {
      await host.runPortable(resolution.verb);
   }
   return resolution.command;
}

/** Builds the virtual adapter over one host: jsdom, a Playwright page, or the test's page. */
export function createVirtualAdapter(
   host: VirtualHost,
   options: VirtualAdapterOptions = {},
): DriverAdapter {
   return {
      target: 'virtual',
      capabilities: driverCapabilities,
      checkReadiness: virtualCheckReadiness,
      start: () => host.attachDocument(defaultVirtualDocument),
      stop: () => host.dispose(),
      attachDocument: (document) => host.attachDocument(document),
      focus: virtualFocus,
      performPortable: async (verb) => {
         await host.runPortable(verb);
      },
      navigate: (request) => host.navigate(request),
      readCurrentItem: () => host.readCurrentItem(),
      readTitle: () => host.readTitle(),
      findText: (text) => host.findText(text),
      moveInTable: (move) => host.moveInTable(move),
      captureCursorScreenshot: async () => {
         throw createScreenshotUnsupportedError('virtual');
      },
      press: (keys) => host.press(keys),
      type: (text) => host.type(text),
      performCommand: (command) =>
         performVirtualCommand(host, options.resolveCommand, command),
      readState: (checkpoints) => virtualReadState(host, checkpoints),
      waitForSpeechStabilization: virtualWaitForSpeech,
   };
}
