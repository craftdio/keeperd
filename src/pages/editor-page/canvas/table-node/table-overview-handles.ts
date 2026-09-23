import type { DBField } from '@/lib/domain/db-field';
import type { DBRelationship } from '@/lib/domain/db-relationship';

export const TABLE_FIELD_START_Y = 46;
export const TABLE_FIELD_HEIGHT = 32;

export const getOverviewTableHeight = (
    visibleFieldCount: number,
    hasFooter: boolean
): number =>
    TABLE_FIELD_START_Y +
    visibleFieldCount * TABLE_FIELD_HEIGHT +
    (hasFooter ? TABLE_FIELD_HEIGHT : 0) +
    2;

export interface OverviewHandleAnchor {
    fieldId: string;
    side: 'left' | 'right' | 'target';
    index?: number;
    top: number;
}

/** Keep existing edge handle IDs and field-row centers without mounting rows. */
export const getOverviewHandleAnchors = (
    tableId: string,
    visibleFields: DBField[],
    relationships: DBRelationship[],
    hiddenOnly = false
): OverviewHandleAnchor[] => {
    const fieldPositions = new Map(
        visibleFields.map((field, index) => [
            field.id,
            TABLE_FIELD_START_Y +
                index * TABLE_FIELD_HEIGHT +
                TABLE_FIELD_HEIGHT / 2,
        ])
    );
    const fallbackTop =
        TABLE_FIELD_START_Y + (visibleFields.length * TABLE_FIELD_HEIGHT) / 2;
    const sourceFields = new Set<string>();
    const targetCounts = new Map<string, number>();
    const anchors: OverviewHandleAnchor[] = [];

    for (const relationship of relationships) {
        if (relationship.sourceTableId === tableId) {
            sourceFields.add(relationship.sourceFieldId);
        }
        if (relationship.targetTableId === tableId) {
            const index = targetCounts.get(relationship.targetFieldId) ?? 0;
            anchors.push({
                fieldId: relationship.targetFieldId,
                side: 'target',
                index,
                top:
                    fieldPositions.get(relationship.targetFieldId) ??
                    fallbackTop,
            });
            targetCounts.set(relationship.targetFieldId, index + 1);
        }
    }

    for (const fieldId of sourceFields) {
        const top = fieldPositions.get(fieldId) ?? fallbackTop;
        anchors.push({ fieldId, side: 'left', top });
        anchors.push({ fieldId, side: 'right', top });
    }

    return hiddenOnly
        ? anchors.filter((anchor) => !fieldPositions.has(anchor.fieldId))
        : anchors;
};
