export interface AriaTreeNode {
   role: string;
   name?: string;
   level?: number;
   text?: string;
   children: AriaTreeNode[];
}

const INDENT_UNIT = 2;
const LINE_PATTERN =
   /^(\s*)- ([^\s"[:]+)(?:\s+"((?:[^"\\]|\\.)*)")?(?:\s+\[([^\]]*)\])?:?\s*(.*)$/u;
const LEVEL_ATTR_PATTERN = /level=(\d+)/u;

interface ParsedLine {
   depth: number;
   role: string;
   name: string | undefined;
   level: number | undefined;
   text: string | undefined;
   isProperty: boolean;
}

function parseLevelAttribute(attrs: string | undefined): number | undefined {
   if (!attrs) {
      return undefined;
   }
   const match = LEVEL_ATTR_PATTERN.exec(attrs);
   return match ? Number(match[1]) : undefined;
}

function parseLine(line: string): ParsedLine | undefined {
   const match = LINE_PATTERN.exec(line);
   if (!match) {
      return undefined;
   }
   const [, indent = '', role = '', name, attrs, trailing] = match;
   return {
      depth: Math.floor(indent.length / INDENT_UNIT),
      role,
      name: name || undefined,
      level: parseLevelAttribute(attrs),
      text: trailing || undefined,
      isProperty: role.startsWith('/'),
   };
}

function buildNode(parsed: ParsedLine): AriaTreeNode {
   const node: AriaTreeNode = { role: parsed.role, children: [] };
   if (parsed.name) {
      node.name = parsed.name;
   }
   if (parsed.level !== undefined) {
      node.level = parsed.level;
   }
   if (parsed.text) {
      node.text = parsed.text;
   }
   return node;
}

interface StackFrame {
   depth: number;
   node: AriaTreeNode;
}

function popToDepth(stack: StackFrame[], depth: number): void {
   while ((stack.at(-1)?.depth ?? -1) >= depth) {
      stack.pop();
   }
}

function attachNode(args: {
   roots: AriaTreeNode[];
   stack: StackFrame[];
   parsed: ParsedLine;
}): void {
   popToDepth(args.stack, args.parsed.depth);

   const node = buildNode(args.parsed);
   const parent = args.stack.at(-1);
   if (parent) {
      parent.node.children.push(node);
   } else {
      args.roots.push(node);
   }
   args.stack.push({ depth: args.parsed.depth, node });
}

/**
 * Parses Playwright's `ariaSnapshot()` YAML into a role/name/level/children tree.
 * Property lines such as `/url:` are dropped; they describe the parent node, not a child
 * in the accessibility tree.
 */
export function parseAriaSnapshot(yamlText: string): AriaTreeNode[] {
   const roots: AriaTreeNode[] = [];
   const stack: StackFrame[] = [];

   for (const rawLine of yamlText.split('\n')) {
      if (!rawLine.trim()) {
         continue;
      }
      const parsed = parseLine(rawLine);
      if (!parsed || parsed.isProperty) {
         continue;
      }
      attachNode({ roots, stack, parsed });
   }

   return roots;
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
