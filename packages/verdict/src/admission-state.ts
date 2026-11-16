import type { StateSetupAction, Verdict } from '@a11ied/contracts';

interface AcceptedState {
   stateId: string;
   targetUrl?: string | undefined;
   fingerprint?: string | undefined;
   setup?: readonly StateSetupAction[] | undefined;
}

const accepted = new WeakMap<
   Verdict,
   {
      body: string;
      stateId: string;
      targetUrl?: string | undefined;
      fingerprint?: string | undefined;
      setup: string;
   }
>();

export function markAcceptedVerdict(verdict: Verdict, state: AcceptedState): Verdict {
   accepted.set(verdict, {
      body: JSON.stringify(verdict),
      stateId: state.stateId,
      targetUrl: state.targetUrl,
      fingerprint: state.fingerprint,
      setup: JSON.stringify(state.setup ?? []),
   });
   return verdict;
}

/**
 * Stored labels, changed objects and evidence for another target cannot establish
 * acceptance.
 */
export function isAcceptedVerdict(verdict: Verdict, state?: AcceptedState): boolean {
   const admission = accepted.get(verdict);
   if (!admission || admission.body !== JSON.stringify(verdict)) {
      return false;
   }
   if (!state) {
      return true;
   }
   return (
      state.stateId === admission.stateId &&
      state.targetUrl === admission.targetUrl &&
      (state.fingerprint === undefined || state.fingerprint === admission.fingerprint) &&
      JSON.stringify(state.setup ?? []) === admission.setup
   );
}
