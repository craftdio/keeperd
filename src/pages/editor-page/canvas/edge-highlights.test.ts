import { describe, expect, it } from 'vitest';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import type { DBDependency } from '@/lib/domain/db-dependency';
import type { EdgeType } from './canvas';
import {
    createEdgeHighlightIndex,
    getHighlightedEdgeIds,
    updateEdgeHighlights,
} from './edge-highlights';

const relationships = [
    { id: 'ab', sourceTableId: 'a', targetTableId: 'b' },
    { id: 'bc', sourceTableId: 'b', targetTableId: 'c' },
    { id: 'de', sourceTableId: 'd', targetTableId: 'e' },
] as DBRelationship[];
const dependencies = [
    { id: 'ac', dependentTableId: 'a', tableId: 'c' },
] as DBDependency[];
const edges = [...relationships, ...dependencies].map((item) => ({
    id: item.id,
    source:
        'sourceTableId' in item ? item.sourceTableId : item.dependentTableId,
    target: 'targetTableId' in item ? item.targetTableId : item.tableId,
    type: 'sourceTableId' in item ? 'relationship-edge' : 'dependency-edge',
    data:
        'sourceTableId' in item ? { relationship: item } : { dependency: item },
})) as EdgeType[];
const isHighlighted = (edge: EdgeType) =>
    (edge.type === 'relationship-edge' || edge.type === 'dependency-edge') &&
    edge.data?.highlighted;

describe('edge highlights', () => {
    it('finds only adjacent edges for single and multiple selections', () => {
        const index = createEdgeHighlightIndex(relationships, dependencies);
        expect(getHighlightedEdgeIds(index, ['a'], [])).toEqual(
            new Set(['ab', 'ac'])
        );
        expect(getHighlightedEdgeIds(index, ['a', 'c'], ['de'])).toEqual(
            new Set(['ab', 'bc', 'ac', 'de'])
        );
    });

    it('preserves untouched edge references and restores them on deselection', () => {
        const index = createEdgeHighlightIndex(relationships, dependencies);
        const selected = getHighlightedEdgeIds(index, ['a'], []);
        const changed = updateEdgeHighlights(
            edges,
            index,
            selected,
            new Set(),
            1,
            0
        );
        expect(changed).not.toBe(edges);
        expect(changed[0]).not.toBe(edges[0]);
        expect(changed[1]).toBe(edges[1]);
        expect(changed[2]).toBe(edges[2]);
        expect(changed[3]).not.toBe(edges[3]);
        expect(isHighlighted(changed[0])).toBe(true);
        expect(
            updateEdgeHighlights(changed, index, selected, selected, 1, 0)
        ).toBe(changed);

        const cleared = updateEdgeHighlights(
            changed,
            index,
            new Set(),
            selected,
            1,
            0
        );
        expect(isHighlighted(cleared[0])).toBe(false);
        expect(isHighlighted(cleared[3])).toBe(false);
        expect(cleared[1]).toBe(edges[1]);
    });

    it('falls back safely if the current edge array differs from the index order', () => {
        const index = createEdgeHighlightIndex(relationships, dependencies);
        const reordered = [edges[2], edges[0], edges[1], edges[3]];
        const highlighted = updateEdgeHighlights(
            reordered,
            index,
            new Set(['ab']),
            new Set(),
            1,
            0
        );
        expect(isHighlighted(highlighted[1])).toBe(true);
        expect(highlighted[0]).toBe(reordered[0]);
    });
});
