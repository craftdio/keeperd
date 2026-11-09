import { tableKey } from './layout-package.js';

export function createLayoutTablePicker(
    container,
    onSelectionChange,
    { onFocusTable } = {}
) {
    container.innerHTML = `
        <section class="erd-layout-selection" aria-label="공유할 테이블 모음">
            <div class="erd-layout-selection-heading"><strong>공유할 테이블 <span data-basket-count>0</span></strong><button type="button" data-clear>모두 비우기</button></div>
            <p data-basket-empty>캔버스나 목록에서 테이블을 눌러 선택·해제하세요.</p>
            <div class="erd-layout-selection-chips" role="list" aria-label="선택한 테이블"></div>
        </section>
        <label class="erd-layout-search">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>
            <input type="search" placeholder="테이블 또는 스키마 검색" aria-label="공유할 테이블 검색">
        </label>
        <div class="erd-layout-list-filters">
            <span data-current-count></span>
            <button type="button" data-selected-only aria-pressed="false">선택한 항목만 <span data-selection-count>0</span></button>
        </div>
        <div class="erd-layout-list-toolbar">
            <label><input type="checkbox" data-select-all aria-label="표시된 테이블 전체 선택"><span data-visible-count></span></label>
            <span class="erd-layout-list-hint">스키마별 묶음 선택</span>
        </div>
        <div class="erd-layout-table-list" role="group" aria-label="공유할 테이블"></div>
        <p class="erd-layout-pick-count" role="status" aria-live="polite"></p>`;
    const search = container.querySelector('input[type=search]');
    const currentCount = container.querySelector('[data-current-count]');
    const selectAll = container.querySelector('[data-select-all]');
    const clear = container.querySelector('[data-clear]');
    const selectedOnly = container.querySelector('[data-selected-only]');
    const selectionCount = container.querySelector('[data-selection-count]');
    const visibleCount = container.querySelector('[data-visible-count]');
    const count = container.querySelector('[role=status]');
    const list = container.querySelector('.erd-layout-table-list');
    const chips = container.querySelector('.erd-layout-selection-chips');
    const basketCount = container.querySelector('[data-basket-count]');
    const basketEmpty = container.querySelector('[data-basket-empty]');
    let chipSignature;
    const selected = new Set();
    const collapsed = new Set();
    let tables = [],
        busy = false,
        onlySelected = false;
    const label = (table) =>
        table.schema ? `${table.schema}.${table.name}` : table.name;
    const visible = () => {
        const query = search.value.trim().toLocaleLowerCase();
        return tables.filter(
            (table) =>
                (!onlySelected || selected.has(tableKey(table))) &&
                label(table).toLocaleLowerCase().includes(query)
        );
    };
    function renderChips() {
        basketCount.textContent = String(selected.size);
        basketEmpty.hidden = selected.size > 0;
        chips.hidden = selected.size === 0;
        const signature = JSON.stringify([...selected]) + busy;
        if (signature === chipSignature) return;
        chipSignature = signature;
        const byKey = new Map(tables.map((table) => [tableKey(table), table]));
        const names = new Map();
        for (const key of selected) {
            const name = byKey.get(key)?.name;
            names.set(name, (names.get(name) ?? 0) + 1);
        }
        chips.replaceChildren();
        for (const key of selected) {
            const table = byKey.get(key);
            if (!table) continue;
            const chip = document.createElement('div');
            chip.className = 'erd-layout-selection-chip';
            chip.setAttribute('role', 'listitem');
            chip.title = label(table);
            const name = document.createElement(
                onFocusTable ? 'button' : 'span'
            );
            name.className = 'erd-layout-chip-name';
            name.textContent =
                names.get(table.name) > 1 ? label(table) : table.name;
            if (onFocusTable) {
                name.type = 'button';
                name.disabled = busy;
                name.setAttribute('aria-label', `${label(table)} 위치 보기`);
                name.addEventListener('click', () => onFocusTable(key));
            }
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.dataset.removeTable = key;
            remove.textContent = '×';
            remove.disabled = busy;
            remove.setAttribute(
                'aria-label',
                `${label(table)} 공유 대상에서 제외`
            );
            remove.addEventListener('click', () => {
                const index = [...selected].indexOf(key);
                selected.delete(key);
                if (!selected.size) onlySelected = false;
                render();
                const remaining = [
                    ...chips.querySelectorAll('[data-remove-table]'),
                ];
                (
                    remaining[Math.min(index, remaining.length - 1)] ?? search
                ).focus();
            });
            chip.append(name, remove);
            chips.append(chip);
        }
    }
    function update() {
        const rows = visible();
        const checked = rows.filter((table) =>
            selected.has(tableKey(table))
        ).length;
        selectAll.checked = rows.length > 0 && checked === rows.length;
        selectAll.indeterminate = checked > 0 && checked < rows.length;
        selectAll.disabled = busy || !rows.length;
        clear.disabled = busy || !selected.size;
        selectedOnly.disabled = busy || !selected.size;
        selectedOnly.setAttribute('aria-pressed', String(onlySelected));
        selectionCount.textContent = String(selected.size);
        visibleCount.textContent =
            busy && !tables.length
                ? '목록을 불러오는 중…'
                : `테이블 ${rows.length}개`;
        count.textContent = selected.size
            ? `${selected.size}개 선택됨 · 캔버스에서 다시 누르면 공유 대상에서 제외됩니다.`
            : '공유할 테이블은 보라색 체크로 표시됩니다.';
        renderChips();
        for (const input of list.querySelectorAll('[data-schema]')) {
            const members = rows.filter(
                (table) => (table.schema ?? '') === input.dataset.schema
            );
            const n = members.filter((table) =>
                selected.has(tableKey(table))
            ).length;
            input.checked = n > 0 && n === members.length;
            input.indeterminate = n > 0 && n < members.length;
        }
        onSelectionChange(selected.size, [...selected]);
    }
    function render(focusKey) {
        list.replaceChildren();
        const rows = visible();
        if (!rows.length) {
            const empty = document.createElement('div');
            empty.className = 'erd-layout-empty-list';
            empty.textContent = search.value
                ? '검색 결과가 없습니다. 다른 이름으로 검색해 보세요.'
                : '이 목록에 표시할 테이블이 없습니다.';
            list.append(empty);
        }
        const groups = new Map();
        for (const table of rows) {
            const schema = table.schema ?? '';
            if (!groups.has(schema)) groups.set(schema, []);
            groups.get(schema).push(table);
        }
        for (const [schema, members] of groups) {
            const group = document.createElement('div');
            group.className = 'erd-layout-schema';
            const header = document.createElement('div');
            header.className = 'erd-layout-schema-heading';
            const groupCheck = document.createElement('input');
            groupCheck.type = 'checkbox';
            groupCheck.dataset.schema = schema;
            groupCheck.disabled = busy;
            groupCheck.setAttribute(
                'aria-label',
                `${schema || '기본'} 스키마 테이블 전체 선택`
            );
            const schemaName = document.createElement('span');
            schemaName.textContent = schema || '기본 스키마';
            const size = document.createElement('small');
            size.textContent = String(members.length);
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.dataset.toggleSchema = schema;
            toggle.disabled = busy;
            const expanded = !collapsed.has(schema);
            toggle.setAttribute('aria-expanded', String(expanded));
            toggle.setAttribute(
                'aria-label',
                `${schema || '기본'} 스키마 ${expanded ? '접기' : '펼치기'}`
            );
            const chevron = document.createElement('span');
            chevron.textContent = '›';
            chevron.setAttribute('aria-hidden', 'true');
            toggle.append(chevron, schemaName, size);
            toggle.addEventListener('click', () => {
                if (expanded) collapsed.add(schema);
                else collapsed.delete(schema);
                render();
                [...list.querySelectorAll('[data-toggle-schema]')]
                    .find((button) => button.dataset.toggleSchema === schema)
                    ?.focus();
            });
            header.append(groupCheck, toggle);
            const rowsContainer = document.createElement('div');
            rowsContainer.hidden = !expanded;

            groupCheck.addEventListener('change', () => {
                for (const table of members) {
                    if (groupCheck.checked) selected.add(tableKey(table));
                    else selected.delete(tableKey(table));
                }
                if (!selected.size) onlySelected = false;
                render();
                [...list.querySelectorAll('[data-schema]')]
                    .find((input) => input.dataset.schema === schema)
                    ?.focus();
            });
            group.append(header);
            for (const table of members) {
                const row = document.createElement('label');
                row.className = 'erd-layout-table-row';
                row.title = label(table);
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.dataset.table = '';
                input.value = tableKey(table);
                input.setAttribute('aria-label', label(table));
                input.checked = selected.has(input.value);
                input.disabled = busy;
                const name = document.createElement('span');
                name.textContent = table.name;
                input.addEventListener('change', () => {
                    if (input.checked) selected.add(input.value);
                    else selected.delete(input.value);
                    if (onlySelected) {
                        if (!selected.size) onlySelected = false;
                        render(input.value);
                    } else update();
                });
                row.append(input, name);
                rowsContainer.append(row);
            }
            group.append(rowsContainer);
            list.append(group);
        }
        update();
        if (focusKey)
            [...list.querySelectorAll('[data-table]')]
                .find((input) => input.value === focusKey)
                ?.focus();
    }
    search.addEventListener('input', () => {
        if (search.value.trim()) collapsed.clear();
        render();
    });
    selectAll.addEventListener('change', () => {
        for (const table of visible()) {
            if (selectAll.checked) selected.add(tableKey(table));
            else selected.delete(tableKey(table));
        }
        if (!selected.size) onlySelected = false;
        render();
    });
    clear.addEventListener('click', () => {
        selected.clear();
        onlySelected = false;
        render();
    });
    selectedOnly.addEventListener('click', () => {
        onlySelected = !onlySelected;
        search.value = '';
        collapsed.clear();
        render();
    });
    return {
        load(
            values,
            { currentTableKeys = null, preserveSelection = false } = {}
        ) {
            const currentKeys =
                currentTableKeys === null ? null : new Set(currentTableKeys);
            tables = values
                .filter(
                    (table) => !currentKeys || currentKeys.has(tableKey(table))
                )
                .sort(
                    (a, b) =>
                        (a.schema ?? '').localeCompare(b.schema ?? '') ||
                        a.name.localeCompare(b.name, undefined, {
                            numeric: true,
                        })
                );
            const known = new Set(tables.map(tableKey));
            for (const key of selected)
                if (!preserveSelection || !known.has(key)) selected.delete(key);
            onlySelected = false;
            search.value = '';
            currentCount.textContent = `현재 ERD · ${tables.length}개`;
            if (!preserveSelection) collapsed.clear();
            render();
        },
        selectedKeys: () => [...selected],
        setSelectedKeys(keys) {
            const known = new Set(tables.map(tableKey));
            selected.clear();
            for (const key of keys) if (known.has(key)) selected.add(key);
            if (!selected.size) onlySelected = false;
            render();
        },
        setBusy(value) {
            busy = value;
            container.setAttribute('aria-busy', String(value));
            if (busy && !tables.length) {
                list.textContent = '테이블 목록을 불러오는 중…';
                list.classList.add('loading');
            } else list.classList.remove('loading');
            for (const control of container.querySelectorAll(
                'input,button,select'
            ))
                control.disabled = value;
            update();
        },
    };
}
