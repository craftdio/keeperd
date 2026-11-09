import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ReactFlowProvider, useStoreApi } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import {
    selectedTableIds,
    useSelectedTableIds,
} from './use-selected-table-ids';

let store: ReturnType<typeof useStoreApi>;
let renders = 0;
function Driver() {
    store = useStoreApi();
    return null;
}
function Menu() {
    const ids = useSelectedTableIds();
    renders++;
    return <output>{ids.join(',')}</output>;
}
afterEach(cleanup);

it('keeps all mounted menu subscribers idle during pan and position updates, while tracking real selection changes', () => {
    render(
        <ReactFlowProvider>
            <Driver />
            {Array.from({ length: 100 }, (_, i) => (
                <Menu key={i} />
            ))}
        </ReactFlowProvider>
    );
    const nodes: Node[] = [
        {
            id: 'users',
            type: 'table',
            selected: true,
            position: { x: 0, y: 0 },
            data: {},
        },
        { id: 'orders', type: 'table', position: { x: 10, y: 10 }, data: {} },
        {
            id: 'hidden',
            type: 'table',
            selected: true,
            hidden: true,
            position: { x: 0, y: 0 },
            data: {},
        },
        {
            id: 'area',
            type: 'area',
            selected: true,
            position: { x: 0, y: 0 },
            data: {},
        },
    ];
    act(() => store.setState({ nodes }));
    const before = renders;
    for (let i = 0; i < 16; i++)
        act(() => store.setState({ transform: [i, i, 1 + i / 100] }));
    act(() =>
        store.setState({
            nodes: nodes.map((node) => ({
                ...node,
                position: { x: 20, y: 20 },
            })),
        })
    );
    expect(renders).toBe(before);
    expect(screen.getAllByText('users')).toHaveLength(100);
    act(() =>
        store.setState({
            nodes: nodes.map((node) => ({
                ...node,
                selected: node.id === 'orders',
            })),
        })
    );
    expect(screen.getAllByText('orders')).toHaveLength(100);
    expect(renders).toBe(before + 100);
    act(() => store.setState({ nodes: [] }));
    expect(
        screen.getAllByRole('status').every((node) => node.textContent === '')
    ).toBe(true);
});

it('shares one derived result across menus for the same immutable node array', () => {
    const nodes: Node[] = [
        {
            id: 'one',
            type: 'table',
            selected: true,
            position: { x: 0, y: 0 },
            data: {},
        },
    ];
    const state = { nodes };
    expect(selectedTableIds(state)).toBe(selectedTableIds(state));
    expect(selectedTableIds(state)).toEqual(['one']);
});
