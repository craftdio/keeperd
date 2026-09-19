// Native selects retain the selection contract; this view supports avatars and icons.
/* Lucide icon geometry, ISC License.
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022
 * as part of Feather (MIT). All other copyright (c) for Lucide are held
 * by Lucide Contributors 2022.
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.8',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
    }))
        svg.setAttribute(key, value);
    const nodes =
        name === 'lock'
            ? [
                  [
                      'rect',
                      { x: 3, y: 11, width: 18, height: 11, rx: 2, ry: 2 },
                  ],
                  ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }],
              ]
            : [['path', { d: 'm6 9 6 6 6-6' }]];
    for (const [tag, attrs] of nodes) {
        const node = document.createElementNS(svg.namespaceURI, tag);
        for (const [key, value] of Object.entries(attrs))
            node.setAttribute(key, value);
        svg.append(node);
    }
    return svg;
}

export function localCloneChoices(repositories, preferredId) {
    const groups = new Map();
    for (const repo of repositories) {
        const key = repo.commonDirectory ?? repo.path ?? repo.id;
        const entries = groups.get(key) ?? [];
        entries.push(repo);
        groups.set(key, entries);
    }
    return [...groups.values()].map(
        (entries) =>
            entries.find((repo) => repo.id === preferredId) ??
            entries.find((repo) => !repo.linkedWorktree) ??
            entries[0]
    );
}

export function createPicker(select, labelId, describe) {
    const root = document.createElement('div');
    root.className = `picker ${select.id}-picker`;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.setAttribute('role', 'combobox');
    trigger.id = `${select.id}-trigger`;
    trigger.className = 'picker-trigger';
    trigger.setAttribute('aria-labelledby', labelId);
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const list = document.createElement('div');
    list.className = 'picker-list';
    list.id = `${select.id}-list`;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-labelledby', labelId);
    list.hidden = true;
    trigger.setAttribute('aria-controls', list.id);
    trigger.setAttribute('aria-labelledby', `${labelId} ${select.id}-value`);
    list.onmousedown = (event) => event.preventDefault();
    select.hidden = true;
    select.setAttribute('aria-hidden', 'true');
    select.tabIndex = -1;
    root.append(trigger, list);
    select.after(root);
    let active = 0;
    let options = [];

    function content(option) {
        const data = describe(option.value) ?? {};
        const row = document.createElement('span');
        row.className = 'picker-row';
        if (data.title) row.title = data.title;
        if (data.avatarUrl) {
            const avatar = document.createElement('img');
            avatar.className = 'owner-avatar';
            avatar.src = data.avatarUrl;
            avatar.alt = '';
            avatar.referrerPolicy = 'no-referrer';
            const fallback = document.createElement('span');
            fallback.className = 'owner-avatar owner-avatar-fallback';
            fallback.textContent = option.textContent.slice(0, 1).toUpperCase();
            avatar.onerror = () => {
                avatar.replaceWith(fallback);
            };
            row.append(avatar);
        }
        const text = document.createElement('span');
        text.className = 'picker-text';
        text.textContent = option.textContent;
        if (data.detail) {
            const detail = document.createElement('small');
            detail.textContent = data.detail;
            text.append(detail);
        }
        row.append(text);
        if (data.private) {
            const lock = document.createElement('span');
            lock.className = 'repo-lock';
            lock.title = '비공개 저장소';
            const accessible = document.createElement('span');
            accessible.className = 'sr-only';
            accessible.textContent = '비공개 저장소';
            lock.append(icon('lock'), accessible);
            row.append(lock);
        }
        return row;
    }
    function close() {
        list.hidden = true;
        root.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.removeAttribute('aria-activedescendant');
    }
    function highlight() {
        [...list.querySelectorAll('[role="option"]')].forEach((item, i) => {
            item.classList.toggle('active', i === active);
            if (i === active) {
                trigger.setAttribute('aria-activedescendant', item.id);
                item.scrollIntoView?.({ block: 'nearest' });
            }
        });
    }
    function open() {
        if (trigger.disabled || !options.length) return;
        list.hidden = false;
        root.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        active = Math.max(
            0,
            options.findIndex((o) => o.value === select.value)
        );
        highlight();
    }
    function choose(index) {
        select.value = options[index].value;
        close();
        select.dispatchEvent(new Event('change', { bubbles: true }));
        trigger.focus();
    }
    function refresh({ open: reopen = false, emptyLabel } = {}) {
        close();
        options = [...select.options].filter((o) => o.value && !o.disabled);
        trigger.disabled = select.disabled || !options.length;
        const selected = [...select.options].find(
            (o) => o.value === select.value
        );
        const selectedData = describe(selected?.value) ?? {};
        trigger.title = selectedData.title ?? '';
        const value = content(
            selected ?? {
                value: '',
                textContent: emptyLabel ?? '선택할 항목이 없습니다',
            }
        );
        value.id = `${select.id}-value`;
        trigger.replaceChildren(value, icon('chevron'));
        list.replaceChildren(
            ...options.map((option, index) => {
                const data = describe(option.value) ?? {};
                const item = document.createElement('div');
                item.id = `${select.id}-option-${index}`;
                item.setAttribute('role', 'option');
                item.setAttribute(
                    'aria-selected',
                    String(option.value === select.value)
                );
                item.title = data.title ?? option.textContent;
                item.append(content(option));
                item.onclick = () => choose(index);
                return item;
            })
        );
        if (reopen) open();
    }
    trigger.onclick = () => (list.hidden ? open() : close());
    trigger.onkeydown = (event) => {
        if (
            [
                'ArrowDown',
                'ArrowUp',
                'Home',
                'End',
                'Enter',
                ' ',
                'Escape',
            ].includes(event.key)
        ) {
            event.preventDefault();
            if (event.key === 'Escape') return close();
            if (list.hidden) return open();
            if (['Enter', ' '].includes(event.key)) return choose(active);
            if (event.key === 'Home') active = 0;
            else if (event.key === 'End') active = options.length - 1;
            else
                active =
                    (active +
                        (event.key === 'ArrowDown' ? 1 : -1) +
                        options.length) %
                    options.length;
            highlight();
        }
    };
    root.addEventListener('focusout', (event) => {
        if (!root.contains(event.relatedTarget)) close();
    });
    document.addEventListener('pointerdown', (event) => {
        if (!root.contains(event.target)) close();
    });
    refresh();
    return { refresh, element: root };
}
