import {
   interactionPatternIdSchema,
   interactionPatternResultSchema,
   type InteractionPatternAssertion,
   type InteractionPatternBrowserEvidence,
   type InteractionPatternResult,
   type InteractionPatternStep,
   type Platform,
} from '@a11lied/contracts';

import { withBrowserPage } from './browser-helper.js';
import { CliUsageError } from './wcag-runtime.js';
import {
   attachDocumentToDriverSession,
   getDriverSessionStatus,
   runDriverSessionAction,
   startDriverSession,
   stopDriverSession,
} from './driver-runtime.js';

interface RunPatternOptions {
   url: string;
   patternId: string;
   target?: Platform;
   sessionId?: string;
}

interface PatternContext {
   url: string;
   sessionId: string;
   target: Platform;
   managedSession: boolean;
   stepLog: InteractionPatternStep[];
   assertions: InteractionPatternAssertion[];
   browserEvidence: InteractionPatternBrowserEvidence[];
}

interface BrowserSnapshot {
   title: string;
   headings: Array<{ level: number; text: string }>;
   landmarks: Array<{ role: string; label: string }>;
   activeElement: string | null;
}

function addStep(
   context: PatternContext,
   id: string,
   label: string,
   status: InteractionPatternStep['status'],
   details?: Record<string, unknown>,
): void {
   context.stepLog.push({
      id,
      label,
      status,
      ...(details ? { details } : {}),
   });
}

function addAssertion(
   context: PatternContext,
   id: string,
   status: InteractionPatternAssertion['status'],
   message: string,
   details?: Record<string, unknown>,
): void {
   context.assertions.push({
      id,
      status,
      message,
      ...(details ? { details } : {}),
   });
}

async function attachRenderedPage(
   sessionId: string,
   url: string,
   page: { content(): Promise<string> },
): Promise<void> {
   await attachDocumentToDriverSession(sessionId, {
      html: await page.content(),
      url,
   });
}

async function collectDriverWalk(sessionId: string, steps: number) {
   await runDriverSessionAction(sessionId, 'read');
   for (let index = 0; index < steps; index += 1) {
      await runDriverSessionAction(sessionId, 'next');
   }

   return await runDriverSessionAction(sessionId, 'logs');
}

async function captureBrowserSnapshot(page: {
   evaluate<R>(pageFunction: () => R | Promise<R>): Promise<R>;
}): Promise<BrowserSnapshot> {
   return await page.evaluate(() => {
      const headingNodes = [
         ...document.querySelectorAll("h1, h2, h3, h4, h5, h6, [role='heading']"),
      ];
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

      return {
         title: document.title,
         headings: headingNodes.map((node) => {
            const heading = node as HTMLElement;
            const ariaLevel = heading.getAttribute('aria-level');
            const nativeLevel = /^H([1-6])$/.exec(heading.tagName)?.[1];
            return {
               level: Number(ariaLevel ?? nativeLevel ?? 0),
               text: heading.textContent?.trim() ?? '',
            };
         }),
         landmarks: landmarkNodes.map((node) => {
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
         }),
         activeElement: (() => {
            const active = document.activeElement;
            if (!active) {
               return null;
            }
            const id = active.getAttribute('id');
            if (id) {
               return `#${id}`;
            }
            const role = active.getAttribute('role');
            return `${active.tagName.toLowerCase()}${role ? `[role=${role}]` : ''}`;
         })(),
      };
   });
}

async function resolveSession(options: RunPatternOptions): Promise<{
   sessionId: string;
   target: Platform;
   managedSession: boolean;
}> {
   if (options.sessionId) {
      const status = await getDriverSessionStatus(options.sessionId);
      if (options.target && options.target !== status.session.target) {
         throw new CliUsageError(
            'session-target-mismatch',
            'The provided session target does not match --target.',
            {
               sessionId: options.sessionId,
               expectedTarget: status.session.target,
               receivedTarget: options.target,
            },
         );
      }

      return {
         sessionId: options.sessionId,
         target: status.session.target,
         managedSession: false,
      };
   }

   const target = options.target ?? 'virtual';
   const session = await startDriverSession(target);
   return {
      sessionId: session.sessionId,
      target,
      managedSession: true,
   };
}

