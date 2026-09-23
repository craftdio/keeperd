import { describe, expect, it } from 'vitest';
import type { RelationshipEdgeType } from '../relationship-edge/relationship-edge';
import type { EdgeType } from '../canvas';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import { getHighlightedFieldIds, sameFieldIds } from './highlighted-fields';

const relationshipEdge = (
    id: string,
    source: string,
    target: string,
    selected = false,
    highlighted = false
): RelationshipEdgeType => ({
    id,
    source,
    target,
    type: 'relationship-edge',
    selected,
    data: {
        highlighted,
        relationship: {
            id,
            sourceTableId: source,
            targetTableId: target,
            sourceFieldId: `${source}-field`,
            targetFieldId: `${target}-field`,
        } as DBRelationship,
    },
});

describe('getHighlightedFieldIds', () => {
    it('reads only adjacent selected or highlighted relationship edges', () => {
        const adjacent = relationshipEdge('adjacent', 'a', 'b', true);
        const other = relationshipEdge('other', 'c', 'd', true);
        const dependency: EdgeType = {
            id: 'dependency',
            source: 'a',
            target: 'c',
            type: 'dependency-edge',
        } as EdgeType;
        const edges = new Map<string, EdgeType>([
            ['adjacent', adjacent],
            ['other', other],
            ['dependency', dependency],
        ]);
        const connections = new Map([
            [
                'a',
                new Map([
                    ['one', { edgeId: 'adjacent' }],
                    ['two', { edgeId: 'dependency' }],
                ]),
            ],
        ]);

        expect(getHighlightedFieldIds('a', connections, edges)).toEqual(
            new Set(['a-field', 'b-field'])
        );
        expect(getHighlightedFieldIds('c', connections, edges)).toEqual(
            new Set()
        );
    });

    it('treats the same field IDs as unchanged even when the Set is recreated', () => {
        expect(sameFieldIds(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(
            true
        );
        expect(sameFieldIds(new Set(['a']), new Set(['b']))).toBe(false);
    });
});
