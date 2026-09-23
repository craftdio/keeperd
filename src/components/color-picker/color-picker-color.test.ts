import { expect, it } from 'vitest';
import { hexToHsv, hsvToHex } from './color-picker-color';

it.each(['#000000', '#FFFFFF', '#FF6363', '#0FA958', '#8EB7FF'])(
    'round-trips the six-digit color %s',
    (hex) => {
        expect(hsvToHex(hexToHsv(hex)!)).toBe(hex);
    }
);

it('maps hue, saturation, and brightness boundaries to their expected colors', () => {
    expect(hsvToHex({ h: 0, s: 100, v: 100 })).toBe('#FF0000');
    expect(hsvToHex({ h: 120, s: 100, v: 100 })).toBe('#00FF00');
    expect(hsvToHex({ h: 240, s: 100, v: 100 })).toBe('#0000FF');
    expect(hsvToHex({ h: 360, s: 0, v: 100 })).toBe('#FFFFFF');
    expect(hsvToHex({ h: 0, s: 100, v: 0 })).toBe('#000000');
});

it('rejects malformed HEX input and preserves gray values', () => {
    expect(hexToHsv('#GGGGGG')).toBeNull();
    expect(hexToHsv('#808080')).toEqual({ h: 0, s: 0, v: (128 / 255) * 100 });
});
