export function stripHtml(value: string): string {
   return value
      .replaceAll(/<[^>]+>/g, '')
      .replaceAll(/\s+/g, ' ')
      .trim();
}
