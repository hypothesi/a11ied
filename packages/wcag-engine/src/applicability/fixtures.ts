import { applicabilityInputSchema, type ApplicabilityInput } from '@a11ied/contracts';

const fixtures = {
   'basic-page.html': {
      target: {
         kind: 'url',
         value: 'https://example.test/basic-page',
      },
      signals: [
         {
            category: 'landmark',
            source: 'dom',
            value: 'main landmark',
            confidence: 'high',
         },
         {
            category: 'heading',
            source: 'dom',
            value: 'single article heading',
            confidence: 'high',
         },
      ],
      metadata: {
         fixture: 'basic-page',
      },
      userHints: [],
   },
   'status-message.html': {
      target: {
         kind: 'url',
         value: 'https://example.test/status-message',
      },
      signals: [
         {
            category: 'live-region',
            source: 'dom',
            value: 'aria-live=polite',
            confidence: 'high',
         },
         {
            category: 'live-region',
            source: 'a11y-tree',
            value: 'role=status',
            confidence: 'high',
         },
         {
            category: 'form',
            source: 'dom',
            value: 'save form with confirmation toast',
            confidence: 'medium',
         },
      ],
      metadata: {
         fixture: 'status-message',
      },
      userHints: ['status update after submit'],
   },
   'auth-login.html': {
      target: {
         kind: 'url',
         value: 'https://example.test/auth-login',
      },
      signals: [
         {
            category: 'auth',
            source: 'dom',
            value: 'login form with password field',
            confidence: 'high',
         },
         {
            category: 'form',
            source: 'dom',
            value: 'sign in form',
            confidence: 'high',
         },
      ],
      metadata: {
         fixture: 'auth-login',
      },
      userHints: ['authentication flow'],
   },
   'dialog.html': {
      target: {
         kind: 'url',
         value: 'https://example.test/dialog',
      },
      signals: [
         {
            category: 'dialog',
            source: 'dom',
            value: 'role=dialog',
            confidence: 'high',
         },
         {
            category: 'overlay',
            source: 'dom',
            value: 'fixed modal overlay',
            confidence: 'high',
         },
         {
            category: 'form',
            source: 'dom',
            value: 'dialog confirmation form',
            confidence: 'medium',
         },
      ],
      metadata: {
         fixture: 'dialog',
      },
      userHints: ['modal workflow'],
   },
   'custom-widget.html': {
      target: {
         kind: 'url',
         value: 'https://example.test/custom-widget',
      },
      signals: [
         {
            category: 'widget',
            source: 'dom',
            value: 'focusable custom widget with tabindex=0',
            confidence: 'medium',
         },
      ],
      metadata: {
         fixture: 'custom-widget',
      },
      userHints: [],
   },
} satisfies Record<string, ApplicabilityInput>;

export const applicabilityFixtures = Object.fromEntries(
   Object.entries(fixtures).map(([name, input]) => [
      name,
      applicabilityInputSchema.parse(input),
   ]),
) as Record<keyof typeof fixtures, ApplicabilityInput>;

export function getApplicabilityFixture(name: keyof typeof fixtures): ApplicabilityInput {
   return applicabilityFixtures[name];
}
