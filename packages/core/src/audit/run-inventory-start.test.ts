import { lstat, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
   buildInitialInventory,
   readInventory,
   writeInventoryAtomic,
} from '../discovery/inventory.js';
import { createAuditRun, readAuditRun, type CreateAuditRunOptions } from './run-store.js';
import { startAuditAssessment } from './run-lifecycle.js';
import { registerAuditState } from './run-state.js';
import { buildState, environment, target } from './test-fixtures.js';

const roots: string[] = [];

afterEach(async () => {
   await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
   );
});

async function assertConflict(conflict: string): Promise<void> {
   const root = await realpath(
      await mkdtemp(resolve(tmpdir(), 'a11ied-inventory-conflict-')),
   );
   roots.push(root);
   const file = resolve(root, 'run.json'),
      inventory = buildInitialInventory(target.value, { scope: 'site' }),
      inventoryPath = resolve(root, 'inventory.json');
   if (conflict === 'path') {
      inventory.run.assessmentFile = resolve(root, 'owned.json');
   }
   if (conflict === 'profile') {
      inventory.run.profile = { wcagVersion: '2.1', level: 'AAA' };
   }
   await writeInventoryAtomic(inventory, inventoryPath);

   await expect(
      startAuditAssessment({
         file,
         inventoryPath,
         target:
            conflict === 'target'
               ? { kind: 'url', value: 'https://createdbyfireside.com/contact/' }
               : target,
         environment,
         profile: { level: 'AA', wcagVersion: '2.2' },
         actionPolicy: {
            allowedOrigins: ['https://createdbyfireside.com'],
            allowFormSubmission: false,
            allowDestructiveActions: false,
         },
         scope: conflict === 'scope' ? 'page' : 'site',
         ...(conflict === 'id' ? { runId: 'other-run' } : {}),
      }),
   ).rejects.toThrow('inventory');
   await expect(readAuditRun(file)).rejects.toMatchObject({ code: 'ENOENT' });
   expect(await readInventory(inventoryPath)).to.eql(inventory);
}

async function assertRecovery(): Promise<void> {
   const root = await realpath(
      await mkdtemp(resolve(tmpdir(), 'a11ied-inventory-recovery-')),
   );
   roots.push(root);
   const inventory = buildInitialInventory(target.value, { scope: 'site' }),
      inventoryPath = resolve(root, 'inventory.json'),
      options = {
         file: resolve(root, 'run.json'),
         inventoryPath,
         target,
         environment,
         profile: { level: 'AA', wcagVersion: '2.2' },
         actionPolicy: {
            allowedOrigins: ['https://createdbyfireside.com'],
            allowFormSubmission: false,
            allowDestructiveActions: false,
         },
         scope: 'site',
      } satisfies CreateAuditRunOptions;
   await writeInventoryAtomic(inventory, inventoryPath);
   const created = await createAuditRun({ ...options, runId: inventory.run.runId });
   const observed = await registerAuditState({
      file: created.file,
      state: buildState(),
   });
   const [first, second] = await Promise.all([
      startAuditAssessment(options),
      startAuditAssessment(options),
   ]);

   expect(first.file).toStrictEqual(second.file);
   expect(first.status.run.states).to.eql(observed.states);
   expect(second.status.run.states).to.eql(observed.states);
   const linked = await readInventory(inventoryPath);

   expect(linked.run.assessmentFile).toStrictEqual(created.file);
   expect(second.status.run.actionPolicy).to.eql(created.run.actionPolicy);
}

async function assertOwnership(): Promise<void> {
   const root = await realpath(
      await mkdtemp(resolve(tmpdir(), 'a11ied-inventory-owner-')),
   );
   roots.push(root);
   const inventory = buildInitialInventory(target.value, { scope: 'site' }),
      inventoryPath = resolve(root, 'inventory.json'),
      options = {
         file: resolve(root, 'run.json'),
         target,
         environment,
         profile: { wcagVersion: '2.2', level: 'AA' },
         scope: 'site',
      } as const;
   await writeInventoryAtomic(inventory, inventoryPath);
   const created = await createAuditRun({ ...options, runId: inventory.run.runId });
   const saved = await readAuditRun(created.file);

   await expect(startAuditAssessment({ ...options, inventoryPath })).rejects.toThrow(
      'different inventory',
   );
   expect(await readAuditRun(created.file)).to.eql(saved);
   expect(await readInventory(inventoryPath)).to.eql(inventory);
}

