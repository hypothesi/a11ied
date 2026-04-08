import {
   applicabilityInputSchema,
   type ApplicabilityInput,
   type ApplicabilitySignal,
} from '@a11lied/contracts';

interface AddSignalParams {
   category: ApplicabilitySignal['category'];
   source: ApplicabilitySignal['source'];
   value: string;
   confidence: ApplicabilitySignal['confidence'];
}

function hasMatch(value: string, pattern: RegExp): boolean {
   return pattern.test(value);
}

function addSignal(signals: ApplicabilitySignal[], params: AddSignalParams): void {
   signals.push({
      category: params.category,
      source: params.source,
      value: params.value,
      confidence: params.confidence,
   });
}

function detectStructuralSignals(html: string, signals: ApplicabilitySignal[]): void {
   if (
      hasMatch(html, /<(main|nav|header|footer|aside)\b/i) ||
      hasMatch(html, /role=["'](?:main|navigation|banner|contentinfo|complementary)["']/i)
   ) {
      addSignal(signals, {
         category: 'landmark',
         source: 'dom',
         value: 'landmark structure',
         confidence: 'high',
      });
   }

   if (hasMatch(html, /<h[1-6]\b/i) || hasMatch(html, /role=["']heading["']/i)) {
      addSignal(signals, {
         category: 'heading',
         source: 'dom',
         value: 'heading structure',
         confidence: 'high',
      });
   }

   if (hasMatch(html, /<form\b/i) || hasMatch(html, /<(input|select|textarea)\b/i)) {
      addSignal(signals, {
         category: 'form',
         source: 'dom',
         value: 'form controls',
         confidence: 'high',
      });
   }
}

function detectAuthAndLiveRegionSignals(
   html: string,
   signals: ApplicabilitySignal[],
): void {
   if (
      hasMatch(html, /type=["']password["']/i) ||
      hasMatch(
         html,
         /autocomplete=["'](?:current-password|new-password|username)["']/i,
      ) ||
      hasMatch(html, /\b(log in|login|sign in|password recovery|two-factor|otp)\b/i)
   ) {
      addSignal(signals, {
         category: 'auth',
         source: 'dom',
         value: 'authentication flow',
         confidence: 'high',
      });
   }

   if (hasMatch(html, /aria-live=["'][^"']+["']/i)) {
      addSignal(signals, {
         category: 'live-region',
         source: 'dom',
         value: 'aria-live region',
         confidence: 'high',
      });
   }

   if (hasMatch(html, /role=["']status["']/i)) {
      addSignal(signals, {
         category: 'live-region',
         source: 'a11y-tree',
         value: 'role=status',
         confidence: 'high',
      });
   }

   if (hasMatch(html, /role=["'](?:alert|log)["']/i)) {
      addSignal(signals, {
         category: 'live-region',
         source: 'a11y-tree',
         value: 'alert or log role',
         confidence: 'medium',
      });
   }
}

function detectDialogSignals(html: string, signals: ApplicabilitySignal[]): void {
   if (
      hasMatch(html, /role=["'](?:dialog|alertdialog)["']/i) ||
      hasMatch(html, /aria-modal=["']true["']/i)
   ) {
      addSignal(signals, {
         category: 'dialog',
         source: 'dom',
         value: 'dialog structure',
         confidence: 'high',
      });
   }
}

function detectUiPatternSignals(html: string, signals: ApplicabilitySignal[]): void {
   if (
      hasMatch(html, /\b(modal|overlay)\b/i) ||
      hasMatch(html, /position\s*:\s*(fixed|sticky)/i)
   ) {
      addSignal(signals, {
         category: 'overlay',
         source: 'dom',
         value: 'fixed or modal overlay',
         confidence: 'medium',
      });
   }

   if (hasMatch(html, /<(video|audio)\b/i)) {
      addSignal(signals, {
         category: 'media',
         source: 'dom',
         value: 'audio or video media',
         confidence: 'high',
      });
   }

   if (hasMatch(html, /\b(draggable|drag|drop)\b/i)) {
      addSignal(signals, {
         category: 'drag-and-drop',
         source: 'dom',
         value: 'drag-and-drop interaction',
         confidence: 'medium',
      });
   }

   if (
      hasMatch(html, /\b(menu|menubar)\b/i) ||
      hasMatch(html, /role=["'](?:menu|menubar|menuitem)["']/i)
   ) {
      addSignal(signals, {
         category: 'menu',
         source: 'dom',
         value: 'menu structure',
         confidence: 'medium',
      });
   }
}

function detectWidgetSignals(html: string, signals: ApplicabilitySignal[]): void {
   if (hasMatch(html, /role=["']tablist["']/i)) {
      addSignal(signals, {
         category: 'tablist',
         source: 'dom',
         value: 'tablist structure',
         confidence: 'medium',
      });
   }

   if (
      hasMatch(html, /aria-invalid=["']true["']/i) ||
      hasMatch(html, /\b(error|invalid|required field|validation)\b/i)
   ) {
      addSignal(signals, {
         category: 'validation',
         source: 'dom',
         value: 'validation messaging',
         confidence: 'medium',
      });
   }

   if (
      hasMatch(html, /tabindex=["']0["']/i) ||
      hasMatch(html, /role=["'](?:button|link|switch|slider|combobox|listbox|tree)["']/i)
   ) {
      addSignal(signals, {
         category: 'widget',
         source: 'dom',
         value: 'focusable widget',
         confidence: 'medium',
      });
   }
}

function resolveHintSource(userHints: string[] | undefined): 'user-hint' | 'metadata' {
   if (userHints?.length) {
      return 'user-hint';
   }
   return 'metadata';
}

function detectHintBasedSignals(
   hintValues: string,
   signals: ApplicabilitySignal[],
   userHints: string[] | undefined,
): void {
   if (hasMatch(hintValues, /\b(auth|login|sign in|sign-in|password|credential)\b/i)) {
      addSignal(signals, {
         category: 'auth',
         source: resolveHintSource(userHints),
         value: 'story metadata hints at an authentication flow',
         confidence: 'high',
      });
   }

   if (
      hasMatch(hintValues, /\b(status|toast|notification|live region|status update)\b/i)
   ) {
      addSignal(signals, {
         category: 'live-region',
         source: resolveHintSource(userHints),
         value: 'story metadata hints at a status message',
         confidence: 'medium',
      });
   }

   if (hasMatch(hintValues, /\b(dialog|modal|confirm|overlay)\b/i)) {
      addSignal(signals, {
         category: 'dialog',
         source: resolveHintSource(userHints),
         value: 'story metadata hints at a dialog workflow',
         confidence: 'medium',
      });
   }
}

function buildHintValues(options?: {
   userHints?: string[];
   metadata?: Record<string, string>;
}): string {
   return [
      ...(options?.userHints ?? []),
      ...Object.entries(options?.metadata ?? {}).map(([key, value]) => `${key}:${value}`),
   ].join(' ');
}

export function deriveApplicabilityInputFromHtml(
   url: string,
   html: string,
   options?: {
      target?: ApplicabilityInput['target'];
      metadata?: Record<string, string>;
      userHints?: string[];
   },
): ApplicabilityInput {
   const signals: ApplicabilitySignal[] = [];

   detectStructuralSignals(html, signals);
   detectAuthAndLiveRegionSignals(html, signals);
   detectDialogSignals(html, signals);
   detectUiPatternSignals(html, signals);
   detectWidgetSignals(html, signals);

   const hintValues = buildHintValues(options);
   detectHintBasedSignals(hintValues, signals, options?.userHints);

   return applicabilityInputSchema.parse({
      target: options?.target ?? {
         kind: 'url',
         value: url,
      },
      signals,
      metadata: options?.metadata ?? {},
      userHints: options?.userHints ?? [],
   });
}
