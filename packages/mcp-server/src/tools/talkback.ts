import {
   disableTalkBack,
   enableTalkBack,
   TALKBACK_KEY_NAMES,
   walkWithTalkBack,
} from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { activeAnnotations, createToolResponse } from '../lib/shared.js';

const MAX_WALK_STEPS = 50;
const talkBackKeySchema = z.enum(TALKBACK_KEY_NAMES);

/** Registers the tool that drives TalkBack on an Android device and records its speech. */
export function registerTalkBackTool(server: McpServer): void {
   server.registerTool(
      'talkback',
      {
         title: 'TalkBack',
         description:
            'Turn TalkBack on or off on an Android device over adb, or walk the screen with a key and return what TalkBack ' +
            'said after each press. Needs a phone or a Google Play emulator image, with TalkBack Developer settings > ' +
            'Log output level set to VERBOSE.',
         inputSchema: {
            action: z.enum(['on', 'off', 'walk']),
            key: talkBackKeySchema.default('next'),
            count: z.number().int().min(1).max(MAX_WALK_STEPS).default(10),
            serial: z.string().optional(),
         },
         annotations: activeAnnotations,
      },
      async (input) => {
         const options = { serial: input.serial };
         if (input.action === 'on') {
            await enableTalkBack(options);
            return createToolResponse({ talkback: 'on' });
         }
         if (input.action === 'off') {
            await disableTalkBack(options);
            return createToolResponse({ talkback: 'off' });
         }
         const keys = Array.from({ length: input.count }, () => input.key);
         return createToolResponse({
            steps: await walkWithTalkBack({ ...options, keys }),
         });
      },
   );
}
