#!/usr/bin/env node

import { buildCli } from './program.js';
import { shouldSkipStartupMaintenance } from './lib/startup.js';

if (!shouldSkipStartupMaintenance(process.argv)) {
   const { cleanupStaleDriverSessions } = await import('#core');
   await cleanupStaleDriverSessions().catch(() => {
      // No-op
   });
}
await buildCli().parseAsync(process.argv);
process.exit(process.exitCode ?? 0);
