import type { CliOutputEnvelope } from '#contracts';
import {
   badge,
   code,
   count,
   dim,
   fields,
   indent,
   section,
   symbols,
   title,
} from '../lib/format.js';
import type { RenderOptions } from './shared.js';

interface AxeNode {
   target: string[];
   html: string;
   failureSummary?: string | null;
}

interface AxeRule {
   id: string;
   impact?: string | null;
   help: string;
   helpUrl: string;
   tags: string[];
   nodes: AxeNode[];
}

const MAX_NODES = 5;
const MAX_HTML_LENGTH = 100;
const NODE_DEPTH = 2;
const WCAG_CRITERION_TAG = /^wcag(\d)(\d)(\d+)$/u;
const WCAG_LEVEL_TAG = /^wcag2\d?(a{1,3})$/u;

function formatRunAxeSelector(selection: {
   kind: string;
   criterion?: string;
   level?: string;
   ruleIds?: string[];
}): string {
   if (selection.kind === 'all') {
      return 'all mapped axe rules';
   }
   if (selection.kind === 'criterion') {
      return `criterion=${selection.criterion}`;
   }
   if (selection.kind === 'level') {
      return `level=${selection.level}`;
   }
   return `rules=${selection.ruleIds?.join(',')}`;
}

/** Turns axe tags like wcag311 and wcag2a into "WCAG 3.1.1 (A)". */
function describeWcagTags(tags: string[]): string {
   const criteria = tags
      .map((tag) => WCAG_CRITERION_TAG.exec(tag))
      .filter((match) => match !== null)
      .map((match) => {
         const [, principle, guideline, criterion] = match;
         return `${principle}.${guideline}.${criterion}`;
      });
   const level = tags
      .map((tag) => WCAG_LEVEL_TAG.exec(tag)?.[1]?.toUpperCase())
      .find((entry) => entry !== undefined);

   if (criteria.length === 0) {
      return '';
   }
   const levelSuffix = level ? ` (${level})` : '';
   return `WCAG ${criteria.join(', ')}${levelSuffix}`;
}

function truncateHtml(html: string): string {
   const singleLine = html.replaceAll(/\s+/g, ' ').trim();
   if (singleLine.length <= MAX_HTML_LENGTH) {
      return singleLine;
   }
   return `${singleLine.slice(0, MAX_HTML_LENGTH)}...`;
}

function renderFailureSummary(summary: string | null | undefined): string[] {
   if (!summary) {
      return [];
   }
   return summary
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line, index) => {
         if (index === 0) {
            return dim(line);
         }
         return `${symbols.bullet} ${line}`;
      });
}

function renderNode(node: AxeNode): string[] {
   return [
      code(node.target.join(' ')),
      ...indent([
         dim(truncateHtml(node.html)),
         ...renderFailureSummary(node.failureSummary),
      ]),
   ];
}

function renderNodes(rule: AxeRule, options: RenderOptions, noun: string): string[] {
   const limit = options.verbose ? rule.nodes.length : MAX_NODES;
   const lines = [
      dim(count(rule.nodes.length, noun)),
      ...indent(rule.nodes.slice(0, limit).flatMap((node) => renderNode(node))),
   ];
   const hidden = rule.nodes.length - limit;
   if (hidden > 0) {
      lines.push(
         ...indent([
            dim(`... ${count(hidden, 'more element')} with --verbose or --json`),
         ]),
      );
   }
   return lines;
}

function ruleHeadline(rule: AxeRule, marker: string): string {
   const parts = [code(rule.id)];
   if (rule.impact) {
      parts.push(badge(rule.impact));
   }
   const wcag = describeWcagTags(rule.tags);
   if (wcag) {
      parts.push(dim(wcag));
   }
   return `${marker} ${parts.join('  ')}`;
}

function renderDetailedRule(args: {
   rule: AxeRule;
   marker: string;
   options: RenderOptions;
   noun: string;
}): string[] {
   return [
      ruleHeadline(args.rule, args.marker),
      ...indent(
         [
            args.rule.help,
            dim(args.rule.helpUrl),
            ...renderNodes(args.rule, args.options, args.noun),
         ],
         NODE_DEPTH,
      ),
      '',
   ];
}

function renderRuleGroup(args: {
   name: string;
   rules: AxeRule[];
   marker: string;
   options: RenderOptions;
   noun?: string;
}): string[] {
   const heading = `${args.name} ${dim(`(${args.rules.length})`)}`;
   if (args.rules.length === 0) {
      return section(heading, [dim('none')]);
   }
   if (!args.noun) {
      return section(
         heading,
         args.rules.map((rule) => `${args.marker} ${code(rule.id)}  ${dim(rule.help)}`),
      );
   }
   const noun = args.noun;
   const body = args.rules.flatMap((rule) =>
      renderDetailedRule({ rule, marker: args.marker, options: args.options, noun }),
   );
   return section(heading, body.slice(0, -1));
}

function summarizeCounts(result: {
   violations: AxeRule[];
   incomplete: AxeRule[];
   passes: AxeRule[];
}): string {
   return [
      count(result.violations.length, 'violation'),
      count(result.incomplete.length, 'incomplete check'),
      count(result.passes.length, 'pass', 'passes'),
   ].join(', ');
}

// Fallow-ignore-next-line unused-export
export function renderRunAxeText(
   envelope: CliOutputEnvelope,
   options: RenderOptions,
): string {
   const result = envelope.result as {
      url: string;
      selection: { kind: string; criterion?: string; level?: string; ruleIds?: string[] };
      ruleIds: string[];
      violations: AxeRule[];
      passes: AxeRule[];
      incomplete: AxeRule[];
   };

   const lines = [
      title('axe scan'),
      ...indent(
         fields([
            ['URL', result.url],
            ['Selection', formatRunAxeSelector(result.selection)],
            ['Result', summarizeCounts(result)],
         ]),
      ),
      ...renderRuleGroup({
         name: 'Violations',
         rules: result.violations,
         marker: symbols.fail,
         options,
         noun: 'failing element',
      }),
      ...renderRuleGroup({
         name: 'Incomplete',
         rules: result.incomplete,
         marker: symbols.warn,
         options,
         noun: 'element to check by hand',
      }),
      ...renderRuleGroup({
         name: 'Passes',
         rules: result.passes,
         marker: symbols.pass,
         options,
      }),
   ];

   if (options.verbose) {
      lines.push(...section('Rule ids', [result.ruleIds.join(', ') || dim('none')]));
   }

   return lines.join('\n');
}
