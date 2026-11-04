import { z } from 'zod';

import { phoneField } from './phone-validation.js';

// Same Iranian mobile validation that was used before the route was renamed.
export const challengeSchema = z.object({
  phone: phoneField,
});

export type ChallengeInput = z.infer<typeof challengeSchema>;
