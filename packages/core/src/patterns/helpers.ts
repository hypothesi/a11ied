import {
   interactionPatternResultSchema,
   type DriverActionResult,
   type InteractionPatternAssertion,
   type InteractionPatternBrowserEvidence,
   type InteractionPatternResult,
   type InteractionPatternStep,
   type Platform,
   type SessionRecording,
} from '@a11ied/contracts';
import type { Page } from 'playwright';

import {
   bringBrowserPageToFront,
   getActiveBrowserFocusTarget,
   withBrowserPage,
   withInteractiveBrowserPage,
} from '../browser/helper.js';
import {
   attachDocumentToDriverSession,
   runDriverSessionAction,
} from '../driver/runtime.js';

export const WALK_PADDING = 2;
export const STATUS_TRIGGER_DELAY_MS = 50;

export interface RunPatternOptions {
   url: string;
   patternId: string;
   target?: Platform;
   sessionId?: string;
   recordingPath?: string;
}

export interface PatternContext {
   url: string;
   sessionId: string;
   target: Platform;
   managedSession: boolean;
   stepLog: InteractionPatternStep[];
   assertions: InteractionPatternAssertion[];
   browserEvidence: InteractionPatternBrowserEvidence[];
   providedPage?: Page;
}

export interface BrowserSnapshot {
   title: string;
   headings: Array<{ level: number; text: string }>;
   landmarks: Array<{ role: string; label: string }>;
   activeElement: string | undefined;
}

interface AddStepOptions {
   context: PatternContext;
   id: string;
   label: string;
   status: InteractionPatternStep['status'];
   details?: Record<string, unknown>;
}

interface AddAssertionOptions {
   context: PatternContext;
   id: string;
   status: InteractionPatternAssertion['status'];
   message: string;
   details?: Record<string, unknown>;
}

export function addStep(options: AddStepOptions): void {
   const base = {
      id: options.id,
      label: options.label,
      status: options.status,
   };
   if (options.details) {
      options.context.stepLog.push({ ...base, details: options.details });
   } else {
      options.context.stepLog.push(base);
   }
}

function addAssertion(options: AddAssertionOptions): void {
   const base = {
      id: options.id,
      status: options.status,
      message: options.message,
   };
   if (options.details) {
      options.context.assertions.push({ ...base, details: options.details });
   } else {
      options.context.assertions.push(base);
   }
}

export function addBooleanAssertion(options: {
   context: PatternContext;
   id: string;
   condition: boolean;
   passedMessage: string;
   failedMessage: string;
   details?: Record<string, unknown>;
   passedStatus?: InteractionPatternAssertion['status'];
   failedStatus?: InteractionPatternAssertion['status'];
}): void {
   if (options.condition) {
      const assertion: AddAssertionOptions = {
         context: options.context,
         id: options.id,
         status: options.passedStatus ?? 'passed',
         message: options.passedMessage,
      };
      if (options.details) {
         assertion.details = options.details;
      }
      addAssertion(assertion);
      return;
   }
   const assertion: AddAssertionOptions = {
      context: options.context,
      id: options.id,
      status: options.failedStatus ?? 'failed',
      message: options.failedMessage,
   };
   if (options.details) {
      assertion.details = options.details;
   }
   addAssertion(assertion);
}

export async function attachRenderedPage(
   context: PatternContext,
   url: string,
   page: {
      content(): Promise<string>;
      bringToFront?: () => Promise<void>;
      title?: () => Promise<string>;
   },
): Promise<void> {
   await attachDocumentToDriverSession(context.sessionId, {
      html: await page.content(),
      url,
   });
   if (context.target !== 'virtual' && page.bringToFront) {
      await bringBrowserPageToFront(page as Page);
      const focusTarget = getActiveBrowserFocusTarget();
      if (focusTarget) {
         const title = page.title ? await page.title() : '';
         const payload = {
            ...focusTarget,
         } as Record<string, unknown>;
         if (title.trim().length > 0) {
            payload.windowTitle = title;
            payload.match = 'contains';
         }
         await runDriverSessionAction(context.sessionId, 'focus', {
            payload,
         });
      }
   }
}

async function walkDriverSteps(sessionId: string, steps: number): Promise<void> {
   let chain = Promise.resolve();
   for (let index = 0; index < steps; index += 1) {
      chain = chain.then(async () => {
         await runDriverSessionAction(sessionId, 'next');
      });
   }
   await chain;
}

