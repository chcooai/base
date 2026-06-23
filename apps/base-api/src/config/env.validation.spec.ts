import 'reflect-metadata';
import { validateEnv } from './env.validation';

const base = {
  JWT_SECRET: 'x'.repeat(32),
  DB_HOST: 'db', DB_PORT: '3306', DB_USERNAME: 'base',
  DB_PASSWORD: 'pw', DB_NAME: 'base',
};

describe('validateEnv', () => {
  it('should_pass_when_required_present', () => {
    expect(() => validateEnv(base)).not.toThrow();
  });
  it('should_throw_when_jwt_secret_missing', () => {
    const { JWT_SECRET, ...rest } = base;
    expect(() => validateEnv(rest)).toThrow();
  });
  it('should_throw_when_jwt_secret_too_short', () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: 'short' })).toThrow();
  });
});
