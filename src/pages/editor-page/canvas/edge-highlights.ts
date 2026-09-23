import type { EdgeType } from './canvas';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import type { DBDependency } from '@/lib/domain/db-dependency';

export interface EdgeHighlightIndex {
    positions: ReadonlyMap<string, number>;
    byTable: ReadonlyMap<string, ReadonlySet<string>>;
}

export const createEdgeHighlightIndex = (
    relationships: DBRelationship[],
    dependencies: DBDependency[]
): EdgeHighlightIndex => {
    const positions = new Map<string, number>();
    const byTable = new Map<string, Set<string>>();

    const add = (id: string, source: string, target: string) => {
        positions.set(id, positions.size);
        for (const tableId of new Set([source, target])) {
            const ids = byTable.get(tableId) ?? new Set<string>();
            ids.add(id);
            byTable.set(tableId, ids);
        }
    };

    for (const relationship of relationships) {
        add(
            relationship.id,
            relationship.sourceTableId,
            relationship.targetTableId
        );
    }
    for (const dependency of dependencies) {
        add(dependency.id, dependency.dependentTableId, dependency.tableId);
    }

    return { positions, byTable };
};

export const getHighlightedEdgeIds = (
    index: EdgeHighlightIndex,
    selectedTableIds: readonly string[],
    selectedEdgeIds: readonly string[]
): ReadonlySet<string> => {
    const ids = new Set(selectedEdgeIds);
    for (const tableId of selectedTableIds) {
        for (const edgeId of index.byTable.get(tableId) ?? []) {
            ids.add(edgeId);
        }
    }
    return ids;
};

export const updateEdgeHighlights = (
    edges: EdgeType[],
    index: EdgeHighlightIndex,
    highlightedIds: ReadonlySet<string>,
    previouslyHighlightedIds: ReadonlySet<string>,
    highlightedZIndex: number,
    defaultZIndex: number
): EdgeType[] => {
    let nextEdges = edges;
    let fallbackPositions: Map<string, number> | undefined;

    for (const id of new Set([
        ...previouslyHighlightedIds,
        ...highlightedIds,
    ])) {
        let position = index.positions.get(id);
        if (position === undefined || edges[position]?.id !== id) {
            fallbackPositions ??= new Map(
                edges.map((edge, edgeIndex) => [edge.id, edgeIndex])
            );
            position = fallbackPositions.get(id);
        }
        if (position === undefined) continue;

        const edge = nextEdges[position];
        if (
            edge.type !== 'relationship-edge' &&
            edge.type !== 'dependency-edge'
        ) {
            continue;
        }
        const highlighted = highlightedIds.has(id);
        const zIndex = highlighted ? highlightedZIndex : defaultZIndex;
        if (
            (edge.data?.highlighted ?? false) === highlighted &&
            (edge.animated ?? false) === highlighted &&
            (edge.zIndex ?? 0) === zIndex
        ) {
            continue;
        }

        if (nextEdges === edges) nextEdges = [...edges];
        nextEdges[position] = {
            ...edge,
            data: { ...edge.data!, highlighted },
            animated: highlighted,
            zIndex,
        } as EdgeType;
    }

    return nextEdges;
};
