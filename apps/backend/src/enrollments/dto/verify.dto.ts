import { z } from 'zod';

import { phoneField } from './phone-validation.js';

export const verifySchema = z.object({
  phone: phoneField,
  otp: z.string().regex(/^\d{6}$/, 'OTP must be a 6-digit number'),
});

export type VerifyInput = z.infer<typeof verifySchema>;
