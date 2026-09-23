import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ColorPicker } from '@/components/color-picker/color-picker';
import { useChartDB } from '@/hooks/use-chartdb';
import { normalizeHexColor } from '@/lib/color-hex';

export interface SelectedTableColorsProps {
    selectedTableIds: string[];
}

export const SelectedTableColors: React.FC<SelectedTableColorsProps> = ({
    selectedTableIds,
}) => {
    const { t } = useTranslation();
    const { tables, updateTablesState, readonly } = useChartDB();
    const selectedTables = useMemo(() => {
        const selected = new Set(selectedTableIds);
        return tables.filter(
            (table) => selected.has(table.id) && !table.isView
        );
    }, [tables, selectedTableIds]);
    const firstColor = selectedTables[0]?.color;
    const normalizedFirstColor = firstColor
        ? (normalizeHexColor(firstColor) ?? firstColor)
        : '';
    const mixed = selectedTables.some(
        (table) =>
            (normalizeHexColor(table.color) ?? table.color) !==
            normalizedFirstColor
    );

    const changeColor = useCallback(
        (color: string) => {
            if (readonly || selectedTables.length === 0) return;
            const normalized = normalizeHexColor(color);
            if (!normalized) return;
            const selected = new Set(selectedTables.map((table) => table.id));
            if (
                selectedTables.every(
                    (table) =>
                        (normalizeHexColor(table.color) ?? table.color) ===
                        normalized
                )
            ) {
                return;
            }
            void updateTablesState(
                (currentTables) =>
                    currentTables.map((table) =>
                        selected.has(table.id)
                            ? { ...table, color: normalized }
                            : table
                    ),
                { updateHistory: true }
            );
        },
        [readonly, selectedTables, updateTablesState]
    );

    if (readonly || selectedTables.length === 0) return null;

    return (
        <div className="nodrag flex items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm shadow-md">
            <span>
                {t('selected_table_colors.count', {
                    count: selectedTables.length,
                })}
            </span>
            <span className="text-muted-foreground">
                {mixed
                    ? t('selected_table_colors.mixed')
                    : normalizedFirstColor}
            </span>
            <ColorPicker
                color={normalizedFirstColor}
                mixed={mixed}
                onChange={changeColor}
                disabled={readonly}
            />
        </div>
    );
};
