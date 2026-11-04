import { z } from 'zod';

// Shared Iranian mobile validation used by challenge and verify DTOs.
export const phoneField = z
  .string()
  .trim()
  .transform((val) => val.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^(\+98|0)?9\d{9}$/, 'Invalid Iranian mobile phone number'));
