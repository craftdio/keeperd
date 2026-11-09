import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction, MouseEvent, PointerEvent } from 'react';
import type { FitView, Node } from '@xyflow/react';
import type { DBTable } from '@/lib/domain/db-table';

const keyOf = (table: Pick<DBTable, 'schema' | 'name'>) =>
    JSON.stringify([table.schema ?? '', table.name]);

type SelectionRequest = {
    diagramId: string;
    keys?: string[];
    read?: boolean;
    focus?: boolean;
    active?: boolean;
};
type ShareSelection = { diagramId: string; keys: string[]; active: boolean };

// Sharing has its own basket. Normal editor selection can change while those
// targets remain highlighted; no table colors, layout or history are written.
export function useLayoutShareSelection<N extends Node>({
    diagramId,
    tables,
    nodes,
    setNodes,
    fitView,
}: {
    diagramId: string;
    tables: DBTable[];
    nodes: N[];
    setNodes: Dispatch<SetStateAction<N[]>>;
    fitView: FitView;
}) {
    const [share, setShare] = useState<ShareSelection>({
        diagramId: '',
        keys: [],
        active: false,
    });
    const active = share.diagramId === diagramId && share.active;
    const targetIds = useMemo(() => {
        const keys = new Set(active ? share.keys : []);
        return new Set(
            tables
                .filter((table) => keys.has(keyOf(table)))
                .map((table) => table.id)
        );
    }, [tables, active, share.keys]);
    // React Flow changes ordinary selection before/after its click callback.
    // A node pointer gesture is owned by the explicit share toggle instead.
    // Marquee/keyboard selection still adds a group through the selection effect.
    const nodePointerGesture = useRef(false);
    const capturePointerDown = useCallback(
        (event: PointerEvent<HTMLDivElement>) => {
            nodePointerGesture.current =
                active &&
                event.target instanceof Element &&
                Boolean(event.target.closest('.react-flow__node-table'));
        },
        [active]
    );
    const captureKeyDown = useCallback(() => {
        nodePointerGesture.current = false;
    }, []);
    const latest = useRef({ tables, nodes, setNodes, fitView, share });
    latest.current = { tables, nodes, setNodes, fitView, share };
    const selection = useMemo(() => {
        const ids = new Set(
            nodes
                .filter((node) => node.type === 'table' && node.selected)
                .map((node) => node.id)
        );
        return JSON.stringify(
            tables
                .filter((table) => ids.has(table.id))
                .map(keyOf)
                .sort()
        );
    }, [nodes, tables]);

    useEffect(() => {
        if (import.meta.env.VITE_LOCAL_ERD !== 'true') return;
        const receive = (event: Event) => {
            const detail = (event as CustomEvent<SelectionRequest>).detail;
            if (!detail || detail.diagramId !== diagramId) return;
            const current = latest.current;
            if (detail.read) {
                const ids = new Set(
                    current.nodes
                        .filter(
                            (node) => node.type === 'table' && node.selected
                        )
                        .map((node) => node.id)
                );
                window.dispatchEvent(
                    new CustomEvent('keeperd-canvas-selection', {
                        detail: {
                            diagramId,
                            keys: current.tables
                                .filter((table) => ids.has(table.id))
                                .map(keyOf),
                        },
                    })
                );
                return;
            }
            if (detail.active === false) {
                setShare({ diagramId, keys: [], active: false });
                return;
            }
            if (!Array.isArray(detail.keys)) return;
            const known = new Set(current.tables.map(keyOf));
            const keys = new Set(detail.keys.filter((key) => known.has(key)));
            const ids = new Set(
                current.tables
                    .filter((table) => keys.has(keyOf(table)))
                    .map((table) => table.id)
            );
            if (detail.focus) {
                const visibleNodes = current.nodes.filter(
                    (node) =>
                        ids.has(node.id) &&
                        node.type === 'table' &&
                        !node.hidden
                );
                if (visibleNodes.length) {
                    const canvas = document
                        .querySelector('#canvas')
                        ?.getBoundingClientRect();
                    const panel = document
                        .querySelector('#erd-layout-panel.visible')
                        ?.getBoundingClientRect();
                    const covered =
                        canvas && panel
                            ? Math.max(0, canvas.right - panel.left)
                            : 0;
                    void current.fitView({
                        nodes: visibleNodes,
                        padding:
                            covered > 0
                                ? {
                                      top: '32px',
                                      bottom: '90px',
                                      left: '24px',
                                      right: `${Math.min(covered, Math.max(0, (canvas?.width ?? 0) - 120)) + 24}px`,
                                  }
                                : 0.35,
                        maxZoom: 1,
                        duration: 250,
                    });
                }
                return;
            }
            const previousKeys = new Set(
                current.share.diagramId === diagramId ? current.share.keys : []
            );
            const removedIds = new Set(
                current.tables
                    .filter(
                        (table) =>
                            previousKeys.has(keyOf(table)) &&
                            !keys.has(keyOf(table))
                    )
                    .map((table) => table.id)
            );
            // Explicit chip/checkbox removals also clear transient selection of
            // that table, so clicking it again can add it back immediately.
            if (removedIds.size)
                current.setNodes((previous) => {
                    let changed = false;
                    const next = previous.map((node) => {
                        if (
                            node.type !== 'table' ||
                            !node.selected ||
                            !removedIds.has(node.id)
                        )
                            return node;
                        changed = true;
                        return { ...node, selected: false };
                    });
                    return changed ? next : previous;
                });
            setShare((previous) =>
                previous.diagramId === diagramId &&
                previous.active &&
                JSON.stringify(previous.keys) === JSON.stringify([...keys])
                    ? previous
                    : { diagramId, keys: [...keys], active: true }
            );
        };
        window.addEventListener('keeperd-layout-selection', receive);
        return () =>
            window.removeEventListener('keeperd-layout-selection', receive);
    }, [diagramId]);

    useEffect(() => {
        const currentShare = latest.current.share;
        if (
            import.meta.env.VITE_LOCAL_ERD !== 'true' ||
            (currentShare.diagramId === diagramId &&
                currentShare.active &&
                nodePointerGesture.current)
        )
            return;
        window.dispatchEvent(
            new CustomEvent('keeperd-canvas-selection', {
                detail: { diagramId, keys: JSON.parse(selection) as string[] },
            })
        );
    }, [diagramId, selection]);

    const onNodeClick = useCallback(
        (_event: MouseEvent, node: N) => {
            if (!active || node.type !== 'table') return;
            const table = latest.current.tables.find(
                (table) => table.id === node.id
            );
            if (table)
                window.dispatchEvent(
                    new CustomEvent('keeperd-canvas-selection', {
                        detail: {
                            diagramId,
                            keys: [keyOf(table)],
                            toggle: true,
                        },
                    })
                );
        },
        [active, diagramId]
    );
    const decorateNodes = useCallback(
        (values: N[]): N[] => {
            if (!active || !targetIds.size) return values;
            return values.map((node) =>
                node.type === 'table' && targetIds.has(node.id)
                    ? {
                          ...node,
                          className: [node.className, 'layout-share-target']
                              .filter(Boolean)
                              .join(' '),
                      }
                    : node
            );
        },
        [active, targetIds]
    );
    return {
        active,
        hasTargets: active && targetIds.size > 0,
        decorateNodes,
        onNodeClick,
        capturePointerDown,
        captureKeyDown,
    };
}
