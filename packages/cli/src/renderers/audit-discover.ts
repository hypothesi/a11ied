import { siteInventorySchema, type CliOutputEnvelope } from '#contracts';

export function renderAuditDiscoverText(envelope: CliOutputEnvelope): string {
   const inventory = siteInventorySchema.parse(envelope.result);
   const auth = inventory.pages.filter((page) => page.requiresAuth).length,
      destructive = inventory.pages.filter((page) => page.hasDestructiveActions).length,
      duplicates = inventory.pages.filter((page) => page.isDuplicateOf).length;
   return [
      `Discovered ${String(inventory.pages.length)} pages.`,
      `Duplicates folded: ${String(duplicates)}.`,
      `Login likely required: ${String(auth)}.`,
      `Pages with destructive controls: ${String(destructive)}.`,
      inventory.discovery.complete ? 'Inventory is complete.' : 'Inventory is partial.',
   ].join('\n');
}
