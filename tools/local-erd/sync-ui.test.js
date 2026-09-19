import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import html from './index.html?raw';

const repositoryUrl = 'https://github.com/example/backend.git';
const response = (payload, ok = true, status = 200) => ({
    ok,
    status,
    json: async () => payload,
});
let listeners;
beforeEach(() => {
    vi.resetModules();
    document.documentElement.innerHTML = html;
    listeners = [];
    const original = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation(
        (type, listener, options) => {
            listeners.push([type, listener]);
            original(type, listener, options);
        }
    );
});
afterEach(() => {
    for (const [type, listener] of listeners)
        window.removeEventListener(type, listener);
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    history.replaceState({}, '', '/');
    document.documentElement.innerHTML = '';
});
const choose = (id) =>
    window.dispatchEvent(
        new CustomEvent('local-erd-repository', {
            detail: {
                repositoryUrl: 'https://github.com/example/backend.git',
                primaryUrl: 'https://github.com/example/backend.git',
                localId: id,
            },
        })
    );

it('syncs only committed local inputs and places information beside the source', async () => {
    const fetch = vi.fn(async (url, options) => {
        if (options?.method === 'POST')
            return response({
                id: 1,
                status: 'running',
                progress: 3,
                message: 'local running',
            });
        if (url.startsWith('/api/local/branches'))
            return response({ branches: ['main', 'other'], current: 'main' });
        if (url === '/api/local/repositories')
            return response({
                repositories: [
                    {
                        id: 'registered-id',
                        path: '/Users/alice/Documents/code/backend',
                        linkedWorktree: false,
                    },
                ],
            });
        return response(
            url === '/api/sync' ? { status: 'idle' } : { snapshots: [] }
        );
    });
    vi.stubGlobal('fetch', fetch);
    await import('./sync-ui.js');
    choose('registered-id');
    const select = document.querySelector('#erd-sync select');
    await vi.waitFor(() => expect(select.disabled).toBe(false));
    await vi.waitFor(() =>
        expect(document.querySelector('#erd-worktree-status').textContent).toBe(
            '현재 선택 worktree · 기본 worktree · ~/Documents/code/backend'
        )
    );
    expect(
        document
            .querySelector('#erd-info-tooltip')
            .contains(document.querySelector('#erd-worktree-status'))
    ).toBe(true);
    document.querySelector('#erd-info-button').click();
    expect(
        document.querySelector('#erd-info-button').getAttribute('aria-expanded')
    ).toBe('true');
    expect(document.querySelector('#erd-sync-action').textContent).toContain(
        '로컬 커밋으로 Sync'
    );
    expect(
        document.querySelector('[aria-label="현재 작업 중 변경 포함"]')
    ).toBeNull();
    expect(document.querySelector('#source-heading #erd-info')).not.toBeNull();
    vi.useFakeTimers();
    document.querySelector('#erd-sync button').click();
    await vi.advanceTimersByTimeAsync(1000);
    const [url] = fetch.mock.calls.find(
        ([, options]) => options?.method === 'POST'
    );
    expect(url).toContain('local=registered-id&mode=commit');
    expect(document.querySelector('#erd-sync-title').textContent).toBe(
        '로컬 스키마 동기화'
    );
});

