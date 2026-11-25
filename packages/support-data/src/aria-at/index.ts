import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getSupportDataDirectories } from '../paths.js';
import type {
   AriaAtEnvironmentReport,
   AriaAtPlanFile,
   AriaAtSummaryFile,
} from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAriaAtPlanFile(value: unknown): value is AriaAtPlanFile {
   if (!isRecord(value)) {
      return false;
   }
   return (
      value.schemaVersion === 1 &&
      typeof value.planVersionID === 'string' &&
      typeof value.slug === 'string' &&
      Array.isArray(value.reports)
   );
}

function isAriaAtSummaryFile(value: unknown): value is AriaAtSummaryFile {
   if (!isRecord(value)) {
      return false;
   }
   return (
      value.schemaVersion === 1 &&
      Array.isArray(value.features) &&
      Array.isArray(value.plans)
   );
}

interface AriaAtCacheState {
   summary: AriaAtSummaryFile | undefined;
   plans: readonly AriaAtPlanFile[] | undefined;
}

const cacheState: AriaAtCacheState = {
   summary: undefined,
   plans: undefined,
};

export function resetAriaAtCache(): void {
   cacheState.summary = undefined;
   cacheState.plans = undefined;
}

function loadPlans(): readonly AriaAtPlanFile[] {
   const { ariaAtPlansDir } = getSupportDataDirectories();
   if (!existsSync(ariaAtPlansDir)) {
      return [];
   }
   const loaded: AriaAtPlanFile[] = [];
   const fileNames = readdirSync(ariaAtPlansDir).filter((name) => name.endsWith('.json'));
   for (const fileName of fileNames) {
      const filePath = resolve(ariaAtPlansDir, fileName);
      const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
      if (!isAriaAtPlanFile(parsed)) {
         throw new Error(`Invalid ARIA-AT plan file: ${filePath}`);
      }
      loaded.push(parsed);
   }
   return loaded.toSorted((left, right) => left.title.localeCompare(right.title));
}

export function getAriaAtSummary(): AriaAtSummaryFile {
   if (cacheState.summary) {
      return cacheState.summary;
   }
   const { ariaAtSummaryPath } = getSupportDataDirectories();
   const parsed: unknown = JSON.parse(readFileSync(ariaAtSummaryPath, 'utf8'));
   if (!isAriaAtSummaryFile(parsed)) {
      throw new Error(`Invalid ARIA-AT summary.json payload at ${ariaAtSummaryPath}`);
   }
   cacheState.summary = parsed;
   return parsed;
}

export function listAriaAtPlans(): readonly AriaAtPlanFile[] {
   cacheState.plans ??= loadPlans();
   return cacheState.plans;
}

export function getAriaAtPlanBySlug(slug: string): AriaAtPlanFile | undefined {
   return listAriaAtPlans().find((plan) => plan.slug === slug);
}

export interface AriaAtVersionedEnvironment {
   readonly key: string;
   readonly screenReader: string;
   readonly screenReaderVersion: string;
   readonly browser: string;
   readonly browserVersion: string;
   readonly os: string;
   readonly osVersion: string;
   readonly device: string;
   readonly planCount: number;
   readonly latestTestedAt?: string;
}

function buildAriaAtEnvTupleKey(report: AriaAtEnvironmentReport): string {
   return [
      report.device,
      report.os,
      report.osVersion,
      report.browserName,
      report.browserVersion,
      report.atName,
      report.atVersion,
   ].join(' | ');
}

function compareLatestTimestamp(
   existing: string | undefined,
   candidate: string | undefined,
): string | undefined {
   if (!candidate) {
      return existing;
   }
   if (!existing || candidate > existing) {
      return candidate;
   }
   return existing;
}

interface AriaAtEnvBucket {
   readonly screenReader: string;
   readonly screenReaderVersion: string;
   readonly browser: string;
   readonly browserVersion: string;
   readonly os: string;
   readonly osVersion: string;
   readonly device: string;
   readonly planIDs: Set<string>;
   latestTestedAt?: string;
}

function accumulateAriaAtReport(
   grouped: Map<string, AriaAtEnvBucket>,
   planVersionID: string,
   report: AriaAtEnvironmentReport,
): void {
   const key = buildAriaAtEnvTupleKey(report);
   let bucket = grouped.get(key);
   if (!bucket) {
      bucket = {
         screenReader: report.atName,
         screenReaderVersion: report.atVersion,
         browser: report.browserName,
         browserVersion: report.browserVersion,
         os: report.os,
         osVersion: report.osVersion,
         device: report.device,
         planIDs: new Set<string>(),
         ...(report.markedFinalAt ? { latestTestedAt: report.markedFinalAt } : {}),
      };
      grouped.set(key, bucket);
   }
   bucket.planIDs.add(planVersionID);
   const nextLatest = compareLatestTimestamp(bucket.latestTestedAt, report.markedFinalAt);
   if (nextLatest) {
      bucket.latestTestedAt = nextLatest;
   }
}

export function listAriaAtEnvironments(): readonly AriaAtVersionedEnvironment[] {
   const grouped = new Map<string, AriaAtEnvBucket>();

   for (const plan of listAriaAtPlans()) {
      for (const report of plan.reports) {
         accumulateAriaAtReport(grouped, plan.planVersionID, report);
      }
   }

   const result: AriaAtVersionedEnvironment[] = [];
   for (const [key, item] of grouped.entries()) {
      result.push({
         key,
         screenReader: item.screenReader,
         screenReaderVersion: item.screenReaderVersion,
         browser: item.browser,
         browserVersion: item.browserVersion,
         os: item.os,
         osVersion: item.osVersion,
         device: item.device,
         planCount: item.planIDs.size,
         ...(item.latestTestedAt ? { latestTestedAt: item.latestTestedAt } : {}),
      });
   }

   return result.toSorted((left, right) => {
      const atDiff = left.screenReader.localeCompare(right.screenReader);
      if (atDiff !== 0) {
         return atDiff;
      }
      const atVerDiff = right.screenReaderVersion.localeCompare(left.screenReaderVersion);
      if (atVerDiff !== 0) {
         return atVerDiff;
      }
      return left.browser.localeCompare(right.browser);
   });
}
