import { preferredEvidenceModeSchema } from '@a11ied/contracts';

import type { StrategySeed } from '../shared/types.js';

function buildHybridOverride(procedureIds: string[], notes: string[]): StrategySeed {
   return {
      preferredEvidenceMode: preferredEvidenceModeSchema.parse('hybrid'),
      procedureIds,
      requiresRealTarget: true,
      notes,
   };
}

function buildManualOverride(procedureIds: string[], notes: string[]): StrategySeed {
   return {
      preferredEvidenceMode: preferredEvidenceModeSchema.parse('manual'),
      procedureIds,
      requiresRealTarget: true,
      notes,
   };
}

function buildFocusObscuredOverride(): StrategySeed {
   return buildHybridOverride(
      ['focus_obscured_probe'],
      [
         'Focus obscuration requires a real rendered target and movement through the interface.',
      ],
   );
}

function buildNavigationOverrides(): Record<string, StrategySeed> {
   return {
      '2.4.1': buildHybridOverride(
         ['landmark_sequence'],
         [
            'Bypass-block alternatives need structure and navigation evidence on a real target.',
         ],
      ),
      '2.4.3': buildHybridOverride(
         ['focus_order_probe'],
         ['Focus order depends on interaction flow, not just static structure.'],
      ),
      '2.4.7': buildHybridOverride(
         ['focus_visibility_probe'],
         ['Focus visibility needs visual and interaction evidence beyond static rules.'],
      ),
      '2.4.11': buildFocusObscuredOverride(),
      '2.4.12': buildFocusObscuredOverride(),
      '2.4.13': buildHybridOverride(
         ['focus_obscured_probe'],
         [
            'Focus appearance requires rendered-state evidence, not just static markup inspection.',
         ],
      ),
   };
}

function buildInputOverrides(): Record<string, StrategySeed> {
   return {
      '3.2.6': buildManualOverride(
         ['cross_page_consistency_review', 'manual_review'],
         [
            'Consistent help is cross-page behavior and still needs product-aware manual review.',
         ],
      ),
      '3.3.7': buildHybridOverride(
         ['redundant_entry_probe'],
         ['Redundant entry is flow-based and needs repeated-journey evidence.'],
      ),
      '3.3.8': buildManualOverride(
         ['auth_flow_probe', 'manual_review'],
         ['Accessible authentication still needs product-aware manual review in v0.3.0.'],
      ),
      '3.3.9': buildManualOverride(
         ['auth_flow_probe', 'manual_review'],
         [
            'Enhanced authentication requirements still need product-aware manual review in v0.3.0.',
         ],
      ),
      '4.1.3': buildHybridOverride(
         ['status_message_probe'],
         [
            'Status messages need announcement evidence from assistive technology without forced focus changes.',
         ],
      ),
   };
}

function buildStrategyOverrides(): Record<string, StrategySeed> {
   return {
      ...buildNavigationOverrides(),
      ...buildInputOverrides(),
   };
}

export function strategyOverrideForCriterion(
   criterionId: string,
): StrategySeed | undefined {
   return buildStrategyOverrides()[criterionId];
}

export function defaultStrategySeed(hasAxe: boolean, hasAct: boolean): StrategySeed {
   if (hasAxe) {
      return {
         preferredEvidenceMode: preferredEvidenceModeSchema.parse('automated'),
         procedureIds: ['axe_scan'],
         requiresRealTarget: false,
         notes: ['axe rules decide this criterion.'],
      };
   }
   if (hasAct) {
      return {
         preferredEvidenceMode: preferredEvidenceModeSchema.parse('hybrid'),
         procedureIds: ['manual_review'],
         requiresRealTarget: true,
         notes: ['ACT mappings exist, but there is no built-in ACT executor in v0.3.0.'],
      };
   }
   return {
      preferredEvidenceMode: preferredEvidenceModeSchema.parse('manual'),
      procedureIds: ['manual_review'],
      requiresRealTarget: true,
      notes: ['No direct axe or ACT mapping was found for this criterion.'],
   };
}