it('labels local branch state and hides remote-equal branches by default', async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url) => {
            if (url.startsWith('/api/local/branches'))
                return response({
                    current: 'feat/local-only',
                    branches: [
                        {
                            name: 'develop',
                            remoteStatus: 'same',
                            ahead: 0,
                            behind: 0,
                            hasWorkingChanges: false,
                            worktreePath: '/repo',
                            base: null,
                        },
                        {
                            name: 'feat/local-only',
                            commit: '1ab5a14ffff',
                            remoteCommit: null,
                            remoteStatus: 'unpublished',
                            ahead: 0,
                            behind: 0,
                            hasWorkingChanges: true,
                            worktreePath: '/repo',
                            base: { branch: 'develop', commit: '1ab5a14ffff' },
                        },
                    ],
                });
            if (url.startsWith('/api/local/check'))
                return response({
                    remoteStatus: 'unpublished',
                    ahead: 0,
                    behind: 0,
                    checkedAt: '2026-09-16T05:53:50.174Z',
                });
            return response(
                url === '/api/sync' ? { status: 'idle' } : { snapshots: [] }
            );
        })
    );
    await import('./sync-ui.js');
    choose('registered-id');
    const select = document.querySelector('#erd-sync select');
    await vi.waitFor(() => expect(select.disabled).toBe(false));
    expect([...select.options].map((option) => option.textContent)).toEqual([
        'feat/local-only · 원격에 없음 · 작업 중 변경 있음',
    ]);
    expect(document.querySelector('#erd-branch-status').textContent).toContain(
        '분기 비교 기준: develop와 마지막으로 공유하는 커밋 1ab5a14'
    );
    expect(document.querySelector('#erd-branch-status').textContent).toContain(
        '로컬 1ab5a14'
    );
    [...document.querySelectorAll('#erd-sync button')]
        .find((button) => button.textContent === '원격 반영 확인')
        .click();
    await vi.waitFor(() =>
        expect(
            document.querySelector('#erd-branch-status').textContent
        ).toContain('GitHub 확인 2026-09-16T05:53:50.174Z')
    );
    expect(document.querySelector('#erd-branch-status').textContent).toContain(
        '분기 비교 기준: develop와 마지막으로 공유하는 커밋 1ab5a14'
    );
    const showAll = document.querySelector(
        '[aria-label="원격과 동일한 로컬 브랜치도 보기"]'
    );
    showAll.click();
    expect([...select.options].map((option) => option.value)).toContain(
        'develop'
    );
});

