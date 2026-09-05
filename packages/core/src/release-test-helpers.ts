import { expect } from 'vitest';

import type { CliCommand } from '@a11ied/contracts';

const EXPECTED_READY_COMMANDS = [
   'wcag',
   'sr',
   'axe',
   'tree',
   'audit',
   'doctor',
   'setup',
   'mcp',
];

export function expectReadyCommands(commands: CliCommand[]): void {
   expect(commands.map((command) => command.name)).toEqual(EXPECTED_READY_COMMANDS);
   expect(commands.every((command) => command.maturity === 'ready')).toBe(true);
}
