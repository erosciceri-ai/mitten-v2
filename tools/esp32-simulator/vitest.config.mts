import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: { alias: { '@mitten/contracts': resolve(import.meta.dirname, '../../packages/contracts/src/index.ts') } },
  test: { environment: 'node', globals: true, include: ['src/**/*.test.ts'], passWithNoTests: true },
});
