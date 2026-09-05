export { createQuickrefTagsYaml, createActMappingPayload } from './fixtures-data.js';
import { createAccessibleAuthCriterion } from './fixtures-data.js';

const ACCESSIBLE_AUTH_INDEX = 2;

function createTextAlternativeCriterion(): unknown {
   return {
      id: 'non-text-content',
      num: '1.1.1',
      content:
         '<p>All non-text content that is presented to the user has a text alternative.</p>',
      handle: 'Non-text Content',
      title: 'Text alternatives are available for non-text content.',
      versions: ['2.1', '2.2'],
      level: 'A',
      details: ['Applies to images, icons, and graphical buttons.'],
      techniques: {
         sufficient: [
            {
               title: 'Text alternatives',
               note: 'Prefer direct equivalent text.',
               techniques: [
                  {
                     id: 'G94',
                     title: 'Providing short text alternatives for non-text content',
                     technology: 'HTML',
                  },
               ],
            },
         ],
         failure: [
            {
               id: 'F65',
               title: 'Failure due to omitting alt text on informative images',
               technology: 'HTML',
            },
         ],
      },
   };
}

/**
 * Reproduces the WCAG 2.4.1 shape: a `sufficient` entry placed directly at the top level
 * (title + suffix + `using`), with no `{title, techniques}` wrapper. A normalizer that
 * only reads `group.techniques` drops every id under an entry shaped like this.
 */
function createBypassBlocksCriterion(): unknown {
   return {
      id: 'bypass-blocks',
      num: '2.4.1',
      content:
         '<p>A mechanism is available to bypass blocks of content that are repeated on multiple web pages.</p>',
      handle: 'Bypass Blocks',
      title: 'A mechanism is available to bypass blocks of content that are repeated on multiple web pages.',
      versions: ['2.1', '2.2'],
      level: 'A',
      details: [],
      techniques: {
         sufficient: [
            {
               title: 'Creating links to skip blocks of repeated material',
               suffix: 'using one of the following techniques:',
               using: [
                  {
                     id: 'G1',
                     technology: 'general',
                     title: 'Adding a link at the top of each page that goes directly to the main content area',
                  },
                  {
                     id: 'G123',
                     technology: 'general',
                     title: 'Adding a link at the beginning of a block of repeated content to go to the end of the block',
                  },
               ],
            },
         ],
         advisory: [
            {
               id: 'C6',
               technology: 'css',
               title: 'Positioning content based on structural markup',
            },
         ],
      },
   };
}

function createFocusVisibleCriterion(): unknown {
   return {
      id: 'focus-visible',
      num: '2.4.7',
      content:
         '<p>Any keyboard operable user interface has a mode of operation where the keyboard focus indicator is visible.</p>',
      handle: 'Focus Visible',
      title: 'Keyboard focus is visible.',
      versions: ['2.1', '2.2'],
      level: 'AA',
      details: ['Relevant when focus moves through controls and interactive widgets.'],
      techniques: {
         sufficient: [
            {
               title: 'Visible focus cues',
               techniques: [
                  {
                     id: 'G195',
                     title: 'Using an author-supplied visible focus indicator',
                     technology: 'CSS',
                  },
               ],
            },
         ],
      },
   };
}

function createStatusMessagesTechniques(): unknown {
   return {
      sufficient: [
         {
            title: 'ARIA status techniques',
            note: 'Use live regions that match the announcement semantics.',
            techniques: [
               {
                  id: 'ARIA22',
                  title: 'Using role=status to present status messages',
                  technology: 'ARIA',
                  using: [
                     {
                        title: 'Set an aria-live polite region before the message appears',
                        technology: 'ARIA',
                     },
                  ],
               },
            ],
         },
      ],
      advisory: [
         {
            title: 'Announcement hygiene',
            techniques: [
               {
                  title: 'Keep repeated status messages concise',
                  suffix: 'Authoring advice',
               },
            ],
         },
      ],
      failure: [
         {
            id: 'F104',
            title: 'Failure due to changing content without programmatic notification',
            technology: 'ARIA',
         },
      ],
   };
}

function createStatusMessagesCriterion(): unknown {
   return {
      id: 'status-messages',
      num: '4.1.3',
      alt_id: ['status-message'],
      content:
         '<p>In content implemented using markup languages, status messages can be programmatically determined through role or properties.</p>',
      handle: 'Status Messages',
      title: 'Status messages are exposed without moving focus.',
      versions: ['2.1', '2.2'],
      level: 'AA',
      details: [
         'Relevant to toast notifications, inline validation, and async loading notices.',
      ],
      techniques: createStatusMessagesTechniques(),
   };
}

