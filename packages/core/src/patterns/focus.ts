import type { InteractionPatternResult } from '@a11ied/contracts';
import type { Page } from 'playwright';

import { runDriverSessionAction } from '../driver/runtime.js';
import {
   addBooleanAssertion,
   addStep,
   attachRenderedPage,
   buildPatternResult,
   type EvaluablePage,
   type PatternContext,
   withPatternPage,
} from './helpers.js';

interface RectData {
   left: number;
   top: number;
   width: number;
   height: number;
}

interface FocusVisibilityAnalysis {
   targetSelector: string;
   outlineStyle: string;
   overlapPixels: number;
   targetRect: RectData | undefined;
   overlayRect: RectData | undefined;
}

interface FocusVisibilityOptions {
   context: PatternContext;
   url: string;
   patternId: 'focus_visibility_probe' | 'focus_obscured_probe';
}

async function evaluateTargetStyle(
   page: EvaluablePage,
): Promise<{ exists: boolean; outlineStyle: string }> {
   return await page.evaluate((): { exists: boolean; outlineStyle: string } => {
      const target = document.querySelector('#obscured-action') as
         | HTMLElement
         | undefined;
      if (!target) {
         return { exists: false, outlineStyle: '' };
      }
      return {
         exists: true,
         outlineStyle: getComputedStyle(target).outlineStyle,
      };
   });
}

interface GeometryResult {
   overlapPixels: number;
   targetRect: RectData;
   overlayRect: RectData | undefined;
}

async function evaluateGeometry(page: EvaluablePage): Promise<GeometryResult> {
   return await page.evaluate((): GeometryResult => {
      const target = (
         document.querySelector('#obscured-action') as HTMLElement
      ).getBoundingClientRect();
      const overlay = (
         document.querySelector('#overlay') as HTMLElement | undefined
      )?.getBoundingClientRect();
      let overlapPixels = 0;
      let overlayRect: RectData | undefined = undefined;
      if (overlay) {
         const horiz = Math.max(
            0,
            Math.min(target.right, overlay.right) - Math.max(target.left, overlay.left),
         );
         const vert = Math.max(
            0,
            Math.min(target.bottom, overlay.bottom) - Math.max(target.top, overlay.top),
         );
         overlapPixels = horiz * vert;
         overlayRect = {
            left: overlay.x,
            top: overlay.y,
            width: overlay.width,
            height: overlay.height,
         };
      }
      return {
         overlapPixels,
         targetRect: {
            left: target.x,
            top: target.y,
            width: target.width,
            height: target.height,
         },
         overlayRect,
      };
   });
}

async function evaluateFocusVisibility(
   page: EvaluablePage,
): Promise<FocusVisibilityAnalysis> {
   const info = await evaluateTargetStyle(page);
   if (!info.exists) {
      return {
         targetSelector: '#obscured-action',
         outlineStyle: '',
         overlapPixels: 0,
         targetRect: undefined,
         overlayRect: undefined,
      };
   }
   const geometry = await evaluateGeometry(page);
   return {
      targetSelector: '#obscured-action',
      outlineStyle: info.outlineStyle,
      ...geometry,
   };
}

function addAllFocusAssertions(
   options: FocusVisibilityOptions,
   analysis: FocusVisibilityAnalysis,
): void {
   const hasIndicator =
      Boolean(analysis.outlineStyle) && analysis.outlineStyle !== 'none';
   addBooleanAssertion({
      context: options.context,
      id: 'focus-visible',
      condition: hasIndicator,
      passedMessage: 'The target exposes a visible focus indicator.',
      failedMessage: 'The target does not expose a visible focus indicator.',
      details: { outlineStyle: analysis.outlineStyle },
   });
   if (options.patternId === 'focus_visibility_probe') {
      let overlapMessage = 'Captured focus geometry without overlap.';
      if (analysis.overlapPixels > 0) {
         overlapMessage = 'Captured focus overlap evidence for follow-up review.';
      }
      addBooleanAssertion({
         context: options.context,
         id: 'focus-geometry-collected',
         condition: true,
         passedMessage: overlapMessage,
         failedMessage: overlapMessage,
         details: { overlapPixels: analysis.overlapPixels },
      });
      return;
   }
   addBooleanAssertion({
      context: options.context,
      id: 'focus-obscured',
      condition: analysis.overlapPixels === 0,
      passedMessage: 'The target is not obscured by an overlay.',
      failedMessage: 'The target is at least partially obscured.',
      details: { overlapPixels: analysis.overlapPixels },
   });
}

async function runFocusVisibilityBody(
   page: Page,
   options: FocusVisibilityOptions,
): Promise<InteractionPatternResult> {
   await page.focus('#obscured-action');
   const analysis = await evaluateFocusVisibility(page);
   await attachRenderedPage(options.context, options.url, page);
   const logs = await runDriverSessionAction(options.context.sessionId, 'logs');
   addStep({
      context: options.context,
      id: 'focus-target',
      label: 'Focus the target control and inspect its visible state',
      status: 'completed',
      details: analysis as unknown as Record<string, unknown>,
   });
   addAllFocusAssertions(options, analysis);
   options.context.browserEvidence.push({
      kind: 'visibility',
      summary: 'Captured focus visibility and overlap geometry from the rendered page.',
      details: analysis as unknown as Record<string, unknown>,
   });
   return buildPatternResult({
      patternId: options.patternId,
      url: options.url,
      context: options.context,
      logs,
      targetMetadata: {
         focusTarget: analysis.targetSelector,
         overlapPixels: analysis.overlapPixels,
      },
   });
}

export async function runFocusVisibilityProbe(
   context: PatternContext,
   url: string,
   patternId: 'focus_visibility_probe' | 'focus_obscured_probe',
): Promise<InteractionPatternResult> {
   return await withPatternPage(context, url, (page) =>
      runFocusVisibilityBody(page, { context, url, patternId }),
   );
}
