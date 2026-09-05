import type { AxeImpact, AxeRuleResult, AxeRunResult } from '@a11ied/contracts';

const SARIF_SCHEMA =
   'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';
const SARIF_VERSION = '2.1.0';

type SarifLevel = 'error' | 'warning' | 'note';

interface SarifReportingDescriptor {
   id: string;
   name: string;
   shortDescription: { text: string };
   fullDescription: { text: string };
   helpUri: string;
}

interface SarifResult {
   ruleId: string;
   level: SarifLevel;
   message: { text: string };
   locations: Array<{
      physicalLocation: { artifactLocation: { uri: string } };
      logicalLocations: Array<{ fullyQualifiedName: string }>;
   }>;
}

export interface AxeSarifLog {
   $schema: string;
   version: '2.1.0';
   runs: Array<{
      tool: {
         driver: {
            name: string;
            informationUri: string;
            rules: SarifReportingDescriptor[];
         };
      };
      results: SarifResult[];
   }>;
}

function mapImpactToSarifLevel(impact: AxeImpact): SarifLevel {
   if (impact === 'critical' || impact === 'serious') {
      return 'error';
   }
   if (impact === 'minor') {
      return 'note';
   }
   return 'warning';
}

function buildRuleDescriptor(rule: AxeRuleResult): SarifReportingDescriptor {
   return {
      id: rule.id,
      name: rule.id,
      shortDescription: { text: rule.help },
      fullDescription: { text: rule.description },
      helpUri: rule.helpUrl,
   };
}

function collectRuleDescriptors(results: AxeRunResult[]): SarifReportingDescriptor[] {
   const byId = new Map<string, SarifReportingDescriptor>();
   for (const result of results) {
      for (const rule of result.violations) {
         if (!byId.has(rule.id)) {
            byId.set(rule.id, buildRuleDescriptor(rule));
         }
      }
   }
   return [...byId.values()];
}

function buildSarifResults(result: AxeRunResult): SarifResult[] {
   return result.violations.flatMap((rule) =>
      rule.nodes.map((node) => ({
         ruleId: rule.id,
         level: mapImpactToSarifLevel(rule.impact),
         message: { text: node.failureSummary ?? rule.help },
         locations: [
            {
               physicalLocation: { artifactLocation: { uri: result.url } },
               logicalLocations: [{ fullyQualifiedName: node.target.join(' ') }],
            },
         ],
      })),
   );
}

/**
 * Builds a SARIF 2.1.0 log from one or more axe scan results, for `a1 axe --format
 * sarif`.
 */
export function buildAxeSarifLog(results: AxeRunResult[]): AxeSarifLog {
   return {
      $schema: SARIF_SCHEMA,
      version: SARIF_VERSION,
      runs: [
         {
            tool: {
               driver: {
                  name: 'axe-core',
                  informationUri: 'https://github.com/dequelabs/axe-core',
                  rules: collectRuleDescriptors(results),
               },
            },
            results: results.flatMap((result) => buildSarifResults(result)),
         },
      ],
   };
}
