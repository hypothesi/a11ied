import {
   applicabilitySignalCategorySchema,
   applicabilityStateSchema,
   wcagVersionSchema,
   type ApplicabilitySignalCategory,
   type ApplicabilityState,
   type NormalizedCriterion,
   type WcagLevel,
   type WcagVersion,
   type coverageArtifactSchema,
   type strategyArtifactSchema,
} from '@a11lied/contracts';

export const supportedVersions = wcagVersionSchema.options;

export const supportedApplicabilityStates = [
   ...applicabilityStateSchema.options,
] as readonly ApplicabilityState[];

export const supportedApplicabilitySignalCategories = [
   ...applicabilitySignalCategorySchema.options,
] as readonly ApplicabilitySignalCategory[];

export type SearchableField = keyof typeof searchableFieldWeights;

export const searchableFieldWeights = {
   title: 8,
   summary: 6,
   normativeText: 4,
   details: 3,
   technique: 5,
   failure: 5,
   tag: 4,
   guideline: 2,
   principle: 2,
} as const;

export interface EngineArtifacts {
   criteria: Record<string, NormalizedCriterion>;
   criteriaByLevel: Record<WcagLevel, string[]>;
   coverage: ReturnType<typeof coverageArtifactSchema.parse>['coverage'];
   strategies: ReturnType<typeof strategyArtifactSchema.parse>['strategies'];
   slugToId: Record<string, string>;
}

export const artifactsCache = new Map<WcagVersion, EngineArtifacts>();

export const applicabilitySignalTagHints: Record<ApplicabilitySignalCategory, string[]> =
   {
      auth: ['forms', 'logins'],
      dialog: ['modals', 'focus', 'keyboard', 'structure'],
      'drag-and-drop': ['controls', 'events', 'interaction', 'keyboard'],
      form: ['forms', 'controls', 'labels', 'errors', 'auto-complete'],
      heading: ['headings', 'structure', 'content'],
      help: ['forms', 'content', 'text'],
      landmark: ['navigation', 'regions', 'structure', 'layout', 'headings'],
      'live-region': [
         'messaging',
         'errors',
         'forms',
         'progress-steps',
         'visual-cues',
         'content',
      ],
      media: [
         'audio',
         'video',
         'captions',
         'moving-content',
         'streaming',
         'text-alternatives',
      ],
      menu: ['menus', 'navigation', 'focus', 'keyboard'],
      overlay: [
         'fixed',
         'sticky',
         'positioning',
         'focus',
         'keyboard',
         'menus',
         'navigation',
         'modals',
      ],
      'repeated-form': ['forms', 'progress-steps'],
      tablist: ['controls', 'focus', 'keyboard', 'structure'],
      validation: ['errors', 'forms', 'labels', 'messaging'],
      widget: ['controls', 'focus', 'keyboard', 'structure', 'buttons', 'links'],
   };

export const strongApplicabilityCategories = new Set<ApplicabilitySignalCategory>([
   'auth',
   'dialog',
   'drag-and-drop',
   'live-region',
   'media',
   'overlay',
]);

export const interactiveFallbackTags = new Set([
   'buttons',
   'controls',
   'focus',
   'forms',
   'keyboard',
   'links',
   'menus',
   'modals',
   'navigation',
   'structure',
   'tab-order',
]);

export const directCriterionCategoryHints: Partial<
   Record<string, ApplicabilitySignalCategory[]>
> = {
   '1.2.1': ['media'],
   '1.2.2': ['media'],
   '1.2.3': ['media'],
   '1.2.5': ['media'],
   '2.1.1': ['widget', 'dialog', 'drag-and-drop', 'form', 'menu', 'tablist', 'media'],
   '2.1.2': ['widget', 'dialog', 'drag-and-drop', 'form', 'menu', 'tablist', 'media'],
   '2.4.3': ['dialog', 'menu', 'tablist', 'overlay', 'form', 'widget'],
   '2.4.11': ['overlay', 'dialog', 'menu'],
   '2.4.12': ['overlay', 'dialog', 'menu'],
   '3.3.8': ['auth'],
   '4.1.2': ['widget', 'dialog', 'menu', 'form'],
   '4.1.3': ['live-region', 'validation', 'form'],
};

export const categoryReasonLabels: Record<ApplicabilitySignalCategory, string> = {
   auth: 'authentication-flow',
   dialog: 'dialog structure',
   'drag-and-drop': 'drag-and-drop',
   form: 'form',
   heading: 'heading',
   help: 'help',
   landmark: 'landmark',
   'live-region': 'live region',
   media: 'media',
   menu: 'menu',
   overlay: 'fixed or overlay',
   'repeated-form': 'repeated-form',
   tablist: 'tablist',
   validation: 'validation',
   widget: 'custom widget',
};
