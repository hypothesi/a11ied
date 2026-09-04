import { render } from 'ink';
import { createElement } from 'react';
import { FinderApp } from './finder-app.js';

/**
 * Copies the axe command to the clipboard and remembers it so the command is printed
 * again after the finder exits, whether or not the clipboard write worked.
 */
function createCommandCopier(): {
   copyCommand: (command: string) => Promise<string>;
   getLastCommand: () => string | undefined;
} {
   let lastCommand: string | undefined = undefined;
   return {
      getLastCommand: () => lastCommand,
      copyCommand: async (command) => {
         lastCommand = command;
         const { default: clipboard } = await import('clipboardy');
         await clipboard.write(command);
         return `Copied: ${command}`;
      },
   };
}

/** Runs the interactive WCAG finder until the user quits, then prints any copied command. */
export async function runWcagFinder(input: { version: string }): Promise<void> {
   const copier = createCommandCopier();
   const instance = render(
      createElement(FinderApp, {
         version: input.version,
         copyCommand: copier.copyCommand,
      }),
      { exitOnCtrlC: true },
   );

   await instance.waitUntilExit();

   const command = copier.getLastCommand();
   if (command) {
      process.stdout.write(`${command}\n`);
   }
}
