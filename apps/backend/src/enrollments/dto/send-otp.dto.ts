import { z } from 'zod';

export const sendOtpSchema = z.object({
  phone: z
    .string()
    .trim()
    .transform((val) => val.replace(/\s+/g, ''))
    .pipe(z.string().regex(/^(\+98|0)?9\d{9}$/, 'Invalid Iranian mobile phone number')),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
