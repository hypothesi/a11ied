import type { VirtualReader } from './virtual-reader.js';

/**
 * Stable ids for DOM nodes the cursor has visited, so two reads of the same node compare
 * equal without holding the node in the result. The map is weak, so a replaced document
 * drops its ids with it.
 */
const nodeIds = new WeakMap<Node, number>();
let nextNodeId = 1;

function getNodeId(node: Node | null): string {
   if (!node) {
      return 'none';
   }
   const known = nodeIds.get(node);
   if (known !== undefined) {
      return String(known);
   }
   const id = nextNodeId;
   nextNodeId += 1;
   nodeIds.set(node, id);
   return String(id);
}

/**
 * Identifies where the virtual cursor is. A container is visited twice, once on entry and
 * once as "end of ...", so the phrase is part of the key.
 */
export async function getVirtualPositionToken(virtual: VirtualReader): Promise<string> {
   const phrase = await virtual.lastSpokenPhrase().catch(() => '');
   return `${getNodeId(virtual.activeNode)}:${phrase}`;
}

/**
 * The role the virtual reader announces first, such as `heading` in `heading, Title,
 * level 1`. A closing phrase like `end of main` reports the role of the container.
 */
export function getVirtualPhraseRole(phrase: string): string {
   const [role = ''] = phrase.split(',');
   return role
      .trim()
      .toLowerCase()
      .replace(/^end of /u, '');
}
