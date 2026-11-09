import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLayoutTablePicker } from './layout-table-picker.js';
import { tableKey } from './layout-package.js';

let container;
beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
});
afterEach(() => container.remove());

it('filters by schema or table, keeps selections across searches and selects only visible rows', () => {
    const changed = vi.fn();
    const picker = createLayoutTablePicker(container, changed);
    const tables = [
        { schema: 'public', name: 'users' },
        { schema: 'audit', name: 'users' },
        { schema: 'public', name: 'orders' },
    ];
    picker.load(tables);
    expect(changed).toHaveBeenLastCalledWith(0, []);
    const search = container.querySelector('input[type=search]');
    const selectAll = container.querySelector('[data-select-all]');
    const filter = (query) => {
        search.value = query;
        search.dispatchEvent(new Event('input'));
    };
    filter('AUDIT');
    expect(container.querySelectorAll('[data-table]')).toHaveLength(1);
    selectAll.click();
    expect(picker.selectedKeys()).toEqual([tableKey(tables[1])]);
    filter('orders');
    container.querySelector('[data-table]').click();
    expect(picker.selectedKeys()).toEqual([
        tableKey(tables[1]),
        tableKey(tables[2]),
    ]);
    filter('users');
    expect(
        [...container.querySelectorAll('[data-table]')].filter((c) => c.checked)
    ).toHaveLength(1);
    selectAll.click();
    expect(picker.selectedKeys()).toHaveLength(3);
    expect(container.querySelector('[role=status]').textContent).toContain(
        '3개 선택됨'
    );
    container.querySelector('[data-clear]').click();
    expect(picker.selectedKeys()).toEqual([]);
    filter('missing');
    expect(selectAll.disabled).toBe(true);
    expect(container.textContent).toContain('검색 결과가 없습니다.');
});

it('renders untrusted names as text, disables busy controls and resets selections on reload', () => {
    const picker = createLayoutTablePicker(container, vi.fn());
    picker.load([{ schema: 'public', name: '<img src=x onerror=alert(1)>' }]);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    container.querySelector('[data-select-all]').click();
    picker.setBusy(true);
    expect(
        [...container.querySelectorAll('input,button')].every(
            (el) => el.disabled
        )
    ).toBe(true);
    picker.setBusy(false);
    picker.load([{ schema: 'new', name: 'table' }]);
    expect(picker.selectedKeys()).toEqual([]);
    expect(container.querySelector('input[type=search]').value).toBe('');
});

it('restricts all selection paths to the current ERD and groups by schema', () => {
    const picker = createLayoutTablePicker(container, vi.fn());
    const tables = [
        { schema: 'public', name: 'users' },
        { schema: 'public', name: 'orders' },
        { schema: 'audit', name: 'users' },
    ];
    picker.load(tables, { currentTableKeys: tables.slice(0, 2).map(tableKey) });
    expect(container.querySelector('select')).toBeNull();
    expect(container.querySelector('[data-current-count]').textContent).toBe(
        '현재 ERD · 2개'
    );
    expect(container.querySelectorAll('[data-table]')).toHaveLength(2);
    container.querySelector('[data-schema="public"]').click();
    container.querySelector('[data-selected-only]').click();
    expect(picker.selectedKeys()).toEqual(
        expect.arrayContaining(tables.slice(0, 2).map(tableKey))
    );
    expect(container.querySelectorAll('[data-table]')).toHaveLength(2);
    // Reopening after switching to an ERD with fewer tables removes stale picks.
    picker.load(tables, {
        currentTableKeys: [tableKey(tables[0])],
        preserveSelection: true,
    });
    expect(picker.selectedKeys()).toEqual([tableKey(tables[0])]);
});

it('collapses schemas independently without changing selection and expands search matches', () => {
    const picker = createLayoutTablePicker(container, vi.fn());
    picker.load([
        { schema: 'public', name: 'users' },
        { schema: 'audit', name: 'logs' },
    ]);
    const toggle = () =>
        container.querySelector('[data-toggle-schema="public"]');
    toggle().click();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(
        container
            .querySelector('[data-schema="public"]')
            .closest('.erd-layout-schema').lastElementChild.hidden
    ).toBe(true);
    expect(
        container
            .querySelector('[data-toggle-schema="audit"]')
            .getAttribute('aria-expanded')
    ).toBe('true');
    expect(picker.selectedKeys()).toEqual([]);
    container.querySelector('[data-schema="public"]').click();
    expect(picker.selectedKeys()).toEqual([
        tableKey({ schema: 'public', name: 'users' }),
    ]);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    const search = container.querySelector('input[type=search]');
    search.value = 'user';
    search.dispatchEvent(new Event('input'));
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[data-table]').checked).toBe(true);
    toggle().click();
    toggle().click();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
});

