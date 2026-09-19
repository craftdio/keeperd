import { describe, expect, it } from 'vitest';
import { colorOptions } from './colors';

describe('colorOptions', () => {
    it('provides 24 unique valid colors', () => {
        expect(colorOptions).toHaveLength(24);
        expect(new Set(colorOptions)).toHaveLength(24);
        colorOptions.forEach((color) =>
            expect(color).toMatch(/^#[0-9a-f]{6}$/i)
        );
    });
});
