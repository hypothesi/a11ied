import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createAuditRun, updateAuditRun } from './run-store.js';
import { registerAuditState } from './run-state.js';
import { buildInitialInventory, writeInventoryAtomic } from '../discovery/inventory.js';
import type {
   AssessmentCheck,
   AssessmentCapability,
   AuditRun,
   AuditEnvironment,
   AuditJourney,
   AuditState,
   TargetReference,
} from '@a11ied/contracts';

export const environment: AuditEnvironment = {
   environmentId: 'mac-voiceover',
   platform: 'voiceover',
   os: 'macOS',
   browser: 'Chrome',
   capabilities: ['keyboard', 'real-reader', 'speech', 'screenshot'],
   limitations: [],
};
export const target: TargetReference = {
   kind: 'url',
   value: 'https://createdbyfireside.com/',
};
/** Keep fixture observations repeatable across persistence and scope regressions. */
export function buildState(
   label = 'Initial',
   fingerprint = 'initial',
): Omit<AuditState, 'stateId' | 'revision' | 'observedAt'> {
   return {
      target,
      label,
      fingerprint,
      environmentId: environment.environmentId,
      artifacts: ['artifacts/snapshot.json'],
      setup: [],
   };
}

/** Keep journey order explicit when exercising scope changes. */
export function buildJourney(stateIds: string[]): AuditJourney {
   return { journeyId: 'menu', label: 'Menu', stateIds, status: 'discovered' };
}

/** Separate element obligations by their observed control identity. */
export function buildElementCheck(
   stateId: string,
   pointer: string,
): Omit<
   AssessmentCheck,
   'checkId' | 'status' | 'attempts' | 'outcome' | 'evidenceIds' | 'reason' | 'updatedAt'
> {
   return {
      criterionId: '4.1.2',
      procedureId: 'wcag_4_1_2',
      procedureVersion: '1',
      scope: 'element',
      stateIds: [stateId],
      journeyId: 'menu',
      pointer,
      environmentId: environment.environmentId,
   };
}

/** Persist scoped fixture metadata without starting a native reader or sending input. */
export async function createObservedAuditRun(
   input: {
      url?: string;
      observedUrl?: string;
      level?: 'AA' | 'AAA';
      capabilities?: AssessmentCapability[];
   } = {},
): Promise<{ file: string; run: AuditRun }> {
   const root = await mkdtemp(resolve(tmpdir(), 'a11ied-run-recovery-'));
   const created = await createAuditRun({
      file: resolve(root, 'run.json'),
      target: { kind: 'url', value: input.url ?? 'https://createdbyfireside.com' },
      environment: {
         ...environment,
         capabilities: input.capabilities ?? [
            'rendered-ui',
            'dom',
            'keyboard',
            'screenshot',
         ],
      },
      scope: 'site',
      profile: { wcagVersion: '2.2', level: input.level ?? 'AA' },
   });
   const run = await registerAuditState({
      file: created.file,
      state: {
         ...buildState(),
         target: {
            kind: 'url',
            value: input.observedUrl ?? new URL(created.run.target.value).href,
         },
      },
   });
   return { file: created.file, run };
}

/** Attach scoped discovery metadata without fabricating observed assessment proof. */
export async function attachObservedAuditInventory(input: {
   file: string;
   run: AuditRun;
}): Promise<string> {
   const inventory = buildInitialInventory(input.run.target.value, { scope: 'site' });
   const inventoryPath = resolve(dirname(input.file), 'inventory.json');
   inventory.run.runId = input.run.runId;
   inventory.run.assessmentFile = input.file;
   inventory.discovery.complete = true;
   inventory.pages.push({
      pageId: 'home',
      url: inventory.startUrl,
      finalUrl: input.run.states[0]?.target.value ?? '',
      status: 200,
      discoveredVia: 'crawl',
      discoveryStatus: 'resolved',
      auditStatus: 'audited',
      requiresAuth: false,
      hasDestructiveActions: false,
   });
   await writeInventoryAtomic(inventory, inventoryPath);
   await updateAuditRun({
      file: input.file,
      change(run) {
         run.inventoryPath = inventoryPath;
         return run;
      },
   });
   return inventoryPath;
}
