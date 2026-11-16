import type { MediaInventory } from '@a11ied/contracts';

export interface TabStop {
   tag: string;
   label: string;
   outline: boolean;
   shadow: boolean;
   top: number;
   left: number;
   inView: boolean;
   obscured: boolean;
   hiddenFocus: boolean;
   id: string;
}

interface Heading {
   level: number;
   text: string;
}

interface Control {
   tag: string;
   type: string;
   name: string;
   label: string;
   placeholder: string;
   autocomplete: string | null;
   required: boolean;
}

export interface SmallTarget {
   html: string;
   width: number;
   height: number;
   crowded: boolean;
}

interface Animation {
   name: string;
   dur: number | null;
   iter: number | null;
}

export interface BaseFacts {
   title: string;
   lang: string;
   headings: Heading[];
   landmarks: { main: number; nav: number; header: number; footer: number };
   images: { src: string; alt: string | null; inLink: boolean; width: number }[];
   svgImgs: { hidden: boolean; label: string | null; inInteractive: boolean }[];
   links: { name: string; href: string | null; text: string }[];
   unnamedButtons: string[];
   controls: Control[];
   forms: number;
   media: {
      video: number;
      audio: number;
      embeds: string[];
      autoplay: number;
      canvas: number;
   };
   metaRefresh: boolean;
   marquee: number;
   titleAttrs: number;
   sliders: string[];
   liveRegions: number;
   pointerCursorNonInteractive: string[];
   runningAnimations: Animation[];
   bodyText: string;
   navLinks: string[];
   helpLinks: { txt: string; top: number; left: number }[];
   interactiveCount: number;
}

export interface Instrumented {
   mediaPlays: number;
   audioContexts: number;
   motionListeners: string[];
}

/** Everything a criterion probe may read about one page. */
export interface PageFacts extends BaseFacts {
   mediaInventory?: MediaInventory;
   url: string;
   smallTargets: SmallTarget[];
   instrumented: Instrumented;
   listeners: { window: string[]; document: string[]; body: string[] };
   clickOnNonInteractive: string[];
   downHandlers: { html: string; types: string[] }[];
   tabStops: (TabStop | null)[];
   urlUnchangedAfterTab: boolean;
   noIndicator: string[];
   trapSuspected: boolean;
   skipLink: string | undefined;
   reflow: { overflowPx: number; wide: string[] };
   zoom200OverflowPx: number;
   portraitOverflowPx: number;
   textSpacingClipped: string[];
}

export interface ListenerInfo {
   html: string;
   native: boolean;
   focusable: boolean;
}
