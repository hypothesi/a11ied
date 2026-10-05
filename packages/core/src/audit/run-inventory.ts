import { dirname, resolve } from 'node:path';

import {
   auditEnvironmentSchema,
   auditProfileSchema,
   auditRunSchema,
   type AuditEnvironment,
   type AuditRun,
   type SiteInventory,
} from '@a11ied/contracts';
import { readInventory, updateInventoryAtomic } from '../discovery/inventory.js';
import { CliUsageError } from '../errors/cli-errors.js';
import { getCanonicalPath, withFileLock } from '../files/atomic-json.js';
import {
   createAuditRun,
   getAuditRunPaths,
   readAuditRun,
   type CreateAuditRunOptions,
} from './run-store.js';

async function readOrCreateRun(
   options: CreateAuditRunOptions & { file: string },
): Promise<AuditRun> {
   try {
      return await readAuditRun(options.file);
   } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
         throw error;
      }
      const created = await createAuditRun(options);
      return created.run;
   }
}

function assertImportIdentity(input: {
   run: AuditRun;
   inventory: SiteInventory;
   profile: AuditRun['profile'];
   environment: AuditEnvironment;
}): void {
   const { environment, inventory, profile, run } = input;
   if (
      run.runId !== inventory.run.runId ||
      run.target.kind !== 'url' ||
      run.scope !== inventory.run.scope ||
      new URL(run.target.value).href !== new URL(inventory.startUrl).href ||
      run.profile.level !== profile.level ||
      run.profile.wcagVersion !== profile.wcagVersion ||
      JSON.stringify(
         run.environments.find(
            (item) => item.environmentId === environment.environmentId,
         ),
      ) !== JSON.stringify(environment)
   ) {
      throw new CliUsageError(
         'audit-import-mismatch',
         'This inventory is linked to a different audit profile, target, or environment.',
      );
   }
}

async function assertInventoryStartOptions(
   options: Partial<CreateAuditRunOptions>,
   inventory: SiteInventory,
   file: string,
): Promise<void> {
   const mismatchedFile =
         inventory.run.assessmentFile !== undefined &&
         (await getCanonicalPath(inventory.run.assessmentFile)) !== file,
      mismatchedId = options.runId !== undefined && options.runId !== inventory.run.runId,
      mismatchedScope =
         options.scope !== undefined && options.scope !== inventory.run.scope,
      mismatchedTarget =
         options.target &&
         (options.target.kind !== 'url' ||
            new URL(options.target.value).href !== new URL(inventory.startUrl).href);
   if (mismatchedTarget || mismatchedScope || mismatchedId || mismatchedFile) {
      throw new CliUsageError(
         'audit-import-mismatch',
         'The requested target, scope, run ID, or path conflicts with this inventory.',
      );
   }
   if (
      inventory.run.profile &&
      (inventory.run.profile.wcagVersion !== options.profile?.wcagVersion ||
         inventory.run.profile.level !== options.profile?.level)
   ) {
      throw new CliUsageError(
         'audit-import-mismatch',
         'The inventory uses a different WCAG profile.',
      );
   }
}

async function assertExistingInventoryRun(input: {
   run: AuditRun;
   inventoryPath: string;
   actionPolicy: CreateAuditRunOptions['actionPolicy'];
}): Promise<void> {
   const { run, inventoryPath, actionPolicy } = input;
   if (
      !run.inventoryPath ||
      (await getCanonicalPath(run.inventoryPath)) !== inventoryPath ||
      (actionPolicy && JSON.stringify(actionPolicy) !== JSON.stringify(run.actionPolicy))
   ) {
      throw new CliUsageError(
         'audit-import-mismatch',
         'The existing coordinator has a different inventory or action policy.',
      );
   }
}

/** Link discovery without turning old audited flags into assessment evidence. */
export async function migrateInventoryAuditRun(
   input: {
      inventoryPath: string;
      profile: AuditRun['profile'];
      environment: AuditEnvironment;
   } & Partial<
      Pick<CreateAuditRunOptions, 'file' | 'runId' | 'scope' | 'target' | 'actionPolicy'>
   >,
): Promise<Awaited<ReturnType<typeof createAuditRun>>> {
   const actionPolicy =
         input.actionPolicy &&
         auditRunSchema.shape.actionPolicy.parse(input.actionPolicy),
      environment = auditEnvironmentSchema.parse(input.environment),
      profile = auditProfileSchema.parse(input.profile);
   const inventoryPath = await getCanonicalPath(input.inventoryPath);
   const inventory = await readInventory(inventoryPath);
   const paths = getAuditRunPaths(
      await getCanonicalPath(
         input.file ??
            inventory.run.assessmentFile ??
            resolve(dirname(inventoryPath), 'run.json'),
      ),
   );
   await assertInventoryStartOptions(input, inventory, paths.file);
   const run = await withFileLock(paths.file, async () =>
      readOrCreateRun({
         file: paths.file,
         runId: inventory.run.runId,
         target: { kind: 'url', value: inventory.startUrl },
         scope: inventory.run.scope,
         profile,
         environment,
         inventoryPath,
         actionPolicy,
      }),
   );
   assertImportIdentity({ run, inventory, profile, environment });
   await assertExistingInventoryRun({ run, inventoryPath, actionPolicy });
   await updateInventoryAtomic({
      path: inventoryPath,
      async change(current) {
         await assertInventoryStartOptions(input, current, paths.file);
         assertImportIdentity({
            run,
            inventory: current,
            profile,
            environment,
         });
         return {
            ...current,
            run: {
               ...current.run,
               assessmentFile: paths.file,
               profile: run.profile,
            },
         };
      },
   });
   return { run, ...paths };
}
