import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DetectedEditor, installItem } from '@a1st/aix-core';
import { PACKAGE_NAME } from '../lib/constants.js';

export type AgentItem = 'skills' | 'mcp';

type EditorResult = Awaited<ReturnType<typeof installItem>>['results'][number];

interface InstallableItem {
   readonly section: AgentItem;
   readonly name: string;
   readonly value: Record<string, unknown>;
}

export interface AgentInstallOutcome {
   readonly editor: string;
   readonly editorLabel: string;
   readonly section: AgentItem;
   readonly name: string;
   readonly isInstalled: boolean;
   /** Errors, warnings, and the reason an editor skipped the item. */
   readonly messages: readonly string[];
}

/**
 * The published package has the skills next to its bundle, in `dist/skills`. Run from the
 * source, they are in the repository's `packages/skills`.
 */
const SKILLS_DIRECTORY_CANDIDATES = [
   new URL('skills/', import.meta.url),
   new URL('../../../skills/', import.meta.url),
];

function findSkillsDirectory(): string | undefined {
   const found = SKILLS_DIRECTORY_CANDIDATES.find((candidate) => existsSync(candidate));

   return found ? fileURLToPath(found) : undefined;
}

function listSkills(): InstallableItem[] {
   const directory = findSkillsDirectory();

   if (directory === undefined) {
      return [];
   }

   return readdirSync(directory, { withFileTypes: true })
      .filter(
         (entry) =>
            entry.isDirectory() && existsSync(join(directory, entry.name, 'SKILL.md')),
      )
      .map((entry) => ({
         section: 'skills',
         name: entry.name,
         value: { path: join(directory, entry.name) },
      }));
}

/** With a global install the MCP config runs `a1`; otherwise npx fetches a11ied each time. */
function getMcpItem(hasGlobalInstall: boolean): InstallableItem {
   const value = hasGlobalInstall
      ? { command: 'a1', args: ['mcp'] }
      : { command: 'npx', args: ['-y', PACKAGE_NAME, 'mcp'] };

   return { section: 'mcp', name: PACKAGE_NAME, value };
}

export function listSkillNames(): string[] {
   return listSkills().map((skill) => skill.name);
}

export async function detectAgentEditors(): Promise<DetectedEditor[]> {
   const { detectEditors } = await import('@a1st/aix-core');

   return detectEditors(process.cwd());
}

function listSkipReasons(result: EditorResult): string[] {
   return [
      ...Object.values(result.unsupportedFeatures ?? {}),
      ...Object.values(result.targetScopeLimitations ?? {}),
   ].map((detail) => detail.reason);
}

function toOutcome(
   item: InstallableItem,
   result: EditorResult,
   editors: readonly DetectedEditor[],
): AgentInstallOutcome {
   const detected = editors.find((editor) => editor.id === result.editor);
   const skipReasons = listSkipReasons(result);

   return {
      editor: result.editor,
      editorLabel: detected?.displayName ?? result.editor,
      section: item.section,
      name: item.name,
      isInstalled: result.success && skipReasons.length === 0,
      messages: [...result.errors, ...(result.warnings ?? []), ...skipReasons],
   };
}

/**
 * Installs one item after another, because several items can write to the same editor
 * config file and to the same install record.
 */
async function installEach(
   install: typeof installItem,
   items: readonly InstallableItem[],
   editors: readonly DetectedEditor[],
): Promise<AgentInstallOutcome[]> {
   const [item, ...rest] = items;

   if (item === undefined) {
      return [];
   }

   const { results } = await install({
      section: item.section,
      name: item.name,
      value: item.value,
      scope: 'user',
      editors: editors.map((editor) => editor.id),
   });

   return [
      ...results.map((result) => toOutcome(item, result, editors)),
      ...(await installEach(install, rest, editors)),
   ];
}

/**
 * Installs the chosen items for every project on this machine (user scope). Installing
 * again replaces the earlier copy, so it also updates them.
 */
export async function installAgentItems(options: {
   readonly sections: readonly AgentItem[];
   readonly editors: readonly DetectedEditor[];
   readonly hasGlobalInstall: boolean;
}): Promise<AgentInstallOutcome[]> {
   const { installItem: install } = await import('@a1st/aix-core');
   const items = [...listSkills(), getMcpItem(options.hasGlobalInstall)].filter((item) =>
      options.sections.includes(item.section),
   );

   return installEach(install, items, options.editors);
}
