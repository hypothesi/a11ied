import { createServer, type Server, type ServerResponse } from 'node:http';
import type { Audit } from '../db.js';
import { renderHtmlReport } from '../report/html.js';
import { buildAuditReport } from '../report/model.js';
import { createEvidenceResolver } from '../report/write.js';
import { getAuditStatus } from '../status.js';
import { renderDashboardHtml } from './render.js';

const DEFAULT_REFRESH_SECONDS = 5;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_ERROR = 500;
const LOCALHOST = '127.0.0.1';

export interface DashboardServer {
   url: string;
   close: () => Promise<void>;
}

interface Reply {
   status: number;
   type: string;
   body: string;
}

function send(response: ServerResponse, reply: Reply): void {
   response.writeHead(reply.status, { 'content-type': `${reply.type}; charset=utf-8` });
   response.end(reply.body);
}

function route(audit: Audit, path: string): Reply {
   if (path === '/') {
      return {
         status: HTTP_OK,
         type: 'text/html',
         body: renderDashboardHtml(audit, {
            refreshSeconds: DEFAULT_REFRESH_SECONDS,
            reportHref: '/report',
         }),
      };
   }
   if (path === '/report') {
      return {
         status: HTTP_OK,
         type: 'text/html',
         body: renderHtmlReport(buildAuditReport(audit), {
            resolveEvidence: createEvidenceResolver(audit, audit.dir, true),
         }),
      };
   }
   if (path === '/status.json') {
      return {
         status: HTTP_OK,
         type: 'application/json',
         body: JSON.stringify(getAuditStatus(audit)),
      };
   }
   return { status: HTTP_NOT_FOUND, type: 'text/plain', body: 'Not found' };
}

/**
 * Serves a live progress page for one audit on localhost. It only reads the audit, so it
 * is safe to leave running while workers write.
 */
export async function startDashboardServer(
   audit: Audit,
   port = 0,
): Promise<DashboardServer> {
   const server: Server = createServer((request, response) => {
      try {
         const { pathname } = new URL(request.url ?? '/', 'http://localhost');
         send(response, route(audit, pathname));
      } catch (error) {
         send(response, {
            status: HTTP_ERROR,
            type: 'text/plain',
            body: error instanceof Error ? error.message : String(error),
         });
      }
   });
   await new Promise<void>((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(port, LOCALHOST, resolveListen);
   });
   const address = server.address();
   const boundPort = typeof address === 'object' && address ? address.port : port;
   return {
      url: `http://${LOCALHOST}:${String(boundPort)}/`,
      close: () =>
         new Promise<void>((resolveClose) => {
            server.close(() => {
               resolveClose();
            });
         }),
   };
}
