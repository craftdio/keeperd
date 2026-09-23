import type { DBTable } from '@/lib/domain/db-table';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import type { DBDependency } from '@/lib/domain/db-dependency';

/** Only changes to rendered handles need a React Flow internals refresh. */
export const getChangedTableHandleIds = (
    tables: DBTable[],
    relationships: DBRelationship[],
    dependencies: DBDependency[],
    previous: Map<string, string>
): { changedIds: string[]; signatures: Map<string, string> } => {
    const targetCounts = new Map<string, Map<string, number>>();
    for (const relationship of relationships) {
        const counts =
            targetCounts.get(relationship.targetTableId) ?? new Map();
        counts.set(
            relationship.targetFieldId,
            (counts.get(relationship.targetFieldId) ?? 0) + 1
        );
        targetCounts.set(relationship.targetTableId, counts);
    }

    const dependencyCounts = new Map<string, number>();
    for (const dependency of dependencies) {
        dependencyCounts.set(
            dependency.tableId,
            (dependencyCounts.get(dependency.tableId) ?? 0) + 1
        );
    }

    const signatures = new Map<string, string>();
    const changedIds: string[] = [];
    for (const table of tables) {
        const counts = targetCounts.get(table.id);
        const signature = JSON.stringify([
            table.expanded ?? false,
            table.fields.map((field) => [field.id, counts?.get(field.id) ?? 0]),
            dependencyCounts.get(table.id) ?? 0,
        ]);
        signatures.set(table.id, signature);
        if (previous.get(table.id) !== signature) {
            changedIds.push(table.id);
        }
    }
    return { changedIds, signatures };
};
