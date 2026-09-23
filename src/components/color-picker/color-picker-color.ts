import { normalizeHexColor } from '@/lib/color-hex';

export interface HsvColor {
    h: number;
    s: number;
    v: number;
}

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

export const hexToHsv = (hex: string): HsvColor | null => {
    const normalized = normalizeHexColor(hex);
    if (!normalized) return null;

    const [red, green, blue] = [1, 3, 5].map(
        (offset) => parseInt(normalized.slice(offset, offset + 2), 16) / 255
    );
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const difference = max - min;
    let hue = 0;

    if (difference > 0) {
        if (max === red) hue = ((green - blue) / difference) % 6;
        else if (max === green) hue = (blue - red) / difference + 2;
        else hue = (red - green) / difference + 4;
        hue = (hue * 60 + 360) % 360;
    }

    return {
        h: hue,
        s: max === 0 ? 0 : (difference / max) * 100,
        v: max * 100,
    };
};

export const hsvToHex = ({ h, s, v }: HsvColor): string => {
    const hue = ((h % 360) + 360) % 360;
    const saturation = clamp(s, 0, 100) / 100;
    const value = clamp(v, 0, 100) / 100;
    const chroma = value * saturation;
    const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
    const minimum = value - chroma;
    const channels =
        hue < 60
            ? [chroma, secondary, 0]
            : hue < 120
              ? [secondary, chroma, 0]
              : hue < 180
                ? [0, chroma, secondary]
                : hue < 240
                  ? [0, secondary, chroma]
                  : hue < 300
                    ? [secondary, 0, chroma]
                    : [chroma, 0, secondary];

    return `#${channels
        .map((channel) =>
            Math.round((channel + minimum) * 255)
                .toString(16)
                .padStart(2, '0')
        )
        .join('')
        .toUpperCase()}`;
};
