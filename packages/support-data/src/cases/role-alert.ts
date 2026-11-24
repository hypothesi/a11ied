import type { ScreenReaderTestCase } from '../types.js';

const ARIA_ALERT_REF = {
   title: 'WAI-ARIA 1.2: alert (role)',
   url: 'https://www.w3.org/TR/wai-aria-1.2/#alert',
   section: '5.3.2 Live Region Roles - alert',
} as const;

const APG_ALERT_REF = {
   title: 'ARIA Authoring Practices Guide: Alert Pattern',
   url: 'https://www.w3.org/WAI/ARIA/apg/patterns/alert/',
   section: 'Alert Example',
} as const;

export const roleAlertCases: readonly ScreenReaderTestCase[] = [
   {
      slug: 'role-alert-dynamic',
      title: 'role="alert": Announces dynamically triggered alert message',
      isolatedTitle: 'role alert dynamic test',
      category: 'aria',
      featureGroup: 'Live Regions',
      attribute: 'alert',
      tags: ['alert', 'role', 'live-region', 'dynamic', 'aria-at'],
      summary:
         'Tests whether triggering content inside a role="alert" container announces the alert message promptly without moving focus.',
      expectedBehavior:
         'Initially the "Trigger alert" button announces as a button; after activation, the screen reader MUST convey the alert text "Hello" and MAY convey the "alert" role.',
      specReferences: [ARIA_ALERT_REF, APG_ALERT_REF],
      html: `<button type="button" id="trigger-alert">Trigger alert</button>
<div id="alert-region" role="alert"></div>`,
      js: `const triggerBtn = document.getElementById('trigger-alert');
const alertRegion = document.getElementById('alert-region');
triggerBtn?.addEventListener('click', () => {
   if (alertRegion) {
      alertRegion.textContent = 'Hello';
   }
});`,
      evaluation: {
         mode: 'interact',
         targetRoleHint: 'button',
         activateButtonText: 'Trigger alert',
         preActionExpectedPhrases: ['Trigger alert'],
         expectedPhrases: ['Hello'],
      },
      assertions: [
         {
            id: 'alert-pre-button',
            priority: 'MUST',
            statement: 'Convey initial control label "Trigger alert" before activation',
            featureRef: 'button',
            rule: {
               kind: 'convey-phrase',
               phrase: 'Trigger alert',
               scope: 'pre-action',
            },
         },
         {
            id: 'alert-post-text',
            priority: 'MUST',
            statement: 'Convey alert text "Hello" after activating the trigger button',
            featureRef: 'alert',
            rule: {
               kind: 'convey-phrase',
               phrase: 'Hello',
               scope: 'post-action',
            },
         },
         {
            id: 'alert-post-role',
            priority: 'MAY',
            statement: 'Convey role "alert" when the alert region updates',
            featureRef: 'alert',
            rule: {
               kind: 'convey-phrase',
               phrase: 'alert',
               scope: 'post-action',
            },
         },
         {
            id: 'alert-no-side-effects',
            priority: 'MUST',
            statement: 'Cause no severe negative side effects',
            featureRef: 'alert',
            rule: {
               kind: 'no-side-effects',
            },
         },
      ],
   },
];
