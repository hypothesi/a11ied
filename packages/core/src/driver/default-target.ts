import type { Platform } from '@a11ied/contracts';

export type DefaultTargetReason = 'platform-default' | 'platform-fallback';
export type TargetType = 'real' | 'simulated';

export interface DefaultTargetSelection {
   target: Platform;
   targetType: TargetType;
   reason: DefaultTargetReason;
   message: string;
   warning?: string;
}

export function resolveTargetType(target: Platform): TargetType {
   return target === 'virtual' ? 'simulated' : 'real';
}

function resolvePreferredTarget(): Platform | undefined {
   if (process.platform === 'darwin') {
      return 'voiceover';
   }
   if (process.platform === 'win32') {
      return 'nvda';
   }
   return undefined;
}

function buildDefaultMessage(target: Platform): string {
   if (target === 'voiceover') {
      return 'No --target provided; defaulting to VoiceOver (real screen reader) for macOS.';
   }
   if (target === 'nvda') {
      return 'No --target provided; defaulting to NVDA (real screen reader) for Windows.';
   }
   return 'No --target provided; this platform does not support VoiceOver or NVDA, falling back to the virtual (simulated) screen reader.';
}

const VIRTUAL_FALLBACK_WARNING =
   'WARNING: Using the "virtual" target, which is a SIMULATED screen reader. ' +
   'Results do NOT reflect real assistive technology behavior. ' +
   'For accurate accessibility testing, use VoiceOver (macOS) or NVDA (Windows).';

export function resolveDefaultTarget(): DefaultTargetSelection {
   const preferred = resolvePreferredTarget();
   if (preferred) {
      return {
         target: preferred,
         targetType: 'real',
         reason: 'platform-default',
         message: buildDefaultMessage(preferred),
      };
   }

   return {
      target: 'virtual',
      targetType: 'simulated',
      reason: 'platform-fallback',
      message: buildDefaultMessage('virtual'),
      warning: VIRTUAL_FALLBACK_WARNING,
   };
}
