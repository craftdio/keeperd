import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const css = readFileSync('src/index.css', 'utf8');

it('excludes areas, notes and active resizing from width animation', () => {
    const selector = css
        .match(/([^{}]+)\{\s*@apply transition-\[width\]/)?.[1]
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim();
    expect(selector).toBeTruthy();
    const canvas = document.createElement('div');
    canvas.className = 'react-flow nodes-animated';
    const node = document.createElement('div');
    canvas.append(node);
    for (const kind of ['area', 'note']) {
        node.className = `react-flow__node react-flow__node-${kind}`;
        expect(node.matches(selector!)).toBe(false);
    }
    node.className = 'react-flow__node react-flow__node-table resizing';
    expect(node.matches(selector!)).toBe(false);
    node.classList.remove('resizing');
    expect(node.matches(selector!)).toBe(true);
});
