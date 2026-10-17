import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    include: ['test/**/*.test.ts'],
    testTimeout: 20000,
    env: {
      MONGODB_URI: 'mongodb://127.0.0.1:27017/askdesk_gateway_test'
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts']
    }
  }
});
