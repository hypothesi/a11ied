const PLACEHOLDER = 'PRACTICE_URL';

interface PageLocation {
   site: URL | undefined;
   url: URL;
}

/**
 * The address of the practice page on whichever copy of the docs the reader is looking
 * at, so every command on the site can be copied and run as written.
 */
export function getPracticeURL(location: PageLocation): string {
   const base = import.meta.env.BASE_URL.replace(/\/*$/, '/'),
      origin = import.meta.env.DEV
         ? location.url.origin
         : (location.site ?? location.url.origin);

   return new URL(`${base}demo/team/`, origin).href;
}

/** Sample files hold PRACTICE_URL where the CLI printed the practice page's address. */
export function withPracticeURL(sample: string, practiceURL: string): string {
   return sample.replaceAll(PLACEHOLDER, practiceURL).trimEnd();
}
