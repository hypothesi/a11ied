import { describe, expect, it } from 'vitest';

import { createStoryRecipe } from './index.js';

describe('storybook scaffolding', () => {
   it('builds a recipe that starts with local Storybook', () => {
      const recipe = createStoryRecipe('button--primary');

      expect(recipe.storyId).toBe('button--primary');
      expect(recipe.steps[0]).toContain('Storybook');
   });
});
