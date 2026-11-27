import { confirm, isCancel, multiselect } from '@clack/prompts';
import { CliUsageError } from '#core';

export interface ChoiceOption {
   readonly value: string;
   readonly label: string;
   readonly hint?: string;
}

/** Prompts need a person at a terminal. JSON output and pipes never prompt. */
export function canPrompt(isJSON: boolean | undefined): boolean {
   return !isJSON && process.stdin.isTTY && process.stdout.isTTY;
}

function createCancelledError(): CliUsageError {
   return new CliUsageError('prompt-cancelled', 'Cancelled. Nothing else was changed.');
}

export async function askYesNo(message: string, initialValue = true): Promise<boolean> {
   const answer = await confirm({ message, initialValue });

   if (isCancel(answer)) {
      throw createCancelledError();
   }

   return answer;
}

/** Every option starts checked. */
export async function askToChoose(
   message: string,
   options: readonly ChoiceOption[],
): Promise<string[]> {
   const answer = await multiselect<string>({
      message,
      options: options.map((option) =>
         option.hint === undefined
            ? { value: option.value, label: option.label }
            : { value: option.value, label: option.label, hint: option.hint },
      ),
      initialValues: options.map((option) => option.value),
      required: false,
   });

   if (isCancel(answer)) {
      throw createCancelledError();
   }

   return answer;
}
