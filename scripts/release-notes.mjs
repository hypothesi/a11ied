/**
 * Prints the GitHub release notes for one version: each public package's changelog
 * section for it. Every package shares one version, so one release covers them all.
 * Internal packages are left out; their changes reach users through `a11ied`.
 *
 * Usage: node scripts/release-notes.mjs <version>
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

/** The packages people install directly, in the order the notes list them. */
const PUBLIC_PACKAGES = [
   { name: 'a11ied', dir: 'packages/cli' },
   { name: '@a11ied/compat', dir: 'packages/compat' },
   { name: '@a11ied/support-data', dir: 'packages/support-data' },
];

const NO_CHANGES = 'No changes in this release.';

/** The body under `## <version>` in a Changesets changelog, without the heading. */
function getVersionSection(changelog, version) {
   const section = changelog
      .split(/^## /mu)
      .find((part) => part.startsWith(`${version}\n`));

   if (section === undefined) {
      return;
   }
   return section.slice(version.length).trim();
}

async function main() {
   const [version] = parseArgs({ allowPositionals: true }).positionals;

   if (!version) {
      throw new Error('Usage: node scripts/release-notes.mjs <version>');
   }

   const sections = await Promise.all(
      PUBLIC_PACKAGES.map(async ({ name, dir }) => {
         const changelog = await readFile(resolve(dir, 'CHANGELOG.md'), 'utf8');
         const body = getVersionSection(changelog, version);

         if (body === undefined) {
            throw new Error(`${dir}/CHANGELOG.md has no section for ${version}.`);
         }
         return body === NO_CHANGES ? undefined : `## ${name}\n\n${body}`;
      }),
   );

   const notes = sections.filter((section) => section !== undefined);

   process.stdout.write(`${notes.length > 0 ? notes.join('\n\n') : NO_CHANGES}\n`);
}

await main();
