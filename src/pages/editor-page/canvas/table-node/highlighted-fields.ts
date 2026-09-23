import type { Edge } from '@xyflow/react';
import type { RelationshipEdgeType } from '../relationship-edge/relationship-edge';

type ConnectedEdge = { edgeId: string };

export const getHighlightedFieldIds = (
    tableId: string,
    connections: ReadonlyMap<string, ReadonlyMap<string, ConnectedEdge>>,
    edges: ReadonlyMap<string, Edge>
): ReadonlySet<string> => {
    const fieldIds = new Set<string>();

    for (const connection of connections.get(tableId)?.values() ?? []) {
        const edge = edges.get(connection.edgeId) as
            | RelationshipEdgeType
            | Edge
            | undefined;
        if (
            edge?.type !== 'relationship-edge' ||
            (!edge.selected && !edge.data?.highlighted)
        ) {
            continue;
        }

        const relationship = (edge as RelationshipEdgeType).data?.relationship;
        if (relationship?.sourceFieldId) {
            fieldIds.add(relationship.sourceFieldId);
        }
        if (relationship?.targetFieldId) {
            fieldIds.add(relationship.targetFieldId);
        }
    }

    return fieldIds;
};

export const sameFieldIds = (
    left: ReadonlySet<string>,
    right: ReadonlySet<string>
): boolean =>
    left.size === right.size &&
    [...left].every((fieldId) => right.has(fieldId));
