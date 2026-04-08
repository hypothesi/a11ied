import { describe, expect, it } from 'vitest';

import { createDoctorReport, listCliCommands, listSupportedTargets } from './index.js';

const EXPECTED_TARGET_COUNT = 3;
const VIRTUAL_TARGET_INDEX = 2;

describe('core scaffolding', () => {
   it('returns the supported target matrix', () => {
      const targets = listSupportedTargets();

      expect(targets).toHaveLength(EXPECTED_TARGET_COUNT);
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
      expect(createDoctorReport().targets[VIRTUAL_TARGET_INDEX]?.status).toBe('ready');
   });
});
