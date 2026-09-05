import { describe, expect, it } from 'vitest';

import {
   DriverCommandError,
   listDriverCommands,
   parseDriverCommandSet,
   resolveDriverCommand,
} from './command-registry.js';

describe('driver command listing', () => {
   it('lists portable, VoiceOver, and NVDA command sets', () => {
      const listed = listDriverCommands();

      expect(
         listed.commandSets.map((group) => `${group.target}:${group.commandSet}`),
      ).toEqual(
         expect.arrayContaining([
            'portable:portable',
            'voiceover:voiceover-commander',
            'voiceover:voiceover-keycode',
            'nvda:nvda-keycode',
         ]),
      );
   });

   it('advertises only the portable verbs and kind jumps for the virtual target', () => {
      const listed = listDriverCommands({ target: 'virtual' });
      const aliases = listed.commandSets[0]?.commands.map((command) => command.alias);

      expect(listed.commandSets.map((group) => group.commandSet)).toEqual(['portable']);
      expect(aliases?.slice(0, 8)).toEqual([
         'next',
         'previous',
         'interact',
         'stop-interacting',
         'activate',
         'top',
         'bottom',
         'escape',
      ]);
      expect(aliases).toContain('next-heading');
      expect(aliases).toContain('previous-form-field');
      expect(aliases).not.toContain('next-item');
   });

   it('resolves a kind jump to its navigation request on every target', () => {
      for (const target of ['voiceover', 'nvda', 'virtual'] as const) {
         const resolved = resolveDriverCommand({ target, command: 'previous-link' });

         expect(resolved.portableNavigation).toEqual({ direction: 'previous', kind: 'link' });
         expect(resolved.portableAction).toBeUndefined();
      }
   });
});

describe('driver command resolution', () => {
   it('defaults VoiceOver resolution to portable plus commander commands', () => {
      const resolved = resolveDriverCommand({
         target: 'voiceover',
         command: 'move-right',
      });

      expect(resolved.commandSet).toBe('voiceover-commander');
      expect(resolved.upstreamKey).toBe('MOVE_RIGHT');
   });

   it('supports explicit keycode command-set prefixes', () => {
      const resolved = resolveDriverCommand({
         target: 'voiceover',
         command: 'voiceover-keycode:hear-item-description',
      });

      expect(resolved.commandSet).toBe('voiceover-keycode');
      expect(resolved.upstreamKey).toBe('hearItemDescription');
   });

   it('rejects invalid target and command-set combinations', () => {
      expect(() =>
         resolveDriverCommand({
            target: 'nvda',
            command: 'voiceover-commander:move-right',
         }),
      ).toThrow(DriverCommandError);
   });

   it('resolves portable verbs on every target through the one table', () => {
      for (const target of ['voiceover', 'nvda', 'virtual'] as const) {
         const resolved = resolveDriverCommand({ target, command: 'top' });

         expect(resolved.portableAction).toBe('top');
         expect(resolved.commandSet).toBe('portable');
      }
   });

   it('validates command-set values', () => {
      expect(parseDriverCommandSet('voiceover-commander')).toBe('voiceover-commander');
      expect(() => parseDriverCommandSet('made-up')).toThrow(DriverCommandError);
   });
});
