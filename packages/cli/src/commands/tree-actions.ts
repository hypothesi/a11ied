import type { AriaTreeNode } from '#core';

export interface TreeActionOptions {
   json?: boolean;
   verbose?: boolean;
   html?: string;
   timeout?: string;
   waitFor?: string;
   role?: string;
   name?: string;
   click?: string;
}

function parseTimeoutMs(timeout: string | undefined): number | undefined {
   if (timeout === undefined) {
      return undefined;
   }
   return Number.parseInt(timeout, 10);
}

function buildTreeFilter(
   options: TreeActionOptions,
): ((node: AriaTreeNode) => boolean) | undefined {
   if (!options.role && !options.name) {
      return undefined;
   }
   const namePattern = options.name?.toLowerCase();
   return (node: AriaTreeNode): boolean => {
      if (options.role && node.role !== options.role) {
         return false;
      }
      if (namePattern && !(node.name ?? '').toLowerCase().includes(namePattern)) {
         return false;
      }
      return true;
   };
}

export async function handleTreeAction(
   target: string | undefined,
   options: TreeActionOptions,
): Promise<{
   target: { kind: string; value: string };
   result: { yaml: string; nodes: AriaTreeNode[] };
}> {
   const [{ resolvePageTarget }, { buildPageTargetInput }, core] = await Promise.all([
      import('../lib/execute.js'),
      import('../lib/target-input.js'),
      import('#core'),
   ]);
   const resolved = await resolvePageTarget(
      buildPageTargetInput(target, options, 'tree'),
   );
   const tree = await core.getAccessibilityTree(resolved.load, {
      timeoutMs: parseTimeoutMs(options.timeout),
      waitFor: options.waitFor,
      click: options.click,
   });

   const filter = buildTreeFilter(options);
   if (!filter) {
      return { target: resolved.reportTarget, result: tree };
   }

   const nodes = core.filterAriaTree(tree.nodes, filter);
   return {
      target: resolved.reportTarget,
      result: { yaml: core.serializeAriaTree(nodes), nodes },
   };
}
