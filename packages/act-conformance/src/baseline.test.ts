import { describe, expect, it } from 'vitest';

import { diffBaseline, listContradictions, type BaselineEntry } from './baseline.js';
import type { CaseOutcome } from './run.js';

function buildEntry(overrides: Partial<BaselineEntry> = {}): BaselineEntry {
   return {
      actRuleId: '09o5cg',
      axeRuleId: 'color-contrast',
      testcaseId: 'aaa111',
      expected: 'failed',
      actual: 'passed',
      ...overrides,
   };
}

function buildOutcome(overrides: Partial<CaseOutcome> = {}): CaseOutcome {
   return {
      testcaseId: 'aaa111',
      testcaseTitle: 'Failed Example 1',
      actRuleId: '09o5cg',
      axeRuleId: 'color-contrast',
      expected: 'failed',
      actual: 'passed',
      approved: true,
      contradiction: true,
      sourceUrl: 'https://www.w3.org/WAI/content-assets/wcag-act-rules/testcases/x.html',
      ...overrides,
   };
}

function assertOnlyContradictionsAreListed(): void {
   const entries = listContradictions([
      buildOutcome(),
      buildOutcome({ testcaseId: 'bbb222', contradiction: false, actual: 'failed' }),
   ]);

   expect(entries).toHaveLength(1);
   expect(entries[0]?.testcaseId).toStrictEqual('aaa111');
}

function assertNewContradictionIsAdded(): void {
   const diff = diffBaseline({ contradictions: [] }, [buildEntry()]);

   expect(diff.added).toHaveLength(1);
   expect(diff.removed).toHaveLength(0);
}

function assertFixedContradictionIsRemoved(): void {
   const diff = diffBaseline({ contradictions: [buildEntry()] }, []);

   expect(diff.added).toHaveLength(0);
   expect(diff.removed).toHaveLength(1);
}

function assertUnchangedBaselineIsQuiet(): void {
   const diff = diffBaseline({ contradictions: [buildEntry()] }, [buildEntry()]);

   expect(diff.added).toHaveLength(0);
   expect(diff.removed).toHaveLength(0);
}

function assertSiblingRulesAreDistinct(): void {
   const diff = diffBaseline({ contradictions: [buildEntry()] }, [
      buildEntry(),
      buildEntry({ axeRuleId: 'color-contrast-enhanced' }),
   ]);

   expect(diff.added).toHaveLength(1);
   expect(diff.added[0]?.axeRuleId).toStrictEqual('color-contrast-enhanced');
}

function assertOutcomeChangeIsANewEntry(): void {
   const diff = diffBaseline({ contradictions: [buildEntry()] }, [
      buildEntry({ actual: 'inapplicable' }),
   ]);

   expect(diff.added).toHaveLength(1);
   expect(diff.removed).toHaveLength(1);
}

describe('listContradictions', () => {
   it(
      'keeps only the outcomes flagged as contradictions',
      assertOnlyContradictionsAreListed,
   );
});

describe('diffBaseline', () => {
   it('reports a contradiction missing from the baseline', assertNewContradictionIsAdded);
   it(
      'reports a baselined contradiction that no longer happens',
      assertFixedContradictionIsRemoved,
   );
   it('stays quiet when the run matches the baseline', assertUnchangedBaselineIsQuiet);
   it('tracks sibling axe rules separately', assertSiblingRulesAreDistinct);
   it(
      'treats a changed outcome as both added and removed',
      assertOutcomeChangeIsANewEntry,
   );
});
