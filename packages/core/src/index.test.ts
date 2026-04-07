import { describe, expect, it } from 'vitest';

import { createDoctorReport, listCliCommands, listSupportedTargets } from './index.js';

describe('core scaffolding', () => {
   it('returns the supported target matrix', () => {
      const targets = listSupportedTargets();

      expect(targets).toHaveLength(3);
      expect(targets.map((target) => target.platform)).toEqual([
         'voiceover',
         'nvda',
         'virtual',
      ]);
   });

   it('returns a CLI catalog that keeps CLI-first work front and center', () => {
      const commands = listCliCommands();

      expect(commands.map((command) => command.name)).toEqual([
         'wcag',
         'inspect',
         'drive',
         'doctor',
         'run',
         'verify',
         'story',
         'mcp',
      ]);
      expect(createDoctorReport().targets[2]?.status).toBe('ready');
   });
});
