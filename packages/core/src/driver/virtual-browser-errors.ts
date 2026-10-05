import { decodeDriverCommandError, type VirtualHost } from '@a11ied/guidepup';

type HostMethod = (...args: never[]) => Promise<unknown>;

function decorate(method: HostMethod): HostMethod {
   return async (...args) => {
      try {
         return await method(...args);
      } catch (error) {
         const decoded = decodeDriverCommandError(error);
         throw decoded instanceof Error ? decoded : error;
      }
   };
}

/**
 * Rebuilds the typed error a page threw, so a command the reader cannot run reports the
 * same code and exit status it reports on the jsdom engine.
 */
export function withDecodedErrors(host: VirtualHost): VirtualHost {
   const entries = Object.entries(host).map(([name, value]) =>
      typeof value === 'function' ? [name, decorate(value as HostMethod)] : [name, value],
   );
   return Object.fromEntries(entries) as VirtualHost;
}

/** Context destruction requires a fresh observation rather than replayed input. */
export function isNavigationError(error: unknown): boolean {
   if (!(error instanceof Error)) {
      return false;
   }
   const message = error.message.toLowerCase();
   return (
      message.includes('execution context was destroyed') ||
      message.includes('navigation') ||
      message.includes('cannot find context')
   );
}
