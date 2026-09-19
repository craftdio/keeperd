import type { Node } from '@xyflow/react';

export function preserveInteraction<T extends Node>(
    incoming: T[],
    previous: T[],
    active: Set<string>
): T[] {
    const byId = new Map(previous.map((node) => [node.id, node]));
    return incoming.map((node) => {
        const current = byId.get(node.id);
        if (!current) return node;
        return {
            ...node,
            selected: current.selected,
            ...(active.has(node.id)
                ? {
                      position: current.position,
                      width: current.width,
                      height: current.height,
                      measured: current.measured,
                      resizing: current.resizing,
                      dragging: current.dragging,
                  }
                : {}),
        };
    });
}
