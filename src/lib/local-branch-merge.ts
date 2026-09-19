import type { Diagram } from './domain/diagram';

// Match schema-qualified names while retaining each branch's local layout.
export function mergeBranchDiagram(
    incoming: Diagram,
    previous?: Diagram
): Diagram {
    // Older snapshots contain full CHECK clauses rather than expressions.
    // Normalize on import too, so existing snapshots need no destructive reset.
    incoming = {
        ...incoming,
        tables: incoming.tables?.map((table) => ({
            ...table,
            checkConstraints: table.checkConstraints?.map((constraint) => ({
                ...constraint,
                expression: constraint.expression
                    .replace(/^\s*CHECK\s*(?=\()/i, '')
                    .replace(/\s+NO\s+INHERIT\s*$/i, ''),
            })),
        })),
    };
    if (!previous) return incoming;
    const tableIds = new Map<string, string>();
    const fieldIds = new Map<string, string>();
    let nextY =
        Math.max(
            0,
            ...(previous.tables ?? []).map(
                (t) => t.y + 100 + t.fields.length * 40
            )
        ) + 160;
    const tables = (incoming.tables ?? []).map((table) => {
        const old = previous.tables?.find(
            (t) => t.schema === table.schema && t.name === table.name
        );
        tableIds.set(table.id, old?.id ?? table.id);
        const fields = table.fields.map((field) => {
            const oldField = old?.fields.find((f) => f.name === field.name);
            fieldIds.set(field.id, oldField?.id ?? field.id);
            return {
                ...field,
                id: oldField?.id ?? field.id,
                createdAt: oldField?.createdAt ?? field.createdAt,
            };
        });
        const position = old
            ? {
                  x: old.x,
                  y: old.y,
                  color: old.color,
                  width: old.width,
                  parentAreaId: old.parentAreaId,
                  expanded: old.expanded,
                  order: old.order,
                  createdAt: old.createdAt,
              }
            : { x: 100, y: nextY };
        if (!old) nextY += 160 + fields.length * 40;
        return {
            ...table,
            ...position,
            id: old?.id ?? table.id,
            fields,
            indexes: table.indexes.map((index) => ({
                ...index,
                id:
                    old?.indexes.find((i) => i.name === index.name)?.id ??
                    index.id,
                fieldIds: index.fieldIds.map((id) => fieldIds.get(id) ?? id),
            })),
        };
    });
    return {
        ...incoming,
        createdAt: previous.createdAt,
        tables,
        areas: previous.areas ?? [],
        notes: previous.notes ?? [],
        relationships: incoming.relationships?.map((r) => ({
            ...r,
            sourceTableId: tableIds.get(r.sourceTableId) ?? r.sourceTableId,
            targetTableId: tableIds.get(r.targetTableId) ?? r.targetTableId,
            sourceFieldId: fieldIds.get(r.sourceFieldId) ?? r.sourceFieldId,
            targetFieldId: fieldIds.get(r.targetFieldId) ?? r.targetFieldId,
        })),
    };
}