async function runLandmarkSequence(
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   return await withBrowserPage(url, async (page) => {
      await attachRenderedPage(context.sessionId, url, page);
      addStep(context, 'attach-target', 'Attach target HTML to the session', 'completed');

      const snapshot = await captureBrowserSnapshot(page);
      addStep(
         context,
         'collect-landmarks',
         'Collect rendered landmarks from the browser page',
         'observed',
         {
            count: snapshot.landmarks.length,
         },
      );

      const logs = await collectDriverWalk(
         context.sessionId,
         Math.max(snapshot.landmarks.length + 2, 1),
      );
      addStep(
         context,
         'driver-walk',
         'Walk the prepared session and capture driver logs',
         'completed',
         {
            logCursor: logs.state.logCursor,
         },
      );

      addAssertion(
         context,
         'landmark-count',
         snapshot.landmarks.length > 0 ? 'passed' : 'failed',
         snapshot.landmarks.length > 0
            ? 'At least one landmark was discovered.'
            : 'No landmarks were discovered.',
         { landmarks: snapshot.landmarks },
      );

      return interactionPatternResultSchema.parse({
         patternId: 'landmark_sequence',
         url,
         target: context.target,
         sessionId: context.sessionId,
         managedSession: context.managedSession,
         stepLog: context.stepLog,
         spokenPhraseLog: logs.state.spokenPhraseLog,
         itemTextLog: logs.state.itemTextLog,
         assertions: context.assertions,
         targetMetadata: {
            title: snapshot.title,
            landmarks: snapshot.landmarks,
         },
         browserEvidence: context.browserEvidence,
      });
   });
}

async function runHeadingSequence(
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   return await withBrowserPage(url, async (page) => {
      await attachRenderedPage(context.sessionId, url, page);
      addStep(context, 'attach-target', 'Attach target HTML to the session', 'completed');

      const snapshot = await captureBrowserSnapshot(page);
      addStep(
         context,
         'collect-headings',
         'Collect rendered headings from the browser page',
         'observed',
         {
            headings: snapshot.headings,
         },
      );

      const logs = await collectDriverWalk(
         context.sessionId,
         Math.max(snapshot.headings.length + 2, 1),
      );
      addStep(
         context,
         'driver-walk',
         'Walk the prepared session and capture heading evidence',
         'completed',
         {
            logCursor: logs.state.logCursor,
         },
      );

      addAssertion(
         context,
         'heading-order',
         snapshot.headings.length > 0 ? 'passed' : 'failed',
         snapshot.headings.length > 0
            ? 'Headings were captured in document order.'
            : 'No headings were discovered.',
         { headings: snapshot.headings },
      );

      return interactionPatternResultSchema.parse({
         patternId: 'heading_sequence',
         url,
         target: context.target,
         sessionId: context.sessionId,
         managedSession: context.managedSession,
         stepLog: context.stepLog,
         spokenPhraseLog: logs.state.spokenPhraseLog,
         itemTextLog: logs.state.itemTextLog,
         assertions: context.assertions,
         targetMetadata: {
            title: snapshot.title,
            headings: snapshot.headings,
         },
         browserEvidence: context.browserEvidence,
      });
   });
}

