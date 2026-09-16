import { readFile, readdir, writeFile } from 'node:fs/promises';
import { defineConfig } from 'astro/config';

const productionBase = '/a11ied/';
const isProductionBuild = process.argv.includes('build');

async function prefixRootRelativeLinksInFile(path) {
   const html = await readFile(path, 'utf8');

   await writeFile(
      path,
      html.replaceAll(/href="\/(?!a11ied\/)/g, `href="${productionBase}`),
   );
}

async function prefixRootRelativeLinks(directory) {
   const entries = await readdir(directory, { withFileTypes: true });

   await Promise.all(
      entries.map((entry) => {
         const path = new URL(
            `${entry.name}${entry.isDirectory() ? '/' : ''}`,
            directory,
         );

         if (entry.isDirectory()) {
            return prefixRootRelativeLinks(path);
         }

         if (entry.name.endsWith('.html')) {
            return prefixRootRelativeLinksInFile(path);
         }

         return Promise.resolve();
      }),
   );
}

export default defineConfig({
   base: isProductionBuild ? productionBase : '/',
   compressHTML: true,
   integrations: isProductionBuild
      ? [
           {
              name: 'prefix-root-relative-links',
              hooks: {
                 'astro:build:done': async ({ dir }) => {
                    await prefixRootRelativeLinks(dir);
                 },
              },
           },
        ]
      : [],
});
