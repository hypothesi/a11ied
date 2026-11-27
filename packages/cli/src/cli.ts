#!/usr/bin/env node

import { buildCli } from './program.js';
import { shouldShowUpdateNotice, shouldSkipStartupMaintenance } from './lib/startup.js';

if (!shouldSkipStartupMaintenance(process.argv)) {
   const { cleanupStaleDriverSessions } = await import('#core');
   await cleanupStaleDriverSessions().catch(() => {
      // No-op
   });
}
if (shouldShowUpdateNotice(process.argv)) {
   const { scheduleUpdateNotice } = await import('./lib/update-check.js');
   scheduleUpdateNotice();
}
await buildCli().parseAsync(process.argv);
