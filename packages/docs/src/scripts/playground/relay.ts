/**
 * Talks to the relay script inside the playground's frame. The frame can hold a page of
 * this site or a sandboxed page fetched from another one, so every command goes as a
 * message and every answer comes back as one.
 */
const TAG = 'a11ied-playground';

const READY_TIMEOUT_MS = 10_000;

/** Counting a long page takes a while, so an answer is given this long to arrive. */
const ANSWER_TIMEOUT_MS = 30_000;

export interface CursorBox {
   readonly left: number;
   readonly top: number;
   readonly width: number;
   readonly height: number;
}

/** What the relay reports after each command. */
export interface ReaderState {
   readonly phrases: readonly string[];
   readonly item: {
      readonly role?: string;
      readonly name?: string;
      readonly states: readonly string[];
      readonly phrase?: string;
   };
   readonly position: string;
   readonly atEnd: boolean;
   readonly canActivate: boolean;
   /** Whether the page changed since its items were last counted. */
   readonly hasChanged: boolean;
   readonly box?: CursorBox;
}

/** The position of every item on the page, in reading order. */
export interface Survey {
   readonly tokens: readonly string[];
   /** The page has more items than were counted. */
   readonly isCapped: boolean;
}

/** What the frame can tell the page without being asked. */
export interface RelayEvents {
   /** A link in the framed page was followed. */
   readonly onNavigate: (url: string) => void;
}

const pending = new Map<
   number,
   { resolve: (value: unknown) => void; reject: (reason: Error) => void }
>();

/** Mutable state of the one relay the page talks to. */
const relay: { nextRequestID: number; onReady: (() => void) | undefined } = {
   nextRequestID: 1,
   onReady: undefined,
};

export function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null;
}

function isReaderState(value: unknown): value is ReaderState {
   return (
      isRecord(value) &&
      Array.isArray(value.phrases) &&
      isRecord(value.item) &&
      Array.isArray(value.item.states) &&
      typeof value.position === 'string' &&
      typeof value.atEnd === 'boolean'
   );
}

function isSurvey(value: unknown): value is Survey {
   return isRecord(value) && Array.isArray(value.tokens);
}

/** Sends one command to the relay in the frame and waits for its answer. */
export function request(
   frame: HTMLIFrameElement,
   method: string,
   ...args: unknown[]
): Promise<unknown> {
   const id = relay.nextRequestID;

   relay.nextRequestID += 1;
   return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      // A page that has gone somewhere else takes the relay with it and never answers.
      globalThis.setTimeout(() => {
         if (pending.delete(id)) {
            reject(new Error('The page stopped answering. Press Start over.'));
         }
      }, ANSWER_TIMEOUT_MS);
      // A sandboxed frame has no origin of its own, so the target origin cannot be named.
      frame.contentWindow?.postMessage({ tag: TAG, id, method, args }, '*');
   });
}

export async function readState(frame: HTMLIFrameElement): Promise<ReaderState> {
   const value = await request(frame, 'readState');

   if (!isReaderState(value)) {
      throw new Error('The screen reader did not answer.');
   }
   return value;
}

/** Counts the items on the framed page. The cursor is at the top afterwards. */
export async function surveyItems(
   frame: HTMLIFrameElement,
   max: number,
): Promise<Survey | undefined> {
   const value = await request(frame, 'survey', max);

   return isSurvey(value) ? value : undefined;
}

function waitForReady(): Promise<void> {
   return new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
         relay.onReady = undefined;
         reject(new Error('The screen reader did not start on this page.'));
      }, READY_TIMEOUT_MS);

      relay.onReady = (): void => {
         globalThis.clearTimeout(timer);
         relay.onReady = undefined;
         resolve();
      };
   });
}

/**
 * Loads a page of this site by its address, then adds the reader to it from outside.
 *
 * @param scriptURLs The reader's script, then the relay's
 */
export async function mountByAddress(
   frame: HTMLIFrameElement,
   href: string,
   scriptURLs: readonly string[],
): Promise<void> {
   frame.removeAttribute('sandbox');
   frame.removeAttribute('allow');
   frame.removeAttribute('srcdoc');
   await new Promise<void>((resolve) => {
      frame.addEventListener(
         'load',
         () => {
            resolve();
         },
         { once: true },
      );
      frame.src = href;
   });
   const inner = frame.contentDocument,
      ready = waitForReady();

   if (!inner) {
      throw new Error('The page did not load.');
   }
   for (const source of scriptURLs) {
      const tag = inner.createElement('script');

      // Scripts added this way run in the order they are added only when not async.
      tag.async = false;
      tag.src = source;
      inner.head.append(tag);
   }
   await ready;
}

/**
 * Fetches a page from any site and shows it with the reader built in. The frame is
 * sandboxed, so the fetched page's scripts cannot reach this site.
 *
 * @param scriptURLs The reader's script, then the relay's
 */
export async function mountFetched(
   frame: HTMLIFrameElement,
   url: string,
   scriptURLs: readonly string[],
): Promise<void> {
   const response = await fetch(url, { credentials: 'omit' });

   if (!response.ok) {
      throw new Error(`The page answered with status ${String(response.status)}.`);
   }
   const html = await response.text(),
      ready = waitForReady();
   const scripts = scriptURLs
      .map((source) => `<script src="${source}"></script>`)
      .join('');
   // The base address makes the page's own links, styles, and images resolve.
   const head = `<base href="${url.replaceAll('"', '%22')}">${scripts}`;

   frame.removeAttribute('src');
   frame.setAttribute('sandbox', 'allow-scripts');
   // Without this, Chrome stops a sandboxed page from moving focus, and Tab does nothing.
   frame.setAttribute('allow', 'focus-without-user-activation');
   frame.srcdoc = /<head[^>]*>/i.test(html)
      ? html.replace(/<head[^>]*>/i, (open) => `${open}${head}`)
      : `${head}${html}`;
   await ready;
}

function settle(data: Record<string, unknown>): void {
   const waiting = typeof data.id === 'number' ? pending.get(data.id) : undefined;

   if (!waiting || typeof data.id !== 'number') {
      return;
   }
   pending.delete(data.id);
   if (data.ok === true) {
      waiting.resolve(data.value);
   } else {
      waiting.reject(new Error(String(data.error)));
   }
}

/** Starts listening to the relay in the frame. Call once. */
export function listenToRelay(frame: HTMLIFrameElement, events: RelayEvents): void {
   globalThis.addEventListener('message', (event: MessageEvent<unknown>) => {
      const { data } = event;

      if (event.source !== frame.contentWindow || !isRecord(data) || data.tag !== TAG) {
         return;
      }
      if (data.event === 'ready') {
         relay.onReady?.();
      } else if (data.event === 'navigate' && typeof data.url === 'string') {
         events.onNavigate(data.url);
      } else {
         settle(data);
      }
   });
}
