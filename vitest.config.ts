import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    /**
     * Repo có HAI test runner. `*.node.test.ts` viết bằng `node:test` và chạy qua tsx
     * (`npm run test:invoice-utils` / `test:export`), KHÔNG phải vitest — vite không
     * bundle được built-in `node:test` nên gom nhầm là đỏ ngay lúc nạp module, với câu
     * lỗi chẳng liên quan gì tới nội dung test.
     *
     * Trải `configDefaults.exclude` chứ đừng viết đè: mất nó là vitest bắt đầu bò vào
     * node_modules/dist.
     */
    exclude: [...configDefaults.exclude, '**/*.node.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
