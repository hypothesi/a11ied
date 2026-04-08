import type { InteractionPatternResult } from '@a11lied/contracts';
import type { Page } from 'playwright';

import { withBrowserPage } from './browser-helper.js';
import { runDriverSessionAction } from './driver-runtime.js';
import {
   addBooleanAssertion,
   addStep,
   attachRenderedPage,
   buildPatternResult,
   evaluateActiveElement,
   type PatternContext,
} from './pattern-helpers.js';

interface DialogFocusState {
   active: string | undefined;
   containsFocus: boolean;
}

async function evaluateDialogFocusState(page: Page): Promise<DialogFocusState> {
   return await page.evaluate((): DialogFocusState => {
      const dialog = document.querySelector("[role='dialog']") as HTMLElement | undefined;
      const activeEl = document.activeElement;

      function describeElement(): string | undefined {
         if (!activeEl) {
            return undefined;
         }
         const elId = activeEl.getAttribute('id');
         if (elId) {
            return `#${elId}`;
         }
         const role = activeEl.getAttribute('role');
         if (role) {
            return `${activeEl.tagName.toLowerCase()}[role=${role}]`;
         }
         return activeEl.tagName.toLowerCase();
      }

      const containsFocus = Boolean(
         dialog && document.activeElement && dialog.contains(document.activeElement),
      );
      return { active: describeElement(), containsFocus };
   });
}

async function evaluateDialogLabel(page: Page): Promise<string> {
   return await page.evaluate((): string => {
      const dialog = document.querySelector("[role='dialog']") as HTMLElement | undefined;
      return (
         dialog?.getAttribute('aria-label') ??
         dialog?.getAttribute('aria-labelledby') ??
         'dialog'
      );
   });
}

function addFocusEntryAssertion(
   context: PatternContext,
   openState: DialogFocusState,
): void {
   addBooleanAssertion({
      context,
      id: 'focus-entry',
      condition: openState.containsFocus,
      passedMessage: 'Focus entered the dialog after it opened.',
      failedMessage: 'Focus did not enter the dialog after it opened.',
      details: openState as unknown as Record<string, unknown>,
   });
}

function addFocusContainmentAssertion(
   context: PatternContext,
   tabState: DialogFocusState,
): void {
   addBooleanAssertion({
      context,
      id: 'focus-containment',
      condition: tabState.containsFocus,
      passedMessage: 'Focus stayed inside the dialog after one tab step.',
      failedMessage: 'Focus left the dialog unexpectedly.',
      details: tabState as unknown as Record<string, unknown>,
   });
}

function addCloseReturnAssertion(
   context: PatternContext,
   closeActive: string | undefined,
   beforeOpen: string | undefined,
): void {
   addBooleanAssertion({
      context,
      id: 'close-behavior',
      condition: closeActive === '#open-dialog',
      passedMessage: 'Focus returned to the trigger after the dialog closed.',
      failedMessage: 'Focus did not return to the trigger after the dialog closed.',
      details: { beforeOpen, afterClose: closeActive },
   });
}

interface DialogOpenResult {
   beforeOpen: string | undefined;
   openFocus: DialogFocusState;
   dialogLabel: string;
}

async function captureDialogOpenPhase(
   page: Page,
   context: PatternContext,
): Promise<DialogOpenResult> {
   await page.focus('#open-dialog');
   const beforeOpen = await evaluateActiveElement(page);
   await page.click('#open-dialog');
   await page.waitForSelector("[role='dialog']");
   const openFocus = await evaluateDialogFocusState(page);
   const dialogLabel = await evaluateDialogLabel(page);
   addStep({
      context,
      id: 'open-dialog',
      label: 'Open the dialog and capture focus entry',
      status: 'completed',
      details: { ...openFocus, dialogLabel },
   });
   return { beforeOpen, openFocus, dialogLabel };
}

async function captureDialogTabPhase(
   page: Page,
   context: PatternContext,
): Promise<DialogFocusState> {
   await page.keyboard.press('Tab');
   const tabState = await evaluateDialogFocusState(page);
   addStep({
      context,
      id: 'tab-inside-dialog',
      label: 'Move focus once inside the open dialog',
      status: 'completed',
      details: tabState as unknown as Record<string, unknown>,
   });
   return tabState;
}

async function captureDialogClosePhase(
   page: Page,
   context: PatternContext,
): Promise<string | undefined> {
   await page.click('#close-dialog');
   await page.waitForSelector('#dialog-root', { state: 'hidden' });
   const closeActive = await evaluateActiveElement(page);
   addStep({
      context,
      id: 'close-dialog',
      label: 'Close the dialog and capture the final focus target',
      status: 'completed',
      details: { active: closeActive },
   });
   return closeActive;
}

function recordDialogEvidence(options: {
   context: PatternContext;
   openResult: DialogOpenResult;
   tabState: DialogFocusState;
   closeActive: string | undefined;
}): void {
   addFocusEntryAssertion(options.context, options.openResult.openFocus);
   addFocusContainmentAssertion(options.context, options.tabState);
   addCloseReturnAssertion(
      options.context,
      options.closeActive,
      options.openResult.beforeOpen,
   );
   options.context.browserEvidence.push({
      kind: 'dialog',
      summary: 'Captured dialog focus entry and close behavior from the rendered page.',
      details: {
         beforeOpen: options.openResult.beforeOpen,
         openState: {
            ...options.openResult.openFocus,
            dialogLabel: options.openResult.dialogLabel,
         },
         tabState: options.tabState,
         closeState: { active: options.closeActive },
      },
   });
}

async function runDialogProbeBody(
   page: Page,
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   await attachRenderedPage(context.sessionId, url, page);
   addStep({
      context,
      id: 'attach-before-open',
      label: 'Attach the initial page state to the session',
      status: 'completed',
   });

   const openResult = await captureDialogOpenPhase(page, context);
   const tabState = await captureDialogTabPhase(page, context);
   const closeActive = await captureDialogClosePhase(page, context);

   await attachRenderedPage(context.sessionId, url, page);
   const logs = await runDriverSessionAction(context.sessionId, 'logs');

   recordDialogEvidence({ context, openResult, tabState, closeActive });

   return buildPatternResult({
      patternId: 'dialog_probe',
      url,
      context,
      logs,
      targetMetadata: { dialogLabel: openResult.dialogLabel },
   });
}

export async function runDialogProbe(
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   return await withBrowserPage(url, (page) => runDialogProbeBody(page, context, url));
}
