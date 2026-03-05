import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    include: ['**/*.test.ts'],
    exclude: ['node_modules', '.next', '.open-next'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
