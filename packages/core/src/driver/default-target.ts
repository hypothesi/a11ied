import type { Platform } from '@a11ied/contracts';

export type DefaultTargetReason = 'platform-default' | 'platform-fallback';

export interface DefaultTargetSelection {
   target: Platform;
   reason: DefaultTargetReason;
   message: string;
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
      return 'No --target provided; defaulting to VoiceOver for macOS.';
   }
   if (target === 'nvda') {
      return 'No --target provided; defaulting to NVDA for Windows.';
   }
   return 'No --target provided; this platform does not support VoiceOver or NVDA, using the virtual target.';
}

export function resolveDefaultTarget(): DefaultTargetSelection {
   const preferred = resolvePreferredTarget();
   if (preferred) {
      return {
         target: preferred,
         reason: 'platform-default',
         message: buildDefaultMessage(preferred),
      };
   }

   return {
      target: 'virtual',
      reason: 'platform-fallback',
      message: buildDefaultMessage('virtual'),
   };
}