it('ignores stale branch results when switching local worktrees', async () => {
    let finish;
    vi.stubGlobal(
        'fetch',
        vi.fn((url) => {
            if (url.includes('local=first'))
                return new Promise((resolve) => {
                    finish = resolve;
                });
            return Promise.resolve(
                response(
                    url.includes('local=second')
                        ? {
                              branches: ['second-branch'],
                              current: 'second-branch',
                          }
                        : url === '/api/sync'
                          ? { status: 'idle' }
                          : { snapshots: [] }
                )
            );
        })
    );
    await import('./sync-ui.js');
    choose('first');
    choose('second');
    await vi.waitFor(() =>
        expect(document.querySelector('#erd-sync select').value).toBe(
            'second-branch'
        )
    );
    finish(response({ branches: ['stale-branch'], current: 'stale-branch' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('#erd-sync select').value).toBe(
        'second-branch'
    );
});

it('opens an existing branch directly and syncs a branch that has no saved ERD', async () => {
    const fetch = vi.fn(async (path, options) => {
        if (path.startsWith('/api/branches'))
            return response({ branches: ['develop', 'main'] });
        if (path === '/data/snapshots.json')
            return response({
                snapshots: [
                    {
                        repositoryUrl,
                        branch: 'develop',
                        diagram: { id: 'debut-develop' },
                    },
                ],
            });
        if (path.startsWith('/api/sync') && options?.method === 'POST')
            return response({
                status: 'error',
                progress: 0,
                message: 'fixture',
            });
        return response({ status: 'idle' });
    });
    vi.stubGlobal('fetch', fetch);
    await import('./sync-ui.js');
    window.dispatchEvent(
        new CustomEvent('local-erd-repository', {
            detail: { repositoryUrl, primaryUrl: repositoryUrl },
        })
    );
    const open = document.querySelector('#erd-open');
    const select = document.querySelector('#erd-sync select');
    await vi.waitFor(() => expect(open.disabled).toBe(false));
    expect(document.querySelector('#erd-sync-action').textContent).toContain(
        'GitHub 최신 상태로 Sync'
    );
    expect(open.textContent).toContain('이 브랜치로 ERD 열기');
    expect(open.title).toContain('바로 엽니다');

    select.value = 'main';
    select.dispatchEvent(new Event('change'));
    expect(open.title).toContain('스키마를 생성한 뒤 엽니다');
    vi.useFakeTimers();
    open.click();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(
            `/api/sync?branch=main&repository=${encodeURIComponent(repositoryUrl)}`
        ),
        expect.objectContaining({ method: 'POST' })
    );
});

it('switches the sync basis between the current local worktree and GitHub remote', async () => {
    history.replaceState({}, '', '/diagrams/debut-local-feature');
    const snapshot = {
        repositoryUrl,
        branch: 'feature',
        schemaSource: {
            kind: 'atlas-schema',
            label: 'Atlas 선언 스키마',
            path: 'db/schema/*.sql',
            files: 18,
        },
        source: {
            kind: 'local',
            repositoryId: 'local-id',
            mode: 'commit',
            notice: '로컬 브랜치 커밋',
            commit: '1ab5a14ffff',
            capturedAt: '2026-09-16T06:00:00.000Z',
            fingerprint: 'fixture',
        },
        schemaAdditions: {
            newTableIds: [],
            newFieldIds: [],
            changedTableIds: [],
            changedFieldIds: [],
            removedTables: 0,
            removedFields: 0,
            allTablesNew: false,
            comparison: {
                kind: 'branch-base',
                branch: 'develop',
                revision: '1ab5a14ffff',
            },
        },
        diagram: { id: 'debut-local-feature' },
    };
    let failRemote = false;
    const fetch = vi.fn(async (path) => {
        if (path === '/api/context')
            return response({ primaryUrl: repositoryUrl });
        if (path === '/data/snapshots.json')
            return response({ snapshots: [snapshot] });
        if (path.startsWith('/api/local/branches'))
            return response({
                branches: [
                    { name: 'ci/first', remoteStatus: 'unpublished' },
                    { name: 'feature', remoteStatus: 'same' },
                ],
                current: 'ci/first',
            });
        if (path.startsWith('/api/branches')) {
            if (failRemote) throw new Error('remote branch failure');
            return response({ branches: ['feature'] });
        }
        if (path === '/api/local/repositories')
            return response({
                repositories: [
                    {
                        id: 'local-id',
                        repositoryUrl,
                        path: '/private/tmp/codex/worktrees/a-very-long-folder/backend-feature',
                        linkedWorktree: true,
                    },
                ],
            });
        return response({ status: 'idle' });
    });
    vi.stubGlobal('fetch', fetch);

    await import('./sync-ui.js');

    const source = document.querySelector('#erd-sync-source');
    await vi.waitFor(() => expect(source.value).toBe('local'));
    expect(document.querySelector('#erd-sync-action').textContent).toContain(
        '로컬 커밋으로 Sync'
    );
    await vi.waitFor(() =>
        expect(document.querySelector('#erd-input-status').textContent).toBe(
            '스키마 입력 · Atlas 선언 스키마 · db/schema/*.sql · 18개'
        )
    );
    await vi.waitFor(() =>
        expect(document.querySelector('#erd-worktree-status').textContent).toBe(
            '현재 ERD worktree · 연결된 worktree · /private/…/backend-feature'
        )
    );
    expect(document.querySelector('#erd-worktree-status').title).toBe(
        '/private/tmp/codex/worktrees/a-very-long-folder/backend-feature'
    );
    expect(document.querySelector('#erd-schema-status').textContent).toBe(
        '형광 초록색은 develop와 마지막으로 공유하는 커밋 1ab5a14의 스키마보다 추가되거나 변경된 테이블·필드입니다. 기준 브랜치의 현재 최신 상태가 아니라, 두 브랜치가 갈라지는 지점의 커밋과 비교합니다.'
    );

    source.value = 'remote';
    source.dispatchEvent(new Event('change'));
    await vi.waitFor(() =>
        expect(
            document.querySelector('#erd-sync-action').textContent
        ).toContain('GitHub 최신 상태로 Sync')
    );
    expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/branches?repository='),
        { cache: 'no-store' }
    );

    source.value = 'local';
    source.dispatchEvent(new Event('change'));
    await vi.waitFor(() =>
        expect(
            document.querySelector('#erd-sync-action').textContent
        ).toContain('로컬 커밋으로 Sync')
    );
    expect(fetch).toHaveBeenCalledWith('/api/local/repositories', {
        cache: 'no-store',
    });

    failRemote = true;
    source.value = 'remote';
    source.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(source.value).toBe('local'));
    expect(document.querySelector('#erd-branch').disabled).toBe(false);
    expect(document.querySelector('#erd-branch').value).toBe('feature');
    expect(document.querySelector('#erd-sync-action').disabled).toBe(false);
    expect(document.querySelector('#erd-branch-status').textContent).toContain(
        'remote branch failure'
    );
});

