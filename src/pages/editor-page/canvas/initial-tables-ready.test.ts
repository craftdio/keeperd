import { describe, expect, it } from 'vitest';
import type { DBTable } from '@/lib/domain/db-table';
import type { TableNodeType } from './table-node/table-node';
import { initialTablesReady } from './initial-tables-ready';

const table = (id: string, x: number, fieldIds: string[]): DBTable =>
    ({
        id,
        x,
        y: 0,
        fields: fieldIds.map((fieldId) => ({ id: fieldId })),
    }) as DBTable;

const node = (value: DBTable): TableNodeType =>
    ({
        id: value.id,
        type: 'table',
        position: { x: value.x, y: value.y },
        data: { table: value },
    }) as TableNodeType;

describe('initialTablesReady', () => {
    it('accepts the loaded tables even when later edits change unrelated data', () => {
        const initial = table('one', 20, ['a', 'b']);
        const rendered = table('one', 20, ['a', 'b']);
        rendered.name = 'renamed';
        expect(initialTablesReady([initial], [node(rendered)])).toBe(true);
    });

    it('waits for all tables and their loaded positions', () => {
        const one = table('one', 20, ['a']);
        const two = table('two', 40, ['b']);
        expect(initialTablesReady([one, two], [node(one)])).toBe(false);
        expect(initialTablesReady([one], [node(table('one', 30, ['a']))])).toBe(
            false
        );
    });

    it('waits for the correct field handles after a branch or diagram change', () => {
        const initial = table('one', 20, ['a', 'b']);
        expect(
            initialTablesReady([initial], [node(table('one', 20, ['a', 'c']))])
        ).toBe(false);
        expect(initialTablesReady([initial], [node(initial)])).toBe(true);
    });
});
