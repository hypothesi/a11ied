/** Types for the shared screen reader workflow / verb metadata registry. */

export type SrTaskGroup =
   | 'session'
   | 'navigate'
   | 'interact'
   | 'assert'
   | 'inspect'
   | 'bulk';

export interface SrVerbMetadata {
   verb: string;
   group: SrTaskGroup;
   summary: string;
   /** The `a1 sr <subcommand>` this verb maps to, if any (top-level commands omitted). */
   cliSubcommand?: string;
   cliEquivalent?: string;
   payloadFields?: readonly string[];
   queuedMethods?: readonly string[];
   vitestMatchers?: readonly string[];
}

export const SR_ACTION_ENUM_VALUES = [
   'next',
   'previous',
   'navigate',
   'act',
   'press',
   'type',
   'perform',
   'click',
   'interact',
   'stopInteracting',
   'takeSnapshot',
] as const;

export type SrActionEnumValue = (typeof SR_ACTION_ENUM_VALUES)[number];

export interface SrActionMetadata {
   action: SrActionEnumValue;
   verb: string;
   group: SrTaskGroup;
   summary: string;
   cliEquivalent: string;
   payloadFields: readonly string[];
}
