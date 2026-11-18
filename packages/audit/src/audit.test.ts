import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
   addLimitation,
   buildAuditReport,
   removeLimitation,
   addPage,
   AuditError,
   blockUnit,
   buildWorkPacket,
   claimNext,
   closeAudit,
   excludePage,
   getAuditStatus,
   getConfig,
   listCriterionRollups,
   listFindings,
   listUnits,
   openAudit,
   putSignal,
   recordAutomatedFinding,
   renderWorkPacket,
   reopenUnit,
   startAudit,
   STATE_SIGNAL_KIND,
   submitUnit,
   type Audit,
   type SubmissionInput,
   type Unit,
} from './index.js';

const LEASE_MINUTES = 20;
const MS_PER_MINUTE = 60_000;
const AA_CRITERIA_COUNT = 55;
const PAGE_PASS_COUNT = 6;
const TWO_PAGE_UNIT_COUNT = 13;

let root = '';
let clock = new Date('2026-01-01T00:00:00Z');
const opened: Audit[] = [];
const DEFAULT_INPUT = { target: 'x' };

function advance(minutes: number): void {
   clock = new Date(clock.getTime() + minutes * MS_PER_MINUTE);
}

function start(overrides: Parameters<typeof startAudit>[0] = DEFAULT_INPUT): Audit {
   const audit = startAudit(
      { ...overrides, target: 'https://example.test', id: 'test', root },
      { now: () => clock },
   );
   opened.push(audit);
   return audit;
}

function passAll(unit: Unit): SubmissionInput {
   return {
      results: unit.criteria.map((criterion) => ({
         criterion,
         outcome: 'pass',
         note: 'Checked and found no problem.',
      })),
   };
}

/** Writes a stand-in screenshot, since findings on web pages need evidence. */
function saveEvidence(store: Audit): string {
   mkdirSync(join(store.dir, 'evidence'), { recursive: true });
   writeFileSync(join(store.dir, 'evidence', 'shot.png'), 'x');
   return 'evidence/shot.png';
}

function claim(store: Audit, worker: string, unitId?: string): Unit {
   const unit = claimNext(store, { worker, unitId });
   if (!unit) {
      throw new Error('Expected a unit to claim.');
   }
   return unit;
}

function getProblems(action: () => unknown): readonly string[] {
   try {
      action();
   } catch (error) {
      if (error instanceof AuditError) {
         return error.problems;
      }
      throw error;
   }
   return [];
}

beforeEach(() => {
   root = mkdtempSync(join(tmpdir(), 'a11ied-audit-'));
   clock = new Date('2026-01-01T00:00:00Z');
});

afterEach(() => {
   for (const audit of opened.splice(0)) {
      closeAudit(audit);
   }
   rmSync(root, { recursive: true, force: true });
});

describe('audit scope', () => {
   it('covers every WCAG 2.2 A and AA criterion by default', () => {
      const store = start();

      expect(getConfig(store).criteria).toHaveLength(AA_CRITERIA_COUNT);
   });

   it('creates one unit per page and pass, plus site-wide units for two pages', () => {
      const store = start();
      addPage(store, { locator: 'https://example.test/' });

      expect(listUnits(store)).toHaveLength(PAGE_PASS_COUNT);

      addPage(store, { locator: 'https://example.test/about' });

      expect(listUnits(store).map((unit) => unit.id)).toContain('site.consistency');
      expect(listUnits(store)).toHaveLength(TWO_PAGE_UNIT_COUNT);
   });

   it('limits units to the passes that own the requested criteria', () => {
      const store = start({
         target: 'x',
         criteria: ['1.4.3', 'focus-visible'],
      });
      addPage(store, { locator: 'https://example.test/' });

      expect(listUnits(store).map((unit) => [unit.id, unit.criteria])).toEqual([
         ['P1.keyboard', ['2.4.7']],
         ['P1.visual', ['1.4.3']],
      ]);
   });

   it('reports a cross-page criterion as not evaluated in a single-page audit', () => {
      const store = start();
      addPage(store, { locator: 'https://example.test/' });

      const rollup = listCriterionRollups(store).find(
         (each) => each.criterion === '3.2.3',
      );

      expect(rollup?.standing).toBe('not-evaluated');
   });

   it('rejects an unknown criterion with a correctable message', () => {
      expect(() => start({ target: 'x', criteria: ['9.9.9'] })).toThrow(
         /not a WCAG 2.2 success criterion/u,
      );
   });
});

