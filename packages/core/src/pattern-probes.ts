import {
   interactionPatternResultSchema,
   type InteractionPatternResult,
} from '@a11lied/contracts';
import type { Page } from 'playwright';

import { withBrowserPage } from './browser-helper.js';
import { runDriverSessionAction } from './driver-runtime.js';
import {
   addBooleanAssertion,
   addStep,
   attachRenderedPage,
   buildPatternResult,
   collectDriverWalk,
   type PatternContext,
} from './pattern-helpers.js';

async function runTabSequenceBody(
   page: Page,
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   const tabbables = await page.evaluate((): string[] =>
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

   addStep({
      context,
      id: 'collect-tabbables',
      label: 'Collect tabbable controls from the rendered page',
      status: 'observed',
      details: { tabbables },
   });
   addBooleanAssertion({
      context,
      id: 'tabbable-count',
      condition: tabbables.length > 0,
      passedMessage: 'Found one or more tabbable controls.',
      failedMessage: 'No tabbable controls were found.',
      details: { tabbables },
   });

   return buildPatternResult({
      patternId: 'tab_sequence',
      url,
      context,
      logs,
      targetMetadata: { tabbables },
   });
}

export async function runTabSequence(
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   return await withBrowserPage(url, (page) => runTabSequenceBody(page, context, url));
}

async function runFormFieldBody(
   page: Page,
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   const fields = await page.evaluate(
      (): Array<{ name: string; type: string }> =>
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

   addBooleanAssertion({
      context,
      id: 'field-count',
      condition: fields.length > 0,
      passedMessage: 'Found one or more form fields.',
      failedMessage: 'No form fields were found.',
      details: { fields },
   });

   return buildPatternResult({
      patternId: 'form_field_walk',
      url,
      context,
      logs,
      targetMetadata: { fields },
   });
}

export async function runFormFieldWalk(
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   return await withBrowserPage(url, (page) => runFormFieldBody(page, context, url));
}

export async function runFocusOrderProbe(
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

async function runAuthFlowBody(
   page: Page,
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   const authSignals = await page.evaluate(
      (): { hasPasswordField: boolean; hasOtpHint: boolean } => ({
         hasPasswordField: Boolean(document.querySelector("input[type='password']")),
         hasOtpHint: /\b(otp|two-factor|2fa|verification code)\b/i.test(
            document.body.textContent ?? '',
         ),
      }),
   );
   await attachRenderedPage(context.sessionId, url, page);
   const logs = await runDriverSessionAction(context.sessionId, 'logs');

   addBooleanAssertion({
      context,
      id: 'auth-signals',
      condition: authSignals.hasPasswordField || authSignals.hasOtpHint,
      passedMessage: 'Authentication-specific signals were found.',
      failedMessage: 'No authentication-specific signals were found on this page.',
      passedStatus: 'passed',
      failedStatus: 'not-run',
      details: authSignals,
   });

   return buildPatternResult({
      patternId: 'auth_flow_probe',
      url,
      context,
      logs,
      targetMetadata: authSignals,
   });
}

export async function runAuthFlowProbe(
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   return await withBrowserPage(url, (page) => runAuthFlowBody(page, context, url));
}

async function runRedundantEntryBody(
   page: Page,
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   const fieldNames = await page.evaluate((): string[] =>
      [
         ...document.querySelectorAll<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
         >('input[name], textarea[name], select[name]'),
      ]
         .map((field) => field.getAttribute('name') ?? '')
         .filter(Boolean),
   );
   const duplicates = [
      ...new Set(fieldNames.filter((name, index) => fieldNames.indexOf(name) !== index)),
   ];

   await attachRenderedPage(context.sessionId, url, page);
   const logs = await runDriverSessionAction(context.sessionId, 'logs');

   addBooleanAssertion({
      context,
      id: 'redundant-entry-signals',
      condition: duplicates.length === 0,
      passedMessage: 'No repeated field names were found.',
      failedMessage: 'Repeated field names may indicate redundant entry.',
      details: { duplicates },
   });

   return buildPatternResult({
      patternId: 'redundant_entry_probe',
      url,
      context,
      logs,
      targetMetadata: { duplicates },
   });
}

export async function runRedundantEntryProbe(
   context: PatternContext,
   url: string,
): Promise<InteractionPatternResult> {
   return await withBrowserPage(url, (page) => runRedundantEntryBody(page, context, url));
}
