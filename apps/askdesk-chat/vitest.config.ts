import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'test/']
    },
    testTimeout: 20000,
    env: {
      MONGODB_URI: 'mongodb://127.0.0.1:27017/askdesk_chat_test'
    }
  }
});
