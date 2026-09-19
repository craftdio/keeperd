import type {
    NodeChange,
    NodeDimensionChange,
    NodePositionChange,
} from '@xyflow/react';

// React Flow may omit dimensions on the final resize event.
export function settledNodeChanges() {
    const pending = new Map<string, NodeDimensionChange>();
    const positions = new Map<string, NodePositionChange>();
    return (changes: NodeChange[]): NodeChange[] => {
        for (const change of changes) {
            if (change.type === 'dimensions' && change.resizing === true)
                pending.set(change.id, change);
        }
        for (const change of changes) {
            if (change.type === 'position' && pending.has(change.id))
                positions.set(change.id, change);
        }
        const resizing = new Set(pending.keys());
        return changes.flatMap<NodeChange>((change) => {
            if (change.type === 'remove') {
                pending.delete(change.id);
                positions.delete(change.id);
            }
            if (change.type === 'position' && resizing.has(change.id))
                return [];
            if (change.type !== 'dimensions') return [change];
            if (change.resizing === true) {
                pending.set(change.id, change);
                return [];
            }
            if (change.resizing === false) {
                const previous = pending.get(change.id);
                const position = positions.get(change.id);
                pending.delete(change.id);
                positions.delete(change.id);
                return [
                    ...(position ? [{ ...position, dragging: false }] : []),
                    {
                        ...previous,
                        ...change,
                        dimensions: change.dimensions ?? previous?.dimensions,
                    },
                ];
            }
            return [];
        });
    };
}