it('retains valid choices on reopen and removes choices that no longer exist', () => {
    const picker = createLayoutTablePicker(container, vi.fn());
    const users = { schema: 'public', name: 'users' };
    const orders = { schema: 'public', name: 'orders' };
    picker.load([users, orders]);
    container.querySelector('[data-select-all]').click();
    picker.load([users], { preserveSelection: true });
    expect(picker.selectedKeys()).toEqual([tableKey(users)]);
    picker.load([users]);
    expect(picker.selectedKeys()).toEqual([]);
});

it('returns to the full list when the last selected schema is cleared in selected-only mode', () => {
    const changed = vi.fn();
    const picker = createLayoutTablePicker(container, changed);
    const users = { schema: 'public', name: 'users' };
    const events = { schema: 'audit', name: 'events' };
    picker.load([users, events]);
    container.querySelector('[data-schema="public"]').click();
    container.querySelector('[data-selected-only]').click();
    expect(container.querySelectorAll('[data-table]')).toHaveLength(1);

    container.querySelector('[data-schema="public"]').click();

    expect(picker.selectedKeys()).toEqual([]);
    expect(changed).toHaveBeenLastCalledWith(0, []);
    expect(
        container
            .querySelector('[data-selected-only]')
            .getAttribute('aria-pressed')
    ).toBe('false');
    expect(container.querySelectorAll('[data-table]')).toHaveLength(2);
    expect(document.activeElement).toBe(
        container.querySelector('[data-schema="public"]')
    );
    container.querySelector('input[aria-label="audit.events"]').click();
    expect(picker.selectedKeys()).toEqual([tableKey(events)]);
});

it('accepts canvas selections by schema/name and rejects keys outside the current ERD', () => {
    const changed = vi.fn();
    const picker = createLayoutTablePicker(container, changed);
    const current = { schema: 'public', name: 'users' };
    picker.load([current, { schema: 'audit', name: 'users' }], {
        currentTableKeys: [tableKey(current)],
    });
    picker.setSelectedKeys([
        tableKey(current),
        tableKey({ schema: 'audit', name: 'users' }),
    ]);
    expect(picker.selectedKeys()).toEqual([tableKey(current)]);
    expect(changed).toHaveBeenLastCalledWith(1, [tableKey(current)]);
    expect(container.querySelector('[data-table]').checked).toBe(true);
    picker.setSelectedKeys([]);
    expect(container.querySelector('[data-table]').checked).toBe(false);
});

it('keeps chips in selection order across search and collapsed groups, disambiguates duplicate names and removes one chip', () => {
    const changed = vi.fn();
    const focus = vi.fn();
    const picker = createLayoutTablePicker(container, changed, {
        onFocusTable: focus,
    });
    const a = { schema: 'public', name: 'users' },
        b = { schema: 'audit', name: 'users' };
    picker.load([a, b]);
    container.querySelector('input[aria-label="public.users"]').click();
    container.querySelector('input[aria-label="audit.users"]').click();
    const chips = () => [...container.querySelectorAll('[role=listitem]')];
    expect(
        chips().map(
            (chip) => chip.querySelector('.erd-layout-chip-name').textContent
        )
    ).toEqual(['public.users', 'audit.users']);
    container.querySelector('[data-toggle-schema="public"]').click();
    const search = container.querySelector('input[type=search]');
    search.value = 'missing';
    search.dispatchEvent(new Event('input'));
    expect(chips()).toHaveLength(2);
    chips()[0].querySelector('.erd-layout-chip-name').click();
    expect(focus).toHaveBeenCalledWith(tableKey(a));
    chips()[0].querySelector('[data-remove-table]').click();
    expect(picker.selectedKeys()).toEqual([tableKey(b)]);
    expect(chips()[0].querySelector('.erd-layout-chip-name').textContent).toBe(
        'users'
    );
    expect(document.activeElement).toBe(
        chips()[0].querySelector('[data-remove-table]')
    );
    expect(changed).toHaveBeenLastCalledWith(1, [tableKey(b)]);
    chips()[0].querySelector('[data-remove-table]').click();
    expect(container.querySelector('[data-basket-empty]').hidden).toBe(false);
    expect(document.activeElement).toBe(search);
    expect(picker.selectedKeys()).toEqual([]);
});

it('renders hostile names safely in chips and keeps all selected names reviewable', () => {
    const picker = createLayoutTablePicker(container, vi.fn());
    const tables = Array.from({ length: 143 }, (_, i) => ({
        schema: 'public',
        name: `table_${i}`,
    }));
    tables[0].name = '<img src=x onerror=alert(1)>';
    picker.load(tables);
    container.querySelector('[data-select-all]').click();
    expect(container.querySelectorAll('[role=listitem]')).toHaveLength(143);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-basket-count]').textContent).toBe(
        '143'
    );
    picker.setBusy(true);
    expect(
        [...container.querySelectorAll('[data-remove-table]')].every(
            (button) => button.disabled
        )
    ).toBe(true);
});
