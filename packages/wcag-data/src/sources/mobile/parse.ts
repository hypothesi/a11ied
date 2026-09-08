import type { MobileGuidanceState } from '@a11ied/contracts';

const HEADING_LINE = /^##\s+(.+)$/u;
const CRITERION_ID = /(\d+\.\d+\.\d+)/u;
const LEVEL_LINE = /^\(Level (?:A|AA|AAA)\)$/u;
const MACRO_LINE = /^\[([a-z][a-z0-9]*):(.*)\]$/u;
const NOTE_MACRO = /^note\d*$/u;
const EXAMPLE_MACRO = /^example\d*$/u;
const BLANK_RUN = /\n{3,}/gu;
const NON_SLUG_CHARS = /[^a-z0-9]+/gu;
const EDGE_HYPHENS = /^-+|-+$/gu;

const MACRO_NAME_INDEX = 1;
const MACRO_BODY_INDEX = 2;
const PLACEHOLDER_BODY = 'Placeholder';
const MATF_DOCUMENT_URL = 'https://w3c.github.io/matf/';
const WCAG2ICT_DOCUMENT_URL = 'https://www.w3.org/TR/wcag2ict-22/';
const MATF_ISSUES_URL = 'https://github.com/w3c/matf/issues/';

/** One `comments/<criterion-id>.md` entry from the WCAG2Mobile source, parsed. */
export interface ParsedMobileGuidance {
   criterionId: string;
   title: string;
   url: string;
   state: MobileGuidanceState;
   guidance: string;
   notes: string[];
   examples: string[];
   wcag2ictUrl: string;
   openIssueUrl: string | undefined;
}

/** Raised when a source file does not have the heading every entry is keyed by. */
export class MobileGuidanceParseError extends Error {
   readonly fileName: string;

   constructor(fileName: string, message: string) {
      super(`Cannot parse mobile guidance ${fileName}: ${message}`);
      this.name = 'MobileGuidanceParseError';
      this.fileName = fileName;
   }
}

/**
 * Builds the fragment the published document gives a section heading, so an entry links
 * to the section it was copied from: "Success Criterion 2.5.8 Target Size (Minimum)"
 * becomes `success-criterion-2-5-8-target-size-minimum`.
 */
function anchorFromTitle(title: string): string {
   return title
      .toLowerCase()
      .replaceAll(NON_SLUG_CHARS, '-')
      .replaceAll(EDGE_HYPHENS, '');
}

interface MacroCollector {
   notes: string[];
   examples: string[];
   wcag2ictAnchor: string | undefined;
   issueNumber: string | undefined;
}

function collectMacro(collector: MacroCollector, name: string, body: string): void {
   if (NOTE_MACRO.test(name)) {
      collector.notes.push(body.trim());
      return;
   }
   if (EXAMPLE_MACRO.test(name)) {
      collector.examples.push(body.trim());
      return;
   }
   if (name === 'wcag2ict') {
      collector.wcag2ictAnchor = body.trim();
      return;
   }
   if (name === 'issue') {
      collector.issueNumber = body.trim();
   }
}

function readTitle(lines: string[], fileName: string): string {
   for (const line of lines) {
      const heading = HEADING_LINE.exec(line.trim());
      if (heading?.[1]) {
         return heading[1].trim();
      }
   }
   throw new MobileGuidanceParseError(fileName, 'no "## Success Criterion" heading');
}

function readCriterionId(title: string, fileName: string): string {
   const match = CRITERION_ID.exec(title);
   if (!match?.[1]) {
      throw new MobileGuidanceParseError(fileName, `no criterion id in "${title}"`);
   }
   return match[1];
}

function isProseLine(line: string): boolean {
   const trimmed = line.trim();
   return !HEADING_LINE.test(trimmed) && !LEVEL_LINE.test(trimmed);
}

function joinProse(proseLines: string[]): string {
   return proseLines.join('\n').replaceAll(BLANK_RUN, '\n\n').trim();
}

function fragmentUrl(base: string, fragment: string | undefined): string {
   return fragment ? `${base}#${fragment}` : base;
}

/**
 * Parses one WCAG2Mobile source file into the fields the generated artifact stores. The
 * document writes its notes, examples, and open issues as single-line `[note:...]`,
 * `[example:...]`, and `[issue:12]` macros, so those come out as their own fields and
 * everything else stays as the prose it is, in Markdown.
 *
 * An entry whose only prose is "Placeholder" has no guidance published yet. It is stored
 * anyway, with the issue tracking it, so a caller can tell "not written" apart from "not
 * covered by the document at all".
 */
export function parseMobileGuidance(input: {
   fileName: string;
   markdown: string;
}): ParsedMobileGuidance {
   const lines = input.markdown.split('\n');
   const title = readTitle(lines, input.fileName);
   const collector: MacroCollector = {
      notes: [],
      examples: [],
      wcag2ictAnchor: undefined,
      issueNumber: undefined,
   };
   const proseLines: string[] = [];

   for (const line of lines) {
      const macro = MACRO_LINE.exec(line.trim());
      const name = macro?.[MACRO_NAME_INDEX];
      const body = macro?.[MACRO_BODY_INDEX];
      if (name !== undefined && body !== undefined) {
         collectMacro(collector, name, body);
      } else if (isProseLine(line)) {
         proseLines.push(line);
      }
   }

   const prose = joinProse(proseLines);
   const isPlaceholder = prose === PLACEHOLDER_BODY;

   return {
      criterionId: readCriterionId(title, input.fileName),
      title,
      url: fragmentUrl(MATF_DOCUMENT_URL, anchorFromTitle(title)),
      state: isPlaceholder ? 'placeholder' : 'guidance',
      guidance: isPlaceholder ? '' : prose,
      notes: collector.notes,
      examples: collector.examples,
      wcag2ictUrl: fragmentUrl(WCAG2ICT_DOCUMENT_URL, collector.wcag2ictAnchor),
      openIssueUrl: collector.issueNumber
         ? `${MATF_ISSUES_URL}${collector.issueNumber}`
         : undefined,
   };
}
