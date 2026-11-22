import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // React DOM dominates the entry; keep the stable runtime cache separate from feature code.
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react-runtime';
        },
      },
      onwarn(warning, warn) {
        const file = warning.id?.replaceAll('\\', '/');
        // Zod prose mentions PURE annotations; Rollup already removes these non-directive comments.
        if (warning.code === 'INVALID_ANNOTATION' && file?.includes('/node_modules/zod/v4/core/') &&
          (warning.message.includes('Wrapped in a') || warning.message.includes('Anchors a pattern source'))) return;
        warn(warning);
      },
    },
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Unit tests always start in mock mode, whatever a developer's local .env selects; tests that
  // need live mode opt in explicitly (createServices('live'), vi.stubEnv).
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], include: ['src/**/*.test.{ts,tsx}'], restoreMocks: true, env: { VITE_SERVICE_MODE: 'mock' } },
});
