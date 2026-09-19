import { describe, expect, it } from 'vitest';
import { claimChunkReload, isChunkLoadError } from './chunk-load-recovery';

describe('chunk load recovery', () => {
    it('recognizes stale Vite dynamic import failures', () => {
        expect(
            isChunkLoadError(
                new TypeError(
                    'Failed to fetch dynamically imported module: /assets/editor.js'
                )
            )
        ).toBe(true);
        expect(isChunkLoadError(new Error('database unavailable'))).toBe(false);
    });

    it('allows one automatic reload per path and recovery window', () => {
        const values = new Map<string, string>();
        const storage = {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
        };

        expect(
            claimChunkReload({ pathname: '/diagrams/a', storage, now: 100_000 })
        ).toBe(true);
        expect(
            claimChunkReload({ pathname: '/diagrams/a', storage, now: 120_000 })
        ).toBe(false);
        expect(
            claimChunkReload({ pathname: '/diagrams/b', storage, now: 120_000 })
        ).toBe(true);
        expect(
            claimChunkReload({ pathname: '/diagrams/a', storage, now: 161_000 })
        ).toBe(true);
    });
});