function createDraggingMovementsCriterion(): unknown {
   return {
      id: 'dragging-movements',
      num: '2.5.7',
      content:
         '<p>All functionality that uses a dragging movement can be operated by a single pointer.</p>',
      handle: 'Dragging Movements',
      title: 'Dragging interactions have a non-drag alternative.',
      versions: ['2.2'],
      level: 'AA',
      details: ['Applies to sliders, sortable lists, and map interactions.'],
      techniques: {
         sufficient: [
            {
               title: 'Alternative pointer actions',
               techniques: [
                  {
                     id: 'G219',
                     title: 'Provide a single-pointer alternative to dragging',
                     technology: 'General',
                  },
               ],
            },
         ],
      },
   };
}

function createTargetSizeCriterion(): unknown {
   return {
      id: 'target-size-minimum',
      num: '2.5.8',
      content:
         '<p>The size of the target for pointer inputs is at least 24 by 24 CSS pixels.</p>',
      handle: 'Target Size (Minimum)',
      title: 'Pointer targets meet the minimum size threshold.',
      versions: ['2.2'],
      level: 'AA',
      details: ['Applies to small touch targets and densely packed action bars.'],
   };
}

function createWcag22OnlyCriteria(): unknown[] {
   return [
      createDraggingMovementsCriterion(),
      createTargetSizeCriterion(),
      createAccessibleAuthCriterion(),
   ];
}

function getVersionOnlyCriteria(version: '2.1' | '2.2'): unknown[] {
   if (version === '2.2') {
      return createWcag22OnlyCriteria();
   }
   return [];
}

function getUnderstandableGuidelines(
   version: '2.1' | '2.2',
   versionOnlyCriteria: unknown[],
): unknown[] {
   if (version === '2.2') {
      return [
         {
            id: 'guideline3-3',
            num: '3.3',
            handle: 'Input Assistance',
            title: 'Help users avoid and correct mistakes.',
            successcriteria: [versionOnlyCriteria[ACCESSIBLE_AUTH_INDEX]],
         },
      ];
   }
   return [];
}

function buildPerceivablePrinciple(): unknown {
   return {
      id: 'principle1',
      num: '1',
      handle: 'Perceivable',
      title: 'Perceivable',
      guidelines: [
         {
            id: 'guideline1-1',
            num: '1.1',
            handle: 'Text Alternatives',
            title: 'Provide text alternatives.',
            successcriteria: [createTextAlternativeCriterion()],
         },
      ],
   };
}

function buildOperablePrinciple(versionOnlyCriteria: unknown[]): unknown {
   return {
      id: 'principle2',
      num: '2',
      handle: 'Operable',
      title: 'Operable',
      guidelines: [
         {
            id: 'guideline2-5',
            num: '2.4',
            handle: 'Navigable',
            title: 'Help users navigate and find content.',
            successcriteria: [
               createBypassBlocksCriterion(),
               createFocusVisibleCriterion(),
            ],
         },
         {
            id: 'guideline2-5',
            num: '2.5',
            handle: 'Input Modalities',
            title: 'Make input easy to operate.',
            successcriteria: versionOnlyCriteria,
         },
      ],
   };
}

function buildRobustPrinciple(): unknown {
   return {
      id: 'principle4',
      num: '4',
      handle: 'Robust',
      title: 'Robust',
      guidelines: [
         {
            id: 'guideline4-1',
            num: '4.1',
            handle: 'Compatible',
            title: 'Maximize compatibility with user agents and assistive technologies.',
            successcriteria: [createStatusMessagesCriterion()],
         },
      ],
   };
}

export function createWcagPayload(version: '2.1' | '2.2'): unknown {
   const versionOnlyCriteria = getVersionOnlyCriteria(version);
   const understandableGuidelines = getUnderstandableGuidelines(
      version,
      versionOnlyCriteria,
   );

   return {
      principles: [
         buildPerceivablePrinciple(),
         buildOperablePrinciple(versionOnlyCriteria),
         {
            id: 'principle3',
            num: '3',
            handle: 'Understandable',
            title: 'Understandable',
            guidelines: understandableGuidelines,
         },
         buildRobustPrinciple(),
      ],
      terms: {},
   };
}
