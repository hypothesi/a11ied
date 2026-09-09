import { describe, expect, it } from 'vitest';

import { toPlaywrightKeys } from './keys.js';

describe('toPlaywrightKeys', () => {
   it('maps the arrow spellings the APG uses', () => {
      expect(toPlaywrightKeys(['Down Arrow'])).toEqual({ chord: 'ArrowDown' });
      expect(toPlaywrightKeys(['Up arrow'])).toEqual({ chord: 'ArrowUp' });
      expect(toPlaywrightKeys(['Left Arrow'])).toEqual({ chord: 'ArrowLeft' });
      expect(toPlaywrightKeys(['Right arrow'])).toEqual({ chord: 'ArrowRight' });
   });

   it('accepts the arrow key names sr press documents, for --setup', () => {
      expect(toPlaywrightKeys(['ArrowDown'])).toEqual({ chord: 'ArrowDown' });
      expect(toPlaywrightKeys(['Shift', 'ArrowUp'])).toEqual({ chord: 'Shift+ArrowUp' });
   });

   it('folds the case and spacing the APG is inconsistent about', () => {
      expect(toPlaywrightKeys(['TAB'])).toEqual({ chord: 'Tab' });
      expect(toPlaywrightKeys(['ESC'])).toEqual({ chord: 'Escape' });
      expect(toPlaywrightKeys(['Page Up'])).toEqual({ chord: 'PageUp' });
      expect(toPlaywrightKeys(['PageUp'])).toEqual({ chord: 'PageUp' });
   });

   it('joins one group into one chord', () => {
      expect(toPlaywrightKeys(['Alt', 'Down Arrow'])).toEqual({ chord: 'Alt+ArrowDown' });
      expect(toPlaywrightKeys(['Shift', 'Tab'])).toEqual({ chord: 'Shift+Tab' });
      expect(toPlaywrightKeys(['Command', 'S'])).toEqual({ chord: 'Meta+S' });
   });

   it('refuses a key cell that describes a class of keys', () => {
      expect(toPlaywrightKeys(['Printable Characters'])).toEqual({
         untestable: 'the APG describes a class of keys, not one key',
      });
      expect(toPlaywrightKeys(['A-Z'])).toEqual({
         untestable: 'the APG describes a range of keys, not one key',
      });
      expect(toPlaywrightKeys(['Standard single line text editing keys'])).toEqual({
         untestable:
            'the APG defers to the platform text editing keys, which it does not list',
      });
   });

   it('says which key it could not map rather than guessing', () => {
      expect(toPlaywrightKeys(['Whatever Key'])).toEqual({
         untestable: 'no browser key matches "Whatever Key"',
      });
   });
});
