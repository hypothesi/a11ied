import type { CliOutputEnvelope } from '#contracts';
import { badge, dim, fields, indent, section, symbols, title } from '../lib/format.js';
import type { RenderOptions } from './shared.js';

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

function renderRuleGroup(
   name: string,
   entries: Array<{ id: string; impact?: string | null }>,
   marker: string,
): string[] {
   const body = entries.map((entry) => {
      const impact = entry.impact ? `  ${badge(entry.impact)}` : '';
      return `${marker} ${entry.id}${impact}`;
   });
   return section(
      `${name} ${dim(`(${entries.length})`)}`,
      body.length > 0 ? body : [dim('none')],
   );
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
      violations: Array<{ id: string; impact: string | null }>;
      passes: Array<{ id: string }>;
      incomplete: Array<{ id: string }>;
   };

   const lines = [
      title('axe scan'),
      ...indent(
         fields([
            ['URL', result.url],
            ['Selection', formatRunAxeSelector(result.selection)],
         ]),
      ),
      ...renderRuleGroup('Violations', result.violations, symbols.fail),
      ...renderRuleGroup('Passes', result.passes, symbols.pass),
      ...renderRuleGroup('Incomplete', result.incomplete, symbols.warn),
   ];

   if (options.verbose) {
      lines.push(...section('Rule ids', [result.ruleIds.join(', ') || dim('none')]));
   }

   return lines.join('\n');
}
