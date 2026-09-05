import type {
   DriverNavigateRequest,
   Platform,
   PortableDriverVerb,
} from '@a11ied/contracts';
import { DriverCommandError } from './driver-command-error.js';
import {
   commandEntries,
   getLookupValues,
   isValidCommandSetForTarget,
   normalizeLookup,
   serializeCommand,
   type DriverCommandEntry,
} from './command-registry-data.js';

export { DriverCommandError } from './driver-command-error.js';

const SUGGESTION_LIMIT = 8;

export const driverCommandSets = [
   'auto',
   'portable',
   'voiceover-commander',
   'voiceover-keycode',
   'nvda-keycode',
] as const;
export type DriverCommandSet = (typeof driverCommandSets)[number];
export type ConcreteDriverCommandSet = Exclude<DriverCommandSet, 'auto'>;
export interface SerializableDriverCommand {
   target: Platform | 'portable';
   commandSet: ConcreteDriverCommandSet;
   alias: string;
   upstreamKey: string;
   upstreamValue?: string;
   description?: string;
   representation?: string;
}
export interface ResolvedDriverCommand extends SerializableDriverCommand {
   requestedCommand: string;
   command: unknown;
   portableAction?: PortableDriverVerb;
   portableNavigation?: DriverNavigateRequest;
}
export interface ListDriverCommandsOptions {
   target?: Platform;
   commandSet?: DriverCommandSet;
   query?: string;
}
export interface DriverCommandGroup {
   target: Platform | 'portable';
   commandSet: ConcreteDriverCommandSet;
   commands: SerializableDriverCommand[];
}
export interface DriverCommandList {
   commandSets: DriverCommandGroup[];
}
export interface ResolveDriverCommandOptions {
   target: Platform;
   command: string;
   commandSet?: DriverCommandSet;
}
export function isDriverCommandSet(value: string): value is DriverCommandSet {
   return driverCommandSets.includes(value as DriverCommandSet);
}
export function parseDriverCommandSet(value: string): DriverCommandSet {
   if (isDriverCommandSet(value)) {
      return value;
   }
   throw new DriverCommandError(
      'invalid-driver-command-set',
      `Command set "${value}" is not supported.`,
      {
         commandSet: value,
         supportedCommandSets: driverCommandSets,
      },
   );
}

function matchesTarget(entry: DriverCommandEntry, target: Platform | undefined): boolean {
   if (!target) {
      return true;
   }
   return entry.target === target || entry.commandSet === 'portable';
}

function matchesCommandSet(
   entry: DriverCommandEntry,
   commandSet: DriverCommandSet | undefined,
): boolean {
   if (!commandSet || commandSet === 'auto') {
      return true;
   }
   return entry.commandSet === commandSet;
}

function matchesQuery(entry: DriverCommandEntry, query: string | undefined): boolean {
   if (!query) {
      return true;
   }
   const normalizedQuery = normalizeLookup(query);
   return getLookupValues(entry).some((value) => value.includes(normalizedQuery));
}

function parseRequestedCommand(args: { command: string; commandSet: DriverCommandSet }): {
   command: string;
   commandSet: DriverCommandSet;
} {
   const [maybeSet, ...rest] = args.command.split(':');
   if (rest.length === 0) {
      return args;
   }
   if (driverCommandSets.includes(maybeSet as DriverCommandSet)) {
      return {
         commandSet: maybeSet as DriverCommandSet,
         command: rest.join(':'),
      };
   }
   return args;
}

function getDefaultCommandSets(target: Platform): ConcreteDriverCommandSet[] {
   if (target === 'voiceover') {
      return ['portable', 'voiceover-commander'];
   }
   if (target === 'nvda') {
      return ['portable', 'nvda-keycode'];
   }
   return ['portable'];
}

function getCandidateEntries(args: {
   target: Platform;
   commandSet: DriverCommandSet;
}): DriverCommandEntry[] {
   if (args.commandSet === 'auto') {
      const defaultSets = getDefaultCommandSets(args.target);
      return commandEntries.filter(
         (entry) =>
            defaultSets.includes(entry.commandSet) &&
            isValidCommandSetForTarget(args.target, entry.commandSet),
      );
   }
   return commandEntries.filter(
      (entry) =>
         entry.commandSet === args.commandSet &&
         isValidCommandSetForTarget(args.target, entry.commandSet),
   );
}

