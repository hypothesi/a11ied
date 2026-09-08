import type { CliCommandFamily, CliOutputEnvelope } from '#contracts';
import type * as CoreModuleNamespace from '#core';
import type * as RenderersNamespace from '../renderers/index.js';

type CoreModule = typeof CoreModuleNamespace;
type Renderers = typeof RenderersNamespace;
type RenderText = (envelope: CliOutputEnvelope, options: { verbose: boolean }) => string;
type CommandResult = Record<string, unknown> | Promise<Record<string, unknown>>;

export interface LookupCommandInput {
   family: CliCommandFamily;
   subcommand: string;
   json?: boolean | undefined;
   verbose?: boolean | undefined;
   /**
    * Only the WCAG family sets this. An APG pattern is the same in every WCAG version, so
    * `a1 pattern` leaves it undefined and the envelope omits it.
    */
   wcagVersion?: string | undefined;
   buildResult: (core: CoreModule) => CommandResult;
   renderText: (renderers: Renderers) => RenderText;
}

/**
 * Runs one lookup command: load the core runtime and the renderers, build the result, and
 * print it through the shared output envelope.
 *
 * Core and the renderers are imported here rather than at module scope so `a1 --help`
 * does not pay for loading the WCAG data.
 */
export async function runLookupCommand(input: LookupCommandInput): Promise<void> {
   const [{ executeCommand }, renderers, core] = await Promise.all([
      import('./execute.js'),
      import('../renderers/index.js'),
      import('#core'),
   ]);

   await executeCommand(
      {
         family: input.family,
         subcommand: input.subcommand,
         wcagVersion: input.wcagVersion,
         json: input.json,
         verbose: input.verbose,
      },
      async () => ({ result: await input.buildResult(core) }),
      input.renderText(renderers),
   );
}
