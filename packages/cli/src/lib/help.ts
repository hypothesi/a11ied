import type { Command } from 'commander';

function getCommandPath(command: Command): string {
   const names: string[] = [];
   let current: Command | undefined = command;

   while (current) {
      const currentName = current.name();
      if (currentName) {
         names.unshift(currentName);
      }
      current = current.parent ?? undefined;
   }

   return names.join(' ');
}

function isGeneratedHelpCommand(command: Command): boolean {
   return command.name() === 'help';
}

function collectHelpBlocks(command: Command, blocks: string[]): void {
   blocks.push(`# ${getCommandPath(command)}\n\n${command.helpInformation()}`);

   for (const child of command.commands) {
      if (!isGeneratedHelpCommand(child)) {
         collectHelpBlocks(child, blocks);
      }
   }
}

export function renderFullHelp(
   command: Command,
   options: { extraBlocks?: string[] } = {},
): string {
   const blocks: string[] = [];
   collectHelpBlocks(command, blocks);
   blocks.push(...(options.extraBlocks ?? []));
   return blocks.join('\n\n---\n\n');
}
