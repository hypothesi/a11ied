import { fail, needsReview, notApplicable, pass, type Probe } from './probe-types.js';

const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Za-z]+)*$/,
   NON_LATIN = /[Ͱ-ϿЀ-ӿ؀-ۿ一-鿿]/;

const unsubmittableForm =
   (reason: string): Probe =>
   ({ facts }) =>
      facts.forms === 0 ? notApplicable('The page has no form.') : needsReview(reason);

export const understandableProbes: Record<string, Probe> = {
   '3.1.1': ({ facts }) =>
      LANGUAGE_TAG.test(facts.lang)
         ? pass(`The html element declares lang="${facts.lang}".`)
         : fail({
              rationale: `The page language is "${facts.lang}".`,
              title: 'Page language is not set',
              userImpact: 'Screen readers pick the wrong voice.',
              remediation: 'Set <html lang="en">.',
           }),
   '3.1.2': ({ facts }) =>
      NON_LATIN.test(facts.bodyText)
         ? needsReview('Non-Latin text was found; its language attributes need review.')
         : pass(
              'The page text is in one language; no other-language passage was detected.',
           ),
   '3.2.1': ({ facts }) =>
      facts.urlUnchangedAfterTab
         ? pass(
              'Tabbing through every control changed neither the address nor the context.',
           )
         : fail({
              rationale: 'Focusing a control navigated away.',
              title: 'Focus changes the context',
              userImpact: 'Users are moved unexpectedly.',
              remediation: 'Do not navigate when a control receives focus.',
           }),
   '3.2.2': ({ facts }) =>
      facts.controls.length === 0
         ? notApplicable('The page has no inputs or selects.')
         : needsReview(
              'Input changes were not exercised: form entry is outside the action policy.',
           ),
   '3.2.3': ({ site }) =>
      new Set(site.navSignatures).size <= 1
         ? pass(
              `The navigation links are identical on all ${String(site.navSignatures.length)} pages.`,
           )
         : fail({
              rationale: `${String(new Set(site.navSignatures).size)} different navigation link sets appear across pages.`,
              title: 'Navigation differs between pages',
              userImpact: 'Users cannot predict where the menu items are.',
              remediation: 'Use one navigation component on every page.',
           }),
   '3.2.4': ({ site }) =>
      new Set(site.navSignatures).size <= 1
         ? pass('Same-purpose navigation links carry the same label on every page.')
         : needsReview('Navigation labels differ between pages.'),
   '3.2.6': ({ site }) =>
      new Set(site.helpSignatures).size <= 1
         ? pass('The phone number sits in the same header position on every page.')
         : needsReview(
              `Help links vary across pages (${String(new Set(site.helpSignatures).size)} layouts).`,
           ),
   '3.3.1': unsubmittableForm(
      'Errors appear only after submission, which the action policy forbids.',
   ),
   '3.3.2': ({ facts }) => {
      if (facts.controls.length === 0) {
         return notApplicable('The page has no input fields.');
      }
      const unlabeled = facts.controls.filter(
         (control) => !control.label && control.type !== 'submit',
      );
      return unlabeled.length > 0
         ? fail({
              rationale: `${String(unlabeled.length)} field(s) have no label.`,
              title: 'Fields lack labels',
              userImpact: 'Users do not know what to enter.',
              remediation: 'Add a <label for> to each field.',
           })
         : pass(`All ${String(facts.controls.length)} fields have a label.`);
   },
   '3.3.3': unsubmittableForm(
      'Error suggestions need a submission, which the action policy forbids.',
   ),
   '3.3.4': unsubmittableForm(
      'Whether the form can be reversed or confirmed was not verified.',
   ),
   '3.3.7': unsubmittableForm(
      'Redundant entry needs a multi-step flow that could not be exercised.',
   ),
   '3.3.8': ({ facts }) =>
      facts.controls.some((control) => control.type === 'password')
         ? needsReview('A password field is present; its authentication needs review.')
         : notApplicable('The page has no authentication step.'),
   '4.1.2': ({ facts }) =>
      facts.unnamedButtons.length > 0
         ? fail({
              rationale: `${String(facts.unnamedButtons.length)} control(s) have no accessible name: ${facts.unnamedButtons[0] ?? ''}`,
              title: 'Control has no accessible name',
              userImpact: 'Screen readers announce an unnamed button.',
              remediation: 'Give the toggle an aria-label and aria-expanded.',
              impact: 'critical',
           })
         : pass(
              `All ${String(facts.interactiveCount)} interactive controls expose a name.`,
           ),
   '4.1.3': ({ facts }) =>
      facts.liveRegions === 0 && facts.forms === 0
         ? notApplicable('The page has no forms, search results, or live regions.')
         : needsReview(
              `${String(facts.liveRegions)} live region(s) were found; their announcements need a reader.`,
           ),
};
