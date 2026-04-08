import {
   wcagLevelSchema,
   wcagVersionSchema,
   type WcagLevel,
   type WcagVersion,
} from '@a11lied/contracts';

import { CliUsageError } from '../errors/cli-errors.js';

export function parseWcagVersion(version: string): WcagVersion {
   const parsed = wcagVersionSchema.safeParse(version);
   if (!parsed.success) {
      throw new CliUsageError(
         'validation-error',
         `WCAG version "${version}" is unsupported.`,
         {
            field: 'version',
            value: version,
            supportedVersions: [...wcagVersionSchema.options],
         },
      );
   }

   return parsed.data;
}

export function parseWcagLevel(level: string): WcagLevel {
   const parsed = wcagLevelSchema.safeParse(level);
   if (!parsed.success) {
      throw new CliUsageError(
         'validation-error',
         `WCAG level "${level}" is unsupported.`,
         {
            field: 'level',
            value: level,
            supportedLevels: [...wcagLevelSchema.options],
         },
      );
   }

   return parsed.data;
}
