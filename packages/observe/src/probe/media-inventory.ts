import type { MediaInventory } from '@a11ied/contracts';
import type { Page } from 'playwright';
import { z } from 'zod';
import { needsReview, notApplicable, type Judgement } from './probe-types.js';

const instrumentationSchema = z.object({
   mediaPlays: z.number().int().nonnegative(),
   audioContexts: z.number().int().nonnegative(),
});

/** CDP includes closed shadow roots; missing frame instrumentation keeps absence unproved. */
export async function collectMediaInventory(page: Page): Promise<MediaInventory> {
   const cdp = await page.context().newCDPSession(page);
   try {
      const snapshot = await cdp.send('DOMSnapshot.captureSnapshot', {
         computedStyles: [],
      });
      const names = snapshot.documents.flatMap((document) =>
         (document.nodes.nodeName ?? []).map((index) => snapshot.strings[index]),
      );
      const frames = page.frames();
      const observations = await Promise.all(
         frames.map(async (frame) => {
            try {
               return instrumentationSchema.safeParse(
                  await frame.evaluate('window.__a11'),
               );
            } catch {
               return instrumentationSchema.safeParse({});
            }
         }),
      );
      const inventory: MediaInventory = {
         url: page.url(),
         video: names.filter((name) => name === 'VIDEO').length,
         audio: names.filter((name) => name === 'AUDIO').length,
         embeds: names.filter((name) => name === 'OBJECT' || name === 'EMBED').length,
         mediaPlays: 0,
         audioContexts: 0,
         uninspectedTrees:
            Math.max(0, frames.length - snapshot.documents.length) +
            snapshot.documents.filter((document) => document.nodes.nodeName === undefined)
               .length,
         method:
            'CDP DOMSnapshot inventories document and shadow trees; pre-navigation hooks count media play calls and audio contexts in every reachable frame.',
      };
      for (const observation of observations) {
         if (observation.success) {
            inventory.mediaPlays += observation.data.mediaPlays;
            inventory.audioContexts += observation.data.audioContexts;
         } else {
            inventory.uninspectedTrees += 1;
         }
      }
      return inventory;
   } finally {
      await cdp.detach();
   }
}

export function judgeMediaInventory(inventory?: MediaInventory): Judgement {
   if (
      inventory &&
      inventory.video +
         inventory.audio +
         inventory.embeds +
         inventory.mediaPlays +
         inventory.audioContexts +
         inventory.uninspectedTrees ===
         0
   ) {
      return notApplicable(
         'No media elements, embedded media, media playback, audio contexts, or uninspected trees were observed in this state.',
      );
   }
   return needsReview(
      'Media is present or its absence is unproved; inspect reachable media and use audio capability when evaluating its alternatives.',
   );
}
