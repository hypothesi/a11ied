import type { DriverCurrentItem } from '@a11ied/contracts';

/**
 * Role words as VoiceOver and NVDA speak them, longest first so "radio button" wins over
 * "button" and "visited link" over "link".
 */
const SPOKEN_ROLES = [
   'secure edit text',
   'search text field',
   'disclosure triangle',
   'pop up button',
   'menu button',
   'radio button',
   'visited link',
   'check box',
   'checkbox',
   'combo box',
   'list box',
   'edit text',
   'text field',
   'static text',
   'web content',
   'html content',
   'list item',
   'menu item',
   'heading',
   'landmark',
   'graphic',
   'image',
   'button',
   'link',
   'table',
   'group',
   'list',
   'menu',
   'slider',
   'tab',
   'edit',
   'text',
   'row',
   'cell',
   'banner',
   'navigation',
   'main',
   'region',
   'complementary',
   'contentinfo',
   'article',
   'form',
   'search',
   'dialog',
] as const;

const SPOKEN_STATES = [
   'not checked',
   'unchecked',
   'checked',
   'unticked',
   'ticked',
   'not pressed',
   'pressed',
   'selected',
   'required',
   'read only',
   'readonly',
   'expanded',
   'collapsed',
   'dimmed',
   'unavailable',
   'disabled',
   'busy',
   'invalid',
   'has popup',
   'has pop up',
   'clickable',
   'visited',
   'current',
] as const;

const SPOKEN_STATE_SET: ReadonlySet<string> = new Set(SPOKEN_STATES);
const HEADING_LEVEL_PATTERN = /\bheading level (\d)\b/iu;

function findSpokenRole(chunk: string): string | undefined {
   // "heading level 1" carries the level after the role word.
   const lowered = chunk.toLowerCase().replace(/\s+level \d$/u, '');
   return SPOKEN_ROLES.find((role) => lowered === role || lowered.endsWith(` ${role}`));
}

function extractStates(chunks: string[]): string[] {
   return chunks
      .map((chunk) => chunk.toLowerCase())
      .filter((chunk) => SPOKEN_STATE_SET.has(chunk));
}

function readHeadingLevel(phrase: string): number | undefined {
   const level = HEADING_LEVEL_PATTERN.exec(phrase)?.[1];
   return level === undefined ? undefined : Number(level);
}

function normalizeRole(role: string, phrase: string): string {
   if (readHeadingLevel(phrase) !== undefined || role === 'heading') {
      return 'heading';
   }
   return role.replaceAll(' ', '-');
}

function withOptional(
   item: DriverCurrentItem,
   fields: {
      role?: string | undefined;
      name?: string | undefined;
      level?: number | undefined;
   },
): DriverCurrentItem {
   const result = { ...item };
   if (fields.role) {
      result.role = fields.role;
   }
   if (fields.name) {
      result.name = fields.name;
   }
   if (fields.level !== undefined) {
      result.level = fields.level;
   }
   return result;
}

/**
 * Parses a VoiceOver phrase, which names the item first and its role last: `Learn more,
 * link`, `Example Domain, heading level 1`, `Accept, unchecked, checkbox`. The item text,
 * when VoiceOver reports one, is the name.
 */
export function parseVoiceOverItem(phrase: string, itemText: string): DriverCurrentItem {
   const chunks = phrase
      .split(',')
      .map((chunk) => chunk.trim())
      .filter(Boolean);
   const roleIndex = chunks.findLastIndex((chunk) => findSpokenRole(chunk) !== undefined);
   const roleChunk = roleIndex === -1 ? undefined : chunks[roleIndex];
   const rest = chunks.filter((_chunk, index) => index !== roleIndex);
   const rawRole = roleChunk === undefined ? undefined : findSpokenRole(roleChunk);
   const base: DriverCurrentItem = {
      states: extractStates(rest),
      phrase,
      itemText,
      source:
         'VoiceOver: role and states parsed from the phrase, name from the item text',
   };
   return withOptional(base, {
      role: rawRole === undefined ? undefined : normalizeRole(rawRole, phrase),
      name: itemText || rest.find((chunk) => !SPOKEN_STATE_SET.has(chunk.toLowerCase())),
      level: readHeadingLevel(phrase),
   });
}

/**
 * Parses an NVDA phrase, which speaks the role first: `link Learn more`, `heading level 1
 * Example Domain`, `check box not checked Accept`.
 */
export function parseNvdaItem(phrase: string, itemText: string): DriverCurrentItem {
   const lowered = phrase.toLowerCase();
   const rawRole = SPOKEN_ROLES.find(
      (role) => lowered.startsWith(`${role} `) || lowered === role,
   );
   let remainder = rawRole === undefined ? phrase : phrase.slice(rawRole.length).trim();
   remainder = remainder.replace(/^level \d\s*/iu, '');
   const states: string[] = [];
   for (const state of SPOKEN_STATES) {
      const pattern = new RegExp(`(^|\\s)${state}(\\s|$)`, 'iu');
      if (pattern.test(remainder)) {
         states.push(state);
         remainder = remainder.replace(pattern, ' ').trim();
      }
   }
   const base: DriverCurrentItem = {
      states,
      phrase,
      itemText,
      source: 'NVDA: role, states, and name parsed from the phrase',
   };
   return withOptional(base, {
      role: rawRole === undefined ? undefined : normalizeRole(rawRole, phrase),
      name: remainder || itemText,
      level: readHeadingLevel(phrase),
   });
}
