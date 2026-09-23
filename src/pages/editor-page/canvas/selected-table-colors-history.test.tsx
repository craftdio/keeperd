import React, { useContext } from 'react';
import { act, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ChartDBProvider } from '@/context/chartdb-context/chartdb-provider';
import {
    chartDBContext,
    type ChartDBContext,
} from '@/context/chartdb-context/chartdb-context';
import { HistoryProvider } from '@/context/history-context/history-provider';
import {
    historyContext,
    type HistoryContext,
} from '@/context/history-context/history-context';
import { RedoUndoStackProvider } from '@/context/history-context/redo-undo-stack-provider';
import {
    redoUndoStackContext,
    type RedoUndoStackContext,
} from '@/context/history-context/redo-undo-stack-context';
import {
    storageContext,
    storageInitialValue,
} from '@/context/storage-context/storage-context';
import type { DBTable } from '@/lib/domain/db-table';
import type { Diagram } from '@/lib/domain/diagram';

vi.mock('@/context/diff-context/use-diff', () => ({
    useDiff: () => ({
        hasDiff: false,
        events: { useSubscription: () => undefined },
    }),
}));

const table = (id: string, color: string) =>
    ({
        id,
        name: id,
        color,
        x: 0,
        y: 0,
        isView: false,
        createdAt: Date.now(),
        fields: [],
        indexes: [],
    }) as DBTable;

it('saves a bulk color change as one undoable and redoable action', async () => {
    const putTable = vi.fn(async () => undefined);
    const updateDiagram = vi.fn(async () => undefined);
    const tables = [
        table('a', '#FF6363'),
        table('b', '#8EB7FF'),
        table('c', '#42E0C0'),
    ];
    const diagram = {
        id: 'diagram',
        name: 'Diagram',
        tables,
        relationships: [],
        dependencies: [],
        areas: [],
        notes: [],
    } as unknown as Diagram;
    let chart: ChartDBContext;
    let history: HistoryContext;
    let stack: RedoUndoStackContext;
    const Probe = () => {
        chart = useContext(chartDBContext);
        history = useContext(historyContext);
        stack = useContext(redoUndoStackContext);
        return null;
    };

    render(
        <storageContext.Provider
            value={{ ...storageInitialValue, putTable, updateDiagram }}
        >
            <RedoUndoStackProvider>
                <ChartDBProvider diagram={diagram}>
                    <HistoryProvider>
                        <Probe />
                    </HistoryProvider>
                </ChartDBProvider>
            </RedoUndoStackProvider>
        </storageContext.Provider>
    );

    await act(async () => {
        await chart!.updateTablesState(
            (currentTables) =>
                currentTables.map((item) =>
                    item.id === 'a' || item.id === 'b'
                        ? { ...item, color: '#0FA958' }
                        : item
                ),
            { updateHistory: true }
        );
    });
    expect(chart!.tables.map((item) => item.color)).toEqual([
        '#0FA958',
        '#0FA958',
        '#42E0C0',
    ]);
    expect(chart!.tables[2]).toBe(tables[2]);
    expect(putTable).toHaveBeenCalledTimes(2);
    expect(stack!.undoStack).toHaveLength(1);
    expect(stack!.undoStack[0].action).toBe('updateTablesState');
    expect(putTable).toHaveBeenCalledWith({
        diagramId: '',
        table: expect.objectContaining({ id: 'a', color: '#0FA958' }),
    });

    await act(async () => {
        await history!.undo();
    });
    expect(chart!.tables.map((item) => item.color)).toEqual([
        '#FF6363',
        '#8EB7FF',
        '#42E0C0',
    ]);
    expect(stack!.redoStack).toHaveLength(1);

    await act(async () => {
        await history!.redo();
    });
    expect(chart!.tables.map((item) => item.color)).toEqual([
        '#0FA958',
        '#0FA958',
        '#42E0C0',
    ]);
});
