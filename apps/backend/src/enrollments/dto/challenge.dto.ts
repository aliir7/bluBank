import { z } from 'zod';

// Same Iranian mobile validation that was used before the route was renamed.
export const challengeSchema = z.object({
  phone: z
    .string()
    .trim()
    .transform((val) => val.replace(/\s+/g, ''))
    .pipe(z.string().regex(/^(\+98|0)?9\d{9}$/, 'Invalid Iranian mobile phone number')),
});

export type ChallengeInput = z.infer<typeof challengeSchema>;
