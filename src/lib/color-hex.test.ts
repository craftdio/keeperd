import { describe, expect, it } from 'vitest';
import { normalizeHexColor } from './color-hex';

describe('normalizeHexColor', () => {
    it.each(['#0fa958', '0FA958', '  #0Fa958  '])(
        'normalizes six-digit input %s',
        (input) => {
            expect(normalizeHexColor(input)).toBe('#0FA958');
        }
    );

    it.each(['', '#abc', 'abc', '#0FA958FF', '0FA958FF', '#GGAA00'])(
        'rejects invalid or incomplete input %s',
        (input) => {
            expect(normalizeHexColor(input)).toBeNull();
        }
    );
});
