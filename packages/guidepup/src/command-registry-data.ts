import {
   NVDAKeyCodeCommands,
   VoiceOverCommanderCommands,
   voiceOverKeyCodeCommands,
} from '@guidepup/guidepup';
import type { DriverActionName, Platform } from '@a11ied/contracts';
import type {
   ConcreteDriverCommandSet,
   SerializableDriverCommand,
} from './command-registry.js';

export interface DriverCommandEntry extends SerializableDriverCommand {
   command: unknown;
   portableAction?: DriverActionName;
}

const portableCommands: Record<
   string,
   { action: DriverActionName; description: string }
> = {
   next: { action: 'next', description: 'Move to the next item.' },
   previous: { action: 'previous', description: 'Move to the previous item.' },
   interact: { action: 'interact', description: 'Enter interaction mode.' },
   'stop-interacting': {
      action: 'stop-interacting',
      description: 'Leave interaction mode.',
   },
   activate: {
      action: 'click-current-item',
      description: 'Activate the current item.',
   },
   'click-current-item': {
      action: 'click-current-item',
      description: 'Activate the current item.',
   },
};

function toKebabCase(value: string): string {
   return value
      .replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replaceAll('_', '-')
      .replaceAll(/\s+/g, '-')
      .replaceAll(/[^a-zA-Z0-9-]+/g, '-')
      .replaceAll(/-+/g, '-')
      .replaceAll(/^-|-$/g, '')
      .toLowerCase();
}

export function normalizeLookup(value: string): string {
   return value.toLowerCase().replaceAll(/[\s:_-]+/gu, '');
}

export function serializeCommand(entry: DriverCommandEntry): SerializableDriverCommand {
   const result: SerializableDriverCommand = {
      target: entry.target,
      commandSet: entry.commandSet,
      alias: entry.alias,
      upstreamKey: entry.upstreamKey,
   };
   if (entry.upstreamValue) {
      result.upstreamValue = entry.upstreamValue;
   }
   if (entry.description) {
      result.description = entry.description;
   }
   if (entry.representation) {
      result.representation = entry.representation;
   }
   return result;
}

function getCommandDescription(command: unknown): string | undefined {
   if (
      typeof command === 'object' &&
      command !== null &&
      'description' in command &&
      typeof command.description === 'string'
   ) {
      return command.description;
   }
   return undefined;
}

function getCommandRepresentation(command: unknown): string | undefined {
   if (
      typeof command === 'object' &&
      command !== null &&
      'representation' in command &&
      typeof command.representation === 'string'
   ) {
      return command.representation;
   }
   return undefined;
}

function createPortableEntries(): DriverCommandEntry[] {
   return Object.entries(portableCommands).map(([alias, command]) => ({
      target: 'portable',
      commandSet: 'portable',
      alias,
      upstreamKey: alias,
      description: command.description,
      command: command.action,
      portableAction: command.action,
   }));
}

function createCommanderEntries(): DriverCommandEntry[] {
   return Object.entries(VoiceOverCommanderCommands).map(([upstreamKey, value]) => ({
      target: 'voiceover',
      commandSet: 'voiceover-commander',
      alias: toKebabCase(upstreamKey),
      upstreamKey,
      upstreamValue: String(value),
      command: value,
   }));
}

function createKeyCodeEntry(args: {
   target: Extract<Platform, 'voiceover' | 'nvda'>;
   commandSet: Extract<ConcreteDriverCommandSet, 'voiceover-keycode' | 'nvda-keycode'>;
   upstreamKey: string;
   command: unknown;
}): DriverCommandEntry {
   const entry: DriverCommandEntry = {
      target: args.target,
      commandSet: args.commandSet,
      alias: toKebabCase(args.upstreamKey),
      upstreamKey: args.upstreamKey,
      command: args.command,
   };
   const description = getCommandDescription(args.command);
   if (description) {
      entry.description = description;
   }
   const representation = getCommandRepresentation(args.command);
   if (representation) {
      entry.representation = representation;
   }
   return entry;
}

function createKeyCodeEntries(args: {
   target: Extract<Platform, 'voiceover' | 'nvda'>;
   commandSet: Extract<ConcreteDriverCommandSet, 'voiceover-keycode' | 'nvda-keycode'>;
   commands: Record<string, unknown>;
}): DriverCommandEntry[] {
   return Object.entries(args.commands).map(([upstreamKey, command]) =>
      createKeyCodeEntry({
         target: args.target,
         commandSet: args.commandSet,
         upstreamKey,
         command,
      }),
   );
}

export const commandEntries: DriverCommandEntry[] = [
   ...createPortableEntries(),
   ...createCommanderEntries(),
   ...createKeyCodeEntries({
      target: 'voiceover',
      commandSet: 'voiceover-keycode',
      commands: voiceOverKeyCodeCommands,
   }),
   ...createKeyCodeEntries({
      target: 'nvda',
      commandSet: 'nvda-keycode',
      commands: NVDAKeyCodeCommands,
   }),
];

export function getLookupValues(entry: DriverCommandEntry): string[] {
   const values = [entry.alias, entry.upstreamKey];
   if (entry.upstreamValue) {
      values.push(entry.upstreamValue);
   }
   if (entry.representation) {
      values.push(entry.representation);
   }
   return values.map((value) => normalizeLookup(value));
}

export function isValidCommandSetForTarget(
   target: Platform,
   commandSet: ConcreteDriverCommandSet,
): boolean {
   if (commandSet === 'portable') {
      return true;
   }
   if (target === 'voiceover') {
      return commandSet === 'voiceover-commander' || commandSet === 'voiceover-keycode';
   }
   if (target === 'nvda') {
      return commandSet === 'nvda-keycode';
   }
   return false;
}
