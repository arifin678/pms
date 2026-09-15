import { defineConfig } from 'vitest/config'; // <-- Ubah import ini dari 'vite' menjadi 'vitest/config'
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Tambahkan blok test ini:
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js', // Kita akan buat file ini nanti
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      // Mengecualikan file statis dari perhitungan persentase coverage
      exclude: ['src/assets/**', 'src/main.jsx', 'src/**/*.css'], 
    },
  },
});