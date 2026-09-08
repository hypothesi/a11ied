import {
   apgFindResultSchema,
   apgLookupResultSchema,
   apgPatternListResultSchema,
   type ApgAttributeTable,
   type ApgExample,
   type ApgKeyboardTable,
   type ApgPattern,
   type CliOutputEnvelope,
   type W3cDocumentSource,
} from '#contracts';

import { code, count, dim, section, table } from '../lib/format.js';
import { attributionLine, W3C_SOFTWARE_AND_DOCUMENT_LICENSE } from './shared.js';

/** Which blocks of an example view to print. */
export type PatternDetailSection = 'keyboard' | 'attributes' | 'examples';

export const patternDetailSections: ReadonlyArray<PatternDetailSection> = [
   'keyboard',
   'attributes',
   'examples',
];

export const KEY_COLUMN_CAP = 26;
export const USAGE_COLUMN_CAP = 60;

/** The APG attribution line, with the license the guide is actually published under. */
export function apgAttribution(document: W3cDocumentSource): string {
   return attributionLine({ ...document, license: W3C_SOFTWARE_AND_DOCUMENT_LICENSE });
}

/** Alternatives are printed as the APG writes them, so `Space or Enter` stays two keys. */
function formatKeys(keyGroups: string[][]): string {
   return keyGroups.map((group) => group.join(' + ')).join(' or ');
}

function keyboardTableLines(keyboardTable: ApgKeyboardTable): string[] {
   const rows = keyboardTable.rows.map((row) => [
      code(formatKeys(row.keyGroups)),
      row.description.join(' '),
   ]);
   const body = table(['Key', 'Function'], rows, [KEY_COLUMN_CAP, USAGE_COLUMN_CAP]);
   if (keyboardTable.name.length === 0) {
      return body;
   }
   return [dim(keyboardTable.name), ...body];
}

function attributeTableLines(attributeTable: ApgAttributeTable): string[] {
   const rows = attributeTable.rows.map((row) => [
      code(row.attribute?.raw ?? row.role ?? ''),
      row.element,
      row.usage,
   ]);
   const body = table(['Role or attribute', 'Element', 'Usage'], rows, [
      KEY_COLUMN_CAP,
      KEY_COLUMN_CAP,
      USAGE_COLUMN_CAP,
   ]);
   if (attributeTable.name.length === 0) {
      return body;
   }
   return [dim(attributeTable.name), ...body];
}

function exampleTablesLines(
   example: { keyboardTables: ApgKeyboardTable[]; attributeTables: ApgAttributeTable[] },
   sections: ReadonlyArray<PatternDetailSection>,
): string[] {
   const lines: string[] = [];

   if (sections.includes('keyboard')) {
      const body =
         example.keyboardTables.length > 0
            ? example.keyboardTables.flatMap((entry) => keyboardTableLines(entry))
            : [dim('The APG documents this example without a keyboard table.')];
      lines.push(...section('Keyboard support', body));
   }

   if (sections.includes('attributes')) {
      const body =
         example.attributeTables.length > 0
            ? example.attributeTables.flatMap((entry) => attributeTableLines(entry))
            : [dim('The APG documents this example without an attribute table.')];
      lines.push(...section('Role, property, state, and tabindex', body));
   }

   return lines;
}

function exampleLines(
   result: { example: ApgExample; pattern: ApgPattern; document: W3cDocumentSource },
   sections: ReadonlyArray<PatternDetailSection>,
): string[] {
   const { example } = result;

   return [
      example.title,
      dim(`${result.pattern.title} pattern, example id ${example.id}`),
      ...(example.experimental ? [dim('Listed under Experimental Examples.')] : []),
      ...exampleTablesLines(example, sections),
      '',
      dim(example.pageUrl),
      apgAttribution(result.document),
   ];
}

function patternLines(
   result: { pattern: ApgPattern; examples: ApgExample[]; document: W3cDocumentSource },
   sections: ReadonlyArray<PatternDetailSection>,
): string[] {
   const lines = [result.pattern.title, dim(`pattern id ${result.pattern.id}`)];

   if (sections.includes('examples')) {
      const rows = result.examples.map((example) => [example.id, example.title]);
      lines.push(
         ...section(
            count(result.examples.length, 'example'),
            table(['Id', 'Title'], rows),
         ),
         '',
         `${dim('Run')} a1 pattern ${result.examples[0]?.id ?? '<example-id>'} ${dim('for its keyboard and attribute tables')}`,
      );
   }

   lines.push('', dim(result.pattern.pageUrl), apgAttribution(result.document));
   return lines;
}

/**
 * Prints whichever a bare `a1 pattern <name>` resolved to: a pattern with its examples,
 * or one example with its keyboard and attribute tables.
 */
export function renderPatternLookupText(
   envelope: CliOutputEnvelope,
   options: { verbose: boolean; sections?: ReadonlyArray<PatternDetailSection> },
): string {
   const result = apgLookupResultSchema.parse(envelope.result);
   const sections = options.sections ?? patternDetailSections;

   if (result.kind === 'example') {
      return exampleLines(result, sections).join('\n');
   }
   return patternLines(result, sections).join('\n');
}

/** Prints every APG pattern with the number of examples the guide publishes for it. */
export function renderPatternListText(
   envelope: CliOutputEnvelope,
   _options: { verbose: boolean },
): string {
   const result = apgPatternListResultSchema.parse(envelope.result);
   const rows = result.patterns.map((pattern) => [
      pattern.id,
      pattern.title,
      count(pattern.exampleCount, 'example'),
   ]);

   return [
      ...table(['Id', 'Title', 'Examples'], rows),
      '',
      `${dim('Run')} a1 pattern <id> ${dim('for one pattern')}`,
      apgAttribution(result.document),
   ].join('\n');
}

/** Prints the examples the APG's example index files under one role or attribute. */
export function renderPatternFindText(
   envelope: CliOutputEnvelope,
   _options: { verbose: boolean },
): string {
   const result = apgFindResultSchema.parse(envelope.result);
   const rows = result.examples.map((example) => [
      example.id,
      example.patternId,
      example.title,
   ]);

   return [
      `${result.kind} ${code(result.key)}`,
      ...table(['Example', 'Pattern', 'Title'], rows),
      '',
      apgAttribution(result.document),
   ].join('\n');
}
