import {
   mkdir,
   mkdtemp,
   readFile,
   readlink,
   rm,
   symlink,
   writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { recordEvidence } from '../evidence/store.js';
import { updateAuditRun } from '../audit/run-store.js';
import { buildReportBundle } from './runtime.js';
import { createCoupledReport, writeReportTestDraft } from './test-fixtures.js';

const roots: string[] = [];

afterEach(async () => {
   await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
   );
});

async function moveRegisteredArtifact(
   saved: Awaited<ReturnType<typeof createCoupledReport>>,
   outDir: string,
): Promise<{ bytes: Buffer; file: string }> {
   const artifact = saved.fixture.record.provenance?.artifacts[0];
   if (!artifact) {
      throw new Error('The fixture needs raw evidence.');
   }
   const root = dirname(saved.fixture.runFile);
   const bytes = await readFile(resolve(root, artifact.path)),
      oldPath = artifact.path;
   await mkdir(outDir);
   const file = join(outDir, 'report.json');
   await writeFile(file, bytes);
   artifact.path = relative(root, file);
   await updateAuditRun({
      file: saved.fixture.runFile,
      change(run) {
         for (const state of run.states) {
            state.artifacts = state.artifacts.map((path) =>
               path === oldPath ? artifact.path : path,
            );
         }
         return run;
      },
   });
   return { bytes, file };
}

describe('report input protection', () => {
   it('preserves an inventory link inside the output directory', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'a11ied-report-input-'));
      roots.push(directory);
      const saved = await writeReportTestDraft(directory);
      const bytes = await readFile(saved.inventoryPath, 'utf8'),
         outDir = join(directory, 'report');
      await mkdir(outDir);
      const inventoryPath = join(outDir, 'report.json');
      await symlink(saved.inventoryPath, inventoryPath);

      await expect(
         buildReportBundle({
            ...saved,
            inventoryPath,
            outDir,
            draft: true,
            formats: ['json'],
            version: '0.1.0',
         }),
      ).rejects.toThrow('must not contain audit input');
      expect(await readlink(inventoryPath)).toStrictEqual(saved.inventoryPath);
      expect(await readFile(saved.inventoryPath, 'utf8')).toStrictEqual(bytes);
   });

   it('preserves validated raw evidence when its filename conflicts with a report output', async () => {
      const saved = await createCoupledReport(roots);
      const outDir = join(dirname(saved.fixture.runFile), 'raw-evidence-output');
      const { bytes, file } = await moveRegisteredArtifact(saved, outDir);
      const recorded = await recordEvidence(saved.fixture.record, saved.fixture);

      expect(recorded.record.verification?.status).toStrictEqual('verified');
      await expect(
         buildReportBundle({
            ...saved,
            outDir,
            draft: true,
            formats: ['json'],
            version: '0.1.0',
         }),
      ).rejects.toThrow('must not contain audit input');
      expect(await readFile(file)).to.eql(bytes);
   });
});

describe('draft report evidence diagnostics', () => {
   it('keeps draft scanner output when an artifact path is invalid', async () => {
      const saved = await createCoupledReport(roots);
      const artifact = saved.fixture.record.provenance?.artifacts[0];
      if (!artifact) {
         throw new Error('The fixture needs raw evidence.');
      }
      const recorded = await recordEvidence(saved.fixture.record, saved.fixture);
      const persisted = recorded.record.provenance?.artifacts[0];
      if (!persisted) {
         throw new Error('The fixture needs persisted evidence.');
      }
      persisted.path = '\0invalid-artifact.json';
      await writeFile(recorded.file, `${JSON.stringify(recorded.record)}\n`);
      const result = await buildReportBundle({
         ...saved,
         draft: true,
         formats: ['json'],
         version: '0.1.0',
      });

      expect(result.model.pages[0]?.error).toBeUndefined();
      expect(result.model.pages[0]?.criteria.length).toBeGreaterThan(0);
      expect(result.model.pages[0]?.recorded[0]?.verification?.status).toStrictEqual(
         'unverified',
      );
      expect(result.model.assessment?.complete).toStrictEqual(false);
   });
});