export async function collectDriverWalk(
   sessionId: string,
   steps: number,
): Promise<DriverActionResult> {
   await runDriverSessionAction(sessionId, 'clear-logs');
   await runDriverSessionAction(sessionId, 'read');
   await walkDriverSteps(sessionId, steps);
   return await runDriverSessionAction(sessionId, 'logs');
}

export async function withPatternPage<TResult>(
   context: PatternContext,
   url: string,
   callback: (page: Page) => Promise<TResult>,
): Promise<TResult> {
   if (context.providedPage) {
      return await callback(context.providedPage);
   }
   if (context.target === 'virtual') {
      return await withBrowserPage(url, callback);
   }
   return await withInteractiveBrowserPage(url, callback);
}

export interface EvaluablePage {
   evaluate<Result>(pageFunction: () => Result | Promise<Result>): Promise<Result>;
}

async function collectPageHeadings(
   page: EvaluablePage,
): Promise<Array<{ level: number; text: string }>> {
   return await page.evaluate((): Array<{ level: number; text: string }> => {
      const headingNodes = [
         ...document.querySelectorAll("h1, h2, h3, h4, h5, h6, [role='heading']"),
      ];
      return headingNodes.map((node) => {
         const heading = node as HTMLElement;
         const ariaLevel = heading.getAttribute('aria-level');
         const nativeLevel = /^H([1-6])$/.exec(heading.tagName)?.[1];
         return {
            level: Number(ariaLevel ?? nativeLevel ?? 0),
            text: heading.textContent?.trim() ?? '',
         };
      });
   });
}

async function collectPageLandmarks(
   page: EvaluablePage,
): Promise<Array<{ role: string; label: string }>> {
   return await page.evaluate((): Array<{ role: string; label: string }> => {
      const landmarkSelectors = [
         'main',
         'nav',
         'header',
         'footer',
         'aside',
         "[role='main']",
         "[role='navigation']",
         "[role='banner']",
         "[role='contentinfo']",
         "[role='complementary']",
      ].join(', ');
      const landmarkNodes = [...document.querySelectorAll(landmarkSelectors)];
      return landmarkNodes.map((node) => {
         const element = node as HTMLElement;
         const role =
            element.getAttribute('role') ??
            (
               {
                  MAIN: 'main',
                  NAV: 'navigation',
                  HEADER: 'banner',
                  FOOTER: 'contentinfo',
                  ASIDE: 'complementary',
               } as Record<string, string>
            )[element.tagName] ??
            element.tagName.toLowerCase();
         return {
            role,
            label:
               element.getAttribute('aria-label') ??
               element.getAttribute('title') ??
               element.textContent?.trim() ??
               role,
         };
      });
   });
}

export async function evaluateActiveElement(
   page: EvaluablePage,
): Promise<string | undefined> {
   return await page.evaluate((): string | undefined => {
      const active = document.activeElement;
      if (!active) {
         return undefined;
      }
      const elId = active.getAttribute('id');
      if (elId) {
         return `#${elId}`;
      }
      const role = active.getAttribute('role');
      if (role) {
         return `${active.tagName.toLowerCase()}[role=${role}]`;
      }
      return active.tagName.toLowerCase();
   });
}

export async function captureBrowserSnapshot(
   page: EvaluablePage,
): Promise<BrowserSnapshot> {
   const title = await page.evaluate((): string => document.title);
   const headings = await collectPageHeadings(page);
   const landmarks = await collectPageLandmarks(page);
   const activeElement = await evaluateActiveElement(page);
   return { title, headings, landmarks, activeElement };
}

export function buildPatternResult(options: {
   patternId: string;
   url: string;
   context: PatternContext;
   logs: DriverActionResult;
   targetMetadata: Record<string, unknown>;
   spokenPhraseLog?: string[];
   recording?: SessionRecording;
}): InteractionPatternResult {
   return interactionPatternResultSchema.parse({
      patternId: options.patternId,
      url: options.url,
      target: options.context.target,
      sessionId: options.context.sessionId,
      managedSession: options.context.managedSession,
      recording: options.recording,
      stepLog: options.context.stepLog,
      spokenPhraseLog: options.spokenPhraseLog ?? options.logs.state.spokenPhraseLog,
      itemTextLog: options.logs.state.itemTextLog,
      assertions: options.context.assertions,
      targetMetadata: options.targetMetadata,
      browserEvidence: options.context.browserEvidence,
   });
}
