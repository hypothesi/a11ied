import { isMap, isScalar, isSeq, parseDocument } from 'yaml';

export interface AriaTreeNode {
   role: string;
   name?: string;
   level?: number;
   text?: string;
   children: AriaTreeNode[];
}

const DESCRIPTOR_PATTERN =
   /^([^\s"[:]+)(?:\s+"((?:[^"\\]|\\.)*)")?(?:\s+\[([^\]]*)\])?$/u;
const LEVEL_ATTR_PATTERN = /level=(\d+)/u;

function parseDescriptor(descriptor: string): AriaTreeNode | undefined {
   const match = DESCRIPTOR_PATTERN.exec(descriptor);
   if (!match || descriptor.startsWith('/')) {
      return undefined;
   }
   const [, role = '', encodedName, attrs] = match,
      level = LEVEL_ATTR_PATTERN.exec(attrs ?? ''),
      node: AriaTreeNode = { role, children: [] };
   if (encodedName) {
      node.name = JSON.parse(`"${encodedName}"`);
   }
   if (level) {
      node.level = Number(level[1]);
   }
   return node;
}

function parseSnapshotEntry(entry: unknown): AriaTreeNode[] {
   if (isScalar(entry) && typeof entry.value === 'string') {
      const node = parseDescriptor(entry.value);
      return node ? [node] : [];
   }
   if (!isMap(entry)) {
      return [];
   }
   const nodes: AriaTreeNode[] = [];
   for (const pair of entry.items) {
      if (!isScalar(pair.key) || typeof pair.key.value !== 'string') {
         continue;
      }
      const node = parseDescriptor(pair.key.value);
      if (!node) {
         continue;
      }
      if (isSeq(pair.value)) {
         node.children = pair.value.items.flatMap(parseSnapshotEntry);
      } else if (isScalar(pair.value) && pair.value.value !== null) {
         node.text = String(pair.value.value);
      }
      nodes.push(node);
   }
   return nodes;
}

/** Parses snapshot YAML, omitting parent properties such as /url from the tree. */
export function parseAriaSnapshot(yamlText: string): AriaTreeNode[] {
   const document = parseDocument(yamlText);
   if (document.errors.length > 0) {
      throw document.errors[0];
   }
   return isSeq(document.contents)
      ? document.contents.items.flatMap(parseSnapshotEntry)
      : [];
}

function buildNodeHeadline(node: AriaTreeNode): string {
   const parts = [node.role];
   if (node.name) {
      parts.push(`"${node.name}"`);
   }
   const headline = parts.join(' ');
   if (node.level === undefined) {
      return headline;
   }
   return `${headline} [level=${node.level}]`;
}

/** Serializes a filtered tree back into the same YAML-like shape ariaSnapshot() uses. */
export function serializeAriaTree(nodes: AriaTreeNode[], depth = 0): string {
   const indent = '  '.repeat(depth);
   const lines = nodes.flatMap((node) => {
      const headline = buildNodeHeadline(node);
      if (node.children.length > 0) {
         return [`${indent}- ${headline}:`, serializeAriaTree(node.children, depth + 1)];
      }
      const textSuffix = node.text ? `: ${node.text}` : '';
      return [`${indent}- ${headline}${textSuffix}`];
   });
   return lines.join('\n');
}

/** Keeps a node when it matches `predicate`, or when any descendant does (its ancestors). */
export function filterAriaTree(
   nodes: AriaTreeNode[],
   predicate: (node: AriaTreeNode) => boolean,
): AriaTreeNode[] {
   const kept: AriaTreeNode[] = [];
   for (const node of nodes) {
      const filteredChildren = filterAriaTree(node.children, predicate);
      if (predicate(node) || filteredChildren.length > 0) {
         kept.push({ ...node, children: filteredChildren });
      }
   }
   return kept;
}