it('shows local commit identity and schema difference against its remote basis', async () => {
    history.replaceState({}, '', '/diagrams/debut-local-feature');
    const remote = {
        repositoryUrl,
        branch: 'develop',
        diagram: {
            id: 'debut-develop',
            tables: [
                {
                    id: 'remote-users',
                    schema: 'public',
                    name: 'users',
                    fields: [{ id: 'remote-user-id', name: 'id' }],
                },
            ],
            relationships: [],
        },
    };
    const local = {
        repositoryUrl,
        branch: 'feature',
        source: {
            kind: 'local',
            repositoryId: 'local-id',
            mode: 'commit',
            notice: '로컬 브랜치 커밋',
            commit: '1ab5a14ffff',
            capturedAt: '2026-09-16T06:00:00.000Z',
            fingerprint: 'fixture',
        },
        diagram: {
            id: 'debut-local-feature',
            tables: [
                {
                    id: 'local-users',
                    schema: 'public',
                    name: 'users',
                    fields: [
                        { id: 'local-user-id', name: 'id' },
                        { id: 'local-user-email', name: 'email' },
                    ],
                },
                {
                    id: 'local-profiles',
                    schema: 'public',
                    name: 'profiles',
                    fields: [{ id: 'local-profile-id', name: 'id' }],
                },
            ],
            relationships: [
                {
                    sourceTableId: 'local-profiles',
                    sourceFieldId: 'local-profile-id',
                    targetTableId: 'local-users',
                    targetFieldId: 'local-user-id',
                },
            ],
        },
    };
    vi.stubGlobal(
        'fetch',
        vi.fn(async (path) => {
            if (path === '/api/context')
                return response({ primaryUrl: repositoryUrl });
            if (path === '/data/snapshots.json')
                return response({ snapshots: [remote, local] });
            if (path.startsWith('/api/local/branches'))
                return response({
                    current: 'feature',
                    branches: [
                        {
                            name: 'feature',
                            commit: '1ab5a14ffff',
                            remoteCommit: null,
                            remoteStatus: 'unpublished',
                            ahead: 0,
                            behind: 0,
                            hasWorkingChanges: true,
                            worktreePath: '/repo',
                            base: {
                                branch: 'develop',
                                commit: '1ab5a14ffff',
                            },
                        },
                    ],
                });
            return response({ status: 'idle' });
        })
    );

    await import('./sync-ui.js');

    await vi.waitFor(() =>
        expect(document.querySelector('#erd-schema-status').textContent).toBe(
            'GitHub develop 대비 스키마 · 테이블 +1/-0 · 컬럼 +2/-0/변경 0 · 관계 +1/-0'
        )
    );
    expect(document.querySelector('#erd-branch-status').textContent).toContain(
        '로컬 1ab5a14'
    );
});

