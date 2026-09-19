import { expect, it } from 'vitest';
import {
    findSchemaAdditions,
    summarizeSchemaDifference,
} from './schema-diff.js';
const table = (id, name, fields, schema = 'public') => ({
    id,
    name,
    schema,
    fields: fields.map(([fieldId, fieldName]) => ({
        id: fieldId,
        name: fieldName,
    })),
});

it('finds new tables and fields by schema-qualified names', () => {
    const base = {
        tables: [table('old-users', 'users', [['old-id', 'id']])],
    };
    const current = {
        tables: [
            table('new-users', 'users', [
                ['new-id', 'id'],
                ['new-email', 'email'],
            ]),
            table('new-orders', 'orders', [['order-id', 'id']]),
            table('audit-users', 'users', [['audit-id', 'id']], 'audit'),
        ],
    };
    expect(findSchemaAdditions(base, current)).toEqual({
        newTableIds: ['new-orders', 'audit-users'],
        newFieldIds: ['new-email'],
        changedTableIds: ['new-users'],
        changedFieldIds: [],
        removedTables: 0,
        removedFields: 0,
        allTablesNew: false,
    });
});

it('marks the whole schema as new on the first sync', () => {
    const current = {
        tables: [table('users', 'users', []), table('orders', 'orders', [])],
    };
    expect(findSchemaAdditions(undefined, current)).toEqual({
        newTableIds: ['users', 'orders'],
        newFieldIds: [],
        changedTableIds: [],
        changedFieldIds: [],
        removedTables: 0,
        removedFields: 0,
        allTablesNew: true,
    });
});

it('marks changed fields and tables and counts removed schema items', () => {
    const base = {
        tables: [
            table('old-users', 'users', [
                ['old-id', 'id'],
                ['old-name', 'name'],
            ]),
            table('old-logs', 'logs', [['old-log-id', 'id']]),
        ],
    };
    base.tables[0].fields[0].type = { name: 'bigint' };
    const current = {
        tables: [table('new-users', 'users', [['new-id', 'id']])],
    };
    current.tables[0].fields[0].type = { name: 'uuid' };
    expect(findSchemaAdditions(base, current)).toEqual({
        newTableIds: [],
        newFieldIds: [],
        changedTableIds: ['new-users'],
        changedFieldIds: ['new-id'],
        removedTables: 1,
        removedFields: 1,
        allTablesNew: false,
    });
});

it('summarizes table, field, type and relationship changes by stable names', () => {
    const base = {
        tables: [
            table('old-users', 'users', [
                ['old-id', 'id'],
                ['old-name', 'name'],
            ]),
            table('old-logs', 'logs', [['old-log-id', 'id']]),
        ],
        relationships: [
            {
                sourceTableId: 'old-logs',
                sourceFieldId: 'old-log-id',
                targetTableId: 'old-users',
                targetFieldId: 'old-id',
            },
        ],
    };
    base.tables[0].fields[0].type = { name: 'bigint' };
    const current = {
        tables: [
            table('new-users', 'users', [
                ['new-id', 'id'],
                ['new-email', 'email'],
            ]),
            table('new-profiles', 'profiles', [['profile-id', 'id']]),
        ],
        relationships: [
            {
                sourceTableId: 'new-profiles',
                sourceFieldId: 'profile-id',
                targetTableId: 'new-users',
                targetFieldId: 'new-id',
            },
        ],
    };
    current.tables[0].fields[0].type = { name: 'uuid' };

    expect(summarizeSchemaDifference(base, current)).toEqual({
        tables: { added: 1, removed: 1 },
        fields: { added: 2, removed: 2, changed: 1 },
        relationships: { added: 1, removed: 1 },
    });
});