function buildSuggestions(args: {
   candidates: DriverCommandEntry[];
   command: string;
}): string[] {
   const normalized = normalizeLookup(args.command);
   const matches = args.candidates.filter((entry) =>
      getLookupValues(entry).some(
         (value) => value.includes(normalized) || normalized.includes(value),
      ),
   );
   return matches.slice(0, SUGGESTION_LIMIT).map((entry) => entry.alias);
}

function resolveMatch(args: {
   candidates: DriverCommandEntry[];
   command: string;
}): DriverCommandEntry {
   const normalized = normalizeLookup(args.command);
   const matches = args.candidates.filter((entry) =>
      getLookupValues(entry).includes(normalized),
   );
   if (matches.length === 1) {
      return matches[0] as DriverCommandEntry;
   }
   if (matches.length > 1) {
      throw new DriverCommandError(
         'ambiguous-driver-command',
         `Driver command "${args.command}" is ambiguous.`,
         {
            command: args.command,
            matches: matches.map((entry) => ({
               commandSet: entry.commandSet,
               alias: entry.alias,
               upstreamKey: entry.upstreamKey,
            })),
         },
      );
   }
   throw new DriverCommandError(
      'driver-command-not-found',
      `Driver command "${args.command}" was not found.`,
      {
         command: args.command,
         suggestions: buildSuggestions(args),
      },
   );
}

export function listDriverCommands(
   options: ListDriverCommandsOptions = {},
): DriverCommandList {
   const groups = new Map<string, DriverCommandGroup>();
   const entries = commandEntries.filter(
      (entry) =>
         matchesTarget(entry, options.target) &&
         matchesCommandSet(entry, options.commandSet) &&
         matchesQuery(entry, options.query),
   );
   for (const entry of entries) {
      const key = `${entry.target}:${entry.commandSet}`;
      const group = groups.get(key) ?? {
         target: entry.target,
         commandSet: entry.commandSet,
         commands: [],
      };
      group.commands.push(serializeCommand(entry));
      groups.set(key, group);
   }
   return { commandSets: [...groups.values()] };
}

export function serializeResolvedDriverCommand(
   command: ResolvedDriverCommand,
): SerializableDriverCommand & { requestedCommand: string } {
   return {
      ...serializeCommand(command),
      requestedCommand: command.requestedCommand,
   };
}

function assertTargetSupportsCommandSet(args: {
   target: Platform;
   commandSet: DriverCommandSet;
   command: string;
}): void {
   if (args.commandSet === 'auto' || args.commandSet === 'portable') {
      return;
   }
   if (isValidCommandSetForTarget(args.target, args.commandSet)) {
      return;
   }
   if (args.target === 'virtual') {
      throw new DriverCommandError(
         'driver-command-target-unsupported',
         'The virtual target only runs the portable commands; VoiceOver and NVDA command sets need a real target.',
         {
            target: args.target,
            commandSet: args.commandSet,
            command: args.command,
         },
      );
   }
   throw new DriverCommandError(
      'driver-command-set-mismatch',
      `Command set "${args.commandSet}" is not valid for target "${args.target}".`,
      {
         target: args.target,
         commandSet: args.commandSet,
         command: args.command,
      },
   );
}

function createResolvedCommand(args: {
   match: DriverCommandEntry;
   requestedCommand: string;
}): ResolvedDriverCommand {
   const resolved: ResolvedDriverCommand = {
      ...serializeCommand(args.match),
      requestedCommand: args.requestedCommand,
      command: args.match.command,
   };
   if (args.match.portableAction) {
      resolved.portableAction = args.match.portableAction;
   }
   if (args.match.portableNavigation) {
      resolved.portableNavigation = args.match.portableNavigation;
   }
   return resolved;
}

export function resolveDriverCommand(
   options: ResolveDriverCommandOptions,
): ResolvedDriverCommand {
   const requestedCommand = options.command;
   const requestedSet = options.commandSet ?? 'auto';
   const parsed = parseRequestedCommand({
      command: requestedCommand,
      commandSet: requestedSet,
   });
   assertTargetSupportsCommandSet({
      target: options.target,
      commandSet: parsed.commandSet,
      command: requestedCommand,
   });
   const candidates = getCandidateEntries({
      target: options.target,
      commandSet: parsed.commandSet,
   });
   const match = resolveMatch({ candidates, command: parsed.command });
   return createResolvedCommand({ match, requestedCommand });
}