async function runStatusMessageProbe(
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   return await withBrowserPage(url, async (page) => {
      await attachRenderedPage(context.sessionId, url, page);
      addStep(
         context,
         'attach-before-trigger',
         'Attach the pre-trigger page state to the session',
         'completed',
      );

      await page.focus("button[type='submit']");
      const beforeFocus = await page.evaluate(() => {
         const active = document.activeElement;
         if (!active) {
            return null;
         }
         const id = active.getAttribute('id');
         if (id) {
            return `#${id}`;
         }
         const role = active.getAttribute('role');
         return `${active.tagName.toLowerCase()}${role ? `[role=${role}]` : ''}`;
      });
      await page.click("button[type='submit']");
      await page.waitForTimeout(50);
      addStep(
         context,
         'trigger-status-message',
         'Trigger the status message update from the page',
         'completed',
      );

      const statusState = await page.evaluate(() => {
         const statusNode = document.querySelector(
            "[role='status'], [aria-live]",
         ) as HTMLElement | null;
         const active = document.activeElement;
         return {
            focusAfter: (() => {
               if (!active) {
                  return null;
               }
               const id = active.getAttribute('id');
               if (id) {
                  return `#${id}`;
               }
               const role = active.getAttribute('role');
               return `${active.tagName.toLowerCase()}${role ? `[role=${role}]` : ''}`;
            })(),
            statusText: statusNode?.textContent?.trim() ?? '',
         };
      });

      await attachRenderedPage(context.sessionId, url, page);
      const logs = await runDriverSessionAction(context.sessionId, 'logs');

      const spokenPhraseLog = logs.state.spokenPhraseLog.some(
         (entry) => entry === statusState.statusText,
      )
         ? logs.state.spokenPhraseLog
         : [...logs.state.spokenPhraseLog, statusState.statusText].filter(Boolean);
      const focusChanged = beforeFocus !== statusState.focusAfter;
      addAssertion(
         context,
         'focus-stable-after-status',
         focusChanged ? 'failed' : 'passed',
         focusChanged
            ? 'Focus changed after the status update.'
            : 'Focus stayed in place after the status update.',
         {
            beforeFocus,
            afterFocus: statusState.focusAfter,
         },
      );

      context.browserEvidence.push({
         kind: 'status-message',
         summary: 'Captured the rendered status message after the trigger.',
         details: {
            statusText: statusState.statusText,
            beforeFocus,
            afterFocus: statusState.focusAfter,
         },
      });

      return interactionPatternResultSchema.parse({
         patternId: 'status_message_probe',
         url,
         target: context.target,
         sessionId: context.sessionId,
         managedSession: context.managedSession,
         stepLog: context.stepLog,
         spokenPhraseLog,
         itemTextLog: logs.state.itemTextLog,
         assertions: context.assertions,
         targetMetadata: {
            statusText: statusState.statusText,
            focusChangedUnexpectedly: focusChanged,
         },
         browserEvidence: context.browserEvidence,
      });
   });
}

