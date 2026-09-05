const EXCERPT_MAX_CHARS = 400;
const EXCERPT_HEADINGS = ['In Brief', 'Intent'];

function truncate(text: string, maxChars: number): string {
   const collapsed = text.replaceAll(/\s+/g, ' ').trim();
   if (collapsed.length <= maxChars) {
      return collapsed;
   }
   return `${collapsed.slice(0, maxChars).trimEnd()}...`;
}

function sectionBody(markdown: string, heading: string): string | undefined {
   const pattern = new RegExp(`##\\s+${heading}\\n([\\s\\S]*?)(\\n##\\s|$)`);
   return pattern.exec(markdown)?.[1]?.trim();
}

/**
 * Pulls a short opening excerpt from a converted Understanding document: the In Brief
 * section, or Intent when In Brief is missing. Used so `wcag show` prints a preview
 * instead of the full document.
 */
export function excerptUnderstanding(markdown: string): string | undefined {
   for (const heading of EXCERPT_HEADINGS) {
      const section = sectionBody(markdown, heading);
      if (section) {
         return truncate(section, EXCERPT_MAX_CHARS);
      }
   }
   return undefined;
}
