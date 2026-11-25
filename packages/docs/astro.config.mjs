import { readFile, readdir, writeFile } from 'node:fs/promises';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';
import llms from 'astro-llms-md';

const site = 'https://hypothesi.github.io';
const productionBase = '/a11ied/';
// The plugin's own defaults. Passing `exclude` replaces them, so they are repeated here.
const LLMS_DEFAULT_EXCLUDES = [
   '404',
   '404.html',
   '_astro',
   '**.xml',
   '**.txt',
   'node_modules',
];
/*
 * The compatibility tables are hundreds of pages of test results, the demo pages are
 * practice targets, and the example audit is a generated report. None of them is docs.
 */
const LLMS_EXCLUDED_SECTIONS = ['compatibility', 'demo', 'example-audit', 'pagefind'];
// Page furniture and decoration that would be noise in the Markdown copy of a page.
const LLMS_NOISE_SELECTORS = [
   'nav',
   'aside',
   'footer',
   '[aria-hidden="true"]',
   '[hidden]',
   '.crumb',
];
// `astro preview` serves the built site, so it needs the same base path as the build.
const isProductionBuild =
   process.argv.includes('build') || process.argv.includes('preview');

/**
 * A page is served at an address that ends in a slash. A link without one costs the
 * reader a redirect, and gives search engines two addresses for one page.
 */
function addTrailingSlash(match, path, suffix = '') {
   const isPage = !path.endsWith('/') && !/\.[a-z0-9]+$/i.test(path);

   return `href="${isPage ? `${path}/` : path}${suffix}"`;
}

async function prefixRootRelativeLinksInFile(path) {
   const html = await readFile(path, 'utf8');

   await writeFile(
      path,
      html
         .replaceAll(/href="\/(?!a11ied\/)/g, `href="${productionBase}`)
         .replaceAll(/href="(\/a11ied\/[^"#?]*)([#?][^"]*)?"/g, addTrailingSlash),
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

/** Leaves the practice pages, the bare test fixtures, and the 404 page out of the sitemap. */
function isSearchablePage(pageURL) {
   return !/\/(demo|compatibility\/cases)\/|\/404/.test(pageURL);
}

export default defineConfig({
   site,
   base: isProductionBuild ? productionBase : '/',
   compressHTML: true,
   integrations: [
      /*
       * The site has no icon files of its own. Pointing the integration at a folder that
       * exists, with no SVG files in it, avoids its warning about a missing `src/icons`.
       */
      icon({ iconDir: 'src/assets' }),
      ...(isProductionBuild
         ? [
              {
                 name: 'prefix-root-relative-links',
                 hooks: {
                    'astro:build:done': async ({ dir }) => {
                       await prefixRootRelativeLinks(dir);
                    },
                 },
              },
              sitemap({ filter: isSearchablePage }),
              // Writes llms.txt, llms-full.txt, and a Markdown copy of each page for AI tools.
              llms({
                 siteUrl: `${site}${productionBase.replace(/\/$/, '')}`,
                 name: 'a11ied',
                 description:
                    'A CLI, testing library, and MCP server for automated screen reader and accessibility testing.',
                 exclude: [...LLMS_DEFAULT_EXCLUDES, ...LLMS_EXCLUDED_SECTIONS],
                 excludeSelectors: LLMS_NOISE_SELECTORS,
              }),
           ]
         : []),
   ],
});
