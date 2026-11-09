// Public, deterministic data for measurements; never read an installed workspace.
export function performanceSnapshots({ tables = 100, diagrams = 14 } = {}) {
    if (
        !Number.isSafeInteger(tables) ||
        tables < 1 ||
        tables > 1000 ||
        !Number.isSafeInteger(diagrams) ||
        diagrams < 1 ||
        diagrams > 100
    )
        throw new Error('Use 1–1000 tables and 1–100 diagrams.');
    const date = '2026-01-01T00:00:00.000Z';
    return {
        snapshots: Array.from({ length: diagrams }, (_, branch) => {
            const id = `debut-perf-${branch}`;
            const tableId = (i) => `${id}-table-${i}`;
            return {
                revision: 'fixture-v1',
                repositoryUrl: 'https://github.com/example/keeperd-performance',
                branch: `fixture-${branch}`,
                commit: 'a'.repeat(40),
                diagram: {
                    id,
                    name: `Performance fixture ${branch}`,
                    databaseType: 'postgresql',
                    createdAt: date,
                    updatedAt: date,
                    tables: Array.from({ length: tables }, (_, i) => ({
                        id: tableId(i),
                        name: `table_${String(i).padStart(4, '0')}`,
                        schema: 'public',
                        x: (i % 10) * 340,
                        y: Math.floor(i / 10) * 360,
                        width: 280,
                        color: '#6366f1',
                        order: i,
                        expanded: false,
                        fields: Array.from({ length: 10 }, (_, field) => ({
                            id: `${tableId(i)}-field-${field}`,
                            name: field === 0 ? 'id' : `column_${field}`,
                            type: { id: 'bigint', name: 'bigint' },
                            primaryKey: field === 0,
                            nullable: field > 1,
                            createdAt: date,
                        })),
                        indexes: [],
                    })),
                    relationships: Array.from(
                        { length: tables - 1 },
                        (_, i) => ({
                            id: `${id}-relationship-${i}`,
                            name: `fk_${i}`,
                            sourceTableId: tableId(i + 1),
                            sourceFieldId: `${tableId(i + 1)}-field-1`,
                            targetTableId: tableId(i),
                            targetFieldId: `${tableId(i)}-field-0`,
                            sourceCardinality: 'many',
                            targetCardinality: 'one',
                            createdAt: date,
                        })
                    ),
                    dependencies: [],
                    areas: [],
                    notes: [],
                    customTypes: [],
                },
            };
        }),
    };
}
