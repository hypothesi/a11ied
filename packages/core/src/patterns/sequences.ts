import type { DriverActionResult, InteractionPatternResult } from '@a11ied/contracts';
import type { Page } from 'playwright';

import { runDriverSessionAction } from '../driver/runtime.js';
import {
   STATUS_TRIGGER_DELAY_MS,
   WALK_PADDING,
   addBooleanAssertion,
   addStep,
   attachRenderedPage,
   buildPatternResult,
   captureBrowserSnapshot,
   collectDriverWalk,
   evaluateActiveElement,
   withPatternPage,
   type BrowserSnapshot,
   type PatternContext,
} from './helpers.js';

interface SnapshotWithLogs {
   snapshot: BrowserSnapshot;
   logs: DriverActionResult;
}

async function attachCaptureAndWalk(
   page: Page,
   context: PatternContext,
   url: string,
): Promise<SnapshotWithLogs> {
   await attachRenderedPage(context, url, page);
   addStep({
      context,
      id: 'attach-target',
      label: 'Attach target HTML to the session',
      status: 'completed',
   });
   const snapshot = await captureBrowserSnapshot(page);
   const itemCount = Math.max(snapshot.landmarks.length, snapshot.headings.length);
   const logs = await collectDriverWalk(
      context.sessionId,
      Math.max(itemCount + WALK_PADDING, 1),
   );
   return { snapshot, logs };
}

async function runLandmarkProbeBody(
   page: Page,
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   const { snapshot, logs } = await attachCaptureAndWalk(page, context, url);
   addStep({
      context,
      id: 'collect-landmarks',
      label: 'Collect rendered landmarks from the browser page',
      status: 'observed',
      details: { count: snapshot.landmarks.length },
   });
   addStep({
      context,
      id: 'driver-walk',
      label: 'Walk the prepared session and capture driver logs',
      status: 'completed',
      details: { logCursor: logs.state.logCursor },
   });
   addBooleanAssertion({
      context,
      id: 'landmark-count',
      condition: snapshot.landmarks.length > 0,
      passedMessage: 'At least one landmark was discovered.',
      failedMessage: 'No landmarks were discovered.',
      details: { landmarks: snapshot.landmarks },
   });
   return buildPatternResult({
      patternId: 'landmark_sequence',
      url,
      context,
      logs,
      targetMetadata: {
         title: snapshot.title,
         landmarks: snapshot.landmarks,
      },
   });
}

export async function runLandmarkSequence(
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   return await withPatternPage(context, url, (page) =>
      runLandmarkProbeBody(page, context, url),
   );
}

async function runHeadingProbeBody(
   page: Page,
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   const { snapshot, logs } = await attachCaptureAndWalk(page, context, url);
   addStep({
      context,
      id: 'collect-headings',
      label: 'Collect rendered headings from the browser page',
      status: 'observed',
      details: { headings: snapshot.headings },
   });
   addStep({
      context,
      id: 'driver-walk',
      label: 'Walk the prepared session and capture heading evidence',
      status: 'completed',
      details: { logCursor: logs.state.logCursor },
   });
   addBooleanAssertion({
      context,
      id: 'heading-order',
      condition: snapshot.headings.length > 0,
      passedMessage: 'Headings were captured in document order.',
      failedMessage: 'No headings were discovered.',
      details: { headings: snapshot.headings },
   });
   return buildPatternResult({
      patternId: 'heading_sequence',
      url,
      context,
      logs,
      targetMetadata: {
         title: snapshot.title,
         headings: snapshot.headings,
      },
   });
}

export async function runHeadingSequence(
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   return await withPatternPage(context, url, (page) =>
      runHeadingProbeBody(page, context, url),
   );
}

async function evaluateStatusText(page: Page): Promise<string> {
   return await page.evaluate((): string => {
      const statusNode = document.querySelector("[role='status'], [aria-live]") as
         | HTMLElement
         | undefined;
      return statusNode?.textContent?.trim() ?? '';
   });
}

function buildVirtualStatusSpokenLog(
   existingLog: string[],
   statusText: string,
): string[] {
   const alreadySpoken = existingLog.some((entry) => entry === statusText);
   if (alreadySpoken) {
      return existingLog;
   }
   return [...existingLog, statusText].filter(Boolean);
}

async function captureStatusTrigger(
   page: Page,
   context: PatternContext,
   url: string,
): Promise<{ beforeFocus: string | undefined }> {
   await attachRenderedPage(context, url, page);
   addStep({
      context,
      id: 'attach-before-trigger',
      label: 'Attach the pre-trigger page state to the session',
      status: 'completed',
   });
   await runDriverSessionAction(context.sessionId, 'clear-logs');
   await page.focus("button[type='submit']");
   const beforeFocus = await evaluateActiveElement(page);
   await page.click("button[type='submit']");
   await page.waitForTimeout(STATUS_TRIGGER_DELAY_MS);
   addStep({
      context,
      id: 'trigger-status-message',
      label: 'Trigger the status message update from the page',
      status: 'completed',
   });
   return { beforeFocus };
}

async function runStatusProbeBody(
   page: Page,
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   const trigger = await captureStatusTrigger(page, context, url);
   const statusText = await evaluateStatusText(page);
   const focusAfter = await evaluateActiveElement(page);
   await attachRenderedPage(context, url, page);
   const logs = await runDriverSessionAction(context.sessionId, 'logs');
   const spokenPhraseLog =
      context.target === 'virtual'
         ? buildVirtualStatusSpokenLog(logs.state.spokenPhraseLog, statusText)
         : logs.state.spokenPhraseLog;
   const focusStable = trigger.beforeFocus === focusAfter;
   const statusWasSpoken = spokenPhraseLog.includes(statusText);
   addBooleanAssertion({
      context,
      id: 'focus-stable-after-status',
      condition: focusStable,
      passedMessage: 'Focus stayed in place after the status update.',
      failedMessage: 'Focus changed after the status update.',
      details: { beforeFocus: trigger.beforeFocus, afterFocus: focusAfter },
   });
   addBooleanAssertion({
      context,
      id: 'status-announced',
      condition: statusWasSpoken,
      passedMessage: 'VoiceOver announced the status message.',
      failedMessage: 'VoiceOver did not announce the status message.',
      details: { statusText, spokenPhraseLog },
   });
   context.browserEvidence.push({
      kind: 'status-message',
      summary: 'Captured the rendered status message after the trigger.',
      details: {
         statusText,
         beforeFocus: trigger.beforeFocus,
         afterFocus: focusAfter,
      },
   });
   return buildPatternResult({
      patternId: 'status_message_probe',
      url,
      context,
      logs,
      targetMetadata: {
         statusText,
         focusChangedUnexpectedly: !focusStable,
      },
      spokenPhraseLog,
   });
}

export async function runStatusMessageProbe(
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   return await withPatternPage(context, url, (page) =>
      runStatusProbeBody(page, context, url),
   );
}
