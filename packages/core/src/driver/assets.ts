import {
   createDefaultGuidepupEnvironmentDeps,
   hasScreenReaderAssets,
} from '@a11ied/guidepup';
import type { Platform } from '@a11ied/contracts';

import { listGuidepupSetupSteps, runGuidepupSetup } from '../doctor/setup.js';

/**
 * Downloads what a real screen reader needs before its first session, so nobody has to
 * run the Guidepup install command from a global node_modules directory by hand. Only the
 * download runs here. Granting automation permissions prompts for input, so `a1 setup`
 * still owns that step.
 */
export async function ensureScreenReaderAssets(target: Platform): Promise<boolean> {
   if (target === 'virtual') {
      return false;
   }

   const deps = createDefaultGuidepupEnvironmentDeps();
   if (hasScreenReaderAssets(deps, target)) {
      return false;
   }

   const steps = listGuidepupSetupSteps({ skipSetup: true, skipInstall: false }, deps);
   await runGuidepupSetup(steps);
   return true;
}