describe('claiming work', () => {
   it('gives parallel workers different units on different pages', () => {
      const store = start();
      addPage(store, { locator: 'https://example.test/' });
      addPage(store, { locator: 'https://example.test/about' });

      const first = claim(store, 'w1');
      const second = claim(store, 'w2');

      expect(first.id).not.toBe(second.id);
      expect(first.pageId).not.toBe(second.pageId);
   });

   it('returns the same unit to a worker that asks again', () => {
      const store = start();
      addPage(store, { locator: 'https://example.test/' });

      const first = claim(store, 'w1');
      const again = claim(store, 'w1');

      expect(again.id).toBe(first.id);
      expect(again.attempts).toBe(1);
   });

   it('returns an abandoned unit to the queue when its lease expires', () => {
      const store = start({ target: 'x', criteria: ['2.4.7'] });
      addPage(store, { locator: 'https://example.test/' });
      claim(store, 'w1');
      advance(LEASE_MINUTES + 1);

      const taken = claim(store, 'w2');

      expect(taken.id).toBe('P1.keyboard');
      expect(taken.worker).toBe('w2');
   });

   it('blocks a unit that three workers abandoned', () => {
      const store = start({ target: 'x', criteria: ['2.4.7'] });
      addPage(store, { locator: 'https://example.test/' });
      for (const worker of ['w1', 'w2', 'w3']) {
         claim(store, worker);
         advance(LEASE_MINUTES + 1);
      }

      const next = claimNext(store, { worker: 'w4' });
      const status = getAuditStatus(store);

      expect(next).toBeUndefined();
      expect(status.phase).toBe('needs-attention');
      expect(status.blocked[0]?.reason).toMatch(/Abandoned 3 times/u);
   });

   it('leaves site-wide units until page units are taken', () => {
      const store = start({ target: 'x', criteria: ['2.4.7', '3.2.3'] });
      addPage(store, { locator: 'https://example.test/' });
      addPage(store, { locator: 'https://example.test/about' });

      const order = ['w1', 'w2', 'w3'].map((worker) => claim(store, worker).id);

      expect(order).toEqual(['P1.keyboard', 'P2.keyboard', 'site.consistency']);
   });

   it('honors pass filters so one worker can own a serial resource', () => {
      const store = start();
      addPage(store, { locator: 'https://example.test/' });

      const only = claim(store, 'w1');
      const filtered = claimNext(store, { worker: 'w2', passes: ['visual'] });
      const excluded = claimNext(store, {
         worker: 'w3',
         excludePasses: ['keyboard', 'media', 'forms', 'pointer'],
      });

      expect(only.pass).toBe('semantics');
      expect(filtered?.pass).toBe('visual');
      expect(excluded).toBeUndefined();
   });
});

