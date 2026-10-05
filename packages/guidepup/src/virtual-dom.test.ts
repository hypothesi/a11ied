import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJsdomVirtualHost, loadVirtualReader } from './virtual-dom.js';
import type * as VirtualScreenReader from '@guidepup/virtual-screen-reader';
import type { VirtualReader } from './virtual-reader.js';

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
   let resolve: () => void = vi.fn();
   const promise = new Promise<void>((finish) => {
      resolve = finish;
   });
   return { promise, resolve };
}

const loader = vi.hoisted(() => {
   const state: { failure: Error | undefined } = { failure: undefined };
   return state;
});
vi.mock('@guidepup/virtual-screen-reader', async (importOriginal) => {
   const upstream = await importOriginal<typeof VirtualScreenReader>();
   return {
      ...upstream,
      get virtual(): VirtualReader {
         if (loader.failure) {
            throw loader.failure;
         }
         return upstream.virtual;
      },
   };
});
afterEach(() => {
   loader.failure = undefined;
   vi.restoreAllMocks();
});

describe('JSDOM document ownership', () => {
   it('retains ownership when a loaded reader cannot stop, then permits cleanup retry', async () => {
      const first = createJsdomVirtualHost(),
         second = createJsdomVirtualHost();
      await first.attachDocument({ html: '<h1>First</h1>', url: 'about:first' });
      const reader = await loadVirtualReader();
      vi.spyOn(reader, 'stop').mockRejectedValueOnce(new Error('Virtual stop failed'));
      try {
         await expect(first.dispose()).rejects.toThrow('Virtual stop failed');
         await expect(second.start()).rejects.toMatchObject({
            code: 'virtual-session-conflict',
         });
         await first.dispose();
         await second.attachDocument({ html: '<h1>Second</h1>', url: 'about:second' });

         await expect(second.readSpeech()).resolves.toMatchObject({
            lastSpokenPhrase: 'document',
         });
      } finally {
         await Promise.all([first.dispose(), second.dispose()]);
      }
   });

   it('rejects a competing host before replacing the document and permits transfer after stop', async () => {
      const first = createJsdomVirtualHost(),
         second = createJsdomVirtualHost();
      try {
         await first.attachDocument({
            html: '<h1>First document</h1>',
            url: 'about:first',
         });
         await first.runPortable('next');
         const before = await first.readCurrentItem();

         await expect(
            second.attachDocument({
               html: '<h1>Second document</h1>',
               url: 'about:second',
            }),
         ).rejects.toMatchObject({ code: 'virtual-session-conflict' });
         await second.dispose();

         expect(await first.readCurrentItem()).to.eql(before);

         await first.dispose();
         await second.attachDocument({
            html: '<h1>Second document</h1>',
            url: 'about:second',
         });
         await second.runPortable('next');
         const current = await second.readCurrentItem();

         expect(current.item.name).toBe('Second document');
      } finally {
         await first.dispose();
         await second.dispose();
      }
   });
});

async function assertSerializedAttachment(): Promise<void> {
   const host = createJsdomVirtualHost(),
      reader = await loadVirtualReader();
   const entered = createDeferred(),
      events: string[] = [],
      original = reader.start.bind(reader),
      release = createDeferred();
   vi.spyOn(reader, 'start').mockImplementation(async (options) => {
      const label = options?.container?.textContent ?? '';
      events.push(`${label} start`);
      if (label === 'First') {
         entered.resolve();
         await release.promise;
      }
      await original(options);
      events.push(`${label} end`);
   });
   try {
      const first = host.attachDocument({ html: '<h1>First</h1>', url: 'about:first' });
      await entered.promise;
      const second = host.attachDocument({
         html: '<h1>Second</h1>',
         url: 'about:second',
      });
      release.resolve();
      await Promise.all([first, second]);

      expect(events).to.eql(['First start', 'First end', 'Second start', 'Second end']);
   } finally {
      release.resolve();
      await host.dispose();
   }
}

async function assertCoalescedStops(): Promise<void> {
   const first = createJsdomVirtualHost(),
      reader = await loadVirtualReader(),
      second = createJsdomVirtualHost();
   const entered = createDeferred(),
      original = reader.stop.bind(reader),
      release = createDeferred();
   await first.attachDocument({ html: '<h1>First</h1>', url: 'about:first' });
   const stop = vi.spyOn(reader, 'stop').mockImplementation(async () => {
      entered.resolve();
      await release.promise;
      await original();
   });
   try {
      const stopping = first.stop();
      await entered.promise;
      const overlapping = first.dispose();
      release.resolve();
      await Promise.all([stopping, overlapping]);

      expect(stop).toHaveBeenCalledTimes(1);

      await second.attachDocument({ html: '<h1>Second</h1>', url: 'about:second' });

      await expect(second.readSpeech()).resolves.toMatchObject({
         lastSpokenPhrase: 'document',
      });
   } finally {
      release.resolve();
      await Promise.all([first.dispose(), second.dispose()]);
   }
}

async function assertFailedLoaderRecovery(): Promise<void> {
   const failed = createJsdomVirtualHost(),
      replacement = createJsdomVirtualHost();
   loader.failure = new Error('Virtual loader failed');
   try {
      await expect(failed.start()).rejects.toMatchObject({ cause: loader.failure });
      loader.failure = undefined;
      await replacement.attachDocument({
         html: '<h1>Replacement</h1>',
         url: 'about:replacement',
      });
      await failed.dispose();

      await expect(replacement.readSpeech()).resolves.toMatchObject({
         lastSpokenPhrase: 'document',
      });
   } finally {
      loader.failure = undefined;
      await failed.dispose();
      await replacement.dispose();
   }
}

describe('JSDOM lifecycle serialization', () => {
   it(
      'finishes each attachment before the next one can replace the document',
      assertSerializedAttachment,
   );
   it(
      'coalesces overlapping stops before another host acquires the document',
      assertCoalescedStops,
   );
   it(
      'releases a failed loader claim and preserves the original startup error',
      assertFailedLoaderRecovery,
   );
});
