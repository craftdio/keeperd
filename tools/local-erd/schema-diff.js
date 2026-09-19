export const canonicalRepository = (url) =>
    (url ?? '').toLowerCase().replace(/\.git$/, '');

const tableKey = (table) => `${table.schema ?? ''}\u0000${table.name}`;
const fieldSignature = (field) =>
    JSON.stringify({
        type: field.type?.name ?? field.type,
        primaryKey: Boolean(field.primaryKey),
        unique: Boolean(field.unique),
        nullable: Boolean(field.nullable),
        increment: Boolean(field.increment),
        default: field.default ?? null,
    });

export function findSchemaAdditions(baseDiagram, currentDiagram) {
    const baseTables = new Map(
        (baseDiagram?.tables ?? []).map((table) => [tableKey(table), table])
    );
    const newTableIds = [];
    const newFieldIds = [];
    const changedTableIds = [];
    const changedFieldIds = [];
    let removedTables = 0;
    let removedFields = 0;
    for (const table of currentDiagram.tables ?? []) {
        const baseTable = baseTables.get(tableKey(table));
        if (!baseTable) {
            newTableIds.push(table.id);
            continue;
        }
        const baseFields = new Map(
            baseTable.fields.map((field) => [field.name, field])
        );
        const currentFieldNames = new Set();
        let tableChanged = false;
        for (const field of table.fields) {
            currentFieldNames.add(field.name);
            const baseField = baseFields.get(field.name);
            if (!baseField) {
                newFieldIds.push(field.id);
                tableChanged = true;
            } else if (fieldSignature(baseField) !== fieldSignature(field)) {
                changedFieldIds.push(field.id);
                tableChanged = true;
            }
        }
        const tableRemovedFields = [...baseFields.keys()].filter(
            (name) => !currentFieldNames.has(name)
        ).length;
        removedFields += tableRemovedFields;
        if (tableRemovedFields || tableChanged) changedTableIds.push(table.id);
    }
    const currentTableKeys = new Set(
        (currentDiagram.tables ?? []).map((table) => tableKey(table))
    );
    removedTables = [...baseTables.keys()].filter(
        (key) => !currentTableKeys.has(key)
    ).length;
    const tableCount = currentDiagram.tables?.length ?? 0;
    return {
        newTableIds,
        newFieldIds,
        changedTableIds,
        changedFieldIds,
        removedTables,
        removedFields,
        allTablesNew: tableCount > 0 && newTableIds.length === tableCount,
    };
}

const fieldKey = (table, field) => `${tableKey(table)}\u0000${field.name}`;

function relationshipKeys(diagram) {
    const tableById = new Map();
    const fieldById = new Map();
    for (const table of diagram?.tables ?? []) {
        const key = tableKey(table);
        tableById.set(table.id, key);
        for (const field of table.fields ?? [])
            fieldById.set(field.id, `${key}\u0000${field.name}`);
    }
    return new Set(
        (diagram?.relationships ?? []).map((relationship) =>
            [
                tableById.get(relationship.sourceTableId) ??
                    relationship.sourceTableId,
                fieldById.get(relationship.sourceFieldId) ??
                    relationship.sourceFieldId,
                tableById.get(relationship.targetTableId) ??
                    relationship.targetTableId,
                fieldById.get(relationship.targetFieldId) ??
                    relationship.targetFieldId,
            ].join('\u0000')
        )
    );
}

const differenceCount = (left, right) =>
    [...left].filter((key) => !right.has(key)).length;

export function summarizeSchemaDifference(baseDiagram, currentDiagram) {
    const baseTables = new Map(
        (baseDiagram?.tables ?? []).map((table) => [tableKey(table), table])
    );
    const currentTables = new Map(
        (currentDiagram?.tables ?? []).map((table) => [tableKey(table), table])
    );
    const baseFields = new Map();
    const currentFields = new Map();
    for (const table of baseDiagram?.tables ?? [])
        for (const field of table.fields ?? [])
            baseFields.set(fieldKey(table, field), fieldSignature(field));
    for (const table of currentDiagram?.tables ?? [])
        for (const field of table.fields ?? [])
            currentFields.set(fieldKey(table, field), fieldSignature(field));
    const baseRelationships = relationshipKeys(baseDiagram);
    const currentRelationships = relationshipKeys(currentDiagram);
    return {
        tables: {
            added: differenceCount(currentTables.keys(), baseTables),
            removed: differenceCount(baseTables.keys(), currentTables),
        },
        fields: {
            added: differenceCount(currentFields.keys(), baseFields),
            removed: differenceCount(baseFields.keys(), currentFields),
            changed: [...currentFields].filter(
                ([key, signature]) =>
                    baseFields.has(key) && baseFields.get(key) !== signature
            ).length,
        },
        relationships: {
            added: differenceCount(currentRelationships, baseRelationships),
            removed: differenceCount(baseRelationships, currentRelationships),
        },
    };
}
