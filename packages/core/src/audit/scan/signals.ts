import type { PageFacts, TabStop } from '@a11ied/observe';

const HEADING_LIMIT = 40;
const IMAGE_LIMIT = 30;
const LIST_LIMIT = 20;
const TAB_STOP_LIMIT = 60;
const TEXT_LIMIT = 60;

function clip(text: string): string {
   return text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}...` : text;
}

function structureSignal(facts: PageFacts): unknown {
   return {
      title: facts.title,
      lang: facts.lang,
      landmarks: facts.landmarks,
      headings: facts.headings
         .slice(0, HEADING_LIMIT)
         .map((heading) => `h${String(heading.level)} ${clip(heading.text)}`),
      imageCount: facts.images.length,
      imagesWithoutAlt: facts.images.filter((image) => image.alt === null).length,
      images: facts.images.slice(0, IMAGE_LIMIT).map((image) => ({
         src: clip(image.src),
         alt: image.alt,
         inLink: image.inLink,
      })),
      unlabeledSvgImages: facts.svgImgs.filter((svg) => !svg.hidden && svg.label === null)
         .length,
      unnamedButtons: facts.unnamedButtons.slice(0, LIST_LIMIT),
      linkCount: facts.links.length,
      liveRegions: facts.liveRegions,
      titleAttributes: facts.titleAttrs,
   };
}

/** Names a tab stop and flags only what looks wrong, so a clean stop costs few tokens. */
function describeTabStop(stop: TabStop): string {
   const flags = [
      stop.outline || stop.shadow ? '' : 'no-outline',
      stop.obscured ? 'obscured' : '',
      stop.hiddenFocus || !stop.inView ? 'offscreen-or-hidden' : '',
   ].filter((flag) => flag !== '');
   const name =
      `${stop.tag.toLowerCase()} ${clip(stop.label.replaceAll(/\s+/gu, ' '))}`.trim();
   return flags.length > 0 ? `${name} [${flags.join(', ')}]` : name;
}

function keyboardSignal(facts: PageFacts): unknown {
   const walked = facts.tabStops.filter((stop) => stop !== null);
   // Tabbing past the last stop wraps to the first, so keep one pass through the page.
   const wrapAt = walked.findIndex(
      (stop, index) => index > 0 && stop.id === walked[0]?.id,
   );
   const stops = wrapAt > 0 ? walked.slice(0, wrapAt) : walked;
   return {
      tabStopCount: stops.length,
      tabOrder: stops.slice(0, TAB_STOP_LIMIT).map((stop) => describeTabStop(stop)),
      stopsWithNoStyleChangeOnFocus: [...new Set(facts.noIndicator)].slice(0, LIST_LIMIT),
      trapSuspected: facts.trapSuspected,
      skipLink: facts.skipLink ?? 'none found',
      clickHandlersOnNonFocusable: facts.clickOnNonInteractive.slice(0, LIST_LIMIT),
      pageLevelKeyListeners: [
         ...facts.listeners.window,
         ...facts.listeners.document,
         ...facts.listeners.body,
      ].filter((type) => type.startsWith('key')),
      urlChangedWhileTabbing: !facts.urlUnchangedAfterTab,
   };
}

function layoutSignal(facts: PageFacts): unknown {
   return {
      overflowAt320px: facts.reflow.overflowPx,
      wideElementsAt320px: facts.reflow.wide.slice(0, LIST_LIMIT),
      overflowAt200PercentZoom: facts.zoom200OverflowPx,
      overflowInPortrait: facts.portraitOverflowPx,
      clippedWithTextSpacing: facts.textSpacingClipped.slice(0, LIST_LIMIT),
   };
}

function mediaSignal(facts: PageFacts): unknown {
   return {
      elements: facts.media,
      inventory: facts.mediaInventory ?? 'not collected',
      mediaPlayCallsOnLoad: facts.instrumented.mediaPlays,
      audioContextsOnLoad: facts.instrumented.audioContexts,
      runningAnimations: facts.runningAnimations.slice(0, LIST_LIMIT),
      metaRefresh: facts.metaRefresh,
      marquee: facts.marquee,
   };
}

function formsSignal(facts: PageFacts): unknown {
   return {
      formCount: facts.forms,
      controls: facts.controls.slice(0, HEADING_LIMIT),
   };
}

function pointerSignal(facts: PageFacts): unknown {
   return {
      targetsUnder24px: facts.smallTargets.slice(0, IMAGE_LIMIT).map((target) => ({
         element: clip(target.html),
         size: `${String(Math.round(target.width))}x${String(Math.round(target.height))}`,
         crowded: target.crowded,
      })),
      pointerDownHandlers: facts.downHandlers.slice(0, LIST_LIMIT),
      motionListeners: facts.instrumented.motionListeners,
      sliders: facts.sliders.slice(0, LIST_LIMIT),
      pointerCursorOnNonInteractive: facts.pointerCursorNonInteractive.slice(
         0,
         LIST_LIMIT,
      ),
   };
}

function navigationSignal(facts: PageFacts): unknown {
   return {
      navLinks: facts.navLinks.slice(0, HEADING_LIMIT),
      helpLinks: facts.helpLinks.slice(0, LIST_LIMIT),
   };
}

/**
 * Condenses collected page facts into the signal kinds work packets show. Signals are
 * observations for an auditor to verify. None of them decides a criterion.
 */
export function buildPageSignals(facts: PageFacts): Record<string, unknown> {
   return {
      structure: structureSignal(facts),
      keyboard: keyboardSignal(facts),
      layout: layoutSignal(facts),
      media: mediaSignal(facts),
      forms: formsSignal(facts),
      pointer: pointerSignal(facts),
      navigation: navigationSignal(facts),
   };
}
