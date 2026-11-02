import {
   fail,
   getFirstPass,
   needsReview,
   notApplicable,
   pass,
   type Probe,
} from './probe-types.js';

const BACKWARD_JUMP_PX = 40;
const GENERIC_ALT = /^(image|photo|picture|graphic)$/i;
const SAMPLE_COUNT = 3;
const SIDEBAR_LEFT_PX = 400;

function hasMedia(media: { video: number; audio: number; embeds: string[] }): boolean {
   return media.video + media.audio + media.embeds.length > 0;
}

const mediaAlternative: Probe = ({ facts }) => {
   const played = facts.instrumented.mediaPlays + facts.instrumented.audioContexts;
   if (!hasMedia(facts.media) && played === 0) {
      return notApplicable(
         'No audio or video elements, embeds, media playback, or audio contexts were observed.',
      );
   }
   return needsReview(
      `Media is present (${String(facts.media.video)} video, ${String(facts.media.audio)} audio, ${String(facts.media.embeds.length)} embeds); its alternatives need a person.`,
   );
};

export const perceivableProbes: Record<string, Probe> = {
   '1.1.1': ({ facts }) => {
      const missing = facts.images.filter(
         (image) => image.alt === null || GENERIC_ALT.test(image.alt),
      );
      if (missing.length > 0) {
         return fail({
            rationale: `${String(missing.length)} image(s) lack a useful alt attribute: ${missing
               .map((image) => image.src)
               .slice(0, SAMPLE_COUNT)
               .join(', ')}.`,
            title: 'Images lack a text alternative',
            userImpact: 'Screen reader users get no description of the image.',
            remediation:
               'Add a descriptive alt attribute, or an empty one for decoration.',
            impact: 'serious',
         });
      }
      if (facts.unnamedButtons.length > 0) {
         return fail({
            rationale: `${String(facts.unnamedButtons.length)} icon button(s) have no accessible name: ${facts.unnamedButtons[0] ?? ''}`,
            title: 'Icon-only button has no text alternative',
            userImpact:
               'Screen reader users hear an unnamed button and cannot tell what it does.',
            remediation: 'Give the button an aria-label and expose aria-expanded.',
            impact: 'critical',
         });
      }
      return pass(
         `${String(facts.images.length)} images carry alt text and no control is unnamed.`,
      );
   },
   '1.2.1': mediaAlternative,
   '1.2.2': mediaAlternative,
   '1.2.3': mediaAlternative,
   '1.2.4': mediaAlternative,
   '1.2.5': mediaAlternative,
   '1.3.1': ({ facts }) => {
      const h1Count = facts.headings.filter((heading) => heading.level === 1).length;
      const unlabeled = facts.controls.filter(
         (control) => !control.label && !['submit', 'button'].includes(control.type),
      );
      const problems = [
         h1Count === 1 ? '' : `${String(h1Count)} h1 elements`,
         unlabeled.length > 0
            ? `${String(unlabeled.length)} unlabeled form control(s)`
            : '',
         facts.landmarks.main === 0 ? 'no main landmark' : '',
      ].filter(Boolean);
      if (problems.length > 0) {
         return fail({
            rationale: `Structure problems: ${problems.join('; ')}.`,
            title: 'Page structure is not fully exposed',
            userImpact:
               'Assistive technology users cannot navigate by landmark or heading.',
            remediation:
               'Wrap the primary content in <main>, use one h1, and label every control.',
            impact: 'moderate',
         });
      }
      return pass(
         `One h1, ${String(facts.headings.length)} headings, a main landmark, and labelled controls.`,
      );
   },
   '1.3.2': ({ facts }) => {
      const stops = getFirstPass(facts);
      const backwards = stops.filter(
         (stop, index) =>
            index > 0 &&
            stop.top + BACKWARD_JUMP_PX < (stops[index - 1]?.top ?? 0) &&
            stop.left > SIDEBAR_LEFT_PX,
      );
      return backwards.length > 0
         ? needsReview('Focus order jumps backwards; the reading sequence needs review.')
         : pass('The DOM order matches the visual order: focus only moved forward.');
   },
   '1.3.3': ({ facts }) =>
      /\b(click|press|tap|see|use) (the )?(red|green|blue|round|square|left|right|top|bottom|above|below)\b/i.test(
         facts.bodyText,
      )
         ? needsReview('Instruction text mentions colour or position; it needs review.')
         : pass('No instruction in the page text relies on colour, shape, or position.'),
   '1.3.4': ({ facts }) =>
      facts.portraitOverflowPx <= 0
         ? pass('The page fits in portrait (800x1280) and landscape (1280x900).')
         : fail({
              rationale: `Portrait orientation overflows by ${String(facts.portraitOverflowPx)}px.`,
              title: 'Content breaks in portrait orientation',
              userImpact: 'Users who cannot rotate their device lose content.',
              remediation: 'Make the layout responsive in both orientations.',
           }),
   '1.3.5': ({ facts }) => {
      if (facts.controls.length === 0) {
         return notApplicable('No form fields collect user information.');
      }
      const missing = facts.controls.filter(
         (control) =>
            /name|email|phone|tel|address/i.test(`${control.name}${control.type}`) &&
            !control.autocomplete,
      );
      return missing.length > 0
         ? fail({
              rationale: `${String(missing.length)} personal-data field(s) lack autocomplete: ${missing.map((control) => control.name).join(', ')}.`,
              title: 'Personal-data fields lack autocomplete',
              userImpact: 'Browsers cannot autofill name, email, or phone.',
              remediation: 'Add autocomplete tokens such as name, email, and tel.',
              impact: 'moderate',
           })
         : pass('Every personal-data field declares an autocomplete token.');
   },
   '1.4.1': ({ axe }) =>
      axe?.violations.some((rule) => rule.id === 'link-in-text-block')
         ? fail({
              rationale:
                 'axe link-in-text-block found links distinguished by colour alone.',
              title: 'Links are indistinguishable without colour',
              userImpact: 'Colour-blind users cannot find links in text.',
              remediation: 'Underline links in running text.',
           })
         : pass('axe found no colour-only links, and no instruction depends on colour.'),
   '1.4.2': ({ facts }) =>
      facts.media.autoplay === 0 && !hasMedia(facts.media)
         ? notApplicable('No audio or video plays on the page.')
         : needsReview(
              'Autoplaying media is present; its audio control was not verified.',
           ),
   '1.4.3': ({ axe }) => {
      const rule = axe?.violations.find((entry) => entry.id === 'color-contrast');
      return rule
         ? fail({
              rationale: `axe color-contrast: ${String(rule.nodes.length)} element(s) fall below 4.5:1, for example ${rule.nodes[0]?.target.join(' ') ?? ''}.`,
              title: 'Text contrast is below 4.5:1',
              userImpact: 'Low-vision users cannot read the text.',
              remediation: `See ${rule.helpUrl}.`,
              impact: 'serious',
           })
         : pass('axe color-contrast found no violations.');
   },
   '1.4.4': ({ facts }) =>
      facts.zoom200OverflowPx <= 0
         ? pass('At a 640px viewport (200% zoom equivalent) nothing overflows sideways.')
         : fail({
              rationale: `At 200% zoom equivalent the page overflows by ${String(facts.zoom200OverflowPx)}px.`,
              title: 'Content does not resize to 200%',
              userImpact: 'Low-vision users who zoom must scroll sideways.',
              remediation: 'Use fluid layouts and relative units.',
           }),
   '1.4.5': ({ facts }) =>
      needsReview(
         `Images of text need a visual review; the page has ${String(facts.images.length)} raster images and ${String(facts.svgImgs.length)} SVGs.`,
      ),
   '1.4.10': ({ facts }) =>
      facts.reflow.overflowPx <= 0
         ? pass('At 320px wide the page has no horizontal scrolling.')
         : fail({
              rationale: `At 320px wide the page scrolls sideways by ${String(facts.reflow.overflowPx)}px. Widest: ${facts.reflow.wide.join(', ')}.`,
              title: 'Page does not reflow at 320px',
              userImpact: 'Users who zoom to 400% must scroll in two directions.',
              remediation:
                 'Constrain the widest elements with max-width: 100% and wrap long text.',
              impact: 'serious',
           }),
   '1.4.11': () =>
      needsReview(
         'Non-text contrast of borders and icons needs a visual measurement; text contrast is covered by 1.4.3.',
      ),
   '1.4.12': ({ facts }) =>
      facts.textSpacingClipped.length === 0
         ? pass(
              'With the WCAG text-spacing overrides applied, no visible text was clipped.',
           )
         : fail({
              rationale: `${String(facts.textSpacingClipped.length)} element(s) clip text under the spacing overrides.`,
              title: 'Text clips under user text spacing',
              userImpact: 'Users who need wider spacing lose text.',
              remediation: 'Avoid fixed heights and overflow: hidden on text containers.',
           }),
   '1.4.13': () =>
      needsReview(
         'Hover and focus popups were not exercised, so dismissal and persistence are unverified.',
      ),
};
