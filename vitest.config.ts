import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: './src/test/setup.ts',
        // CI persists Node's localStorage in one file. Files that exercise
        // IndexedDB/layout transfer therefore must not race across workers.
        fileParallelism: false,
        exclude: [
            ...configDefaults.exclude,
            '**/.local-erd/**',
            'tools/local-erd/**/*.test.mjs',
        ],
        coverage: {
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules/', 'src/test/setup.ts'],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