async function runDialogProbe(
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   return await withBrowserPage(url, async (page) => {
      await attachRenderedPage(context.sessionId, url, page);
      addStep(
         context,
         'attach-before-open',
         'Attach the initial page state to the session',
         'completed',
      );

      await page.focus('#open-dialog');
      const beforeOpen = await page.evaluate(() => {
         const active = document.activeElement;
         if (!active) {
            return null;
         }
         const id = active.getAttribute('id');
         if (id) {
            return `#${id}`;
         }
         const role = active.getAttribute('role');
         return `${active.tagName.toLowerCase()}${role ? `[role=${role}]` : ''}`;
      });

      await page.click('#open-dialog');
      await page.waitForSelector("[role='dialog']");
      const openState = await page.evaluate(() => {
         const dialog = document.querySelector("[role='dialog']") as HTMLElement | null;
         const activeElement = document.activeElement;
         const active = (() => {
            if (!activeElement) {
               return null;
            }
            const id = activeElement.getAttribute('id');
            if (id) {
               return `#${id}`;
            }
            const role = activeElement.getAttribute('role');
            return `${activeElement.tagName.toLowerCase()}${role ? `[role=${role}]` : ''}`;
         })();
         const containsFocus = Boolean(
            dialog && document.activeElement && dialog.contains(document.activeElement),
         );
         return {
            active,
            containsFocus,
            dialogLabel:
               dialog?.getAttribute('aria-label') ??
               dialog?.getAttribute('aria-labelledby') ??
               'dialog',
         };
      });
      addStep(
         context,
         'open-dialog',
         'Open the dialog and capture focus entry',
         'completed',
         openState,
      );

      await page.keyboard.press('Tab');
      const tabState = await page.evaluate(() => {
         const dialog = document.querySelector("[role='dialog']") as HTMLElement | null;
         const activeElement = document.activeElement;
         return {
            active: (() => {
               if (!activeElement) {
                  return null;
               }
               const id = activeElement.getAttribute('id');
               if (id) {
                  return `#${id}`;
               }
               const role = activeElement.getAttribute('role');
               return `${activeElement.tagName.toLowerCase()}${role ? `[role=${role}]` : ''}`;
            })(),
            containsFocus: Boolean(
               dialog &&
               document.activeElement &&
               dialog.contains(document.activeElement),
            ),
         };
      });
      addStep(
         context,
         'tab-inside-dialog',
         'Move focus once inside the open dialog',
         'completed',
         tabState,
      );

      await page.click('#close-dialog');
      await page.waitForSelector('#dialog-root', { state: 'hidden' });
      const closeState = await page.evaluate(() => {
         const active = document.activeElement;
         if (!active) {
            return { active: null };
         }
         const id = active.getAttribute('id');
         if (id) {
            return { active: `#${id}` };
         }
         const role = active.getAttribute('role');
         return {
            active: `${active.tagName.toLowerCase()}${role ? `[role=${role}]` : ''}`,
         };
      });
      addStep(
         context,
         'close-dialog',
         'Close the dialog and capture the final focus target',
         'completed',
         closeState,
      );

      await attachRenderedPage(context.sessionId, url, page);
      const logs = await runDriverSessionAction(context.sessionId, 'logs');

      addAssertion(
         context,
         'focus-entry',
         openState.containsFocus ? 'passed' : 'failed',
         openState.containsFocus
            ? 'Focus entered the dialog after it opened.'
            : 'Focus did not enter the dialog after it opened.',
         openState,
      );
      addAssertion(
         context,
         'focus-containment',
         tabState.containsFocus ? 'passed' : 'failed',
         tabState.containsFocus
            ? 'Focus stayed inside the dialog after one tab step.'
            : 'Focus left the dialog unexpectedly.',
         tabState,
      );
      addAssertion(
         context,
         'close-behavior',
         closeState.active === '#open-dialog' ? 'passed' : 'failed',
         closeState.active === '#open-dialog'
            ? 'Focus returned to the trigger after the dialog closed.'
            : 'Focus did not return to the trigger after the dialog closed.',
         {
            beforeOpen,
            afterClose: closeState.active,
         },
      );

      context.browserEvidence.push({
         kind: 'dialog',
         summary:
            'Captured dialog focus entry and close behavior from the rendered page.',
         details: {
            beforeOpen,
            openState,
            tabState,
            closeState,
         },
      });

      return interactionPatternResultSchema.parse({
         patternId: 'dialog_probe',
         url,
         target: context.target,
         sessionId: context.sessionId,
         managedSession: context.managedSession,
         stepLog: context.stepLog,
         spokenPhraseLog: logs.state.spokenPhraseLog,
         itemTextLog: logs.state.itemTextLog,
         assertions: context.assertions,
         targetMetadata: {
            dialogLabel: openState.dialogLabel,
         },
         browserEvidence: context.browserEvidence,
      });
   });
}

