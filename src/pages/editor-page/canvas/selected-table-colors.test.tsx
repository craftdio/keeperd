import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { DBTable } from '@/lib/domain/db-table';
import { SelectedTableColors } from './selected-table-colors';

const mocks = vi.hoisted(() => ({
    tables: [] as DBTable[],
    readonly: false,
    updateTablesState: vi.fn(),
}));

vi.mock('@/hooks/use-chartdb', () => ({
    useChartDB: () => mocks,
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count: number }) =>
            ({
                'selected_table_colors.count': `Selected tables: ${options?.count}`,
                'selected_table_colors.mixed': 'Mixed colors',
                'color_picker.choose_color': 'Choose color',
                'color_picker.hex_color': 'HEX color',
                'color_picker.invalid_hex': 'Invalid HEX',
                'color_picker.apply': 'Apply',
                'color_picker.cancel': 'Cancel',
                'color_picker.mixed': 'Mixed colors',
                'color_picker.current': 'Current',
                'color_picker.preview': 'Preview',
                'color_picker.presets': 'Preset colors',
                'color_picker.hue': 'Hue',
                'color_picker.saturation_brightness':
                    'Saturation and brightness',
                'color_picker.saturation': 'saturation',
                'color_picker.brightness': 'brightness',
            })[key] ?? key,
    }),
}));

const table = (id: string, color: string, isView = false) =>
    ({ id, color, isView }) as DBTable;

afterEach(() => {
    mocks.tables = [];
    mocks.readonly = false;
    mocks.updateTablesState.mockReset();
});

it('shows the mixed state and updates only selected tables in one history action', async () => {
    const currentTables = [
        table('a', '#FF6363'),
        table('b', '#8EB7FF'),
        table('c', '#42E0C0'),
        table('view', '#B0B0B0', true),
    ];
    mocks.tables = currentTables;
    render(<SelectedTableColors selectedTableIds={['a', 'b', 'view']} />);

    expect(screen.getByText('Selected tables: 2')).toBeInTheDocument();
    expect(screen.getByText('Mixed colors')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Mixed colors'));
    fireEvent.change(await screen.findByLabelText('HEX color'), {
        target: { value: '#0fa958' },
    });
    expect(mocks.updateTablesState).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(mocks.updateTablesState).toHaveBeenCalledOnce();
    const [updateFn, options] = mocks.updateTablesState.mock.calls[0];
    expect(options).toEqual({ updateHistory: true });
    expect(updateFn(currentTables).map((item: DBTable) => item.color)).toEqual([
        '#0FA958',
        '#0FA958',
        '#42E0C0',
        '#B0B0B0',
    ]);
});

it('retains single-table behavior and skips unchanged colors', async () => {
    mocks.tables = [table('a', '#0FA958'), table('b', '#8EB7FF')];
    render(<SelectedTableColors selectedTableIds={['a']} />);
    expect(screen.getByText('Selected tables: 1')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('#0FA958'));
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }));
    expect(mocks.updateTablesState).not.toHaveBeenCalled();
});

it('does not offer bulk color changes in read-only mode', () => {
    mocks.tables = [table('a', '#FF6363'), table('b', '#8EB7FF')];
    mocks.readonly = true;
    const { container } = render(
        <SelectedTableColors selectedTableIds={['a', 'b']} />
    );
    expect(container).toBeEmptyDOMElement();
    expect(mocks.updateTablesState).not.toHaveBeenCalled();
});
