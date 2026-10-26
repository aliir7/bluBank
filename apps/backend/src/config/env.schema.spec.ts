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
    });
  });

  it('coerces valid PORT values to numbers', () => {
    expect(validateEnv({ PORT: '5000' }).PORT).toBe(5000);
  });

  it('lists every invalid environment variable in a readable error', () => {
    expect(() => validateEnv({ NODE_ENV: 'test', PORT: 'not-a-number' })).toThrow(
      /Invalid environment variables:\n\s+- NODE_ENV:.*\n\s+- PORT:.*number/i,
    );
  });
});