describe('submitting a unit', () => {
   it('completes the unit and the audit when every criterion has an outcome', () => {
      const store = start({ target: 'x', criteria: ['2.4.7'] });
      addPage(store, { locator: 'https://example.test/' });
      const unit = claim(store, 'w1');

      submitUnit(store, {
         unitId: unit.id,
         worker: 'w1',
         submission: passAll(unit),
      });
      const status = getAuditStatus(store);

      expect(status.phase).toBe('complete');
      expect(status.criteria.pass).toBe(1);
   });

   it('lists every problem in a rejected submission and saves nothing', () => {
      const store = start({ target: 'x', criteria: ['2.4.7', '2.1.1'] });
      addPage(store, { locator: 'https://example.test/' });
      const unit = claim(store, 'w1');

      const problems = getProblems(() =>
         submitUnit(store, {
            unitId: unit.id,
            worker: 'w1',
            submission: {
               results: [{ criterion: '2.4.7', outcome: 'fail', note: 'No ring.' }],
               findings: [
                  {
                     criterion: '1.4.3',
                     title: 'Out of scope',
                     location: 'x',
                     evidence: ['evidence/missing.png'],
                  },
               ],
            },
         }),
      );

      expect(problems.join('\n')).toMatch(/2\.1\.1 has no outcome/u);
      expect(problems.join('\n')).toMatch(/2\.4\.7 is fail but no finding/u);
      expect(problems.join('\n')).toMatch(/outside this audit's scope/u);
      expect(problems.join('\n')).toMatch(/a new finding needs severity/u);
      expect(problems.join('\n')).toMatch(/does not exist/u);
      expect(listFindings(store)).toHaveLength(0);
      expect(listUnits(store)[0]?.status).toBe('claimed');
   });

   it('merges the same defect reported on two pages into one finding', () => {
      const store = start({ target: 'x', criteria: ['2.4.7'] });
      addPage(store, { locator: 'https://example.test/' });
      addPage(store, { locator: 'https://example.test/about' });
      mkdirSync(join(store.dir, 'evidence', 'P1.keyboard'), {
         recursive: true,
      });
      writeFileSync(join(store.dir, 'evidence', 'P1.keyboard', 'menu.png'), 'x');
      const finding = {
         criterion: '2.4.7',
         title: 'Menu button has no focus indicator',
         severity: 'serious',
         description: 'The menu button shows no visible change on focus.',
         impact: 'Keyboard users cannot tell where focus is.',
         recommendation: 'Add a visible :focus-visible outline.',
         location: 'Header > Menu (button.nav-toggle)',
         evidence: ['evidence/P1.keyboard/menu.png'],
      } as const;

      for (const worker of ['w1', 'w2']) {
         const unit = claim(store, worker);
         submitUnit(store, {
            unitId: unit.id,
            worker,
            submission: {
               results: [
                  {
                     criterion: '2.4.7',
                     outcome: 'fail',
                     note: 'No indicator.',
                  },
               ],
               findings: [
                  worker === 'w1'
                     ? {
                          ...finding,
                          evidence: ['evidence/P1.keyboard/menu.png'],
                       }
                     : {
                          ...finding,
                          title: 'Menu button has no focus indicator.',
                       },
               ],
            },
         });
      }
      const [merged] = listFindings(store);

      expect(listFindings(store)).toHaveLength(1);
      expect(merged?.open.map((instance) => instance.pageId)).toEqual(['P1', 'P2']);
      expect(merged?.open[0]?.evidence).toEqual(['evidence/P1.keyboard/menu.png']);
   });
});

describe('automated findings', () => {
   it('refuses a pass while an automated finding is open, until it is dismissed', () => {
      const store = start({ target: 'x', criteria: ['1.4.3'] });
      addPage(store, { locator: 'https://example.test/' });
      const findingId = recordAutomatedFinding(store, {
         pageId: 'P1',
         criterion: '1.4.3',
         key: 'axe:color-contrast',
         title: 'Text contrast is too low',
         severity: 'serious',
         description: 'd',
         impact: 'i',
         recommendation: 'r',
         source: 'axe',
         location: 'p.lead',
         detail: '1 element',
      });
      const unit = claim(store, 'w1');

      const problems = getProblems(() =>
         submitUnit(store, {
            unitId: unit.id,
            worker: 'w1',
            submission: passAll(unit),
         }),
      );
      submitUnit(store, {
         unitId: unit.id,
         worker: 'w1',
         submission: {
            ...passAll(unit),
            dismiss: [{ finding: findingId, reason: 'Text sits on a solid overlay.' }],
         },
      });

      expect(problems[0]).toMatch(/F1 is open on this page/u);
      expect(listFindings(store)).toHaveLength(0);
      expect(listCriterionRollups(store)[0]?.standing).toBe('pass');
   });

   it('shows a criterion as failed as soon as an automated finding exists', () => {
      const store = start({ target: 'x', criteria: ['1.4.3'] });
      addPage(store, { locator: 'https://example.test/' });
      recordAutomatedFinding(store, {
         pageId: 'P1',
         criterion: '1.4.3',
         key: 'axe:color-contrast',
         title: 'Text contrast is too low',
         severity: 'serious',
         description: 'd',
         impact: 'i',
         recommendation: 'r',
         source: 'axe',
         location: 'p.lead',
         detail: '',
      });

      expect(listCriterionRollups(store)[0]?.standing).toBe('fail');
   });
});

describe('stale workers', () => {
   it('rejects a submission from a worker that no longer holds the unit', () => {
      const store = start({ target: 'x', criteria: ['2.4.7'] });
      addPage(store, { locator: 'https://example.test/' });
      const unit = claim(store, 'w1');
      advance(LEASE_MINUTES + 1);
      claim(store, 'w2');

      expect(() =>
         submitUnit(store, {
            unitId: unit.id,
            worker: 'w1',
            submission: passAll(unit),
         }),
      ).toThrow(/claimed by w2, not claimed by w1/u);
   });
});

describe('recovering and changing scope', () => {
   it('keeps other work moving when one unit is blocked, then reopens it', () => {
      const store = start({ target: 'x', criteria: ['2.4.7', '3.3.1'] });
      addPage(store, { locator: 'https://example.test/' });
      const first = claim(store, 'w1');
      blockUnit(store, {
         unitId: first.id,
         actor: 'w1',
         reason: 'Needs a login.',
      });

      const second = claim(store, 'w1');
      reopenUnit(store, {
         unitId: first.id,
         actor: 'lead',
         reason: 'Login provided.',
      });
      const third = claim(store, 'w2');

      expect(second.id).not.toBe(first.id);
      expect(third.id).toBe(first.id);
   });

   it('stops counting an excluded page', () => {
      const store = start({ target: 'x', criteria: ['2.4.7'] });
      addPage(store, { locator: 'https://example.test/' });
      addPage(store, { locator: 'https://example.test/chat' });

      excludePage(store, { pageId: 'P2', reason: 'Third-party widget.' });

      expect(listUnits(store).map((unit) => unit.id)).toEqual(['P1.keyboard']);
      expect(getAuditStatus(store).pages).toEqual({ active: 1, excluded: 1 });
   });

   it('reopens finished site-wide units when the page set changes', () => {
      const store = start({ target: 'x', criteria: ['3.2.3'] });
      addPage(store, { locator: 'https://example.test/' });
      addPage(store, { locator: 'https://example.test/about' });
      const unit = claim(store, 'w1', 'site.consistency');
      submitUnit(store, {
         unitId: unit.id,
         worker: 'w1',
         submission: passAll(unit),
      });

      addPage(store, { locator: 'https://example.test/contact' });
      const reopened = listUnits(store).find(
         (candidate) => candidate.id === 'site.consistency',
      );

      expect(reopened?.status).toBe('pending');
      expect(getAuditStatus(store).criteria.pass).toBe(0);
   });

   it('keeps the outcomes of a reopened unit for the next worker', () => {
      const store = start({ target: 'x', criteria: ['2.4.7'] });
      addPage(store, { locator: 'https://example.test/' });
      const unit = claim(store, 'w1');
      submitUnit(store, {
         unitId: unit.id,
         worker: 'w1',
         submission: passAll(unit),
      });

      reopenUnit(store, {
         unitId: unit.id,
         actor: 'lead',
         reason: 'Screen reader disagreed',
      });
      const packet = buildWorkPacket(store, claim(store, 'w2'));

      expect(packet.priorResults.map((result) => result.criterion)).toEqual(['2.4.7']);
      expect(packet.priorResults[0]?.reopenReason).toBe('Screen reader disagreed');
      expect(renderWorkPacket(packet)).toContain('## Prior results');
      expect(getAuditStatus(store).criteria.pass).toBe(0);
   });

   it('survives a restart: a new process sees the same state', () => {
      const store = start({ target: 'x', criteria: ['2.4.7'] });
      addPage(store, { locator: 'https://example.test/' });
      claim(store, 'w1');
      closeAudit(store);
      opened.length = 0;
      const reopened = openAudit(join(root, 'test'), { now: () => clock });
      opened.push(reopened);

      const resumed = claim(reopened, 'w1');

      expect(resumed.id).toBe('P1.keyboard');
      expect(resumed.attempts).toBe(1);
   });
});

describe('audit-wide limitations', () => {
   it('lists a limitation as not verified in the report, even when every unit passes', () => {
      const store = start({ target: 'x', criteria: ['2.4.7'] });
      addPage(store, { locator: 'https://example.test/' });
      const unit = claim(store, 'w1');
      submitUnit(store, {
         unitId: unit.id,
         worker: 'w1',
         submission: passAll(unit),
      });

      addLimitation(store, {
         criterion: '2.4.7',
         text: 'No physical device was available.',
      });

      expect(buildAuditReport(store).gaps).toEqual([
         {
            criterion: '2.4.7',
            pageId: 'audit',
            pageName: 'All pages and screens',
            reason: 'No physical device was available.',
         },
      ]);
   });

   it('drops a limitation from the report once it is removed', () => {
      const store = start({ target: 'x', criteria: ['2.4.7'] });
      addLimitation(store, { text: 'No screen reader.' });
      addLimitation(store, { text: 'No physical device.' });

      removeLimitation(store, { position: 1 });
      const auditWide = buildAuditReport(store).gaps.filter(
         (gap) => gap.pageId === 'audit',
      );

      expect(auditWide.map((gap) => gap.reason)).toEqual(['No physical device.']);
   });

   it('rejects a limitation on a criterion outside the scope', () => {
      const store = start({ target: 'x', criteria: ['2.4.7'] });

      expect(() =>
         addLimitation(store, { criterion: '1.4.3', text: 'Not tested.' }),
      ).toThrow('not in this audit');
   });
});

describe('work packet', () => {
   it('tells a worker what to test, the rules, and how to submit', () => {
      const store = start({
         target: 'x',
         criteria: ['2.4.7'],
         rules: ['Do not submit the contact form.'],
      });
      addPage(store, { locator: 'https://example.test/', name: 'Home' });
      const unit = claim(store, 'w1');

      const text = renderWorkPacket(buildWorkPacket(store, unit));

      expect(text).toContain('# Unit P1.keyboard: Keyboard operation and focus');
      expect(text).toContain('Do not submit the contact form.');
      expect(text).toContain('2.4.7 Focus Visible (AA)');
      expect(text).toContain('a1 audit submit P1.keyboard --worker w1');
   });
});

describe('one defect that fails several criteria', () => {
   it('is filed once and fails every criterion it names', () => {
      const store = start({
         target: 'x',
         criteria: ['2.4.3', '2.4.7', '2.4.11'],
      });
      addPage(store, { locator: 'https://example.test/' });
      const unit = claim(store, 'w1');

      submitUnit(store, {
         unitId: unit.id,
         worker: 'w1',
         submission: {
            results: unit.criteria.map((criterion) => ({
               criterion,
               outcome: 'fail',
               note: 'Hidden menu links take focus.',
            })),
            findings: [
               {
                  criterion: '2.4.7',
                  alsoFails: ['2.4.11', '2.4.3'],
                  title: 'Collapsed menu links take focus while hidden',
                  severity: 'serious',
                  description: 'd',
                  impact: 'i',
                  recommendation: 'r',
                  location: 'nav a',
                  evidence: [saveEvidence(store)],
               },
            ],
         },
      });

      expect(listFindings(store)).toHaveLength(1);
      expect(listCriterionRollups(store).map((rollup) => rollup.standing)).toEqual([
         'fail',
         'fail',
         'fail',
      ]);
   });

   it('extends a known finding when another pass shows it fails a second criterion', () => {
      const store = start({ target: 'x', criteria: ['2.4.7', '4.1.2'] });
      addPage(store, { locator: 'https://example.test/' });
      const findingId = recordAutomatedFinding(store, {
         pageId: 'P1',
         criterion: '4.1.2',
         key: 'axe:button-name',
         title: 'Buttons must have discernible text',
         severity: 'critical',
         description: 'd',
         impact: 'i',
         recommendation: 'r',
         source: 'axe',
         location: 'button.nav',
         detail: '',
      });
      const unit = claim(store, 'w1', 'P1.keyboard');

      submitUnit(store, {
         unitId: unit.id,
         worker: 'w1',
         submission: {
            results: [{ criterion: '2.4.7', outcome: 'fail', note: 'Same button.' }],
            findings: [
               {
                  criterion: '2.4.7',
                  sameAs: findingId,
                  location: 'button.nav',
                  evidence: [saveEvidence(store)],
               },
            ],
         },
      });

      expect(listFindings(store, { criterion: '2.4.7' })[0]?.id).toBe(findingId);
   });
});

describe('page states', () => {
   const inventory = {
      triggers: [
         { id: 'S1', kind: 'disclosure', label: 'Menu', selector: '#menu' },
         { id: 'S2', kind: 'embedded', label: 'Chat', selector: 'chat-widget' },
      ],
      omitted: 0,
   };

   function startWithInventory(): { store: Audit; unit: Unit } {
      const store = start({ target: 'x', criteria: ['2.4.7'] });
      addPage(store, { locator: 'https://example.test/' });
      putSignal(store, { pageId: 'P1', kind: STATE_SIGNAL_KIND, data: inventory });
      return { store, unit: claim(store, 'w1') };
   }

   it('rejects a submission that leaves a state the scan found unaccounted for', () => {
      const { store, unit } = startWithInventory();

      const problems = getProblems(() =>
         submitUnit(store, {
            unitId: unit.id,
            worker: 'w1',
            submission: {
               ...passAll(unit),
               states: [
                  { name: 'Menu open', covers: ['S1'], tested: true, note: 'Opened it.' },
               ],
            },
         }),
      );

      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('S2');
   });

   it('lists tested states per page and reports untested ones as not verified', () => {
      const { store, unit } = startWithInventory();

      submitUnit(store, {
         unitId: unit.id,
         worker: 'w1',
         submission: {
            ...passAll(unit),
            states: [
               { name: 'Menu open', covers: ['S1'], tested: true, note: 'Opened it.' },
               {
                  name: 'Chat open',
                  covers: ['S2'],
                  tested: false,
                  note: 'Widget would not load.',
               },
            ],
         },
      });
      const report = buildAuditReport(store);

      expect(report.pages[0]?.statesTested).toEqual(['Menu open']);
      expect(report.gaps.map((gap) => gap.reason)).toContain(
         'State "Chat open" was not tested: Widget would not load.',
      );
   });

   it('shows the states to cover in the work packet', () => {
      const { store, unit } = startWithInventory();

      const text = renderWorkPacket(buildWorkPacket(store, unit));

      expect(text).toContain('## States to cover');
      expect(text).toContain('S2 embedded: "Chat" (chat-widget)');
   });
});

describe('finding evidence', () => {
   it('rejects a finding on a web page that has no picture', () => {
      const store = start({ target: 'x', criteria: ['2.4.7'] });
      addPage(store, { locator: 'https://example.test/' });
      const unit = claim(store, 'w1');

      const problems = getProblems(() =>
         submitUnit(store, {
            unitId: unit.id,
            worker: 'w1',
            submission: {
               results: [{ criterion: '2.4.7', outcome: 'fail', note: 'No ring.' }],
               findings: [
                  {
                     criterion: '2.4.7',
                     title: 'No focus ring',
                     severity: 'serious',
                     description: 'd',
                     impact: 'i',
                     recommendation: 'r',
                     location: 'button.nav',
                  },
               ],
            },
         }),
      );

      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('screenshot');
   });
});
