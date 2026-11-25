import type {
   AssertionResultRecord,
   AssertionSummary,
   ScreenReaderTestCase,
   TestOutcome,
   TranscriptEntry,
} from '@a11ied/support-data/types';

/** The parts of a test case the evaluation reads. */
export type GradedTestCase = Pick<
   ScreenReaderTestCase,
   'slug' | 'attribute' | 'evaluation' | 'assertions'
>;

export interface TestRunEvaluation {
   outcome: TestOutcome;
   keyAnnouncement: string;
   notes: string;
   assertionResults: AssertionResultRecord[];
   assertionSummary: AssertionSummary;
}

/**
 * Grades one run of a test case from its transcript.
 *
 * @param postActionStartIndex Where in the transcript the entries spoken after the
 *   activation begin, for a case that activates a control
 */
export function evaluateTestRun(
   testCase: GradedTestCase,
   transcript: readonly TranscriptEntry[],
   postActionStartIndex?: number,
): TestRunEvaluation;
