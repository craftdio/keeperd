import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import html from './library.html?raw';
const storage = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn() }));
vi.mock('./browser-store.js', () => ({
    browserDiagrams: storage.list,
    deleteBrowserDiagrams: storage.remove,
}));
const element = (id) => document.getElementById(id);
const serverItems = [
    {
        id: 'debut-main',
        repositoryUrl: 'https://github.com/org/backend.git',
        branch: 'main',
        tables: 3,
        bytes: 1000,
        schemaSource: {
            label: 'Atlas 선언 스키마',
            files: 18,
        },
    },
    {
        id: 'debut-develop',
        repositoryUrl: 'https://github.com/org/backend.git',
        branch: 'develop',
        tables: 4,
        bytes: 2000,
    },
    {
        id: 'debut-other',
        repositoryUrl: 'https://github.com/other/service.git',
        branch: 'main',
        tables: 2,
        bytes: 500,
    },
];
let fetch;
beforeEach(() => {
    vi.resetModules();
    document.documentElement.innerHTML = html;
    localStorage.clear();
    storage.list.mockResolvedValue([
        { id: 'debut-main', name: 'main', bytes: 400 },
        { id: 'manual', name: 'My diagram', bytes: 200 },
    ]);
    storage.remove.mockReset().mockResolvedValue();
    fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({ items: serverItems }),
    }));
    vi.stubGlobal('fetch', fetch);
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.documentElement.innerHTML = '';
});
async function load() {
    await import('./library.js');
    await vi.waitFor(() => expect(element('cards').children.length).toBe(4));
}
function openDeleteDialog() {
    element('delete').click();
    expect(element('delete-dialog').hidden).toBe(false);
    expect(document.querySelector('main').inert).toBe(true);
}
function confirmDelete() {
    openDeleteDialog();
    element('delete-confirm').click();
}
it('combines server and browser-only diagrams with org/repo/branch filters', async () => {
    await load();
    expect(element('cards').textContent).toContain('My diagram');
    expect(element('cards').textContent).toContain('Atlas 선언 스키마 · 18개');
    element('org-filter').value = 'org';
    element('org-filter').dispatchEvent(new Event('change'));
    expect(element('cards').children).toHaveLength(2);
    expect([...element('repo-filter').options].map((o) => o.value)).toEqual([
        '',
        'https://github.com/org/backend.git',
    ]);
    element('branch-filter').value = 'develop';
    element('branch-filter').dispatchEvent(new Event('input'));
    expect(element('cards').children).toHaveLength(1);
    expect(element('cards').textContent).toContain('develop');
    element('select-all').click();
    expect(element('delete').textContent).toContain('(1)');
    element('branch-filter').value = 'main';
    element('branch-filter').dispatchEvent(new Event('input'));
    expect(element('delete').disabled).toBe(true);
});
it('cancels without mutation and deletes only selected IDs after confirmation', async () => {
    await load();
    element('cards').querySelector('input').click();
    openDeleteDialog();
    expect(element('delete-targets').textContent).toContain('org/backend');
    element('delete-cancel').click();
    expect(element('delete-dialog').hidden).toBe(true);
    expect(document.querySelector('main').inert).toBe(false);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockImplementation(async (_, options) => ({
        ok: true,
        json: async () =>
            options?.method === 'POST'
                ? { deleted: ['debut-main'] }
                : { items: serverItems.filter((i) => i.id !== 'debut-main') },
    }));
    storage.list.mockResolvedValue([
        { id: 'manual', name: 'My diagram', bytes: 200 },
    ]);
    confirmDelete();
    await vi.waitFor(() =>
        expect(storage.remove).toHaveBeenCalledWith(['debut-main'])
    );
    await vi.waitFor(() =>
        expect(element('status').textContent).toContain(
            '1개 ERD를 삭제했습니다'
        )
    );
    const post = fetch.mock.calls.find(([, o]) => o?.method === 'POST');
    expect(JSON.parse(post[1].body)).toEqual({ ids: ['debut-main'] });
    expect(element('cards').children).toHaveLength(3);
});
it('keeps browser data on server failure and disables deletion when browser DB is unavailable', async () => {
    await load();
    let finishPost;
    fetch.mockImplementation((_, options) =>
        options?.method
            ? new Promise((resolve) => {
                  finishPost = resolve;
              })
            : Promise.resolve({
                  ok: true,
                  json: async () => ({ items: serverItems }),
              })
    );
    element('cards').querySelector('input').click();
    confirmDelete();
    await vi.waitFor(() =>
        expect(element('delete').textContent).toContain('삭제 중')
    );
    expect(element('delete')).toHaveAttribute('aria-busy', 'true');
    expect(element('status').textContent).toContain('스키마 파일을 삭제');
    finishPost({
        ok: false,
        json: async () => ({ error: 'Sync 진행 중' }),
    });
    await vi.waitFor(() =>
        expect(element('status').textContent).toContain('Sync 진행 중')
    );
    expect(element('status')).toHaveClass('error');
    expect(element('delete')).toHaveAttribute('aria-busy', 'false');
    expect(storage.remove).not.toHaveBeenCalled();
    storage.list.mockRejectedValue(new Error('fixture'));
    element('refresh').click();
    await vi.waitFor(() =>
        expect(element('status').textContent).toContain(
            '브라우저 DB를 읽지 못해'
        )
    );
    expect(element('delete').disabled).toBe(true);
});

it('restores case-insensitive filters from the main page link', async () => {
    vi.stubGlobal('location', {
        search: '?org=ORG&repo=https%3A%2F%2Fgithub.com%2Forg%2Fbackend.git',
    });
    await import('./library.js');
    await vi.waitFor(() =>
        expect(element('status').textContent).toContain('2개 표시')
    );
    expect(element('org-filter').value).toBe('org');
    expect(element('repo-filter').value).toBe(
        'https://github.com/org/backend.git'
    );
    expect(element('cards').children).toHaveLength(2);
});

it('keeps browser-only leftovers manageable after partial failure and retries without deleting the server twice', async () => {
    await load();
    let deleted = false;
    fetch.mockImplementation(async (_, options) => {
        if (options?.method === 'POST') {
            deleted = true;
            return {
                ok: true,
                json: async () => ({ deleted: ['debut-main'] }),
            };
        }
        return {
            ok: true,
            json: async () => ({
                items: deleted
                    ? serverItems.filter((i) => i.id !== 'debut-main')
                    : serverItems,
            }),
        };
    });
    storage.remove.mockRejectedValueOnce(new Error('fixture browser failure'));
    element('cards').querySelector('input').click();
    confirmDelete();
    await vi.waitFor(() =>
        expect(element('status').textContent).toContain(
            '서버 삭제 후 브라우저 정리에 실패'
        )
    );
    const leftover = [...element('cards').children].find(
        (card) =>
            card.textContent.includes('org/backend') &&
            card.textContent.includes('main')
    );
    expect(leftover.textContent).toContain('이 브라우저의 작업 데이터');
    expect(leftover.textContent).not.toContain('Sync 결과 스키마 파일');
    storage.list.mockResolvedValue([
        { id: 'manual', name: 'My diagram', bytes: 200 },
    ]);
    confirmDelete();
    await vi.waitFor(() =>
        expect(element('status').textContent).toContain(
            '1개 ERD를 삭제했습니다'
        )
    );
    expect(
        fetch.mock.calls.filter(([, o]) => o?.method === 'POST')
    ).toHaveLength(1);
});

it('still allows cleanup when the optional source cache is full', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota');
    });
    await load();
    element('cards').querySelector('input').click();
    expect(element('delete').disabled).toBe(false);
});
