export const colorOptions = [
    '#ff6363', // A brighter red.
    '#ff6b8a', // A vibrant pink.
    '#c05dcf', // A rich purple.
    '#b067e9', // A lighter purple.
    '#8a61f5', // A bold indigo.
    '#7175fa', // A lighter indigo.
    '#8eb7ff', // A sky blue.
    '#42e0c0', // A fresh aqua.
    '#4dee8a', // A mint green.
    '#9ef07a', // A lime green.
    '#ffe374', // A warm yellow.
    '#ff9f74', // A peachy orange.
    '#f87171', // A balanced coral red.
    '#fb923c', // A vivid tangerine.
    '#fbbf24', // A golden amber.
    '#a3e635', // A fresh chartreuse.
    '#22c55e', // A deeper green.
    '#14b8a6', // A balanced teal.
    '#22d3ee', // A bright cyan.
    '#38bdf8', // A clear sky blue.
    '#3b82f6', // A stronger blue.
    '#6366f1', // A cool periwinkle.
    '#94a3b8', // A cool slate gray.
    '#a8a29e', // A warm stone gray.
];

export const randomColor = () => {
    return colorOptions[Math.floor(Math.random() * colorOptions.length)];
};

export const viewColor = '#b0b0b0';
export const materializedViewColor = '#7d7d7d';
export const defaultTableColor = '#8eb7ff';
export const defaultAreaColor = '#b067e9';
