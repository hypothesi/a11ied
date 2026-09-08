import type {
   AxeRuleResult,
   AxeRunResult,
   EarlAssertionInput,
   EarlAssertor,
   EarlOutcome,
   EarlProcedure,
   EarlProfile,
   EarlReport,
} from '@a11ied/contracts';
import { buildEarlReport as buildDocument } from '@a11ied/earl';

import { listCriterionSlugs } from './earl-criteria.js';

/** The release page the report names as `assertedBy` on every assertion. */
const A11IED_RELEASE_URL = 'https://github.com/silvermine/a11ied/releases/tag';

interface AxeBucket {
   rules: AxeRuleResult[];
   outcome: EarlOutcome;
}

function listBuckets(result: AxeRunResult): AxeBucket[] {
   return [
      { rules: result.violations, outcome: 'failed' },
      { rules: result.passes, outcome: 'passed' },
      { rules: result.incomplete, outcome: 'cantTell' },
      { rules: result.inapplicable, outcome: 'inapplicable' },
   ];
}

function buildProcedure(rule: AxeRuleResult, wcagVersion: string): EarlProcedure {
   return {
      title: rule.id,
      url: rule.helpUrl,
      criterionSlugs: listCriterionSlugs(rule.id, wcagVersion),
   };
}

/**
 * The `act` profile writes one assertion per rule, because a test case is atomic enough
 * that a rule yields one outcome. The `report` profile writes one per element so a reader
 * can see which element failed.
 */
function listPointers(
   rule: AxeRuleResult,
   profile: EarlProfile,
): Array<string | undefined> {
   if (profile === 'act' || rule.nodes.length === 0) {
      return [undefined];
   }
   return rule.nodes.map((node) => node.target.join(' '));
}

function buildAssertion(input: {
   subject: string;
   outcome: EarlOutcome;
   procedure: EarlProcedure;
   pointer: string | undefined;
}): EarlAssertionInput {
   const assertion: EarlAssertionInput = {
      subject: input.subject,
      outcome: input.outcome,
      mode: 'automatic',
      procedure: input.procedure,
   };
   if (input.pointer === undefined) {
      return assertion;
   }
   return { ...assertion, pointer: input.pointer };
}

function buildRuleAssertions(input: {
   rule: AxeRuleResult;
   outcome: EarlOutcome;
   result: AxeRunResult;
   profile: EarlProfile;
}): EarlAssertionInput[] {
   const procedure = buildProcedure(input.rule, input.result.wcagVersion);
   return listPointers(input.rule, input.profile).map((pointer) =>
      buildAssertion({
         subject: input.result.url,
         outcome: input.outcome,
         procedure,
         pointer,
      }),
   );
}

/**
 * Maps one axe run to EARL assertions. A run that produced no rule results at all becomes
 * a single `untested` assertion, which is how the report states that nothing applicable
 * ran against the page rather than implying the page is clean.
 */
export function listAxeEarlAssertions(
   result: AxeRunResult,
   profile: EarlProfile,
): EarlAssertionInput[] {
   const assertions = listBuckets(result).flatMap((bucket) =>
      bucket.rules.flatMap((rule) =>
         buildRuleAssertions({ rule, outcome: bucket.outcome, result, profile }),
      ),
   );
   if (assertions.length > 0) {
      return assertions;
   }
   return [{ subject: result.url, outcome: 'untested', mode: 'automatic' }];
}

export interface AxeEarlReportOptions {
   profile: EarlProfile;
   version: string;
}

/** Names a11ied as the tool that made the assertions, at the given release. */
export function buildA11iedAssertor(version: string): EarlAssertor {
   return {
      name: 'a11ied',
      url: `${A11IED_RELEASE_URL}/${version}`,
      revision: version,
   };
}

/**
 * Builds an EARL 1.0 JSON-LD report from one or more axe scan results, for `a1 axe
 * --format earl`.
 */
export function buildAxeEarlReport(
   results: AxeRunResult[],
   options: AxeEarlReportOptions,
): EarlReport {
   return buildDocument({
      assertions: results.flatMap((result) =>
         listAxeEarlAssertions(result, options.profile),
      ),
      assertor: buildA11iedAssertor(options.version),
   });
}
