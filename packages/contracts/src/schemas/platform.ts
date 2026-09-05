import { z } from 'zod';

export const platformSchema = z.enum(['voiceover', 'nvda', 'virtual']);
export type Platform = z.infer<typeof platformSchema>;
