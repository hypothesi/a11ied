import type { Command } from 'commander';
import type { CaptureResult } from '#core';
import { TOP_LEVEL_GROUPS } from '../lib/help.js';
import {
   addJsonOption,
   addStorageStateOption,
   addWaitForOption,
} from '../lib/options.js';

interface CaptureOptions {
   json?: boolean;
   out: string;
   viewport?: string;
   zoom?: string;
   textSpacing?: boolean;
   click?: string;
   press: string[];
   hover?: string;
   selector?: string;
   fullPage?: boolean;
   waitFor?: string;
   storageState?: string;
   timeout?: string;
}

const PERCENT = 100;

const CAPTURE_EXAMPLES = `
Examples:
  a1 capture https://example.com --out home.png
  a1 capture https://example.com --viewport 320x800 --full-page --out reflow.png
  a1 capture https://example.com --zoom 2 --out zoom-200.png
  a1 capture https://example.com --text-spacing --out spacing.png
  a1 capture https://example.com --press "Tab*4" --out focus-4.png
  a1 capture https://example.com --click "#menu" --press Tab --out menu-open.png
`;

function renderCapture(result: CaptureResult): string {
   const { focused } = result;
   const lines = [
      `Saved ${result.file}`,
      `Page: ${result.title} (${result.url})`,
      `Viewport: ${String(result.viewport.width)}x${String(result.viewport.height)} at ${String(result.zoom * PERCENT)}% zoom`,
      result.horizontalOverflowPx > 0
         ? `Horizontal overflow: ${String(result.horizontalOverflowPx)}px wider than the viewport`
         : 'Horizontal overflow: none',
   ];
   if (focused) {
      lines.push(
         `Focus: <${focused.tag}> "${focused.name}" at ${String(focused.box.left)},${String(focused.box.top)} size ${String(focused.box.width)}x${String(focused.box.height)}`,
         `  in viewport: ${focused.inViewport ? 'yes' : 'no'}; covered by another element: ${focused.covered ? 'yes' : 'no'}`,
         `  outline: ${focused.outline}; box-shadow: ${focused.boxShadow}`,
      );
   } else {
      lines.push('Focus: nothing focused');
   }
   return lines.join('\n');
}

function collect(value: string, previous: string[]): string[] {
   return [...previous, value];
}

/** Registers `a1 capture`: a screenshot of a page in a chosen condition. */
export function registerCaptureCommand(program: Command): void {
   addStorageStateOption(
      addWaitForOption(
         addJsonOption(
            program
               .command('capture <url>')
               .helpGroup(TOP_LEVEL_GROUPS.fix)
               .summary(
                  'Screenshot a page at a viewport, zoom, focus stop, or opened state.',
               )
               .description(
                  'Load a page, put it in a condition, and save a PNG. Also prints which element ' +
                     'has keyboard focus, whether it is in view or covered, its outline, and how ' +
                     'far the page overflows sideways. Steps run in this order: wait, click, ' +
                     'press keys, hover, capture.',
               )
               .addHelpText('after', CAPTURE_EXAMPLES)
               .requiredOption('--out <file>', 'PNG file to write.')
               .option(
                  '--viewport <WxH>',
                  'Viewport in CSS pixels. Defaults to 1280x900.',
               )
               .option('--zoom <factor>', 'Browser zoom, such as 2 for 200 percent.')
               .option('--text-spacing', 'Apply the WCAG 1.4.12 text spacing values.')
               .option('--click <selector>', 'Click this element first.')
               .option(
                  '--press <key>',
                  'Press a key. Repeatable. "Tab*5" presses Tab five times.',
                  collect,
                  [],
               )
               .option('--hover <selector>', 'Hover this element before capturing.')
               .option('--selector <css>', 'Capture only this element.')
               .option('--full-page', 'Capture the whole scrollable page.')
               .option('--timeout <ms>', 'Timeout for each step. Defaults to 30000.'),
         ),
      ),
   ).action(async (url: string, options: CaptureOptions) => {
      const [{ executeCommand }, core] = await Promise.all([
         import('../lib/execute.js'),
         import('#core'),
      ]);
      let rendered = '';
      await executeCommand(
         {
            family: 'capture',
            subcommand: 'capture',
            wcagVersion: undefined,
            json: options.json,
         },
         async () => {
            const result = await core.capturePage(url, {
               out: options.out,
               viewport: options.viewport,
               zoom: options.zoom ? Number.parseFloat(options.zoom) : undefined,
               textSpacing: options.textSpacing,
               click: options.click,
               press: options.press,
               hover: options.hover,
               selector: options.selector,
               fullPage: options.fullPage,
               waitFor: options.waitFor,
               storageStatePath: options.storageState,
               timeoutMs: options.timeout
                  ? Number.parseInt(options.timeout, 10)
                  : undefined,
            });
            rendered = renderCapture(result);
            return { result: { ...result } };
         },
         () => rendered,
      );
   });
}
