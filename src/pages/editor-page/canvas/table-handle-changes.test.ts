import { describe, expect, it } from 'vitest';
import type { DBTable } from '@/lib/domain/db-table';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import type { DBDependency } from '@/lib/domain/db-dependency';
import { getChangedTableHandleIds } from './table-handle-changes';

const table = (id: string, fieldIds: string[]): DBTable =>
    ({
        id,
        fields: fieldIds.map((fieldId) => ({ id: fieldId })),
    }) as DBTable;

const relationship = (
    id: string,
    targetTableId: string,
    targetFieldId: string
): DBRelationship => ({ id, targetTableId, targetFieldId }) as DBRelationship;

const dependency = (id: string, tableId: string): DBDependency =>
    ({ id, tableId }) as DBDependency;

describe('getChangedTableHandleIds', () => {
    const tables = [table('one', ['a', 'b']), table('two', ['c'])];

    it('registers each table once on first load and skips unchanged rerenders', () => {
        const first = getChangedTableHandleIds(tables, [], [], new Map());
        expect(first.changedIds).toEqual(['one', 'two']);

        const second = getChangedTableHandleIds(
            [...tables],
            [],
            [],
            first.signatures
        );
        expect(second.changedIds).toEqual([]);
    });

    it('refreshes only the table whose target handle count changes', () => {
        const first = getChangedTableHandleIds(tables, [], [], new Map());
        const added = getChangedTableHandleIds(
            tables,
            [relationship('r1', 'one', 'b')],
            [],
            first.signatures
        );
        expect(added.changedIds).toEqual(['one']);

        const removed = getChangedTableHandleIds(
            tables,
            [],
            [],
            added.signatures
        );
        expect(removed.changedIds).toEqual(['one']);
    });

    it('refreshes only tables with added, removed, or reordered fields', () => {
        const first = getChangedTableHandleIds(tables, [], [], new Map());
        const addedAndReordered = getChangedTableHandleIds(
            [table('one', ['b', 'a', 'new']), tables[1]],
            [],
            [],
            first.signatures
        );
        expect(addedAndReordered.changedIds).toEqual(['one']);

        const removed = getChangedTableHandleIds(
            [table('one', ['a']), tables[1]],
            [],
            [],
            addedAndReordered.signatures
        );
        expect(removed.changedIds).toEqual(['one']);
    });

    it('refreshes dependency targets and does not retain deleted tables', () => {
        const first = getChangedTableHandleIds(tables, [], [], new Map());
        const changed = getChangedTableHandleIds(
            [tables[0]],
            [],
            [dependency('d1', 'one')],
            first.signatures
        );
        expect(changed.changedIds).toEqual(['one']);
        expect(changed.signatures.has('two')).toBe(false);

        const removed = getChangedTableHandleIds(
            [tables[0]],
            [],
            [],
            changed.signatures
        );
        expect(removed.changedIds).toEqual(['one']);
    });
});