it('highlights additions and changes from the branch base commit', async () => {
    history.replaceState({}, '', '/diagrams/debut-feature');
    const canvas = document.createElement('div');
    canvas.id = 'canvas';
    canvas.innerHTML =
        '<div data-table-id="new-table"></div><div data-table-id="old-table"><div data-field-id="new-field"></div><div data-field-id="changed-field"></div></div>';
    document.body.append(canvas);
    const snapshot = {
        repositoryUrl,
        branch: 'feature',
        diagram: { id: 'debut-feature' },
        schemaAdditions: {
            newTableIds: ['new-table'],
            newFieldIds: ['new-field'],
            changedTableIds: ['old-table'],
            changedFieldIds: ['changed-field'],
            removedTables: 1,
            removedFields: 2,
            allTablesNew: false,
            comparison: {
                kind: 'branch-base',
                branch: 'develop',
                revision: '1ab5a14ffff',
            },
        },
    };
    vi.stubGlobal(
        'fetch',
        vi.fn(async (path) => {
            if (path === '/api/context')
                return response({ primaryUrl: repositoryUrl });
            if (path === '/data/snapshots.json')
                return response({ snapshots: [snapshot] });
            if (path.startsWith('/api/branches'))
                return response({ branches: ['feature'] });
            return response({ status: 'idle' });
        })
    );

    await import('./sync-ui.js');

    await vi.waitFor(() =>
        expect(
            document.querySelector('#erd-diff-tooltip').textContent
        ).toContain('테이블 +1/변경 1/-1')
    );
    const badge = document.querySelector('#erd-branch-diff');
    expect(badge.parentElement.id).toBe('erd-sync');
    expect(badge.querySelector('button')).toHaveAttribute(
        'aria-describedby',
        'erd-diff-tooltip'
    );
    badge.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(badge).toHaveClass('dismissed');
    badge.dispatchEvent(new MouseEvent('mouseenter'));
    expect(badge).not.toHaveClass('dismissed');
    expect(document.querySelector('[data-table-id="new-table"]')).toHaveClass(
        'local-erd-new-table'
    );
    expect(document.querySelector('[data-field-id="new-field"]')).toHaveClass(
        'local-erd-new-field'
    );
    expect(document.querySelector('[data-table-id="old-table"]')).toHaveClass(
        'local-erd-new-table'
    );
    expect(
        document.querySelector('[data-field-id="changed-field"]')
    ).toHaveClass('local-erd-new-field');
    expect(canvas).not.toHaveClass('local-erd-all-new');
});

it('draws one canvas border when the first sync adds the whole schema', async () => {
    history.replaceState({}, '', '/diagrams/debut-main');
    const canvas = document.createElement('div');
    canvas.id = 'canvas';
    canvas.innerHTML = '<div data-table-id="users"></div>';
    document.body.append(canvas);
    const snapshot = {
        repositoryUrl,
        branch: 'main',
        diagram: { id: 'debut-main' },
        schemaAdditions: {
            newTableIds: ['users'],
            newFieldIds: [],
            changedTableIds: [],
            changedFieldIds: [],
            removedTables: 0,
            removedFields: 0,
            allTablesNew: true,
            comparison: {
                kind: 'branch-base',
                branch: 'develop',
                revision: '1ab5a14ffff',
            },
        },
    };
    vi.stubGlobal(
        'fetch',
        vi.fn(async (path) => {
            if (path === '/api/context')
                return response({ primaryUrl: repositoryUrl });
            if (path === '/data/snapshots.json')
                return response({ snapshots: [snapshot] });
            if (path.startsWith('/api/branches'))
                return response({ branches: ['main'] });
            return response({ status: 'idle' });
        })
    );

    await import('./sync-ui.js');

    await vi.waitFor(() => expect(canvas).toHaveClass('local-erd-all-new'));
    expect(document.querySelector('#erd-diff-tooltip').textContent).toContain(
        '전체 테이블 신규'
    );
    expect(document.querySelector('[data-table-id="users"]')).not.toHaveClass(
        'local-erd-new-table'
    );
});

it('opens the work data sharing panel with the current repo, branch and commit', async () => {
    history.replaceState({}, '', '/diagrams/debut-main');
    localStorage.removeItem('debut-layout-backup:debut-main');
    vi.stubGlobal(
        'fetch',
        vi.fn(async (path) => {
            if (path === '/api/context')
                return response({ primaryUrl: repositoryUrl });
            if (path === '/data/snapshots.json')
                return response({
                    snapshots: [
                        {
                            repositoryUrl,
                            branch: 'main',
                            revision: 'abc123def456',
                            diagram: { id: 'debut-main' },
                        },
                    ],
                });
            if (path.startsWith('/api/branches'))
                return response({ branches: ['main'] });
            return response({ status: 'idle' });
        })
    );

    await import('./sync-ui.js');

    const button = document.querySelector('#erd-layout-action');
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    button.click();

    expect(document.querySelector('#erd-layout-panel')).toHaveClass('visible');
    expect(document.querySelector('#erd-layout-source').textContent).toBe(
        '레포 공통 작업 데이터 · https://github.com/example/backend.git'
    );
    expect(document.querySelector('#erd-layout-status').textContent).toContain(
        'JSON 파일'
    );
    expect(document.querySelector('#erd-layout-restore').hidden).toBe(true);
});
