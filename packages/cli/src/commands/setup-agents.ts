import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { installItem } from '@a1st/aix-core';
import { editorSupportProfiles } from '@a1st/aix-schema';
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

export function getEditorLabel(editor: string): string {
   const profile = editorSupportProfiles.find((candidate) => candidate.id === editor);

   return profile?.name ?? editor;
}

export function listSkillNames(): string[] {
   return listSkills().map((skill) => skill.name);
}

export async function detectAgentEditors(): Promise<string[]> {
   const { detectEditors } = await import('@a1st/aix-core');

   return detectEditors(process.cwd());
}

function listSkipReasons(result: EditorResult): string[] {
   return [
      ...Object.values(result.unsupportedFeatures ?? {}),
      ...Object.values(result.targetScopeLimitations ?? {}),
   ].map((detail) => detail.reason);
}

function toOutcome(item: InstallableItem, result: EditorResult): AgentInstallOutcome {
   const skipReasons = listSkipReasons(result);

   return {
      editor: result.editor,
      section: item.section,
      name: item.name,
      isInstalled: result.success && skipReasons.length === 0,
      messages: [...result.errors, ...(result.warnings ?? []), ...skipReasons],
   };
}

/**
 * Installs the chosen items for every project on this machine (user scope). Installing
 * again replaces the earlier copy, so it also updates them.
 */
/**
 * Installs one item after another, because several items can write to the same editor
 * config file and to the same install record.
 */
async function installEach(
   install: typeof installItem,
   items: readonly InstallableItem[],
   editors: readonly string[],
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
      editors,
   });

   return [
      ...results.map((result) => toOutcome(item, result)),
      ...(await installEach(install, rest, editors)),
   ];
}

export async function installAgentItems(options: {
   readonly sections: readonly AgentItem[];
   readonly editors: readonly string[];
   readonly hasGlobalInstall: boolean;
}): Promise<AgentInstallOutcome[]> {
   const { installItem: install } = await import('@a1st/aix-core');
   const items = [...listSkills(), getMcpItem(options.hasGlobalInstall)].filter((item) =>
      options.sections.includes(item.section),
   );

   return installEach(install, items, options.editors);
}
