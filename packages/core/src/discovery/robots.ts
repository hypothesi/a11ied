import { createRequire } from 'node:module';

interface RobotsParserResult {
   isAllowed: (url: string, userAgent?: string) => boolean | undefined;
}

const robotsParser: (url: string, contents: string) => RobotsParserResult = createRequire(
   import.meta.url,
)('robots-parser');

export const DISCOVERY_USER_AGENT = 'a11ied-audit-discover/0.1.0';

/** Builds a standards-aware robots.txt check using the MIT-licensed robots-parser package. */
export function buildRobotsCheck(
   robotsUrl: string,
   contents: string,
): (url: string) => boolean {
   const robots = robotsParser(robotsUrl, contents);
   return (url: string): boolean => robots.isAllowed(url, DISCOVERY_USER_AGENT) !== false;
}
