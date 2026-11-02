import {
   fail,
   getFirstPass,
   getTabStops,
   needsReview,
   notApplicable,
   pass,
   type Probe,
} from './probe-types.js';

const BACKWARD_JUMP_PX = 200;
const FAST_FLASH_MS = 333;
const GENERIC_LINK = /^(click here|here|read more|more|learn more|link|this)$/i;
const LABEL_PREFIX = 20;
const LIST_COUNT = 3;
const LONG_ANIMATION_MS = 5000;
const MIN_WAYS = 2;
const PREVIEW_COUNT = 2;
const MIN_BACKWARD_JUMPS = 2;

function visibleStops(
   facts: Parameters<Probe>[0]['facts'],
): ReturnType<typeof getTabStops> {
   return getTabStops(facts).filter((stop) => !stop.hiddenFocus);
}

export const operableProbes: Record<string, Probe> = {
   '2.1.1': ({ facts }) =>
      facts.clickOnNonInteractive.length > 0
         ? fail({
              rationale: `Click handlers sit on non-focusable elements: ${facts.clickOnNonInteractive.slice(0, PREVIEW_COUNT).join(' | ')}.`,
              title: 'Controls work only with a mouse',
              userImpact: 'Keyboard users cannot activate them.',
              remediation: 'Use buttons, or add a role, tabindex, and key handlers.',
           })
         : pass(
              `All ${String(getTabStops(facts).length)} tab stops are native or focusable, and no click handler sits on a non-focusable element.`,
           ),
   '2.1.2': ({ facts }) =>
      facts.trapSuspected
         ? fail({
              rationale: 'Focus never left a small set of elements.',
              title: 'Keyboard trap',
              userImpact: 'Keyboard users get stuck.',
              remediation: 'Let Tab and Escape leave the component.',
           })
         : pass(
              `Tabbing moved through ${String(getTabStops(facts).length)} stops and never stalled.`,
           ),
   '2.1.4': ({ facts }) =>
      [
         ...facts.listeners.window,
         ...facts.listeners.document,
         ...facts.listeners.body,
      ].some((type) => type === 'keydown' || type === 'keypress')
         ? needsReview(
              'A key handler is registered on window or document; whether it implements single-character shortcuts was not verified.',
           )
         : pass(
              'No document-level key handlers exist, so no single-character shortcuts do.',
           ),
   '2.2.1': ({ facts }) =>
      facts.metaRefresh
         ? fail({
              rationale: 'The page uses meta refresh.',
              title: 'Automatic page refresh',
              userImpact: 'Users lose their place.',
              remediation: 'Remove the refresh.',
           })
         : notApplicable(
              'No meta refresh, session timeout, or timed content was observed.',
           ),
   '2.2.2': ({ facts }) => {
      const moving = facts.runningAnimations.filter(
         (animation) =>
            animation.iter === null || (animation.dur ?? 0) > LONG_ANIMATION_MS,
      );
      return moving.length > 0
         ? fail({
              rationale: `${String(moving.length)} CSS animation(s) (${[...new Set(moving.map((animation) => animation.name))].join(', ')}) run continuously with no pause control.`,
              title: 'Moving decoration cannot be paused',
              userImpact:
                 'Users with attention or vestibular needs cannot stop the movement.',
              remediation:
                 'Add a pause control, or drop infinite loops and honour prefers-reduced-motion.',
              impact: 'moderate',
           })
         : pass('No animation runs for longer than five seconds.');
   },
   '2.3.1': ({ facts }) =>
      facts.runningAnimations.some(
         (animation) =>
            (animation.dur ?? FAST_FLASH_MS) < FAST_FLASH_MS && animation.iter === null,
      )
         ? needsReview(
              'A looping animation cycles faster than 333ms; the flash area was not measured.',
           )
         : pass('No animation cycles more than three times per second.'),
   '2.4.1': ({ facts }) => {
      if (facts.skipLink) {
         return pass(`A skip link ("${facts.skipLink}") is the first tab stop.`);
      }
      return facts.landmarks.main > 0 && facts.headings.length > 0
         ? pass(
              'There is no skip link, but a main landmark and headings let users bypass blocks.',
           )
         : fail({
              rationale: 'There is no skip link and no main landmark.',
              title: 'No way to skip repeated navigation',
              userImpact: 'Keyboard users tab through the whole header on every page.',
              remediation:
                 'Add a skip link to a <main id> target and wrap content in <main>.',
              impact: 'moderate',
           });
   },
   '2.4.2': ({ facts }) =>
      facts.title.trim()
         ? pass(`Title: "${facts.title}".`)
         : fail({
              rationale: 'The title is empty.',
              title: 'Page has no title',
              userImpact: 'Users cannot identify the page.',
              remediation: 'Add a descriptive <title>.',
           }),
   '2.4.3': ({ facts }) => {
      const stops = getFirstPass(facts);
      const backwards = stops.filter(
         (stop, index) =>
            index > 0 && stop.top + BACKWARD_JUMP_PX < (stops[index - 1]?.top ?? 0),
      );
      return backwards.length >= MIN_BACKWARD_JUMPS
         ? needsReview(
              `Focus jumps upward ${String(backwards.length)} times; the order needs review.`,
           )
         : pass(
              `${String(stops.length)} visible tab stops follow a top-to-bottom, left-to-right order.`,
           );
   },
   '2.4.4': ({ facts }) => {
      const vague = facts.links.filter(
         (link) => !link.name || GENERIC_LINK.test(link.name),
      );
      return vague.length > 0
         ? fail({
              rationale: `${String(vague.length)} link(s) have no descriptive name: ${vague
                 .map((link) => link.href)
                 .slice(0, LIST_COUNT)
                 .join(', ')}.`,
              title: 'Links lack a descriptive name',
              userImpact: 'Link lists become meaningless.',
              remediation: 'Describe the destination in the link text.',
           })
         : pass(
              `All ${String(facts.links.length)} links have a descriptive accessible name.`,
           );
   },
   '2.4.5': ({ facts, site }) => {
      const ways = [
         facts.navLinks.length > 0 && 'navigation',
         site.hasSitemap && 'an XML sitemap',
      ].filter(Boolean);
      return ways.length >= MIN_WAYS
         ? pass(`Pages are reachable through ${ways.join(' and ')}.`)
         : fail({
              rationale: `Only ${ways.join(', ') || 'no way'} to locate pages: no search or HTML site map.`,
              title: 'Only one way to find pages',
              userImpact: 'Users cannot search or browse a site map.',
              remediation: 'Add a search field or an HTML site map page.',
           });
   },
   '2.4.6': ({ facts }) =>
      facts.headings.some((heading) => !heading.text)
         ? fail({
              rationale: 'An empty heading is present.',
              title: 'Empty heading',
              userImpact: 'Screen reader users hit a blank heading.',
              remediation: 'Remove it or add text.',
           })
         : pass(`All ${String(facts.headings.length)} headings contain text.`),
   '2.4.7': ({ facts }) => {
      const hidden = [
         ...new Set(
            getTabStops(facts)
               .filter((stop) => stop.hiddenFocus)
               .map((stop) => stop.label.split('\n')[0] ?? ''),
         ),
      ];
      if (hidden.length > 0) {
         return fail({
            rationale: `Keyboard focus lands on ${String(hidden.length)} link(s) inside a zero-height collapsed container: ${hidden.join(', ')}.`,
            title: 'Focus moves to invisible menu links',
            userImpact:
               'Keyboard users tab onto links they cannot see before the menu is opened.',
            remediation:
               'Hide the collapsed drawer from the tab order with inert, hidden, or visibility: hidden until it is expanded.',
            impact: 'serious',
         });
      }
      return facts.noIndicator.length > 0
         ? fail({
              rationale: `${String(facts.noIndicator.length)} tab stop(s) show no visible focus change: ${facts.noIndicator.slice(0, LIST_COUNT).join(', ')}.`,
              title: 'Focus is not visible on some controls',
              userImpact: 'Keyboard users lose their place.',
              remediation: 'Add a :focus-visible outline.',
              impact: 'serious',
           })
         : pass(
              `All ${String(getTabStops(facts).length)} tab stops show a focus indicator.`,
           );
   },
   '2.4.11': ({ facts }) => {
      const covered = visibleStops(facts).filter((stop) => stop.obscured && stop.inView);
      return covered.length > 0
         ? fail({
              rationale: `${String(covered.length)} focused control(s) are covered by other content: ${covered
                 .map((stop) => stop.id.split('\n')[0])
                 .slice(0, LIST_COUNT)
                 .join(', ')}.`,
              title: 'Focused control is hidden behind other content',
              userImpact: 'Users cannot see what has focus.',
              remediation: 'Remove overlapping fixed elements or add scroll padding.',
              impact: 'serious',
           })
         : pass('Every visible focused element was the topmost element at its centre.');
   },
   '2.5.1': ({ facts }) =>
      facts.sliders.length > 0
         ? needsReview(`Possible gesture widgets: ${facts.sliders.join(', ')}.`)
         : notApplicable(
              'No sliders, carousels, or maps need a path or multipoint gesture.',
           ),
   '2.5.2': ({ facts }) =>
      facts.downHandlers.length > 0
         ? needsReview(
              `Down-event handlers on ${facts.downHandlers
                 .map((handler) => handler.html)
                 .slice(0, PREVIEW_COUNT)
                 .join(' | ')}; cancellation was not verified.`,
           )
         : pass(
              'No mousedown, pointerdown, or touchstart handlers exist, so activation fires on release.',
           ),
   '2.5.3': ({ facts }) => {
      const mismatched = facts.links.filter(
         (link) =>
            link.text &&
            link.name &&
            !link.name
               .toLowerCase()
               .includes(link.text.toLowerCase().slice(0, LABEL_PREFIX)),
      );
      return mismatched.length > 0
         ? fail({
              rationale: `${String(mismatched.length)} control(s) have a name that omits their visible text.`,
              title: 'Accessible name omits the visible label',
              userImpact: 'Voice users cannot activate the control by its visible text.',
              remediation: 'Include the visible text in the accessible name.',
           })
         : pass('Every link name contains its visible text.');
   },
   '2.5.4': ({ facts }) =>
      facts.instrumented.motionListeners.length === 0
         ? notApplicable(
              'No devicemotion or deviceorientation handler was registered, including after a DevTools sensor override.',
           )
         : needsReview(
              `Motion handlers registered: ${facts.instrumented.motionListeners.join(', ')}.`,
           ),
   '2.5.7': ({ facts }) =>
      facts.sliders.length > 0
         ? needsReview(
              `Possible draggable widgets: ${facts.sliders.join(', ')}; a single-pointer alternative was not verified.`,
           )
         : notApplicable('No dragging interaction was found.'),
   '2.5.8': ({ facts }) => {
      const crowded = facts.smallTargets.filter((target) => target.crowded);
      return crowded.length > 0
         ? fail({
              rationale: `${String(crowded.length)} target(s) are under 24px with neighbours inside their 24px circle: ${crowded[0]?.html ?? ''}.`,
              title: 'Touch target is too small',
              userImpact: 'Users with tremors mis-tap.',
              remediation: 'Increase the target size or spacing.',
              impact: 'moderate',
           })
         : pass(
              `${String(facts.smallTargets.length)} target(s) are under 24px, all with enough spacing.`,
           );
   },
};
