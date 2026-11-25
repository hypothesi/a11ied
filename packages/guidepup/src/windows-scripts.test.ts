import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const scriptsDir = resolve(import.meta.dirname, '../scripts');

/** PowerShell's own process id. Read-only, and variable names ignore case. */
const PID_ASSIGNMENT = /\$pid\s*=(?!=)/i;

describe('the PowerShell scripts', () => {
   const scripts = readdirSync(scriptsDir).filter((name) => name.endsWith('.ps1'));

   it('exist', () => {
      expect(scripts.length).toBeGreaterThan(0);
   });

   it.each(scripts)('%s never assigns to the read-only $PID variable', (name) => {
      const source = readFileSync(resolve(scriptsDir, name), 'utf8');

      expect(PID_ASSIGNMENT.test(source)).toBe(false);
   });
});
