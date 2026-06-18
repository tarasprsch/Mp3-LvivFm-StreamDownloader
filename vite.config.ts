import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  root: 'src/ui',
  cacheDir: '../../node_modules/.vite',
  build: {
    outDir: '../../dist/ui',
    emptyOutDir: true
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: '../global/test-setup.ts',
    include: ['**/*.test.tsx', '../server/**/*.test.ts']
  }
});
