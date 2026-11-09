import React, { useState } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Node, FitView } from '@xyflow/react';
import type { DBTable } from '@/lib/domain/db-table';
import { useLayoutShareSelection } from './use-layout-share-selection';

const key = (schema: string, name: string) => JSON.stringify([schema, name]);
const tables = [
    { id: 'public-users', schema: 'public', name: 'users' },
    { id: 'audit-users', schema: 'audit', name: 'users' },
    { id: 'hidden', schema: '', name: 'hidden' },
] as DBTable[];
const original: Node[] = [
    {
        id: 'public-users',
        type: 'table',
        position: { x: 5, y: 10 },
        data: {},
        selected: true,
    },
    { id: 'audit-users', type: 'table', position: { x: 15, y: 20 }, data: {} },
    {
        id: 'hidden',
        type: 'table',
        position: { x: 50, y: 60 },
        data: {},
        hidden: true,
    },
    {
        id: 'area',
        type: 'area',
        position: { x: 0, y: 0 },
        data: {},
        selected: true,
    },
];
const fitView = vi.fn<FitView>(async () => true);
let currentNodes: Node[];
let displayedNodes: Node[];
let clickNode: ReturnType<typeof useLayoutShareSelection<Node>>['onNodeClick'];
let sharingActive: boolean;
let pointerDown: ReturnType<
    typeof useLayoutShareSelection<Node>
>['capturePointerDown'];
let keyDown: ReturnType<typeof useLayoutShareSelection<Node>>['captureKeyDown'];
let updateNodes: React.Dispatch<React.SetStateAction<Node[]>>;
function Harness({ diagramId = 'diagram' }: { diagramId?: string }) {
    const [nodes, setNodes] = useState(original);
    currentNodes = nodes;
    updateNodes = setNodes;
    const sharing = useLayoutShareSelection({
        diagramId,
        tables,
        nodes,
        setNodes,
        fitView,
    });
    displayedNodes = sharing.decorateNodes(nodes);
    clickNode = sharing.onNodeClick;
    sharingActive = sharing.active;
    pointerDown = sharing.capturePointerDown;
    keyDown = sharing.captureKeyDown;
    return null;
}
const send = (detail: object) =>
    act(() => {
        window.dispatchEvent(
            new CustomEvent('keeperd-layout-selection', { detail })
        );
    });
beforeEach(() => vi.stubEnv('VITE_LOCAL_ERD', 'true'));
afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    fitView.mockClear();
});

it('marks a separate share basket without selecting or recoloring editor nodes, and clears explicitly removed editor picks', () => {
    const received = vi.fn();
    window.addEventListener('keeperd-canvas-selection', received);
    try {
        render(<Harness />);
        received.mockClear();
        send({ diagramId: 'diagram', read: true });
        expect(received.mock.calls[0][0].detail).toEqual({
            diagramId: 'diagram',
            keys: [key('public', 'users')],
        });
        send({
            diagramId: 'other',
            keys: [key('audit', 'users')],
            active: true,
        });
        expect(displayedNodes).toBe(original);
        send({
            diagramId: 'diagram',
            keys: [
                key('public', 'users'),
                key('audit', 'users'),
                key('unknown', 'users'),
            ],
            active: true,
        });
        expect(currentNodes).toBe(original);
        expect(
            displayedNodes
                .filter((n) => n.className === 'layout-share-target')
                .map((n) => n.id)
        ).toEqual(['public-users', 'audit-users']);
        expect(displayedNodes.map((n) => n.position)).toEqual(
            original.map((n) => n.position)
        );
        expect(displayedNodes.map((n) => n.data)).toEqual(
            original.map((n) => n.data)
        );
        expect(fitView).not.toHaveBeenCalled();
        send({
            diagramId: 'diagram',
            keys: [key('audit', 'users')],
            active: true,
        });
        expect(currentNodes.filter((n) => n.selected).map((n) => n.id)).toEqual(
            ['area']
        );
        expect(
            displayedNodes
                .filter((n) => n.className === 'layout-share-target')
                .map((n) => n.id)
        ).toEqual(['audit-users']);
        send({ diagramId: 'diagram', active: false });
        expect(displayedNodes).toBe(currentNodes);
        expect(sharingActive).toBe(false);
    } finally {
        window.removeEventListener('keeperd-canvas-selection', received);
    }
});

it('emits one explicit toggle per canvas click and ignores areas or clicks outside sharing mode', () => {
    const received = vi.fn();
    window.addEventListener('keeperd-canvas-selection', received);
    try {
        render(<Harness />);
        received.mockClear();
        act(() => clickNode({} as React.MouseEvent, original[1]));
        expect(received).not.toHaveBeenCalled();
        send({ diagramId: 'diagram', keys: [], active: true });
        act(() => clickNode({} as React.MouseEvent, original[1]));
        act(() => clickNode({} as React.MouseEvent, original[1]));
        act(() => clickNode({} as React.MouseEvent, original[3]));
        expect(received).toHaveBeenCalledTimes(2);
        expect(received.mock.calls[0][0].detail).toEqual({
            diagramId: 'diagram',
            keys: [key('audit', 'users')],
            toggle: true,
        });
        send({ diagramId: 'diagram', active: false });
        act(() => clickNode({} as React.MouseEvent, original[1]));
        expect(received).toHaveBeenCalledTimes(2);
    } finally {
        window.removeEventListener('keeperd-canvas-selection', received);
    }
});

