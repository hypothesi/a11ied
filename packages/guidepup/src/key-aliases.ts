import type { Platform } from '@a11ied/contracts';

const commonKeyAliases: Record<string, string[]> = {
   DownArrow: ['ArrowDown'],
   LeftArrow: ['ArrowLeft'],
   RightArrow: ['ArrowRight'],
   UpArrow: ['ArrowUp'],
};

function expandDriverAlias(token: string, target: Platform): string[] | undefined {
   if (target === 'voiceover' && token === 'VO') {
      return ['Control', 'Option'];
   }
   if (target === 'nvda' && (token === 'NVDA' || token === 'Nvda')) {
      return ['Insert'];
   }
   return undefined;
}

/** Normalizes a11ied key aliases before handing the chord to Guidepup. */
export function normalizeDriverKeys(keys: string, target: Platform): string {
   return keys
      .split('+')
      .flatMap((rawToken) => {
         const token = rawToken.trim();
         return expandDriverAlias(token, target) ?? commonKeyAliases[token] ?? [token];
      })
      .join('+');
}
