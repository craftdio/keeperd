import React from 'react';
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReactFlowProvider, useStoreApi } from '@xyflow/react';
import { TablesSection } from './tables-section/tables-section';
import { AreasTab } from './visuals-section/areas-tab/areas-tab';
import { NotesTab } from './visuals-section/notes-tab/notes-tab';

const spies = vi.hoisted(() => ({
    listRender: vi.fn(),
    createTable: vi.fn(async () => ({ id: 'created' })),
    createArea: vi.fn(async () => ({ id: 'created' })),
    createNote: vi.fn(async () => ({ id: 'created' })),
}));
vi.mock('@/hooks/use-chartdb', () => ({
    useChartDB: () => ({
        tables: [{ id: 'one', name: 'one', schema: 'public' }],
        areas: [{ id: 'area', name: 'area' }],
        notes: [{ id: 'note', content: 'note' }],
        databaseType: 'postgresql',
        readonly: false,
        createTable: spies.createTable,
        createArea: spies.createArea,
        createNote: spies.createNote,
    }),
}));
vi.mock('@/hooks/use-layout', () => ({
    useLayout: () => ({
        openTableFromSidebar: vi.fn(),
        openAreaFromSidebar: vi.fn(),
        openNoteFromSidebar: vi.fn(),
    }),
}));
vi.mock('@/hooks/use-dialog', () => ({
    useDialog: () => ({ openTableSchemaDialog: vi.fn() }),
}));
vi.mock('@/hooks/use-local-config', () => ({
    useLocalConfig: () => ({ showDBViews: false }),
}));
vi.mock('@/context/diagram-filter-context/use-diagram-filter', () => ({
    useDiagramFilter: () => ({
        filter: undefined,
        schemasDisplayed: [],
        hasActiveFilter: false,
        resetFilter: vi.fn(),
    }),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('./tables-section/table-list/table-list', () => ({
    TableList: () => {
        spies.listRender();
        return <div>tables</div>;
    },
}));
vi.mock('./visuals-section/areas-tab/areas-list/areas-list', () => ({
    AreaList: () => {
        spies.listRender();
        return <div>areas</div>;
    },
}));
vi.mock('./visuals-section/notes-tab/notes-list/notes-list', () => ({
    NotesList: () => {
        spies.listRender();
        return <div>notes</div>;
    },
}));

let store: ReturnType<typeof useStoreApi>;
function Driver() {
    store = useStoreApi();
    return null;
}
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it.each([
    {
        Component: TablesSection,
        create: spies.createTable,
        button: 'side_panel.tables_section.add_table',
    },
    {
        Component: AreasTab,
        create: spies.createArea,
        button: 'side_panel.areas_section.add_area',
    },
    {
        Component: NotesTab,
        create: spies.createNote,
        button: 'side_panel.notes_section.add_note',
    },
])(
    '$button reads the latest viewport on creation without repainting its list on pan',
    async ({ Component, create, button }) => {
        render(
            <ReactFlowProvider>
                <Driver />
                <Component />
            </ReactFlowProvider>
        );
        const before = spies.listRender.mock.calls.length;
        for (let i = 0; i < 16; i++)
            act(() => store.setState({ transform: [100 + i, -200 + i, 2] }));
        expect(spies.listRender).toHaveBeenCalledTimes(before);
        fireEvent.click(screen.getByRole('button', { name: button }));
        await waitFor(() =>
            expect(create).toHaveBeenCalledWith(
                expect.objectContaining({ x: -17.5, y: 132.5 })
            )
        );
    }
);