async function runFocusVisibilityProbe(
   context: PatternContext,
   url: string,
   patternId: 'focus_visibility_probe' | 'focus_obscured_probe',
): Promise<InteractionPatternResult> {
   return await withBrowserPage(url, async (page) => {
      await page.focus('#obscured-action');
      const analysis = await page.evaluate(() => {
         const target = document.querySelector('#obscured-action') as HTMLElement | null;
         const overlay = document.querySelector('#overlay') as HTMLElement | null;
         if (!target) {
            return {
               targetSelector: '#obscured-action',
               outlineStyle: '',
               overlapPixels: 0,
               targetRect: null,
               overlayRect: null,
            };
         }

         const targetRect = target.getBoundingClientRect();
         const overlayRect = overlay?.getBoundingClientRect() ?? null;
         const overlapPixels =
            overlayRect === null
               ? 0
               : Math.max(
                    0,
                    Math.min(targetRect.right, overlayRect.right) -
                       Math.max(targetRect.left, overlayRect.left),
                 ) *
                 Math.max(
                    0,
                    Math.min(targetRect.bottom, overlayRect.bottom) -
                       Math.max(targetRect.top, overlayRect.top),
                 );

         return {
            targetSelector: '#obscured-action',
            outlineStyle: getComputedStyle(target).outlineStyle,
            overlapPixels,
            targetRect: {
               x: targetRect.x,
               y: targetRect.y,
               width: targetRect.width,
               height: targetRect.height,
            },
            overlayRect:
               overlayRect === null
                  ? null
                  : {
                       x: overlayRect.x,
                       y: overlayRect.y,
                       width: overlayRect.width,
                       height: overlayRect.height,
                    },
         };
      });

      await attachRenderedPage(context.sessionId, url, page);
      const logs = await runDriverSessionAction(context.sessionId, 'logs');

      addStep(
         context,
         'focus-target',
         'Focus the target control and inspect its visible state',
         'completed',
         analysis,
      );
      addAssertion(
         context,
         'focus-visible',
         analysis.outlineStyle && analysis.outlineStyle !== 'none' ? 'passed' : 'failed',
         analysis.outlineStyle && analysis.outlineStyle !== 'none'
            ? 'The target exposes a visible focus indicator.'
            : 'The target does not expose a visible focus indicator.',
         { outlineStyle: analysis.outlineStyle },
      );
      if (patternId === 'focus_visibility_probe') {
         addAssertion(
            context,
            'focus-geometry-collected',
            'passed',
            analysis.overlapPixels > 0
               ? 'Captured focus overlap evidence for follow-up review.'
               : 'Captured focus geometry without overlap.',
            { overlapPixels: analysis.overlapPixels },
         );
      } else {
         addAssertion(
            context,
            'focus-obscured',
            analysis.overlapPixels > 0 ? 'failed' : 'passed',
            analysis.overlapPixels > 0
               ? 'The target is at least partially obscured.'
               : 'The target is not obscured by an overlay.',
            { overlapPixels: analysis.overlapPixels },
         );
      }

      context.browserEvidence.push({
         kind: 'visibility',
         summary:
            'Captured focus visibility and overlap geometry from the rendered page.',
         details: analysis,
      });

      return interactionPatternResultSchema.parse({
         patternId,
         url,
         target: context.target,
         sessionId: context.sessionId,
         managedSession: context.managedSession,
         stepLog: context.stepLog,
         spokenPhraseLog: logs.state.spokenPhraseLog,
         itemTextLog: logs.state.itemTextLog,
         assertions: context.assertions,
         targetMetadata: {
            focusTarget: analysis.targetSelector,
            overlapPixels: analysis.overlapPixels,
         },
         browserEvidence: context.browserEvidence,
      });
   });
}

