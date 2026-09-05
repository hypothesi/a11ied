import type { Platform } from '@a11ied/contracts';
import { createDriverAdapter } from '@a11ied/guidepup';

type DefaultTargetReason =
   | 'platform-default'
   | 'platform-fallback'
   | 'readiness-fallback';
export type TargetType = 'real' | 'simulated';

interface DefaultTargetSelection {
   target: Platform;
   targetType: TargetType;
   reason: DefaultTargetReason;
   message: string;
   warning?: string;
}

export function resolveTargetType(target: Platform): TargetType {
   if (target === 'virtual') {
      return 'simulated';
   }
   return 'real';
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
      return 'No --sr provided; defaulting to VoiceOver (real screen reader) for macOS.';
   }
   if (target === 'nvda') {
      return 'No --sr provided; defaulting to NVDA (real screen reader) for Windows.';
   }
   return 'No --sr provided; this platform does not support VoiceOver or NVDA, falling back to the virtual (simulated) screen reader.';
}

function buildReadinessFallbackMessage(target: Platform, summary: string): string {
   const label = target === 'voiceover' ? 'VoiceOver' : 'NVDA';
   return `No --sr provided; ${label} is not ready for automation (${summary}). Falling back to the virtual (simulated) screen reader.`;
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

export async function resolveAvailableDefaultTarget(): Promise<DefaultTargetSelection> {
   const preferred = resolvePreferredTarget();
   if (!preferred) {
      return resolveDefaultTarget();
   }

   const readiness = await createDriverAdapter(preferred).checkReadiness();
   if (readiness.status === 'ready') {
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
      reason: 'readiness-fallback',
      message: buildReadinessFallbackMessage(preferred, readiness.summary),
      warning: VIRTUAL_FALLBACK_WARNING,
   };
}
