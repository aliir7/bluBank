import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    BODY_LIMIT_BYTES: z.coerce.number().int().min(1).max(1_048_576).default(1_048_576),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    TRUST_PROXY: z.string().default('false').pipe(z.stringbool()),
  })
  .superRefine((config, context) => {
    if (config.NODE_ENV === 'production' && config.CORS_ORIGINS.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'At least one origin is required in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

// The only direct read of process.env: NODE_ENV picks the env files, so it is needed
// before validation runs. Earlier files win, and the real environment wins over all of them.
export function envFilePaths(nodeEnv = process.env.NODE_ENV ?? 'development'): string[] {
  return [`.env.${nodeEnv}`, '.env'];
}

// Passed to ConfigModule as `validate`. Throwing here stops the app before it boots.
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (result.success) {
    return result.data;
  }

  const lines = result.error.issues.map(
    (issue) => `  - ${issue.path.map(String).join('.')}: ${issue.message}`,
  );
  throw new Error(`Invalid environment variables:\n${lines.join('\n')}`);
}
