export const normalizeHexColor = (value: string): string | null => {
    const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
    return match ? `#${match[1].toUpperCase()}` : null;
};
