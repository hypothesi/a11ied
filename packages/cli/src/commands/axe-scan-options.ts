import type { CliUsageError, PageCookie } from '#core';

export interface AxeScanCliOptions {
   selector?: string;
   exclude?: string;
   waitFor?: string;
   viewport?: string;
   header?: string[];
   cookie?: string[];
}

type CliUsageErrorConstructor = typeof CliUsageError;

const VIEWPORT_PATTERN = /^(\d+)x(\d+)$/iu;

/** Parses `--viewport WxH`, for example `1280x800`. */
export function parseViewport(
   ErrorClass: CliUsageErrorConstructor,
   value: string | undefined,
): { width: number; height: number } | undefined {
   if (value === undefined) {
      return undefined;
   }
   const match = VIEWPORT_PATTERN.exec(value);
   if (!match) {
      throw new ErrorClass(
         'validation-error',
         `--viewport "${value}" must look like "1280x800".`,
         { field: 'viewport', value },
      );
   }
   const [, widthText, heightText] = match;
   return { width: Number(widthText), height: Number(heightText) };
}

function parseHeaderEntry(
   ErrorClass: CliUsageErrorConstructor,
   entry: string,
): [string, string] {
   const separatorIndex = entry.indexOf(':');
   if (separatorIndex === -1) {
      throw new ErrorClass(
         'validation-error',
         `--header "${entry}" must look like "Name: value".`,
         { field: 'header', value: entry },
      );
   }
   const name = entry.slice(0, separatorIndex).trim();
   const value = entry.slice(separatorIndex + 1).trim();
   return [name, value];
}

/** Parses repeated `--header 'Name: value'` flags into a headers record. */
export function parseHeaders(
   ErrorClass: CliUsageErrorConstructor,
   entries: string[] | undefined,
): Record<string, string> | undefined {
   if (!entries || entries.length === 0) {
      return undefined;
   }
   return Object.fromEntries(entries.map((entry) => parseHeaderEntry(ErrorClass, entry)));
}

function parseCookieEntry(
   ErrorClass: CliUsageErrorConstructor,
   entry: string,
   url: string,
): PageCookie {
   const separatorIndex = entry.indexOf('=');
   if (separatorIndex === -1) {
      throw new ErrorClass(
         'validation-error',
         `--cookie "${entry}" must look like "name=value".`,
         { field: 'cookie', value: entry },
      );
   }
   return {
      name: entry.slice(0, separatorIndex).trim(),
      value: entry.slice(separatorIndex + 1).trim(),
      url,
   };
}

/**
 * Parses repeated `--cookie 'name=value'` flags. `url` is the target's navigable URL;
 * cookies are dropped for a target with no URL, such as `--html` or stdin.
 */
export function parseCookies(
   ErrorClass: CliUsageErrorConstructor,
   entries: string[] | undefined,
   url: string | undefined,
): PageCookie[] | undefined {
   if (!entries || entries.length === 0 || !url) {
      return undefined;
   }
   return entries.map((entry) => parseCookieEntry(ErrorClass, entry, url));
}
