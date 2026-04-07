import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import net from 'node:net';

import {
   accessibilityDriverSessionSchema,
   driverActionResultSchema,
   type AccessibilityDriverSession,
   type DriverActionResult,
   type DriverCheckpoint,
   type Platform,
} from '@a11lied/contracts';
import { createDriverAdapter } from '@a11lied/guidepup';

interface BrokerArgs {
   sessionId: string;
   target: Platform;
   metadataFile: string;
   socketPath: string;
}

interface BrokerRequest {
   command: 'ping' | 'status' | 'stop' | 'action' | 'attach-document';
   action?: DriverActionResult['action'];
   payload?: Record<string, unknown>;
}

interface BrokerResponse {
   ok: boolean;
   result?: DriverActionResult;
   error?: {
      code: string;
      message: string;
   };
}

function parseArgs(argv: string[]): BrokerArgs {
   const values = new Map<string, string>();

   for (let index = 0; index < argv.length; index += 1) {
      const part = argv[index];
      if (!part?.startsWith('--')) {
         continue;
      }

      const value = argv[index + 1];
      if (value) {
         values.set(part, value);
      }
   }

   const sessionId = values.get('--session-id');
   const target = values.get('--target');
   const metadataFile = values.get('--metadata-file');
   const socketPath = values.get('--socket-path');

   if (!sessionId || !target || !metadataFile || !socketPath) {
      throw new Error(
         'driver broker requires --session-id, --target, --metadata-file, and --socket-path',
      );
   }

   if (target !== 'virtual' && target !== 'voiceover' && target !== 'nvda') {
      throw new Error(`Unsupported target "${target}".`);
   }

   return {
      sessionId,
      target,
      metadataFile,
      socketPath,
   };
}

async function writeSessionMetadata(session: AccessibilityDriverSession): Promise<void> {
   await mkdir(dirname(session.metadataFile), { recursive: true });
   await writeFile(session.metadataFile, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
   const args = parseArgs(process.argv.slice(2));
   const adapter = createDriverAdapter(args.target);
   const readiness = await adapter.checkReadiness();
   if (readiness.status !== 'ready') {
      throw new Error(readiness.summary);
   }

   const checkpoints: DriverCheckpoint[] = [];

   await adapter.start();

   const initialState = await adapter.readState(checkpoints);
   const session = accessibilityDriverSessionSchema.parse({
      sessionId: args.sessionId,
      target: args.target,
      startedAt: new Date().toISOString(),
      capabilities: adapter.capabilities,
      logCursor: initialState.logCursor,
      brokerPid: process.pid,
      socketPath: args.socketPath,
      metadataFile: args.metadataFile,
   });

   await writeSessionMetadata(session);

   if (process.platform !== 'win32') {
      await mkdir(dirname(args.socketPath), { recursive: true });
      await rm(args.socketPath, { force: true });
   }

   let stopped = false;

   async function stopBroker(): Promise<void> {
      if (stopped) {
         return;
      }

      stopped = true;
      await adapter.stop().catch(() => {});
      await rm(args.metadataFile, { force: true });
      if (process.platform !== 'win32') {
         await rm(args.socketPath, { force: true });
      }
   }

   const server = net.createServer((connection) => {
      const chunks: Buffer[] = [];

      connection.on('data', (chunk) => {
         const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
         chunks.push(buffer);
         if (!buffer.includes('\n')) {
            return;
         }

         void (async () => {
            const request = JSON.parse(
               Buffer.concat(chunks).toString('utf8').trim(),
            ) as BrokerRequest;
            const resultFor = async (
               action: DriverActionResult['action'],
               details?: Record<string, unknown>,
            ): Promise<DriverActionResult> => {
               const state = await adapter.readState(checkpoints);
               const updatedSession = {
                  ...session,
                  logCursor: state.logCursor,
               };
               await writeSessionMetadata(updatedSession);
               return driverActionResultSchema.parse({
                  session: updatedSession,
                  action,
                  state,
                  details,
               });
            };

            const respond = async (response: BrokerResponse): Promise<void> => {
               connection.end(JSON.stringify(response));
            };

            if (request.command === 'ping') {
               await respond({ ok: true });
               return;
            }

            if (request.command === 'status') {
               await respond({
                  ok: true,
                  result: await resultFor('status'),
               });
               return;
            }

            if (request.command === 'stop') {
               await respond({
                  ok: true,
                  result: await resultFor('stop'),
               });

               server.close(() => {
                  void stopBroker().finally(() => {
                     process.exit(0);
                  });
               });
               return;
            }

            if (request.command === 'attach-document') {
               const html = String(request.payload?.html ?? '');
               const url = String(request.payload?.url ?? '');

               await adapter.attachDocument({ html, url });
               const state = await adapter.readState(checkpoints);
               await writeSessionMetadata({
                  ...session,
                  logCursor: state.logCursor,
               });
               await respond({ ok: true });
               return;
            }

            if (request.command === 'action') {
               switch (request.action) {
                  case 'next': {
                     await adapter.next();
                     break;
                  }
                  case 'previous': {
                     await adapter.previous();
                     break;
                  }
                  case 'key': {
                     await adapter.press(String(request.payload?.keys ?? ''));
                     break;
                  }
                  case 'type': {
                     await adapter.type(String(request.payload?.text ?? ''));
                     break;
                  }
                  case 'interact': {
                     await adapter.interact();
                     break;
                  }
                  case 'stop-interacting': {
                     await adapter.stopInteracting();
                     break;
                  }
                  case 'click-current-item': {
                     await adapter.activateCurrentItem();
                     break;
                  }
                  case 'read':
                  case 'logs':
                  case 'attach-document': {
                     break;
                  }
                  case 'clear-logs': {
                     await adapter.clearLogs(checkpoints);
                     break;
                  }
                  case 'checkpoint': {
                     checkpoints.push({
                        label: String(request.payload?.label ?? 'checkpoint'),
                        createdAt: new Date().toISOString(),
                     });
                     break;
                  }
                  default: {
                     await respond({
                        ok: false,
                        error: {
                           code: 'unknown-action',
                           message: `Unknown driver action "${String(request.action)}".`,
                        },
                     });
                     return;
                  }
               }

               await respond({
                  ok: true,
                  result: await resultFor(request.action, request.payload),
               });
               return;
            }

            await respond({
               ok: false,
               error: {
                  code: 'unknown-command',
                  message: `Unknown broker command "${String(request.command)}".`,
               },
            });
         })().catch((error) => {
            connection.end(
               JSON.stringify({
                  ok: false,
                  error: {
                     code: 'broker-error',
                     message: error instanceof Error ? error.message : String(error),
                  },
               } satisfies BrokerResponse),
            );
         });
      });
   });

   server.listen(args.socketPath);

   const shutdown = async (): Promise<void> => {
      server.close(() => {
         void stopBroker().finally(() => {
            process.exit(0);
         });
      });
   };

   process.on('SIGINT', () => {
      void shutdown();
   });

   process.on('SIGTERM', () => {
      void shutdown();
   });
}

void main().catch((error) => {
   console.error(error);
   process.exit(1);
});
