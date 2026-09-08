import type { Command } from 'commander';
import { CliUsageError } from '#core';

const SECTION_SEPARATOR = ',';

/**
 * Adds `--section` to a lookup command. `allowed` is listed in the description, so `a1
 * wcag show --help` and `a1 pattern --help` both say which names their own family takes.
 */
export function addSectionOption(command: Command, allowed: readonly string[]): Command {
   return command.option(
      '--section <names>',
      `Limit the output to these sections, comma separated: ${allowed.join(', ')}.`,
   );
}

function isAllowedSection<TSection extends string>(
   name: string,
   allowed: readonly TSection[],
): name is TSection {
   return allowed.some((entry) => entry === name);
}

/**
 * Parses `--section`. An omitted option means every section, which is what a caller wants
 * when it renders the full view.
 */
export function parseSectionOption<TSection extends string>(
   value: string | undefined,
   allowed: readonly TSection[],
): readonly TSection[] {
   if (value === undefined) {
      return allowed;
   }

   const names = value
      .split(SECTION_SEPARATOR)
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

   const unknown = names.filter((name) => !isAllowedSection(name, allowed));

   if (unknown.length > 0) {
      throw new CliUsageError(
         'invalid-section',
         `Unknown section ${unknown.join(', ')}. Supported: ${allowed.join(', ')}.`,
         { value, supportedSections: [...allowed] },
      );
   }

   if (names.length === 0) {
      throw new CliUsageError('invalid-section', '--section needs at least one name.', {
         supportedSections: [...allowed],
      });
   }

   return names.filter((name) => isAllowedSection(name, allowed));
}
