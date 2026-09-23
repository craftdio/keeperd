import { describe, expect, it } from 'vitest';
import type { DBField } from '@/lib/domain/db-field';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import {
    getOverviewHandleAnchors,
    getOverviewTableHeight,
} from './table-overview-handles';

const fields = [{ id: 'f1' }, { id: 'f2' }] as DBField[];
const relationships = [
    {
        sourceTableId: 'a',
        sourceFieldId: 'f1',
        targetTableId: 'b',
        targetFieldId: 'f2',
    },
    {
        sourceTableId: 'a',
        sourceFieldId: 'f1',
        targetTableId: 'b',
        targetFieldId: 'f2',
    },
] as DBRelationship[];

describe('overview table handles', () => {
    it('preserves the detailed table height while rows are unmounted', () => {
        expect(getOverviewTableHeight(10, false)).toBe(368);
        expect(getOverviewTableHeight(2, true)).toBe(144);
    });

    it('keeps one source pair and indexed target handles at field centers', () => {
        expect(getOverviewHandleAnchors('a', fields, relationships)).toEqual([
            { fieldId: 'f1', side: 'left', top: 62 },
            { fieldId: 'f1', side: 'right', top: 62 },
        ]);
        expect(getOverviewHandleAnchors('b', fields, relationships)).toEqual([
            { fieldId: 'f2', side: 'target', index: 0, top: 94 },
            { fieldId: 'f2', side: 'target', index: 1, top: 94 },
        ]);
    });

    it('anchors a relationship to a hidden field at the table body center', () => {
        expect(
            getOverviewHandleAnchors('a', [], relationships).map(
                ({ top }) => top
            )
        ).toEqual([46, 46]);
        expect(
            getOverviewHandleAnchors('a', fields, relationships, true)
        ).toEqual([]);
        expect(
            getOverviewHandleAnchors('a', [], relationships, true).map(
                ({ top }) => top
            )
        ).toEqual([46, 46]);
    });
});
