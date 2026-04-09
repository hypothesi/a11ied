export interface StoryScenarioRecipe {
   storyId: string;
   steps: string[];
}

/** Builds the default operator recipe for exercising one Storybook story. */
export function createStoryRecipe(storyId: string): StoryScenarioRecipe {
   return {
      storyId,
      steps: [
         'Start the local Storybook dev server.',
         'Load the story iframe and wait for the canvas to settle.',
         'Attach the virtual screen reader for fast feedback.',
         'Escalate to VoiceOver or NVDA for final confidence.',
      ],
   };
}
