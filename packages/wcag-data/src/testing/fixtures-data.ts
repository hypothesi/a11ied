export function createAccessibleAuthCriterion(): unknown {
   return {
      id: 'accessible-authentication-minimum',
      num: '3.3.8',
      content:
         '<p>A cognitive function test is not required for any step in an authentication process unless that step provides an alternative.</p>',
      handle: 'Accessible Authentication (Minimum)',
      title: 'Authentication does not force a cognitive function test without an alternative.',
      versions: ['2.2'],
      level: 'AA',
      details: ['Applies to login, sign-up, and password recovery journeys.'],
   };
}

export function createQuickrefTagsYaml(): string {
   return [
      'non-text-content:',
      '  dev: images text-alternatives images',
      '  con: text-alternatives content',
      'focus-visible:',
      '  int: keyboard focus',
      '  vis: focus-indicator',
      'status-messages:',
      '  dev: status-messages notifications status-messages',
      '  int: aria-live',
      '  con: announcements',
      'dragging-movements:',
      '  int: dragging gestures',
      'target-size-minimum:',
      '  int: pointer targets',
      'accessible-authentication-minimum:',
      '  int: authentication login',
   ].join('\n');
}

export function createActMappingPayload(): unknown {
   return {
      'act-rules': [
         {
            title: 'Images have accessible text alternatives',
            permalink: '/standards-guidelines/act/rules/abc111/',
            successCriteria: ['non-text-content'],
            deprecated: false,
            proposed: false,
            frontmatter: {
               id: 'abc111',
               accessibility_requirements: { 'wcag20:1.1.1': {} },
            },
         },
         {
            title: 'Focus indicator is visible',
            permalink: '/standards-guidelines/act/rules/09f0ab/',
            successCriteria: ['focus-visible'],
            deprecated: false,
            proposed: false,
            frontmatter: {
               id: '09f0ab',
               accessibility_requirements: { 'wcag20:2.4.7': {} },
            },
         },
         {
            title: 'Element marks only accessible content',
            permalink: '/standards-guidelines/act/rules/8fc3b6/proposed/',
            successCriteria: ['non-text-content'],
            deprecated: false,
            proposed: true,
            frontmatter: {
               id: '8fc3b6',
               accessibility_requirements: { 'wcag20:1.1.1': {} },
            },
         },
      ],
   };
}
