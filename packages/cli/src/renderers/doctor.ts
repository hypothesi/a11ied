import type { CliOutputEnvelope, DoctorReport } from '#contracts';
import { renderDoctorText } from '#core';
import { doctorTextStyle } from '../lib/format.js';
import type { RenderOptions } from './shared.js';

/** Renders the doctor report carried in the envelope's `result` field. */
export function renderDoctorEnvelopeText(
   envelope: CliOutputEnvelope,
   _options: RenderOptions,
): string {
   return renderDoctorText(envelope.result as unknown as DoctorReport, doctorTextStyle);
}
