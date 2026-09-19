import { describe, expect, it } from 'vitest';
import { resolveInitialTheme } from './local-config-theme';

describe('local ERD initial theme', () => {
    it.each([null, 'system'] as const)(
        'uses dark for a local build when the stored value is %s',
        (storedTheme) => {
            expect(resolveInitialTheme(storedTheme, true)).toBe('dark');
        }
    );

    it.each(['light', 'dark'] as const)(
        'preserves an explicit %s choice in a local build',
        (storedTheme) => {
            expect(resolveInitialTheme(storedTheme, true)).toBe(storedTheme);
        }
    );

    it('keeps the upstream system default outside the local build', () => {
        expect(resolveInitialTheme(null, false)).toBe('system');
        expect(resolveInitialTheme('system', false)).toBe('system');
    });
});
