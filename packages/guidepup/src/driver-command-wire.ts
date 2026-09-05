import { DriverCommandError } from './driver-command-error.js';

/**
 * Playwright rebuilds an error thrown inside a page as a plain Error, so the class and
 * the code are lost and the CLI reports a usage error as an internal one. The page side
 * encodes a DriverCommandError into the message and the Node side decodes it back.
 */
const WIRE_PREFIX = 'a11ied-driver-command-error:';

interface WireError {
   code: string;
   message: string;
   details: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null;
}

function isWireError(value: unknown): value is WireError {
   return (
      isRecord(value) &&
      typeof value.code === 'string' &&
      typeof value.message === 'string'
   );
}

/** Encodes a DriverCommandError into an Error message that survives the page boundary. */
export function encodeDriverCommandError(error: unknown): unknown {
   if (!(error instanceof DriverCommandError)) {
      return error;
   }
   const wire: WireError = {
      code: error.code,
      message: error.message,
      details: error.details,
   };
   return new Error(`${WIRE_PREFIX}${JSON.stringify(wire)}`);
}

/** Rebuilds the DriverCommandError an encoded message carries, or returns the error. */
export function decodeDriverCommandError(error: unknown): unknown {
   const message = error instanceof Error ? error.message : '';
   const start = message.indexOf(WIRE_PREFIX);
   if (start === -1) {
      return error;
   }

   const line = message.slice(start + WIRE_PREFIX.length).split('\n')[0] ?? '';
   try {
      const parsed: unknown = JSON.parse(line);
      if (!isWireError(parsed)) {
         return error;
      }
      const details = isRecord(parsed.details) ? parsed.details : {};
      return new DriverCommandError(parsed.code, parsed.message, details);
   } catch {
      return error;
   }
}
