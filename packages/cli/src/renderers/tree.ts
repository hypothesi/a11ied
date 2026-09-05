import type { CliOutputEnvelope } from '#contracts';
import { dim, title } from '../lib/format.js';
import type { RenderOptions } from './shared.js';

// Fallow-ignore-next-line unused-export
export function renderTreeText(
   envelope: CliOutputEnvelope,
   _options: RenderOptions,
): string {
   const result = envelope.result as { yaml: string };
   if (!result.yaml.trim()) {
      return dim('No accessibility nodes matched.');
   }
   return [title('Accessibility tree'), result.yaml].join('\n');
}