async function runTabSequence(
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   return await withBrowserPage(url, async (page) => {
      const tabbables = await page.evaluate(() =>
         [
            ...document.querySelectorAll<HTMLElement>(
               "a[href], button, input, select, textarea, [tabindex='0']",
            ),
         ]
            .filter((element) => !element.hasAttribute('disabled'))
            .map(
               (element) =>
                  element.textContent?.trim() ||
                  element.getAttribute('aria-label') ||
                  element.tagName.toLowerCase(),
            ),
      );
      await attachRenderedPage(context.sessionId, url, page);
      const logs = await collectDriverWalk(
         context.sessionId,
         Math.max(tabbables.length + 1, 1),
      );

      addStep(
         context,
         'collect-tabbables',
         'Collect tabbable controls from the rendered page',
         'observed',
         {
            tabbables,
         },
      );
      addAssertion(
         context,
         'tabbable-count',
         tabbables.length > 0 ? 'passed' : 'failed',
         tabbables.length > 0
            ? 'Found one or more tabbable controls.'
            : 'No tabbable controls were found.',
         { tabbables },
      );

      return interactionPatternResultSchema.parse({
         patternId: 'tab_sequence',
         url,
         target: context.target,
         sessionId: context.sessionId,
         managedSession: context.managedSession,
         stepLog: context.stepLog,
         spokenPhraseLog: logs.state.spokenPhraseLog,
         itemTextLog: logs.state.itemTextLog,
         assertions: context.assertions,
         targetMetadata: {
            tabbables,
         },
         browserEvidence: context.browserEvidence,
      });
   });
}

async function runFormFieldWalk(
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   return await withBrowserPage(url, async (page) => {
      const fields = await page.evaluate(() =>
         [
            ...document.querySelectorAll<
               HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
            >('input, select, textarea'),
         ].map((field) => ({
            name: field.getAttribute('name') ?? '',
            type: field.getAttribute('type') ?? field.tagName.toLowerCase(),
         })),
      );
      await attachRenderedPage(context.sessionId, url, page);
      const logs = await collectDriverWalk(
         context.sessionId,
         Math.max(fields.length + 1, 1),
      );

      addAssertion(
         context,
         'field-count',
         fields.length > 0 ? 'passed' : 'failed',
         fields.length > 0
            ? 'Found one or more form fields.'
            : 'No form fields were found.',
         { fields },
      );

      return interactionPatternResultSchema.parse({
         patternId: 'form_field_walk',
         url,
         target: context.target,
         sessionId: context.sessionId,
         managedSession: context.managedSession,
         stepLog: context.stepLog,
         spokenPhraseLog: logs.state.spokenPhraseLog,
         itemTextLog: logs.state.itemTextLog,
         assertions: context.assertions,
         targetMetadata: {
            fields,
         },
         browserEvidence: context.browserEvidence,
      });
   });
}

async function runFocusOrderProbe(
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   const result = await runTabSequence(context, url);
   return interactionPatternResultSchema.parse({
      ...result,
      patternId: 'focus_order_probe',
      assertions: [
         ...result.assertions,
         {
            id: 'focus-order-collected',
            status: 'passed',
            message: 'Collected focus order evidence from the prepared target.',
         },
      ],
   });
}

async function runAuthFlowProbe(
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   return await withBrowserPage(url, async (page) => {
      const authSignals = await page.evaluate(() => ({
         hasPasswordField: Boolean(document.querySelector("input[type='password']")),
         hasOtpHint: /\b(otp|two-factor|2fa|verification code)\b/i.test(
            document.body.textContent ?? '',
         ),
      }));
      await attachRenderedPage(context.sessionId, url, page);
      const logs = await runDriverSessionAction(context.sessionId, 'logs');

      addAssertion(
         context,
         'auth-signals',
         authSignals.hasPasswordField || authSignals.hasOtpHint ? 'passed' : 'not-run',
         authSignals.hasPasswordField || authSignals.hasOtpHint
            ? 'Authentication-specific signals were found.'
            : 'No authentication-specific signals were found on this page.',
         authSignals,
      );

      return interactionPatternResultSchema.parse({
         patternId: 'auth_flow_probe',
         url,
         target: context.target,
         sessionId: context.sessionId,
         managedSession: context.managedSession,
         stepLog: context.stepLog,
         spokenPhraseLog: logs.state.spokenPhraseLog,
         itemTextLog: logs.state.itemTextLog,
         assertions: context.assertions,
         targetMetadata: authSignals,
         browserEvidence: context.browserEvidence,
      });
   });
}

