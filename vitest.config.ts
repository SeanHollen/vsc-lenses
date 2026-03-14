import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['src/test/**/*.test.ts'],
    alias: {
      vscode: resolve(__dirname, './src/test/__mocks__/vscode.ts'),
    },
  },
});