it('publishes direct canvas changes once and focuses only visible selected tables on explicit request', () => {
    const received = vi.fn();
    window.addEventListener('keeperd-canvas-selection', received);
    try {
        render(<Harness />);
        received.mockClear();
        act(() =>
            updateNodes((nodes) =>
                nodes.map((n) => ({ ...n, selected: n.id === 'audit-users' }))
            )
        );
        expect(received).toHaveBeenCalledTimes(1);
        expect(received.mock.calls[0][0].detail.keys).toEqual([
            key('audit', 'users'),
        ]);
        act(() =>
            updateNodes((nodes) =>
                nodes.map((n) => ({ ...n, position: { x: 100, y: 100 } }))
            )
        );
        expect(received).toHaveBeenCalledTimes(1);
        send({
            diagramId: 'diagram',
            keys: [key('audit', 'users'), key('', 'hidden')],
            focus: true,
        });
        expect(fitView).toHaveBeenCalledWith(
            expect.objectContaining({
                nodes: [expect.objectContaining({ id: 'audit-users' })],
            })
        );
        fitView.mockClear();
        send({ diagramId: 'diagram', keys: [key('', 'hidden')], focus: true });
        expect(fitView).not.toHaveBeenCalled();
    } finally {
        window.removeEventListener('keeperd-canvas-selection', received);
    }
});

it('cleans up across diagram changes and unmount, and is inactive outside the local app', () => {
    const { rerender, unmount } = render(<Harness />);
    send({
        diagramId: 'diagram',
        keys: [key('public', 'users')],
        active: true,
    });
    expect(sharingActive).toBe(true);
    rerender(<Harness diagramId="next" />);
    expect(sharingActive).toBe(false);
    expect(displayedNodes).toBe(original);
    send({ diagramId: 'diagram', keys: [key('audit', 'users')], active: true });
    expect(displayedNodes).toBe(original);
    send({ diagramId: 'next', keys: [key('audit', 'users')], active: true });
    expect(displayedNodes[1].className).toBe('layout-share-target');
    unmount();
    send({ diagramId: 'next', keys: [key('public', 'users')], focus: true });
    expect(fitView).not.toHaveBeenCalled();
    vi.stubEnv('VITE_LOCAL_ERD', 'false');
    render(<Harness />);
    send({ diagramId: 'diagram', keys: [key('audit', 'users')], active: true });
    expect(displayedNodes).toBe(original);
    expect(sharingActive).toBe(false);
});

it('keeps focused tables within the canvas area beside the open sharing panel', () => {
    const canvas = document.createElement('div');
    canvas.id = 'canvas';
    const panel = document.createElement('div');
    panel.id = 'erd-layout-panel';
    panel.className = 'visible';
    document.body.append(canvas, panel);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        left: 414,
        right: 1280,
        width: 866,
    } as DOMRect);
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
        left: 802,
        right: 1262,
        width: 460,
    } as DOMRect);
    try {
        render(<Harness />);
        send({
            diagramId: 'diagram',
            keys: [key('public', 'users')],
            focus: true,
        });
        expect(fitView).toHaveBeenCalledWith(
            expect.objectContaining({
                padding: {
                    left: '24px',
                    right: '502px',
                    top: '32px',
                    bottom: '90px',
                },
            })
        );
        panel.className = '';
        send({
            diagramId: 'diagram',
            keys: [key('public', 'users')],
            focus: true,
        });
        expect(fitView).toHaveBeenLastCalledWith(
            expect.objectContaining({ padding: 0.35 })
        );
    } finally {
        canvas.remove();
        panel.remove();
    }
});

it('suppresses editor snapshots around a node click, while marquee and keyboard selections still add groups', () => {
    const received = vi.fn();
    window.addEventListener('keeperd-canvas-selection', received);
    const table = document.createElement('div');
    table.className = 'react-flow__node-table';
    const child = document.createElement('span');
    table.append(child);
    const pane = document.createElement('div');
    const select = (ids: string[]) =>
        act(() =>
            updateNodes((nodes) =>
                nodes.map((n) => ({ ...n, selected: ids.includes(n.id) }))
            )
        );
    try {
        render(<Harness />);
        send({ diagramId: 'diagram', keys: [], active: true });
        received.mockClear();
        act(() =>
            pointerDown({
                target: child,
            } as unknown as React.PointerEvent<HTMLDivElement>)
        );
        // React Flow may select the node before the click callback.
        select(['audit-users']);
        expect(received).not.toHaveBeenCalled();
        act(() => clickNode({} as React.MouseEvent, original[1]));
        expect(received).toHaveBeenCalledTimes(1);
        expect(received.mock.calls[0][0].detail.toggle).toBe(true);
        // It may also commit another selection snapshot after the callback.
        select([]);
        select(['audit-users']);
        expect(received).toHaveBeenCalledTimes(1);
        act(() => clickNode({} as React.MouseEvent, original[1]));
        expect(received).toHaveBeenCalledTimes(2);
        received.mockClear();
        act(() =>
            pointerDown({
                target: pane,
            } as unknown as React.PointerEvent<HTMLDivElement>)
        );
        select(['public-users', 'audit-users']);
        expect(received.mock.calls[0][0].detail).toEqual({
            diagramId: 'diagram',
            keys: [key('audit', 'users'), key('public', 'users')],
        });
        act(() =>
            pointerDown({
                target: child,
            } as unknown as React.PointerEvent<HTMLDivElement>)
        );
        received.mockClear();
        act(() => keyDown());
        select(['public-users']);
        expect(received.mock.calls[0][0].detail).toEqual({
            diagramId: 'diagram',
            keys: [key('public', 'users')],
        });
    } finally {
        window.removeEventListener('keeperd-canvas-selection', received);
    }
});
