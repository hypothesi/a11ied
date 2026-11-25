import { describe, expect, it } from 'vitest';

import { expectFirstErrorMessage } from './helpers.js';
import { runCli } from './setup.js';

describe('doctor option validation', () => {
   it('rejects --recording without a reader task as a usage error', async () => {
      const result = await runCli(['doctor', '--recording', '--json']);

      const json = expectFirstErrorMessage({
         result,
         match: /recording requires task reader or audit/iu,
      });

      expect(json.ok).toStrictEqual(false);
      expect((json.errors as Array<{ code: string }>)[0]?.code).toBe('validation-error');
   });

   it('rejects an unknown task as a usage error', async () => {
      const result = await runCli(['doctor', '--task', 'everything', '--json']);

      const json = expectFirstErrorMessage({ result, match: /^task: /u });

      expect((json.errors as Array<{ code: string }>)[0]?.code).toBe('validation-error');
   });
});
