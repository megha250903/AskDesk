import { describe, it, expect } from 'vitest';
import { loadEnv } from '../src/config/env.js';

describe('Environment Config Loader', () => {
  it('loads valid environment variables with defaults', () => {
    const config = loadEnv({
      NODE_ENV: 'test',
      PORT: '5000'
    });

    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(5000);
    expect(config.HOST).toBe('127.0.0.1');
    expect(config.LOG_LEVEL).toBe('info');
  });

  it('throws a descriptive error when an invalid port is provided', () => {
    expect(() => {
      loadEnv({
        PORT: '99999' // out of range
      });
    }).toThrow(/Invalid environment configuration/);
  });

  it('throws a descriptive error for invalid NODE_ENV', () => {
    expect(() => {
      loadEnv({
        NODE_ENV: 'staging_invalid'
      });
    }).toThrow(/Invalid environment configuration/);
  });
});
