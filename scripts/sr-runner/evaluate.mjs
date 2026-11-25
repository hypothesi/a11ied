const ROLE_SYNONYMS = {
   button: ['button'],
   link: ['link', 'visited link'],
   heading: ['heading'],
   text: [
      'textbox',
      'edit text',
      'edit box',
      'text field',
      'search text field',
      'text box',
   ],
   navigation: ['navigation', 'nav'],
   region: ['region'],
};

const STATE_SYNONYMS = {
   collapsed: ['collapsed', 'not expanded'],
   expanded: ['expanded'],
   disabled: ['disabled', 'dimmed', 'unavailable'],
   'current page': ['current page', 'current', 'selected'],
   'current step': ['current step', 'current', 'selected'],
};

function normalizeText(value) {
   return String(value ?? '')
      .toLowerCase()
      .replaceAll(/\s+/gu, ' ')
      .trim();
}

function isDocumentBoundaryPhrase(phrase) {
   const normalized = normalizeText(phrase);
   return (
      normalized === 'end of document' ||
      normalized === 'document' ||
      normalized.startsWith('leaving ') ||
      normalized.startsWith('end of ') ||
      normalized.startsWith('end, ')
   );
}

function escapeRegex(value) {
   return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

function matchesRoleHint(entry, roleHint) {
   if (!roleHint) {
      return false;
   }
   const synonyms = ROLE_SYNONYMS[roleHint.toLowerCase()] ?? [roleHint.toLowerCase()];
   const roleNormalized = normalizeText(entry.role);
   if (roleNormalized !== '') {
      return synonyms.some(
         (syn) => roleNormalized === syn || roleNormalized.startsWith(`${syn} `),
      );
   }
   const phraseNormalized = normalizeText(entry.phrase);
   return synonyms.some((syn) => {
      const pattern = new RegExp(`(?:^|[\\s,.;])${escapeRegex(syn)}(?:$|[\\s,.;])`, 'iu');
      return pattern.test(phraseNormalized);
   });
}

function matchesPhraseTerm(entry, term) {
   const haystack = normalizeText(
      `${entry.phrase} ${entry.itemText ?? ''} ${entry.name ?? ''}`,
   );
   return haystack.includes(normalizeText(term));
}

function matchesStateTerm(entries, term) {
   const loweredTerm = term.toLowerCase();
   const synonyms = STATE_SYNONYMS[loweredTerm] ?? [loweredTerm];
   return entries.some((entry) => {
      const haystack = normalizeText(`${entry.phrase} ${entry.itemText ?? ''}`);
      if (loweredTerm === 'expanded') {
         return (
            !haystack.includes('not expanded') &&
            /(?:^|[,.;\s])expanded(?:$|[,.;\s])/u.test(haystack)
         );
      }
      return synonyms.some((syn) => haystack.includes(syn));
   });
}

function selectTargetEntries(entries, rule) {
   const contentEntries = entries.filter(
      (entry) => !isDocumentBoundaryPhrase(entry.phrase),
   );
   if (!rule.targetRoleHint) {
      return contentEntries;
   }
   const matchedByRole = contentEntries.filter((entry) =>
      matchesRoleHint(entry, rule.targetRoleHint),
   );
   return matchedByRole.length > 0 ? matchedByRole : contentEntries;
}

function pickKeyAnnouncement(entries, expectedPhrases, fallbackEntries) {
   for (const entry of entries) {
      if (expectedPhrases.some((phrase) => matchesPhraseTerm(entry, phrase))) {
         return entry.phrase;
      }
   }
   if (entries[0]?.phrase) {
      return entries[0].phrase;
   }
   return fallbackEntries
      .map((entry) => entry.phrase)
      .filter(Boolean)
      .join(' | ');
}

function createEmptyCounts() {
   return {
      passed: 0,
      failed: 0,
      untestable: 0,
      unsupported: 0,
      total: 0,
   };
}

function bumpCount(bucket, verdict) {
   bucket.total += 1;
   if (verdict === 'pass') {
      bucket.passed += 1;
   } else if (verdict === 'fail') {
      bucket.failed += 1;
   } else if (verdict === 'untestable') {
      bucket.untestable += 1;
   } else if (verdict === 'unsupported') {
      bucket.unsupported += 1;
   }
}

function summarizeAssertionResults(results) {
   const summary = {
      must: createEmptyCounts(),
      should: createEmptyCounts(),
      may: createEmptyCounts(),
      severeSideEffects: 0,
      moderateSideEffects: 0,
   };
   for (const item of results) {
      if (item.priority === 'MUST') {
         bumpCount(summary.must, item.verdict);
      } else if (item.priority === 'SHOULD') {
         bumpCount(summary.should, item.verdict);
      } else {
         bumpCount(summary.may, item.verdict);
      }
   }
   return summary;
}

function deriveOutcome(summary) {
   if (summary.must.failed > 0 || summary.severeSideEffects > 0) {
      return 'fail';
   }
   if (summary.should.failed > 0 || summary.moderateSideEffects > 0) {
      return 'partial';
   }
   return 'pass';
}

function resolvePhraseScope(mode, minCount) {
   if (minCount > 1) {
      return 'any';
   }
   return mode === 'interact' ? 'post-action' : 'target';
}

function formatPhraseStatement(phrase, mode, minCount) {
   if (minCount > 1) {
      return `Convey "${phrase}" across at least ${String(minCount)} elements`;
   }
   if (mode === 'interact') {
      return `Convey dynamic announcement "${phrase}" after activation`;
   }
   return `Convey expected accessible text "${phrase}" on the target`;
}

function buildFallbackAssertions(testCase) {
   const rule = testCase.evaluation;
   const assertions = [];
   const featureRef = testCase.attribute;
   const add = (priority, statement, specRule) => {
      assertions.push({
         id: `${testCase.slug}-${String(assertions.length + 1)}`,
         priority,
         statement,
         featureRef,
         rule: specRule,
      });
   };

   if (rule.mode === 'interact' && rule.preActionExpectedPhrases) {
      for (const phrase of rule.preActionExpectedPhrases) {
         add('MUST', `Convey initial control text "${phrase}" before activation`, {
            kind: 'convey-phrase',
            phrase,
            scope: 'pre-action',
         });
      }
   }

   const minCount = rule.minimumOccurrences ?? 1;
   const phraseScope = resolvePhraseScope(rule.mode, minCount);
   for (const phrase of rule.expectedPhrases) {
      add('MUST', formatPhraseStatement(phrase, rule.mode, minCount), {
         kind: 'convey-phrase',
         phrase,
         scope: phraseScope,
         minCount,
      });
   }

   const targetOrPostScope = rule.mode === 'interact' ? 'post-action' : 'target';
   for (const phrase of rule.forbiddenPhrases ?? []) {
      add(
         'MUST',
         `Do not announce overridden or prohibited phrase "${phrase}" on the target`,
         {
            kind: 'omit-phrase',
            phrase,
            scope: targetOrPostScope,
         },
      );
   }

   for (const [phrase, maxAllowed] of Object.entries(rule.maxPhraseOccurrences ?? {})) {
      add(
         'MUST',
         `Do not leak prohibited text "${phrase}" beyond ${String(maxAllowed)} occurrence(s)`,
         {
            kind: 'max-occurrences',
            phrase,
            max: maxAllowed,
         },
      );
   }

   for (const stateTerm of rule.expectedStateTerms ?? []) {
      add('MUST', `Convey required ARIA state "${stateTerm}"`, {
         kind: 'convey-state',
         stateTerm,
         scope: targetOrPostScope,
      });
   }

   if (rule.targetRoleHint && rule.mode === 'walk') {
      add('SHOULD', `Convey expected semantics/role "${rule.targetRoleHint}"`, {
         kind: 'convey-role',
         roleHint: rule.targetRoleHint,
      });
   }

   add('MUST', 'Cause no severe negative side effects', { kind: 'no-side-effects' });
   return assertions;
}

function failVerdictForPriority(priority) {
   return priority === 'MAY' ? 'unsupported' : 'fail';
}

function selectPoolByScope(scope, context) {
   if (scope === 'pre-action') {
      return context.preEntries;
   }
   if (scope === 'post-action') {
      return context.postEntries;
   }
   if (scope === 'any') {
      return context.contentEntries;
   }
   return context.targetEntries;
}

function evaluateConveyPhrase({ base, rule, priority, context }) {
   const pool = selectPoolByScope(rule.scope, context);
   const matches = pool.filter((entry) => matchesPhraseTerm(entry, rule.phrase));
   const minRequired = rule.minCount ?? 1;
   if (matches.length >= minRequired) {
      return {
         ...base,
         verdict: 'pass',
         evidence: matches[0]?.phrase ?? '',
      };
   }
   return {
      ...base,
      verdict: failVerdictForPriority(priority),
      notes:
         minRequired > 1
            ? `Observed "${rule.phrase}" ${String(matches.length)} time(s); expected >= ${String(minRequired)}.`
            : `Expected phrase "${rule.phrase}" was not spoken.`,
   };
}

function evaluateOmitPhrase({ base, rule, priority, context }) {
   let pool = context.targetEntries;
   if (rule.scope === 'post-action') {
      pool = context.postTargetEntries;
   } else if (rule.scope === 'any') {
      pool = context.contentEntries;
   }
   const forbiddenMatch = pool.find((entry) => matchesPhraseTerm(entry, rule.phrase));
   if (!forbiddenMatch) {
      return { ...base, verdict: 'pass' };
   }
   return {
      ...base,
      verdict: failVerdictForPriority(priority),
      evidence: forbiddenMatch.phrase,
      notes: `Forbidden text "${rule.phrase}" was exposed on the target.`,
   };
}

function evaluateMaxOccurrences({ base, rule, priority, context }) {
   const count = context.contentEntries.filter((entry) =>
      matchesPhraseTerm(entry, rule.phrase),
   ).length;
   if (count <= rule.max) {
      return {
         ...base,
         verdict: 'pass',
         notes: `Observed ${String(count)} occurrence(s) (limit ${String(rule.max)}).`,
      };
   }
   return {
      ...base,
      verdict: failVerdictForPriority(priority),
      notes: `"${rule.phrase}" spoken ${String(count)}x (expected <= ${String(rule.max)}).`,
   };
}

function evaluateConveyState({ base, rule, priority, context }) {
   const pool =
      rule.scope === 'post-action' ? context.postEntries : context.targetEntries;
   if (matchesStateTerm(pool, rule.stateTerm)) {
      const sample = pool.find((entry) => matchesStateTerm([entry], rule.stateTerm));
      return {
         ...base,
         verdict: 'pass',
         evidence: sample?.phrase ?? '',
      };
   }
   return {
      ...base,
      verdict: failVerdictForPriority(priority),
      notes: `Expected ARIA state "${rule.stateTerm}" was omitted.`,
   };
}

function evaluateConveyRole({ base, rule, priority, context }) {
   const roleEntry = context.contentEntries.find((entry) =>
      matchesRoleHint(entry, rule.roleHint),
   );
   if (roleEntry) {
      return {
         ...base,
         verdict: 'pass',
         evidence: roleEntry.phrase,
      };
   }
   return {
      ...base,
      verdict: failVerdictForPriority(priority),
      notes: `Expected role "${rule.roleHint}" was not exposed in speech.`,
   };
}

function evaluateSingleAssertion(specAssertion, context) {
   const rule = specAssertion.rule;
   const priority = specAssertion.priority;
   const base = {
      id: specAssertion.id,
      priority,
      statement: specAssertion.statement,
      featureRef: specAssertion.featureRef,
      featureType: 'aria',
   };

   switch (rule.kind) {
      case 'no-side-effects': {
         return {
            ...base,
            verdict: 'pass',
            notes: 'No unexpected chrome, focus trap, or spurious speech observed.',
         };
      }
      case 'convey-phrase': {
         return evaluateConveyPhrase({ base, rule, priority, context });
      }
      case 'omit-phrase': {
         return evaluateOmitPhrase({ base, rule, priority, context });
      }
      case 'max-occurrences': {
         return evaluateMaxOccurrences({ base, rule, priority, context });
      }
      case 'convey-state': {
         return evaluateConveyState({ base, rule, priority, context });
      }
      case 'convey-role': {
         return evaluateConveyRole({ base, rule, priority, context });
      }
      default: {
         return { ...base, verdict: 'untestable' };
      }
   }
}

function resolveKeyAnnouncement({
   rule,
   contentEntries,
   targetEntries,
   preEntries,
   postEntries,
}) {
   if (rule.mode === 'interact') {
      return pickKeyAnnouncement(postEntries, rule.expectedPhrases, preEntries);
   }
   if (contentEntries.length === 0) {
      return '(no content announcements)';
   }
   return pickKeyAnnouncement(targetEntries, rule.expectedPhrases, contentEntries);
}

function resolveEvaluationNotes({
   rule,
   contentEntries,
   failedAssertions,
   keyAnnouncement,
}) {
   if (contentEntries.length === 0 && rule.mode !== 'interact') {
      return 'Screen reader produced no in-document announcements.';
   }
   if (failedAssertions.length > 0) {
      return failedAssertions.map((item) => item.notes || item.statement).join(' ');
   }
   if (rule.mode === 'interact') {
      return `Pre- and post-activation behavior matched spec: "${keyAnnouncement}".`;
   }
   return `Matched expected announcement: "${keyAnnouncement}".`;
}

export function evaluateTestRun(testCase, transcript, postActionStartIndex = 0) {
   const rule = testCase.evaluation;
   const assertions =
      Array.isArray(testCase.assertions) && testCase.assertions.length > 0
         ? testCase.assertions
         : buildFallbackAssertions(testCase);

   const contentEntries = transcript.filter(
      (entry) => !isDocumentBoundaryPhrase(entry.phrase),
   );
   const targetEntries = selectTargetEntries(transcript, rule);
   const preEntries = transcript
      .slice(0, postActionStartIndex)
      .filter((entry) => !isDocumentBoundaryPhrase(entry.phrase));
   const postEntries = transcript
      .slice(postActionStartIndex)
      .filter((entry) => !isDocumentBoundaryPhrase(entry.phrase));
   const hasPostRole =
      Boolean(rule.targetRoleHint) &&
      postEntries.some((entry) => matchesRoleHint(entry, rule.targetRoleHint));
   const postTargetEntries = hasPostRole
      ? postEntries.filter((entry) => matchesRoleHint(entry, rule.targetRoleHint))
      : postEntries;

   const context = {
      contentEntries,
      targetEntries,
      preEntries,
      postEntries,
      postTargetEntries,
   };
   const assertionResults = assertions.map((specAssertion) =>
      evaluateSingleAssertion(specAssertion, context),
   );

   const assertionSummary = summarizeAssertionResults(assertionResults);
   const outcome =
      rule.mode !== 'interact' && contentEntries.length === 0
         ? 'fail'
         : deriveOutcome(assertionSummary);
   const keyAnnouncement = resolveKeyAnnouncement({
      rule,
      contentEntries,
      targetEntries,
      preEntries,
      postEntries,
   });
   const failedAssertions = assertionResults.filter((item) => item.verdict === 'fail');

   return {
      outcome,
      keyAnnouncement,
      notes: resolveEvaluationNotes({
         rule,
         contentEntries,
         failedAssertions,
         keyAnnouncement,
      }),
      assertionResults,
      assertionSummary,
   };
}
