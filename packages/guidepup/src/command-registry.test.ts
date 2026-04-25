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

   it('validates command-set values', () => {
      expect(parseDriverCommandSet('voiceover-commander')).toBe('voiceover-commander');
      expect(() => parseDriverCommandSet('made-up')).toThrow(DriverCommandError);
   });
});
