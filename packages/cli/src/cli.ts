#!/usr/bin/env node

import { buildCli } from "./program.js";
import { cleanupStaleDriverSessions } from "@a11lied/core";

await cleanupStaleDriverSessions().catch(() => undefined);
await buildCli().parseAsync(process.argv);
