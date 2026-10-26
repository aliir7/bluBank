import { envFilePaths, validateEnv } from './env.schema.js';

describe('envFilePaths', () => {
  it('loads the selected environment file before the shared file', () => {
    expect(envFilePaths('production')).toEqual(['.env.production', '.env']);
  });
});

describe('validateEnv', () => {
  it('uses defaults for valid environment configuration', () => {
    expect(validateEnv({})).toEqual({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: 4000,
      LOG_LEVEL: 'debug',
      BODY_LIMIT_BYTES: 1_048_576,
      CORS_ORIGINS: [],
      TRUST_PROXY: false,
    });
  });

  it('coerces valid PORT values to numbers', () => {
    expect(validateEnv({ PORT: '5000' }).PORT).toBe(5000);
  });

  it('defaults LOG_LEVEL to debug in development and info elsewhere', () => {
    expect(
      validateEnv({ NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example' }).LOG_LEVEL,
    ).toBe('info');
    expect(validateEnv({ LOG_LEVEL: 'warn' }).LOG_LEVEL).toBe('warn');
    expect(() => validateEnv({ LOG_LEVEL: '' })).toThrow(/LOG_LEVEL:.*invalid/i);
  });

  it('allows a lower body limit but rejects values above 1 MB', () => {
    expect(validateEnv({ BODY_LIMIT_BYTES: '500000' }).BODY_LIMIT_BYTES).toBe(500000);
    expect(() => validateEnv({ BODY_LIMIT_BYTES: '1048577' })).toThrow(
      /BODY_LIMIT_BYTES: Too big: expected number to be <=1048576/i,
    );
  });

  it('parses comma-separated CORS origins and TRUST_PROXY', () => {
    expect(
      validateEnv({
        CORS_ORIGINS: 'https://app.example, https://admin.example',
        TRUST_PROXY: 'true',
      }),
    ).toMatchObject({
      CORS_ORIGINS: ['https://app.example', 'https://admin.example'],
      TRUST_PROXY: true,
    });
  });

  it('requires CORS_ORIGINS in production', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(
      /CORS_ORIGINS: Required in production/,
    );
  });

  it('lists every invalid environment variable in a readable error', () => {
    expect(() => validateEnv({ NODE_ENV: 'test', PORT: 'not-a-number' })).toThrow(
      /Invalid environment variables:\n\s+- NODE_ENV:.*\n\s+- PORT:.*number/i,
    );
  });
});
