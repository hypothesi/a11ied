import { z } from 'zod';

export const browserAutomationCandidateSchema = z.object({
   id: z.string(),
   label: z.string(),
   source: z.enum(['system', 'playwright']),
   launchMode: z.enum(['channel', 'executable-path', 'playwright-bundled']),
   location: z.string().optional(),
});
export type BrowserAutomationCandidate = z.infer<typeof browserAutomationCandidateSchema>;

export const browserAutomationPolicySchema = z.object({
   policyName: z.literal('system-browser-first'),
   installCommand: z.string(),
   preferredCandidate: browserAutomationCandidateSchema.optional(),
   candidates: z.array(browserAutomationCandidateSchema),
});
export type BrowserAutomationPolicy = z.infer<typeof browserAutomationPolicySchema>;
