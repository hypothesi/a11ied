import type { Platform } from '@a11ied/contracts';

const commonKeyAliases: Record<string, string[]> = {
   DownArrow: ['ArrowDown'],
   LeftArrow: ['ArrowLeft'],
   RightArrow: ['ArrowRight'],
   UpArrow: ['ArrowUp'],
};

/**
 * The virtual reader presses keys through user-event, which knows the space bar only by
 * the character it types. `Space` and `Spacebar` are what the key help documents.
 */
function expandVirtualAlias(token: string): string[] | undefined {
   if (token === 'Space' || token === 'Spacebar') {
      return [' '];
   }
   return undefined;
}

function expandDriverAlias(token: string, target: Platform): string[] | undefined {
   if (target === 'virtual') {
      return expandVirtualAlias(token);
   }
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
