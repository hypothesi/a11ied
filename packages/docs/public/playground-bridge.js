/*
 * Runs inside the playground's frame, next to a11ied's simulated screen reader. The
 * playground page cannot always reach into the frame: a page fetched from another site
 * is sandboxed. So the page sends each command as a message, and this script runs it on
 * the reader and sends the answer back.
 *
 * The block keeps these names out of the framed page's own globals.
 */
{
   const TAG = 'a11ied-playground';

   const INTERACTIVE = [
      'a[href]',
      'button',
      'input',
      'select',
      'textarea',
      'summary',
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="option"]',
      '[role="combobox"]',
      '[tabindex]',
   ].join(', ');

   const page = {
      hasChanged: false,
      /** Read when used, because the reader's script can load after this one. */
      get reader() {
         return globalThis.a11iedVirtualRuntime;
      },
   };

   const send = (message) => {
      // A sandboxed frame has no origin of its own, so the target origin cannot be named.
      globalThis.parent.postMessage({ tag: TAG, ...message }, '*');
   };

   /** What the reader has said, where its cursor is, and what the cursor can do. */
   const readState = async () => {
      const [speech, current, node] = await Promise.all([
         page.reader.readSpeech(),
         page.reader.readCurrentItem(),
         page.reader.readActivationNode(),
      ]);
      const isWholePage =
         !node || node === document.body || node === document.documentElement;

      if (!isWholePage) {
         node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      const box = isWholePage ? undefined : node.getBoundingClientRect();

      return {
         phrases: speech.spokenPhraseLog,
         lastPhrase: speech.lastSpokenPhrase,
         item: current.item,
         position: current.position,
         atEnd: current.atEnd,
         canActivate: !isWholePage && Boolean(node.closest(INTERACTIVE)),
         hasChanged: page.hasChanged,
         box: box && {
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
         },
      };
   };

   /** Moves forward one item at a time, noting each position, until the end or the cap. */
   const walkForward = async (tokens, max) => {
      const current = await page.reader.readCurrentItem();

      tokens.push(current.position);
      if (current.atEnd || tokens.length >= max) {
         return current.atEnd;
      }
      await page.reader.runPortable('next');
      return walkForward(tokens, max);
   };

   /** Counts the items on the page, then puts the cursor back at the top. */
   const survey = async (max) => {
      const tokens = [];

      await page.reader.runPortable('top');
      const hasReachedEnd = await walkForward(tokens, max);

      // Past the last item the reader wraps to the first, which is one step, not a walk back.
      await page.reader.runPortable(hasReachedEnd ? 'next' : 'top');
      page.hasChanged = false;
      return { tokens, isCapped: !hasReachedEnd };
   };

   const stepForward = async (remaining) => {
      if (remaining <= 0) {
         return;
      }
      await page.reader.runPortable('next');
      await stepForward(remaining - 1);
   };

   const methods = {
      start: () => page.reader.start(),
      runPortable: (verb) => page.reader.runPortable(verb),
      navigate: (request) => page.reader.navigate(request),
      press: (keys) => page.reader.press(keys),
      readState,
      survey,
      seek: async (index) => {
         await page.reader.runPortable('top');
         await stepForward(index);
      },
   };

   const answer = async (data) => {
      const run = methods[data.method];

      try {
         if (!run) {
            throw new Error(`Unknown command: ${String(data.method)}`);
         }
         send({ id: data.id, ok: true, value: await run(...(data.args ?? [])) });
      } catch (error) {
         send({
            id: data.id,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
         });
      }
   };

   globalThis.addEventListener('message', async (event) => {
      const { data } = event;

      if (event.source === globalThis.parent && data?.tag === TAG && data.method) {
         await answer(data);
      }
   });

   /*
    * Following a link would replace this page, and the reader with it. A link to a place
    * on the same page is scrolled to here. Any other address goes to the playground, which
    * decides what to do with it.
    */
   const followLink = (event) => {
      const link =
         event.target instanceof Element ? event.target.closest('a[href]') : undefined;

      if (!link) {
         return;
      }
      const href = link.getAttribute('href') ?? '';

      event.preventDefault();
      if (href.startsWith('#')) {
         document.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView();
      } else {
         send({ event: 'navigate', url: link.href });
      }
   };

   document.addEventListener('click', followLink, true);

   new MutationObserver(() => {
      page.hasChanged = true;
   }).observe(document.documentElement, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
   });

   if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
         send({ event: 'ready' });
      });
   } else {
      send({ event: 'ready' });
   }
}
