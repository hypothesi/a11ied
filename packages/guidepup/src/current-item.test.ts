import { describe, expect, it } from 'vitest';

import { parseNvdaItem, parseVoiceOverItem } from './current-item.js';

describe('parseVoiceOverItem', () => {
   it('reads the role from the last chunk and the name from the item text', () => {
      const item = parseVoiceOverItem('Learn more, link', 'Learn more');

      expect(item).toMatchObject({ role: 'link', name: 'Learn more', states: [] });
      expect(item.source).toContain('VoiceOver');
   });

   it('reads heading levels and keeps the level as a number', () => {
      const item = parseVoiceOverItem(
         'Example Domain, heading level 1',
         'Example Domain',
      );

      expect(item).toMatchObject({ role: 'heading', level: 1, name: 'Example Domain' });
   });

   it('collects state words and falls back to the phrase for the name', () => {
      const item = parseVoiceOverItem('Accept the terms, unchecked, checkbox', '');

      expect(item).toMatchObject({
         role: 'checkbox',
         name: 'Accept the terms',
         states: ['unchecked'],
      });
   });

   it('leaves role empty when the phrase names none', () => {
      const item = parseVoiceOverItem('Some plain sentence', 'Some plain sentence');

      expect(item.role).toBeUndefined();
      expect(item.name).toBe('Some plain sentence');
   });
});

describe('parseNvdaItem', () => {
   it('reads the role from the start of the phrase', () => {
      const item = parseNvdaItem('link Learn more', '');

      expect(item).toMatchObject({ role: 'link', name: 'Learn more', states: [] });
      expect(item.source).toContain('NVDA');
   });

   it('reads heading levels', () => {
      const item = parseNvdaItem('heading level 2 Products', '');

      expect(item).toMatchObject({ role: 'heading', level: 2, name: 'Products' });
   });

   it('pulls states out of the middle of the phrase', () => {
      const item = parseNvdaItem('check box not checked Accept the terms', '');

      expect(item).toMatchObject({
         role: 'check-box',
         name: 'Accept the terms',
         states: ['not checked'],
      });
   });

   it('prefers a longer role word such as radio button over button', () => {
      const item = parseNvdaItem('radio button checked Monthly', '');

      expect(item.role).toBe('radio-button');
      expect(item.name).toBe('Monthly');
   });
});
