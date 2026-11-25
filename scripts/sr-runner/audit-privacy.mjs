import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { findPrivacyViolations } from './privacy.mjs';

function collectJsonFiles(dirPath, out = []) {
   if (!existsSync(dirPath)) {
      return out;
   }
   for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = resolve(dirPath, entry.name);
      if (entry.isDirectory()) {
         collectJsonFiles(fullPath, out);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
         out.push(fullPath);
      }
   }
   return out;
}

const dataRoot = resolve(process.cwd(), 'packages', 'support-data', 'data');
const resultsDir = resolve(dataRoot, 'results');
const ariaAtDir = resolve(dataRoot, 'aria-at');

const jsonFiles = [
   ...collectJsonFiles(resultsDir),
   ...collectJsonFiles(ariaAtDir),
].toSorted();

let totalViolations = 0;

for (const filePath of jsonFiles) {
   const label = relative(dataRoot, filePath);
   const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
   const violations = findPrivacyViolations(parsed);
   if (violations.length > 0) {
      totalViolations += violations.length;
      process.stderr.write(`Privacy violations in ${label}:\n`);
      for (const item of violations) {
         process.stderr.write(`  - ${item.path}: ${item.rule} (${item.excerpt})\n`);
      }
   } else {
      process.stdout.write(`OK: ${label} (0 privacy issues)\n`);
   }
}

if (totalViolations > 0) {
   process.exitCode = 1;
}
