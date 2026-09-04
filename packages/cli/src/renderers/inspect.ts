import type { CliOutputEnvelope } from '#contracts';
import {
   badge,
   code,
   dim,
   fields,
   indent,
   listItems,
   section,
   title,
   wrap,
} from '../lib/format.js';
import {
   criterionLine,
   renderElementLines,
   type RenderedElement,
   type RenderOptions,
} from './shared.js';

interface Assessment {
   criterionId: string;
   title: string;
   state: string;
   reasons: string[];
   elements: RenderedElement[];
}

const MAX_INLINE_ELEMENTS = 3;
const MAX_CRITERION_ELEMENTS = 5;
const REASON_DEPTH = 2;
const ELEMENT_DEPTH = 3;
const APPLICABILITY_STATE_ORDER = ['applicable', 'likely-applicable', 'unknown'];
const APPLICABILITY_STATE_LABELS: Readonly<Record<string, string>> = {
   applicable: 'applicable',
   'likely-applicable': 'likely applicable',
   unknown: 'unknown',
};

function renderAssessmentLines(assessment: Assessment, options: RenderOptions): string[] {
   const reasons = options.verbose ? assessment.reasons : assessment.reasons.slice(0, 1);
   const lines = [
      criterionLine({ id: assessment.criterionId, title: assessment.title }),
      ...indent(
         reasons.flatMap((reason) => wrap(dim(reason), 1)),
         REASON_DEPTH,
      ),
   ];

   if (options.verbose && assessment.elements.length > 0) {
      lines.push(
         ...indent(
            renderElementLines(assessment.elements, MAX_INLINE_ELEMENTS),
            ELEMENT_DEPTH,
         ),
      );
   }

   return lines;
}

function summarizeStates(assessments: Assessment[]): string {
   return APPLICABILITY_STATE_ORDER.map((state) => {
      const total = assessments.filter((assessment) => assessment.state === state).length;
      return `${total} ${APPLICABILITY_STATE_LABELS[state] ?? state}`;
   }).join(', ');
}

// Fallow-ignore-next-line unused-export
export function renderApplicableText(
   envelope: CliOutputEnvelope,
   options: RenderOptions,
): string {
   const result = envelope.result as {
      target: { value: string };
      matrix: { assessments: Record<string, Assessment> };
   };
   const assessments = Object.values(result.matrix.assessments);
   const lines = [
      title(`Applicable criteria for ${result.target.value}`),
      ...indent([dim(summarizeStates(assessments))]),
   ];

   for (const state of APPLICABILITY_STATE_ORDER) {
      const matching = assessments.filter((assessment) => assessment.state === state);
      if (matching.length === 0) {
         continue;
      }
      const name = `${badge(state)} ${dim(`(${matching.length})`)}`;
      const body = matching.flatMap((assessment) =>
         renderAssessmentLines(assessment, options),
      );
      lines.push(...section(name, body));
   }

   if (assessments.length === 0) {
      lines.push(...indent([dim('No applicability signals were detected.')]));
   }

   if (!options.verbose) {
      lines.push(
         '',
         dim('Add --verbose for every reason and the elements behind each state.'),
      );
   }

   return lines.join('\n');
}

// Fallow-ignore-next-line unused-export
export function renderCriterionApplicabilityText(
   envelope: CliOutputEnvelope,
   options: RenderOptions,
): string {
   const result = envelope.result as {
      criterion: { id: string; title: string; level?: string };
      assessment: Assessment;
      signals: Array<{
         category: string;
         value: string;
         source: string;
         confidence: string;
      }>;
   };
   const reasons = options.verbose
      ? result.assessment.reasons
      : result.assessment.reasons.slice(0, 1);
   const signalLines = result.signals.map(
      (signal) =>
         `${code(signal.category)}  ${signal.value}  ${dim(`(${signal.source}, ${signal.confidence})`)}`,
   );
   const elementLimit = options.verbose
      ? Number.POSITIVE_INFINITY
      : MAX_CRITERION_ELEMENTS;

   return [
      criterionLine(result.criterion),
      ...indent(fields([['State', badge(result.assessment.state)]])),
      ...section(
         reasons.length === 1 ? 'Reason' : 'Reasons',
         reasons.flatMap((reason) => wrap(reason)),
      ),
      ...section(`Signals ${dim(`(${result.signals.length})`)}`, listItems(signalLines)),
      ...section(
         `Elements ${dim(`(${result.assessment.elements.length})`)}`,
         renderElementLines(result.assessment.elements, elementLimit),
      ),
   ].join('\n');
}
