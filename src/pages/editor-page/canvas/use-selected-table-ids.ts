import { useStore } from '@xyflow/react';
import type { ReactFlowState } from '@xyflow/react';

// All table menus share this selector. Panning keeps the node array unchanged,
// so it must not scan every node once per mounted menu on every viewport tick.
const selections = new WeakMap<ReactFlowState['nodes'], string[]>();
export function selectedTableIds(state: Pick<ReactFlowState, 'nodes'>) {
    let ids = selections.get(state.nodes);
    if (!ids) {
        ids = state.nodes
            .filter(
                (node) => node.type === 'table' && node.selected && !node.hidden
            )
            .map((node) => node.id);
        selections.set(state.nodes, ids);
    }
    return ids;
}
const sameIds = (previous: string[], next: string[]) =>
    previous === next ||
    (previous.length === next.length &&
        previous.every((id, index) => id === next[index]));

export const useSelectedTableIds = () => useStore(selectedTableIds, sameIds);
