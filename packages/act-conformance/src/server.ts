import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { CORPUS_MOUNT_PATH, type CorpusPaths } from './corpus.js';

const NOT_FOUND = 404;
const OK = 200;

/**
 * The test cases reference their assets with absolute paths under
 * `/WAI/content-assets/wcag-act-rules/`, so the server mounts the corpus there. Serving
 * it from the root leaves 707 asset references returning 404, which silently changes what
 * axe reports for the contrast and media rules.
 */
const CONTENT_TYPES: Record<string, string> = {
   '.css': 'text/css',
   '.html': 'text/html; charset=utf-8',
   '.jfif': 'image/jpeg',
   '.jpeg': 'image/jpeg',
   '.jpg': 'image/jpeg',
   '.js': 'text/javascript',
   '.json': 'application/json',
   '.mp3': 'audio/mpeg',
   '.mp4': 'video/mp4',
   '.png': 'image/png',
   '.svg': 'image/svg+xml',
   '.txt': 'text/plain; charset=utf-8',
   '.vtt': 'text/vtt',
   '.webm': 'video/webm',
   '.xhtml': 'application/xhtml+xml',
   '.xml': 'application/xml',
};

/*
 * Five test-asset files have no extension on purpose; they check that an image with a
 * filename-shaped accessible name is still an image. Serving them as an image keeps the
 * browser from offering a download instead of rendering the page.
 */
const DEFAULT_CONTENT_TYPE = 'image/png';

export interface CorpusServerHandle {
   start(): Promise<void>;
   stop(): Promise<void>;
   /** The local URL that serves the test case at `relativePath` from the index. */
   urlFor(relativePath: string): string;
   /** Paths a test case asked for that the corpus does not hold. */
   listMissingAssets(): string[];
}

function resolveContentType(filePath: string): string {
   return CONTENT_TYPES[extname(filePath).toLowerCase()] ?? DEFAULT_CONTENT_TYPE;
}

/**
 * Serves the pinned corpus over http. Files are read as a Buffer, not as utf8, because
 * the media assets the video and audio rules depend on are binary.
 */
export function createCorpusServer(paths: CorpusPaths): CorpusServerHandle {
   const missing = new Set<string>();
   let port = 0;

   const server: Server = createServer((request, response) => {
      const requestPath = normalize(
         decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/'),
      );
      if (!requestPath.startsWith(CORPUS_MOUNT_PATH)) {
         missing.add(requestPath);
         response.writeHead(NOT_FOUND).end();
         return;
      }

      const filePath = join(paths.assets, requestPath.slice(CORPUS_MOUNT_PATH.length));
      readFile(filePath)
         .then((body) => {
            response.writeHead(OK, { 'content-type': resolveContentType(filePath) });
            response.end(body);
         })
         .catch(() => {
            missing.add(requestPath);
            response.writeHead(NOT_FOUND).end();
         });
   });

   return {
      start(): Promise<void> {
         return new Promise((resolveStart) => {
            server.listen(0, '127.0.0.1', () => {
               const address = server.address();
               port = typeof address === 'object' && address !== null ? address.port : 0;
               resolveStart();
            });
         });
      },
      stop(): Promise<void> {
         return new Promise((resolveStop) => {
            server.close(() => resolveStop());
         });
      },
      urlFor(relativePath: string): string {
         return `http://127.0.0.1:${String(port)}${CORPUS_MOUNT_PATH}/${relativePath}`;
      },
      listMissingAssets(): string[] {
         return [...missing].toSorted();
      },
   };
}
