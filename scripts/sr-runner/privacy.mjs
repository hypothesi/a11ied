import os from 'node:os';

const CURRENT_USER = os.userInfo().username;
const CURRENT_HOST = os.hostname().split('.')[0];
const MIN_USER_PATTERN_LEN = 3;
const MIN_HOST_PATTERN_LEN = 4;
const MAX_SUMMARY_VIOLATIONS = 5;

function escapeRegex(value) {
   return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

const FORBIDDEN_PATTERNS = [
   ...(CURRENT_USER && CURRENT_USER.length >= MIN_USER_PATTERN_LEN
      ? [
           {
              label: 'local username',
              regex: new RegExp(String.raw`\b${escapeRegex(CURRENT_USER)}\b`, 'iu'),
           },
        ]
      : []),
   ...(CURRENT_HOST && CURRENT_HOST.length >= MIN_HOST_PATTERN_LEN
      ? [
           {
              label: 'local hostname',
              regex: new RegExp(String.raw`\b${escapeRegex(CURRENT_HOST)}\b`, 'iu'),
           },
        ]
      : []),
   { label: 'macOS home path', regex: /\/Users\/[^\s/"']+/iu },
   { label: 'Windows user path', regex: /C:\\Users\\[^\s\\"']+/iu },
   { label: 'personal device name', regex: /\b(?:mattbook|mattphone|meps\s*70)\b/iu },
   {
      label: 'personal device / setup note leakage',
      regex: /(?:was locked during|npm run sr:import|iPhone12,1|22H352|a11y_TalkBack_33)/iu,
   },
   {
      label: 'desktop OS / personal app reference',
      regex: /\b(?:Finder|Herdr|Antigravity|iTerm2?|Slack|Messages|Apple Mail|System Settings|Control Center|Notification Center|Dock, application|Menu Bar)\b/u,
   },
   {
      label: 'browser window / tab chrome leakage',
      regex: /(?:Address and search bar|Search or type web address|Smart Search Field|Switch or close tabs|Bookmarks Bar|Favorites Bar|Reload this page|New Tab, button|Tab Bar, tab group|Sidebars button|Forward dimmed button|login.? keychain)/iu,
   },
];

const CHROME_BOILERPLATE_PHRASES = [
   /^Chrome$/iu,
   /^Safari$/iu,
   /^Firefox$/iu,
   /^window$/iu,
   /^web content$/iu,
   /^html content$/iu,
   /^in chrome/iu,
   /^in safari/iu,
   /^in firefox/iu,
   /^entering .*web content/iu,
   /^leaving .*web content/iu,
   /^end of web content/iu,
   /^address and search bar/iu,
   /^smart search field/iu,
   /^reload/iu,
   /^sidebars?\b.*button$/iu,
   /^back\b.*button$/iu,
   /^forward\b.*button$/iu,
   /^open menu$/iu,
];

function collectStringValues(value, path = '$', out = []) {
   if (typeof value === 'string') {
      out.push({ path, value });
      return out;
   }
   if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
         collectStringValues(item, `${path}[${String(index)}]`, out);
      }
      return out;
   }
   if (typeof value === 'object' && value !== null) {
      for (const [key, child] of Object.entries(value)) {
         collectStringValues(child, `${path}.${key}`, out);
      }
   }
   return out;
}

export function findPrivacyViolations(payload) {
   const violations = [];
   for (const { path, value } of collectStringValues(payload)) {
      for (const rule of FORBIDDEN_PATTERNS) {
         const match = rule.regex.exec(value);
         if (match) {
            violations.push({
               path,
               rule: rule.label,
               excerpt: match[0],
            });
         }
      }
   }
   return violations;
}

export function assertPrivacySafe(payload, contextLabel = 'screen reader result') {
   const violations = findPrivacyViolations(payload);
   if (violations.length > 0) {
      const summary = violations
         .slice(0, MAX_SUMMARY_VIOLATIONS)
         .map((item) => `${item.path}: matched ${item.rule} (${item.excerpt})`)
         .join('; ');
      throw new Error(`Privacy audit failed for ${contextLabel}: ${summary}`);
   }
}

export function isBoilerplateChromePhrase(phrase) {
   const normalized = String(phrase ?? '').trim();
   if (normalized === '') {
      return false;
   }
   return CHROME_BOILERPLATE_PHRASES.some((pattern) => pattern.test(normalized));
}

/**
 * Strips leading/trailing browser chrome transition entries when a real reader moves into
 * or out of the Web Area, returning only announcements recorded within the test
 * document.
 */
export function filterTranscriptToTestContent(entries) {
   const cleaned = [];
   for (const entry of entries) {
      if (!isBoilerplateChromePhrase(entry.phrase)) {
         cleaned.push({
            ...entry,
            step: cleaned.length + 1,
         });
      }
   }
   return cleaned;
}
