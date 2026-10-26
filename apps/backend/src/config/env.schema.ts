import { z } from 'zod';

// The environment may lower the request-body limit but cannot raise it.
export const MAX_BODY_LIMIT_BYTES = 1024 * 1024;

const logLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);
type LogLevel = z.infer<typeof logLevelSchema>;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin !== ''),
      ),
    TRUST_PROXY: z.stringbool().default(false),
    BODY_LIMIT_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_BODY_LIMIT_BYTES)
      .default(MAX_BODY_LIMIT_BYTES),
    LOG_LEVEL: logLevelSchema.optional(),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.CORS_ORIGINS.length > 0, {
    path: ['CORS_ORIGINS'],
    message: 'Required in production',
  })
  .transform((env) => {
    const defaultLogLevel: LogLevel = env.NODE_ENV === 'development' ? 'debug' : 'info';
    return { ...env, LOG_LEVEL: env.LOG_LEVEL ?? defaultLogLevel };
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
