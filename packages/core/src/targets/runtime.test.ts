import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CliUsageError } from '../errors/cli-errors.js';
import { resolveDocumentTarget } from './runtime.js';

describe('resolveDocumentTarget / url targets', () => {
   const originalFetch = globalThis.fetch;

   afterEach(() => {
      globalThis.fetch = originalFetch;
   });

   it('builds a goto load without fetching', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      const resolved = await resolveDocumentTarget({
         target: 'https://example.com/page',
      });

      expect(resolved.target).toEqual({
         kind: 'url',
         value: 'https://example.com/page',
      });
      expect(resolved.load).toEqual({
         kind: 'goto',
         url: 'https://example.com/page',
      });
      expect(fetchSpy).not.toHaveBeenCalled();
   });

   it('fetches the markup only when readHtml is called, with a timeout signal', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
         ok: true,
         text: () => Promise.resolve('<p>hi</p>'),
      });
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      const resolved = await resolveDocumentTarget({
         target: 'https://example.com/page',
         timeoutMs: 5000,
      });
      expect(fetchSpy).not.toHaveBeenCalled();

      const html = await resolved.readHtml();
      expect(html).toBe('<p>hi</p>');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, init] = fetchSpy.mock.calls[0] as [string, { signal: AbortSignal }];
      expect(init.signal).toBeInstanceOf(AbortSignal);
   });

   it('memoizes readHtml across repeat calls', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
         ok: true,
         text: () => Promise.resolve('<p>hi</p>'),
      });
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      const resolved = await resolveDocumentTarget({
         target: 'https://example.com/page',
      });
      await resolved.readHtml();
      await resolved.readHtml();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
   });
});

describe('resolveDocumentTarget / file targets', () => {
   let tempDir = '';

   beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'a11ied-target-'));
   });

   afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
   });

   it('resolves a goto load pointing at a file:// URL', async () => {
      const filePath = join(tempDir, 'page.html');
      await writeFile(filePath, '<button></button>', 'utf8');

      const resolved = await resolveDocumentTarget({ target: filePath });

      expect(resolved.target).toEqual({ kind: 'file', value: filePath });
      expect(resolved.load).toEqual({
         kind: 'goto',
         url: `file://${resolve(filePath)}`,
      });
      expect(await resolved.readHtml()).toBe('<button></button>');
   });

   it('reports a missing file as a target-unavailable environment error', async () => {
      const resolved = await resolveDocumentTarget({
         target: join(tempDir, 'missing.html'),
      });
      await expect(resolved.readHtml()).rejects.toThrow(/Could not read file/);
   });
});

describe('resolveDocumentTarget / inline and stdin-shaped targets', () => {
   it('resolves --html directly to an html load with no fetch', async () => {
      const resolved = await resolveDocumentTarget({ html: '<img src=x>' });

      expect(resolved.target).toEqual({ kind: 'html', value: '<img src=x>' });
      expect(resolved.load).toEqual({ kind: 'html', html: '<img src=x>' });
      expect(await resolved.readHtml()).toBe('<img src=x>');
   });
});

describe('resolveDocumentTarget / app targets', () => {
   it('rejects app:<name> for a page command by default', async () => {
      await expect(
         resolveDocumentTarget({ target: 'app:Safari', commandName: 'axe' }),
      ).rejects.toThrow(/axe accepts a URL/);
   });

   it('resolves app:<name> when allowApp is set, with no load', async () => {
      const resolved = await resolveDocumentTarget({
         target: 'app:Safari',
         allowApp: true,
      });
      expect(resolved.target).toEqual({ kind: 'app', value: 'Safari' });
      expect(resolved.load).toBeUndefined();
   });
});

describe('resolveDocumentTarget / missing input', () => {
   it('throws a usage error when no target, url, or html is given', async () => {
      await expect(resolveDocumentTarget({})).rejects.toBeInstanceOf(CliUsageError);
   });
});
