import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { FetchLike } from './types.js';

const execFileAsync = promisify(execFile);
const CURL_TIMEOUT_SECONDS = 30;
const CURL_MAX_BUFFER_BYTES = 20_000_000;
const STATUS_MARKER = 'A11IED_CURL_STATUS';

interface CurlResult {
   status: number;
   body: string;
}

function parseCurlOutput(stdout: string): CurlResult {
   const markerIndex = stdout.lastIndexOf(STATUS_MARKER);
   const body = stdout.slice(0, markerIndex);
   const status = Number.parseInt(
      stdout.slice(markerIndex + STATUS_MARKER.length).trim(),
      10,
   );
   return { status, body };
}

/**
 * A fetch-compatible client backed by the system `curl` binary. W3C's CDN answers Node's
 * built-in fetch with a bot-management challenge on an HTTP/TLS client fingerprint match,
 * not on headers or request volume: an identical request from curl succeeds every time.
 * Response headers (etag, retry-after) are unavailable through this path, so callers that
 * need them fall back to their own defaults.
 */
export const curlFetch: FetchLike = async (input) => {
   const url = typeof input === 'string' ? input : input.toString();
   const { stdout } = await execFileAsync(
      'curl',
      [
         '--silent',
         '--show-error',
         '--location',
         '--max-time',
         String(CURL_TIMEOUT_SECONDS),
         '--write-out',
         `${STATUS_MARKER}%{http_code}`,
         url,
      ],
      { maxBuffer: CURL_MAX_BUFFER_BYTES },
   );
   const { status, body } = parseCurlOutput(stdout);
   return new Response(body, { status });
};
