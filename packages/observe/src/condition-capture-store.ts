import { readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import {
   conditionCaptureSchema,
   type AssessmentEvidenceKind,
   type ConditionCapture,
   type ObservationBundle,
} from '@a11ied/contracts';
import {
   canonicalizeObservationURL,
   getContentDigest,
   getObservationDigest,
   validateObservationReceipt,
} from './cache.js';

export interface ConditionEvidence {
   kind: AssessmentEvidenceKind;
   condition: ConditionCapture['request']['condition'];
}

const TEXT_RESIZE_FACTOR = 2;
const REFLOW_WIDTH = 320;

function validateCapturedCondition(
   condition: ConditionCapture['request']['condition'],
   observation: ConditionCapture['observation'],
): void {
   const { textResize, width, spacingVerified } = observation;
   if (
      (condition === 'text200' &&
         (!textResize ||
            textResize.factor !== TEXT_RESIZE_FACTOR ||
            textResize.verifiedCount === 0 ||
            textResize.unverifiedCount !== 0)) ||
      (condition === 'reflow320' && width !== REFLOW_WIDTH) ||
      (condition === 'textSpacing' && spacingVerified !== true)
   ) {
      throw new Error('Condition capture does not verify its requested condition.');
   }
}

export function validateConditionCapture(
   capture: ConditionCapture,
   bundle: ObservationBundle,
): void {
   if (
      capture.rootFingerprint !== bundle.fingerprint ||
      capture.rootDigest !== getObservationDigest(bundle) ||
      capture.stateId !== bundle.stateId ||
      capture.targetUrl !== bundle.targetUrl ||
      capture.baselineTreeHash !== bundle.treeHash ||
      JSON.stringify(capture.setup) !== JSON.stringify(bundle.setup) ||
      JSON.stringify(capture.excludedSelectors) !==
         JSON.stringify(bundle.excludedSelectors ?? []) ||
      capture.environment.environmentId !== 'playwright-virtual' ||
      capture.environment.platform !== 'virtual'
   ) {
      throw new Error('Condition capture does not match the current scoped observation.');
   }
   if (
      capture.actionTrace.length !== capture.request.actions.length ||
      capture.actionTrace.some(
         (entry, index) =>
            entry.index !== index ||
            JSON.stringify(entry.action) !==
               JSON.stringify(capture.request.actions[index]),
      )
   ) {
      throw new Error('Condition action trace is incomplete or out of order.');
   }
   if (
      capture.actionTrace.some(
         (entry) =>
            canonicalizeObservationURL(entry.url) !==
            canonicalizeObservationURL(
               bundle.navigation?.observedURL ?? bundle.targetUrl,
            ),
      )
   ) {
      throw new Error('Condition action left the registered state target.');
   }
   const observations = [
      capture.baselineCondition,
      capture.observation,
      ...capture.actionTrace.map((entry) => entry.observation),
   ];
   for (const observation of observations) {
      validateCapturedCondition(capture.request.condition, observation);
   }
   if (
      Date.parse(capture.capturedAt) < Date.parse(capture.startedAt) ||
      capture.actionTrace.some(
         (entry) =>
            Date.parse(entry.at) < Date.parse(capture.startedAt) ||
            Date.parse(entry.at) > Date.parse(capture.capturedAt),
      )
   ) {
      throw new Error('Condition capture timestamps do not contain its actions.');
   }
}

export async function readConditionCapture(input: {
   runDir: string;
   id: string;
   bundle: ObservationBundle;
}): Promise<ConditionCapture> {
   const id = z.hash('sha256').parse(input.id);
   const directory = join(input.runDir, 'condition-captures', id);
   const capture = conditionCaptureSchema.parse(
      JSON.parse(await readFile(join(directory, 'capture.json'), 'utf8')),
   );
   if (getContentDigest(JSON.stringify(capture)) !== id) {
      throw new Error(
         'Condition capture content hash does not match its registered path.',
      );
   }
   await validateObservationReceipt({ cacheRoot: input.runDir, bundle: input.bundle });
   validateConditionCapture(capture, input.bundle);
   const images = [
      capture.screenshots.before,
      capture.screenshots.after,
      ...capture.actionTrace.map((entry) => entry.screenshot),
   ];
   const paths = [
      'before.png',
      'after.png',
      ...capture.actionTrace.map((entry) => `steps/${String(entry.index)}.png`),
   ];
   await Promise.all(
      images.map(async (image, index) => {
         if (
            image.path !== paths[index] ||
            getContentDigest(await readFile(join(directory, image.path))) !== image.digest
         ) {
            throw new Error('Condition screenshot is missing, unregistered or altered.');
         }
      }),
   );
   return capture;
}

function getConditionEvidence(
   capture: ConditionCapture,
   path: string,
   fragment: string | undefined,
): ConditionEvidence {
   const condition = capture.request.condition;
   if (path === 'capture.json') {
      if (fragment === 'observation') {
         return { kind: 'observation', condition };
      }
      if (fragment === 'transcript' && capture.transcript.spokenOrder.length > 0) {
         return { kind: 'speech', condition };
      }
      if (fragment === 'actionTrace' && capture.actionTrace.length > 0) {
         return { kind: 'action-trace', condition };
      }
   }
   const images = [
      capture.screenshots.before,
      capture.screenshots.after,
      ...capture.actionTrace.map((entry) => entry.screenshot),
   ];
   if (!fragment && images.some((image) => image.path === path)) {
      return { kind: 'screenshot', condition };
   }
   throw new Error('Unsupported condition capture section or screenshot.');
}

/**
 * Recognize only content-addressed producer artifacts; arbitrary audit notes stay
 * unsupported.
 */
export async function resolveConditionEvidence(input: {
   runDir: string;
   bundle: ObservationBundle;
   file: string;
   fragment: string | undefined;
   captures: Map<string, Promise<ConditionCapture>>;
}): Promise<ConditionEvidence | undefined> {
   const local = relative(resolve(input.runDir, 'condition-captures'), input.file);
   const [id, ...parts] = local.split(sep);
   if (!z.hash('sha256').safeParse(id).success || !id) {
      return undefined;
   }
   let pending = input.captures.get(id);
   if (!pending) {
      pending = readConditionCapture({ runDir: input.runDir, id, bundle: input.bundle });
      input.captures.set(id, pending);
   }
   const capture = await pending;
   const path = parts.join('/');
   return getConditionEvidence(capture, path, input.fragment);
}
