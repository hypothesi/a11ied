export interface CliTargetInputOptions {
   url?: string;
}

export function buildCliTargetInput(
   options: CliTargetInputOptions,
): CliTargetInputOptions {
   const input: CliTargetInputOptions = {};
   if (options.url) {
      input.url = options.url;
   }
   return input;
}
