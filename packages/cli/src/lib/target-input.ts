export interface CliTargetInputOptions {
   url?: string;
   storybookUrl?: string;
   storyId?: string;
}

export function buildCliTargetInput(
   options: CliTargetInputOptions,
): CliTargetInputOptions {
   const input: CliTargetInputOptions = {};
   if (options.url) {
      input.url = options.url;
   }
   if (options.storybookUrl) {
      input.storybookUrl = options.storybookUrl;
   }
   if (options.storyId) {
      input.storyId = options.storyId;
   }
   return input;
}
