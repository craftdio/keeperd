import type { DBTable } from '@/lib/domain/db-table';
import type { TableNodeType } from './table-node/table-node';

/** Check only the diagram data needed before the first automatic fit. */
export const initialTablesReady = (
    initialTables: DBTable[],
    nodes: TableNodeType[]
): boolean => {
    if (initialTables.length !== nodes.length) return false;
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    return initialTables.every((table) => {
        const node = nodesById.get(table.id);
        return (
            node?.position.x === table.x &&
            node.position.y === table.y &&
            node.data.table.fields.length === table.fields.length &&
            table.fields.every(
                (field, index) => node.data.table.fields[index]?.id === field.id
            )
        );
    });
};
