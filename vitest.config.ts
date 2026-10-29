import { defineConfig } from 'vitest/config';

// Pruebas automáticas de los cálculos del sistema (npm test). No tocan la base de datos real.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/pruebas/**/*.test.ts', 'src/pruebas/**/*.test.tsx'],
  },
});
