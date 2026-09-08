const CHORD_SEPARATOR = '+';
const SINGLE_CHARACTER = 1;

/**
 * The key spellings the APG uses, mapped to the names Playwright presses.
 *
 * Every entry is taken from the pinned artifact rather than guessed: the guide writes
 * both `Page Up` and `PageUp`, and both `Tab` and `TAB`, so lookups fold case and
 * spacing.
 */
const KEY_NAMES: Record<string, string> = {
   alt: 'Alt',
   backspace: 'Backspace',
   command: 'Meta',
   control: 'Control',
   delete: 'Delete',
   downarrow: 'ArrowDown',
   end: 'End',
   enter: 'Enter',
   esc: 'Escape',
   escape: 'Escape',
   home: 'Home',
   leftarrow: 'ArrowLeft',
   meta: 'Meta',
   pagedown: 'PageDown',
   pageup: 'PageUp',
   rightarrow: 'ArrowRight',
   shift: 'Shift',
   space: 'Space',
   tab: 'Tab',
   uparrow: 'ArrowUp',
};

/**
 * Key cells that describe a class of keys rather than one key, with the reason printed in
 * the report. Pressing one of these would mean choosing a member of the class, which is a
 * decision about the component rather than a fact from the guide.
 */
const UNTESTABLE_KEYS: Record<string, string> = {
   'a-z': 'the APG describes a range of keys, not one key',
   'a-z, a-z': 'the APG describes a range of keys, not one key',
   character: 'the APG describes any character key, not one key',
   key: 'the APG names no specific key',
   'printable characters': 'the APG describes a class of keys, not one key',
   'standard single line text editing keys':
      'the APG defers to the platform text editing keys, which it does not list',
};

export type PlaywrightKeys = { chord: string } | { untestable: string };

function normalize(key: string): string {
   return key.trim().toLowerCase().replaceAll(/\s+/gu, '');
}

function toPlaywrightKey(key: string): string | undefined {
   const named = KEY_NAMES[normalize(key)];
   if (named) {
      return named;
   }
   /* A single printable character, such as the `S` in Control + S, is pressed as itself. */
   const trimmed = key.trim();
   return trimmed.length === SINGLE_CHARACTER ? trimmed : undefined;
}

/**
 * Turns one key group into a chord Playwright can press, or says why it cannot.
 *
 * It takes a single group from a row's `keyGroups`, never the whole row. A row's groups
 * are alternatives, so joining them would build a chord such as `ArrowDown+Space+Enter`
 * that no reader of the APG would ever press.
 */
export function toPlaywrightKeys(keyGroup: readonly string[]): PlaywrightKeys {
   const untestable = keyGroup
      .map((key) => UNTESTABLE_KEYS[key.trim().toLowerCase()])
      .find((reason) => reason !== undefined);
   if (untestable) {
      return { untestable };
   }

   const names = keyGroup.map((key) => toPlaywrightKey(key));
   const unmapped = keyGroup.find((_key, index) => names[index] === undefined);
   if (unmapped !== undefined) {
      return { untestable: `no browser key matches "${unmapped}"` };
   }

   return { chord: names.join(CHORD_SEPARATOR) };
}