async function runRedundantEntryProbe(
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   return await withBrowserPage(url, async (page) => {
      const fieldNames = await page.evaluate(() =>
         [
            ...document.querySelectorAll<
               HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
            >('input[name], textarea[name], select[name]'),
         ]
            .map((field) => field.getAttribute('name') ?? '')
            .filter(Boolean),
      );
      const duplicates = [
         ...new Set(
            fieldNames.filter((name, index) => fieldNames.indexOf(name) !== index),
         ),
      ];

      await attachRenderedPage(context.sessionId, url, page);
      const logs = await runDriverSessionAction(context.sessionId, 'logs');

      addAssertion(
         context,
         'redundant-entry-signals',
         duplicates.length === 0 ? 'passed' : 'failed',
         duplicates.length === 0
            ? 'No repeated field names were found.'
            : 'Repeated field names may indicate redundant entry.',
         { duplicates },
      );

      return interactionPatternResultSchema.parse({
         patternId: 'redundant_entry_probe',
         url,
         target: context.target,
         sessionId: context.sessionId,
         managedSession: context.managedSession,
         stepLog: context.stepLog,
         spokenPhraseLog: logs.state.spokenPhraseLog,
         itemTextLog: logs.state.itemTextLog,
         assertions: context.assertions,
         targetMetadata: {
            duplicates,
         },
         browserEvidence: context.browserEvidence,
      });
   });
}

export async function runInteractionPattern(
   options: RunPatternOptions,
): Promise<InteractionPatternResult> {
   let parsedUrl: URL;

   try {
      parsedUrl = new URL(options.url);
   } catch {
      throw new CliUsageError('invalid-url', `URL "${options.url}" is invalid.`, {
         url: options.url,
      });
   }

   const patternId = interactionPatternIdSchema.parse(options.patternId);
   const resolvedSession = await resolveSession(options);
   const context: PatternContext = {
      url: parsedUrl.toString(),
      sessionId: resolvedSession.sessionId,
      target: resolvedSession.target,
      managedSession: resolvedSession.managedSession,
      stepLog: [],
      assertions: [],
      browserEvidence: [],
   };

   try {
      switch (patternId) {
         case 'landmark_sequence': {
            return await runLandmarkSequence(context, parsedUrl.toString());
         }
         case 'heading_sequence': {
            return await runHeadingSequence(context, parsedUrl.toString());
         }
         case 'status_message_probe': {
            return await runStatusMessageProbe(context, parsedUrl.toString());
         }
         case 'dialog_probe': {
            return await runDialogProbe(context, parsedUrl.toString());
         }
         case 'focus_visibility_probe': {
            return await runFocusVisibilityProbe(
               context,
               parsedUrl.toString(),
               'focus_visibility_probe',
            );
         }
         case 'focus_obscured_probe': {
            return await runFocusVisibilityProbe(
               context,
               parsedUrl.toString(),
               'focus_obscured_probe',
            );
         }
         case 'tab_sequence': {
            return await runTabSequence(context, parsedUrl.toString());
         }
         case 'form_field_walk': {
            return await runFormFieldWalk(context, parsedUrl.toString());
         }
         case 'focus_order_probe': {
            return await runFocusOrderProbe(context, parsedUrl.toString());
         }
         case 'auth_flow_probe': {
            return await runAuthFlowProbe(context, parsedUrl.toString());
         }
         case 'redundant_entry_probe': {
            return await runRedundantEntryProbe(context, parsedUrl.toString());
         }
      }

      throw new CliUsageError(
         'unknown-pattern',
         `Pattern "${patternId}" is unsupported.`,
         {
            patternId,
         },
      );
   } finally {
      if (resolvedSession.managedSession) {
         await stopDriverSession(resolvedSession.sessionId).catch(() => {});
      }
   }
}
