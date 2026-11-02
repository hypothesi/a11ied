import { describe, expect, it } from 'vitest';
import { judgeCriterion } from './judge.js';
import type { PageFacts } from './page-facts.js';
import type { ProbeInput, SiteFacts } from './probe-types.js';

const SITE: SiteFacts = {
   hasSitemap: true,
   navSignatures: ['a|b'],
   helpSignatures: ['[]'],
};

function buildFacts(overrides: Partial<PageFacts> = {}): PageFacts {
   return {
      url: 'https://example.test/',
      title: 'Example',
      lang: 'en',
      headings: [{ level: 1, text: 'Example' }],
      landmarks: { main: 1, nav: 1, header: 0, footer: 1 },
      images: [],
      svgImgs: [],
      links: [{ name: 'Home', href: '/', text: 'Home' }],
      unnamedButtons: [],
      controls: [],
      forms: 0,
      media: { video: 0, audio: 0, embeds: [], autoplay: 0, canvas: 0 },
      metaRefresh: false,
      marquee: 0,
      titleAttrs: 0,
      sliders: [],
      liveRegions: 0,
      pointerCursorNonInteractive: [],
      runningAnimations: [],
      bodyText: 'Hello',
      navLinks: ['Home>/'],
      helpLinks: [],
      interactiveCount: 1,
      smallTargets: [],
      instrumented: { mediaPlays: 0, audioContexts: 0, motionListeners: [] },
      listeners: { window: [], document: [], body: [] },
      clickOnNonInteractive: [],
      downHandlers: [],
      tabStops: [],
      urlUnchangedAfterTab: true,
      noIndicator: [],
      trapSuspected: false,
      skipLink: undefined,
      reflow: { overflowPx: 0, wide: [] },
      zoom200OverflowPx: 0,
      portraitOverflowPx: 0,
      textSpacingClipped: [],
      ...overrides,
   };
}

function input(overrides: Partial<PageFacts> = {}): ProbeInput {
   return { facts: buildFacts(overrides), axe: undefined, site: SITE };
}

describe('judgeCriterion', () => {
   it('fails reflow when the page scrolls sideways at 320px', () => {
      const result = judgeCriterion(
         '1.4.10',
         input({ reflow: { overflowPx: 23, wide: ['DIV.hero'] } }),
      );

      expect(result.outcome).toStrictEqual('failed');
      expect(result.finding?.impact).toStrictEqual('serious');
   });

   it('passes reflow when nothing overflows', () => {
      expect(judgeCriterion('1.4.10', input()).outcome).toStrictEqual('passed');
   });

   it('fails focus visibility when tab stops sit in a collapsed container', () => {
      const stop = {
         tag: 'A',
         label: 'Services',
         outline: false,
         shadow: false,
         top: 0,
         left: 0,
         inView: true,
         obscured: false,
         hiddenFocus: true,
         id: 'A:Services',
      };

      const result = judgeCriterion('2.4.7', input({ tabStops: [stop] }));

      expect(result.outcome).toStrictEqual('failed');
      expect(result.rationale).toContain('Services');
   });
});

describe('judgeCriterion media and axe', () => {
   it('marks media criteria not applicable when the page has no media', () => {
      expect(judgeCriterion('1.2.2', input()).outcome).toStrictEqual('inapplicable');
   });

   it('asks for review when media is present', () => {
      const facts = { media: { video: 1, audio: 0, embeds: [], autoplay: 0, canvas: 0 } };

      expect(judgeCriterion('1.2.2', input(facts)).outcome).toStrictEqual('cantTell');
   });

   it('lets a tagged axe violation decide the criterion', () => {
      const axe = {
         url: 'https://example.test/',
         wcagVersion: '2.2' as const,
         selection: { kind: 'rule' as const, ruleIds: ['button-name'] },
         ruleIds: ['button-name'],
         violations: [
            {
               id: 'button-name',
               impact: 'critical' as const,
               description: 'Buttons need names',
               help: 'Buttons must have discernible text',
               helpUrl: 'https://example.test/button-name',
               tags: ['wcag412'],
               nodes: [],
            },
         ],
         passes: [],
         incomplete: [],
         inapplicable: [],
      };

      const result = judgeCriterion('4.1.2', { ...input(), axe });

      expect(result.outcome).toStrictEqual('failed');
      expect(result.finding?.impact).toStrictEqual('critical');
   });

   it('leaves criteria without a probe for a person', () => {
      expect(judgeCriterion('9.9.9', input()).outcome).toStrictEqual('cantTell');
   });
});
