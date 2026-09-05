import type { SerializableDriverCommand } from '#core';

/**
 * Categories in the order they print. The first pattern that matches the alias wins, so
 * `move-to-next-row` is a table command and `read-next-word` is a text command before
 * either counts as navigation or reading.
 */
const CATEGORY_PATTERNS: ReadonlyArray<[category: string, pattern: RegExp]> = [
   ['Tables', /table|(^|-)(row|column|cell)(-|$)/u],
   [
      'Text and editing',
      /\b(word|character|sentence|paragraph|line|text|spelling|misspelled|insertion|bold|italic|underlined|font|colou?r|style|edit-field|non-linked)\b/u,
   ],
   [
      'Reading',
      /^(read|hear|describe|report|speak|say|repeat|copy-last|save-last)|summary|statistics|item-description|help-tag|hint$/u,
   ],
   ['Hot spots and web spots', /hot-spot|web-spot/u],
   [
      'Windows and apps',
      /window|application|app-|dock|desktop|menu-bar|status-menu|chooser|spotlight|utility|switch-window|front/u,
   ],
   [
      'Navigation',
      /^(move|jump|next|previous|go-|find|scroll|navigate|escape|interact|stop-interacting|activate|click|perform|press|top|bottom|first|last)|frame|container|object|focus|landmark|heading|link|button|list|graphic|region|control|form-field|splitter|page/u,
   ],
   [
      'Settings and modes',
      /rotor|verbosity|speech|setting|commander|curtain|braille|caption|panel|cursor|mouse|sleep|help|quit|start|stop|keyboard|synth|punctuation|configuration|toggle|cycle|change|magnify|shrink|tile|lock|ignore|pronunciation|label|mode|review|refresh|profile|ducking|tether|resize|select|drag|drop|mark/u,
   ],
];

const OTHER_CATEGORY = 'Other';

const PORTABLE_JUMP_PATTERN = /^(next|previous)(-|$)/u;

/** Names the group a command prints under in `sr list`. */
export function categorizeDriverCommand(command: SerializableDriverCommand): string {
   const alias = command.alias.toLowerCase();
   if (PORTABLE_JUMP_PATTERN.test(alias)) {
      return 'Navigation';
   }
   const match = CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(alias));
   return match?.[0] ?? OTHER_CATEGORY;
}

/** Splits one command set into ordered categories, dropping empty ones. */
export function groupByCategory(
   commands: SerializableDriverCommand[],
): Array<[category: string, commands: SerializableDriverCommand[]]> {
   const order = [...CATEGORY_PATTERNS.map(([category]) => category), OTHER_CATEGORY];
   const buckets = new Map<string, SerializableDriverCommand[]>();
   for (const command of commands) {
      const category = categorizeDriverCommand(command);
      buckets.set(category, [...(buckets.get(category) ?? []), command]);
   }
   return order
      .filter((category) => buckets.has(category))
      .map((category) => [category, buckets.get(category) ?? []]);
}