async function assertStartup(): Promise<void> {
   const root = await realpath(
      await mkdtemp(resolve(tmpdir(), 'a11ied-inventory-start-')),
   );
   roots.push(root);
   const inventory = buildInitialInventory(target.value, { scope: 'site' }),
      inventoryPath = resolve(root, 'inventory.json');
   await writeInventoryAtomic(inventory, inventoryPath);
   const started = await startAuditAssessment({
      file: resolve(root, 'custom', 'run.json'),
      inventoryPath,
      target: { kind: 'url', value: 'https://createdbyfireside.com' },
      environment,
      profile: { wcagVersion: '2.2', level: 'AA' },
      scope: 'site',
      actionPolicy: {
         allowedOrigins: ['https://createdbyfireside.com'],
         allowFormSubmission: false,
         allowDestructiveActions: false,
      },
   });
   const linked = await readInventory(inventoryPath);

   expect(started.status.run.runId).toStrictEqual(inventory.run.runId);
   expect(linked.run.assessmentFile).toStrictEqual(started.file);
   expect(linked.run.profile).to.eql(started.status.run.profile);
   expect(
      started.status.issues.some((issue) => issue.code === 'audit-inventory-mismatch'),
   ).toStrictEqual(false);
   expect(started.status.complete).toStrictEqual(false);
}

async function createAliases(
   root: string,
   directoryAlias: boolean,
): Promise<{ file: string; inventoryPath: string }> {
   const alias = resolve(root, 'alias');
   if (directoryAlias) {
      await symlink(root, alias, 'dir');
      return {
         file: resolve(alias, 'run.json'),
         inventoryPath: resolve(alias, 'inventory.json'),
      };
   }
   await symlink(resolve(root, 'inventory.json'), alias);
   const file = resolve(root, 'run-alias.json');
   await symlink(resolve(root, 'run.json'), file);
   return { file, inventoryPath: alias };
}

async function assertSymlink(path: string): Promise<void> {
   const stat = await lstat(path);

   expect(stat.isSymbolicLink()).toStrictEqual(true);
}

async function assertAliasMutation(file: string, physical: string): Promise<void> {
   const observed = await registerAuditState({ file, state: buildState() });
   const saved = await readAuditRun(physical);

   expect(saved.states).to.eql(observed.states);
   expect(saved.states).toHaveLength(1);
   expect(saved.revision).toStrictEqual(observed.revision);
}

async function assertAliases(directoryAlias: boolean): Promise<void> {
   const root = await realpath(
      await mkdtemp(resolve(tmpdir(), 'a11ied-inventory-alias-')),
   );
   roots.push(root);
   const inventory = buildInitialInventory(target.value, { scope: 'site' }),
      inventoryPath = resolve(root, 'inventory.json');
   await writeInventoryAtomic(inventory, inventoryPath);
   const options = {
      inventoryPath,
      target,
      environment,
      profile: { level: 'AA', wcagVersion: '2.2' },
      scope: 'site',
   } as const;
   const aliases = await createAliases(root, directoryAlias),
      first = await startAuditAssessment(options),
      second = await startAuditAssessment({
         ...options,
         ...aliases,
      });
   const linked = await readInventory(inventoryPath);
   await writeInventoryAtomic(linked, aliases.inventoryPath);

   await assertSymlink(resolve(root, 'alias'));
   expect(second.file).toStrictEqual(first.file);
   expect(linked.run.assessmentFile).toStrictEqual(first.file);
   expect(
      second.status.issues.some((issue) => issue.code === 'audit-inventory-mismatch'),
   ).toStrictEqual(false);
   if (!directoryAlias) {
      await assertAliasMutation(aliases.file, first.file);
      await assertSymlink(aliases.file);
   }
}

describe('inventory assessment startup', () => {
   it.each([false, true])(
      'preserves filesystem aliases with directory=%s',
      assertAliases,
   );
   it.each(['target', 'scope', 'id', 'path', 'profile'])(
      'rejects a conflicting inventory %s before creating a coordinator',
      assertConflict,
   );
   it(
      'recovers a matching coordinator created before its inventory link was written',
      assertRecovery,
   );
   it(
      'preserves an unrelated coordinator rather than attaching it to an inventory',
      assertOwnership,
   );
   it(
      'links a discovered inventory to its coordinator without editing JSON',
      assertStartup,
   );
});
