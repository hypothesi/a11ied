import type { DriverTableMove } from '@a11ied/contracts';

import { DriverCommandError } from './command-registry.js';
import {
   nvdaKeyCodeStep,
   voiceOverKeyCodeStep,
   type NvdaPortableStep,
   type VoiceOverPortableStep,
} from './portable-steps.js';
import {
   buildCommandOptions,
   pressRealKeys,
   REAL_TARGET_INPUT_TIMEOUT_MS,
   runNvdaStep,
   runVoiceOverStep,
   type RealStepContext,
} from './real-steps.js';
import { waitForSpeechStabilization } from './speech.js';

/** Where each real reader gets its title from, as the CLI reports it. */
const TITLE_SOURCES = {
   voiceover: 'VoiceOver window summary (VO-F2)',
   nvda: 'NVDA window title (NVDA-T)',
} as const;

const NVDA_NOT_FOUND_PHRASE = 'not found';

interface TargetSteps {
   voiceover: VoiceOverPortableStep;
   nvda: NvdaPortableStep;
}

async function runOnTarget(context: RealStepContext, steps: TargetSteps): Promise<void> {
   if (context.target === 'voiceover') {
      await runVoiceOverStep(context, steps.voiceover);
      return;
   }
   await runNvdaStep(context, steps.nvda);
}

async function settledPhrase(context: RealStepContext): Promise<string> {
   await waitForSpeechStabilization(context.reader);
   return context.reader.lastSpokenPhrase().catch(() => '');
}

/** Speaks the window summary (VoiceOver) or the window title (NVDA) and returns it. */
export async function readRealTitle(
   context: RealStepContext,
): Promise<{ title: string; source: string }> {
   await runOnTarget(context, {
      voiceover: voiceOverKeyCodeStep('hearWindowSummary'),
      nvda: nvdaKeyCodeStep('reportTitle'),
   });
   return { title: await settledPhrase(context), source: TITLE_SOURCES[context.target] };
}

/**
 * Opens the reader's find field, types the text, and confirms. The result is judged from
 * the phrase: it names the text when the cursor landed on it, and NVDA says "not found"
 * when it did not.
 */
export async function findRealText(
   context: RealStepContext,
   text: string,
): Promise<{ found: boolean }> {
   await runOnTarget(context, {
      voiceover: voiceOverKeyCodeStep('findText'),
      nvda: nvdaKeyCodeStep('find'),
   });
   await waitForSpeechStabilization(context.reader);
   await context.reader.type(
      text,
      buildCommandOptions(REAL_TARGET_INPUT_TIMEOUT_MS, context.options),
   );
   await pressRealKeys(context, ['Enter']);
   const phrase = await settledPhrase(context);
   const lowered = phrase.toLowerCase();
   const found =
      lowered.includes(text.toLowerCase()) && !lowered.includes(NVDA_NOT_FOUND_PHRASE);
   return { found };
}

const VOICEOVER_TABLE_STEPS: Partial<Record<DriverTableMove, VoiceOverPortableStep>> = {
   'next-cell': voiceOverKeyCodeStep('moveToNext'),
   'previous-cell': voiceOverKeyCodeStep('moveToPrevious'),
   'next-column': voiceOverKeyCodeStep('moveToNext'),
   'previous-column': voiceOverKeyCodeStep('moveToPrevious'),
   'next-row': voiceOverKeyCodeStep('moveDown'),
   'previous-row': voiceOverKeyCodeStep('moveUp'),
   'column-header': voiceOverKeyCodeStep('readTableColumnHeader'),
};

const NVDA_TABLE_STEPS: Partial<Record<DriverTableMove, NvdaPortableStep>> = {
   'next-cell': nvdaKeyCodeStep('moveToNextColumn'),
   'previous-cell': nvdaKeyCodeStep('moveToPreviousColumn'),
   'next-column': nvdaKeyCodeStep('moveToNextColumn'),
   'previous-column': nvdaKeyCodeStep('moveToPreviousColumn'),
   'next-row': nvdaKeyCodeStep('moveToNextRow'),
   'previous-row': nvdaKeyCodeStep('moveToPreviousRow'),
};

const UNSUPPORTED_TABLE_MOVES: Record<'voiceover' | 'nvda', string> = {
   voiceover:
      'VoiceOver has no key that reads the row header on its own. VO-R (sr do read-table-row) reads the whole row.',
   nvda: 'NVDA has no separate header command. It speaks the column and row headers as the cursor enters a cell.',
};

/** Runs the table key for one move; false when the target has no key for it. */
async function runTableStep(
   context: RealStepContext,
   move: DriverTableMove,
): Promise<boolean> {
   if (context.target === 'voiceover') {
      const step = VOICEOVER_TABLE_STEPS[move];
      if (!step) {
         return false;
      }
      await runVoiceOverStep(context, step);
      return true;
   }
   const step = NVDA_TABLE_STEPS[move];
   if (!step) {
      return false;
   }
   await runNvdaStep(context, step);
   return true;
}

/**
 * Moves inside the table the cursor is in, using VO-arrows on VoiceOver and Control-Alt
 * arrows on NVDA. Header reads run the reader's key where one exists.
 */
export async function moveInRealTable(
   context: RealStepContext,
   move: DriverTableMove,
): Promise<{ header?: string }> {
   const ran = await runTableStep(context, move);
   if (!ran) {
      throw new DriverCommandError(
         'driver-table-move-unsupported',
         `${move} is not available on ${context.target}. ${UNSUPPORTED_TABLE_MOVES[context.target]}`,
         { target: context.target, move },
      );
   }
   if (move === 'column-header') {
      return { header: await settledPhrase(context) };
   }
   return {};
}
