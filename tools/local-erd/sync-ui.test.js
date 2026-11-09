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
    delete globalThis[Symbol.for('keeperd.workspace-client')];
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

it('keeps the Sync toolbar below the responsive editor header', async () => {
    history.replaceState({}, '', '/diagrams/test');
    const root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => response({ snapshots: [], branches: [] }))
    );

    await import('./sync-ui.js');
    const toolbar = document.querySelector('#erd-sync');
    const header = document.createElement('nav');
    let bottom = 117;
    vi.spyOn(header, 'getBoundingClientRect').mockImplementation(() => ({
        bottom,
    }));
    root.append(header);
    await vi.waitFor(() => expect(toolbar.style.top).toBe('127px'));

    bottom = 153;
    window.dispatchEvent(new Event('resize'));
    expect(toolbar.style.top).toBe('163px');

    const replacement = document.createElement('nav');
    vi.spyOn(replacement, 'getBoundingClientRect').mockReturnValue({
        bottom: 90,
    });
    header.replaceWith(replacement);
    await vi.waitFor(() => expect(toolbar.style.top).toBe('100px'));
});

it('shows a branch refresh button and bypasses the remote cache without restarting', async () => {
    let branches = ['main'];
    const fetch = vi.fn(async (path) =>
        path.startsWith('/api/branches')
            ? response({
                  branches: path.includes('refresh=1') ? branches : ['main'],
              })
            : response(
                  path === '/api/sync' ? { status: 'idle' } : { snapshots: [] }
              )
    );
    vi.stubGlobal('fetch', fetch);
    await import('./sync-ui.js');
    choose('');
    const select = document.querySelector('#erd-branch');
    const refresh = document.querySelector('#erd-branch-refresh');
    await vi.waitFor(() => expect(select.value).toBe('main'));
    expect(refresh).not.toBeNull();
    branches = ['main', 'feature/new'];
    refresh.click();
    await vi.waitFor(() =>
        expect([...select.options].map((option) => option.value)).toContain(
            'feature/new'
        )
    );
    expect(select.value).toBe('main');
    expect(fetch.mock.calls.some(([path]) => path.includes('&refresh=1'))).toBe(
        true
    );
});

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
    document.querySelector('#erd-sync-action').click();
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

it.each([
    'SCHEMA_METHOD_UNSUPPORTED',
    'SCHEMA_CONFIGURATION_MISSING',
    'SCHEMA_CONFIGURATION_AMBIGUOUS',
    'SCHEMA_VERSION_UNSUPPORTED',
])('locks Sync after a non-actionable schema result: %s', async (code) => {
    const guidance =
        '스키마 실행 설정을 확인하세요. 현재 지원 방식: Atlas 선언 SQL (db/schema/*.sql), debut 순차 SQL (db/migration/*.sql), 설정된 Flyway SQL (src/main/resources/db/migration/{V,R}*.sql), 설정된 Alembic revision (alembic/versions/*.py), 설정된 Airflow 메타 DB (Dockerfile의 고정 버전)';
    vi.stubGlobal(
        'fetch',
        vi.fn(async (path, options) => {
            if (path.startsWith('/api/branches'))
                return response({ branches: ['main'] });
            if (path === '/data/snapshots.json')
                return response({ snapshots: [] });
            if (path.startsWith('/api/sync') && options?.method === 'POST')
                return response({
                    status: 'error',
                    code,
                    progress: 0,
                    message: guidance,
                });
            return response({ status: 'idle' });
        })
    );
    await import('./sync-ui.js');
    choose('');
    const sync = document.querySelector('#erd-sync-action');
    await vi.waitFor(() => expect(sync.disabled).toBe(false));
    vi.useFakeTimers();
    sync.click();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sync.disabled).toBe(true);
    expect(document.querySelector('#erd-input-status').textContent).toBe(
        guidance
    );
    expect(document.querySelector('#erd-sync-panel').textContent).toContain(
        '현재 지원 방식:'
    );
});

it('shows the selected Airflow metadata database and pinned version', async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn(async (path) => {
            if (path.startsWith('/api/branches'))
                return response({ branches: ['main'] });
            if (path === '/data/snapshots.json')
                return response({
                    snapshots: [
                        {
                            repositoryUrl,
                            branch: 'main',
                            schemaSource: {
                                kind: 'airflow-metadata',
                                label: 'Airflow 메타 DB',
                                path: 'Dockerfile · Airflow 3.3.1',
                                files: 3,
                            },
                            diagram: { id: 'debut-main' },
                        },
                    ],
                });
            return response({ status: 'idle' });
        })
    );
    await import('./sync-ui.js');
    choose('');
    await vi.waitFor(() =>
        expect(document.querySelector('#erd-input-status').textContent).toBe(
            '스키마 입력 · Airflow 메타 DB · Dockerfile · Airflow 3.3.1 · 3개'
        )
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
    vi.stubGlobal('indexedDB', undefined);
    localStorage.removeItem('debut-layout-backup:debut-main');
    vi.stubGlobal(
        'fetch',
        vi.fn(async (path) => {
            if (path === '/api/context')
                return response({ primaryUrl: repositoryUrl });
            if (path === '/api/workspace')
                return response({
                    revision: 1,
                    diagrams: [{ id: 'debut-main', tables: [] }],
                    layouts: [],
                    backups: [],
                    config: {},
                    filters: {},
                });
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
    await button.onclick();

    expect(document.querySelector('#erd-layout-panel')).toHaveClass('visible');
    expect(document.querySelector('#erd-layout-source').textContent).toBe(
        'example/backend'
    );
    expect(document.querySelector('#erd-layout-branch span').textContent).toBe(
        'main'
    );
    expect(document.querySelector('#erd-layout-branch').title).toBe(
        '현재 ERD 브랜치: main'
    );
    expect(document.querySelector('#erd-layout-status').hidden).toBe(true);
    expect(document.querySelector('#erd-layout-restore').hidden).toBe(true);
});

async function sharingPanel() {
    history.replaceState({}, '', '/diagrams/debut-main');
    vi.stubGlobal('indexedDB', undefined);
    const tables = [
        {
            id: 'users',
            schema: 'public',
            name: 'users',
            x: 10,
            y: 20,
            color: '#123456',
            fields: [{ id: 'field', name: 'id' }],
        },
        {
            id: 'audit-users',
            schema: 'audit',
            name: 'users',
            x: 50,
            y: 60,
            color: '#ffffff',
            fields: [],
        },
    ];
    const state = {
        revision: 1,
        diagrams: [{ id: 'debut-main', tables, areas: [], notes: [] }],
        layouts: [],
        backups: [],
        filters: {},
        config: {},
    };
    const fetch = vi.fn(async (path) => {
        if (path === '/api/context')
            return response({ primaryUrl: repositoryUrl });
        if (path === '/data/snapshots.json')
            return response({
                snapshots: [
                    {
                        repositoryUrl,
                        branch: 'main',
                        revision: 'abc123',
                        diagram: { id: 'debut-main' },
                    },
                ],
            });
        if (path === '/api/workspace') return response(state);
        if (path.startsWith('/api/branches'))
            return response({ branches: ['main'] });
        return response({ status: 'idle' });
    });
    vi.stubGlobal('fetch', fetch);
    await import('./sync-ui.js');
    const button = document.querySelector('#erd-layout-action');
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    await button.onclick();
    return { state, fetch };
}

it('downloads only selected table placements and keeps full export available', async () => {
    await sharingPanel();
    const selectedExport = document.querySelector(
        '#erd-layout-export-selected'
    );
    expect(selectedExport.disabled).toBe(true);
    expect(document.querySelector('#erd-layout-export').disabled).toBe(false);
    let blob;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
        blob = value;
        return 'blob:test';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const search = document.querySelector(
        '#erd-layout-picker input[type=search]'
    );
    search.value = 'audit';
    search.dispatchEvent(new Event('input'));
    document.querySelector('#erd-layout-picker [data-select-all]').click();
    expect(selectedExport.disabled).toBe(false);
    await selectedExport.onclick();
    const partial = JSON.parse(await blob.text());
    expect(partial.format).toBe('keeperd-table-layout');
    expect(partial.layout.tables).toHaveLength(1);
    expect(partial.layout.tables[0]).toMatchObject({
        schema: 'audit',
        name: 'users',
        x: 50,
    });
    expect(partial.layout.tables[0].fields).toBeUndefined();
    expect(partial.layout.areas).toBeUndefined();
    document.querySelector('input[name=erd-layout-scope][value=all]').click();
    expect(document.querySelector('#erd-layout-picker').hidden).toBe(true);
    expect(document.querySelector('#erd-layout-export-selected').hidden).toBe(
        true
    );
    await document.querySelector('#erd-layout-export').onclick();
    expect(JSON.parse(await blob.text()).format).toBe(
        'keeperd-repository-layout'
    );
});

it('previews partial match and skip counts, blocks zero matches, and rejects a different repository', async () => {
    await sharingPanel();
    document.querySelector('#erd-layout-tab-import').click();
    const file = document.querySelector('#erd-layout-file');
    const apply = document.querySelector('#erd-layout-apply');
    const status = document.querySelector('#erd-layout-status');
    const row = {
        schema: 'public',
        name: 'users',
        x: 100,
        y: 200,
        color: '#000000',
        width: null,
        expanded: null,
        order: null,
    };
    const input = {
        format: 'keeperd-table-layout',
        version: 1,
        repository: { url: repositoryUrl },
        layout: { tables: [row, { ...row, name: 'absent' }] },
    };
    const load = async () => {
        Object.defineProperty(file, 'files', {
            configurable: true,
            value: [{ size: 100, text: async () => JSON.stringify(input) }],
        });
        await file.onchange();
    };
    await load();
    expect(document.querySelector('#erd-layout-count-total').textContent).toBe(
        '2'
    );
    expect(
        document.querySelector('#erd-layout-count-matched').textContent
    ).toBe('1');
    expect(
        document.querySelector('#erd-layout-count-skipped').textContent
    ).toBe('1');
    expect(
        document.querySelector('#erd-layout-import-help').textContent
    ).toContain('Area 소속은 유지');
    expect(apply.hidden).toBe(false);
    expect(apply.textContent).toContain('1개 테이블에 적용');
    input.layout.tables = [{ ...row, name: 'absent' }];
    await load();
    expect(apply.hidden).toBe(true);
    expect(status.textContent).toContain('적용할 테이블이 없습니다');
    input.repository.url = 'https://github.com/other/repo';
    await load();
    expect(status.textContent).toContain('레포가 다릅니다');
    expect(apply.hidden).toBe(true);
});

it('separates import from export, preserves choices between tabs and restores focus on Escape', async () => {
    await sharingPanel();
    const dialog = document.querySelector('#erd-layout-panel [role=dialog]');
    expect(dialog.hasAttribute('aria-modal')).toBe(false);
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    outside.click();
    expect(document.querySelector('#erd-layout-panel')).toHaveClass('visible');
    const tab = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
    });
    dialog.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(document.querySelector('#erd-layout-export-panel').hidden).toBe(
        false
    );
    expect(document.querySelector('#erd-layout-import-panel').hidden).toBe(
        true
    );
    document.querySelector('#erd-layout-picker [data-schema="public"]').click();
    const selected = document.querySelector('#erd-layout-export-selected');
    expect(selected.textContent).toBe('1개 테이블 내보내기');
    const exportTab = document.querySelector('#erd-layout-tab-export');
    exportTab.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    );
    expect(document.querySelector('#erd-layout-import-panel').hidden).toBe(
        false
    );
    expect(document.querySelector('#erd-layout-export-panel').hidden).toBe(
        true
    );
    document.querySelector('#erd-layout-tab-export').click();
    expect(selected.textContent).toBe('1개 테이블 내보내기');
    const opener = document.querySelector('#erd-layout-action');
    document.querySelector('#erd-layout-close').click();
    opener.focus();
    await opener.onclick();
    expect(selected.textContent).toBe('1개 테이블 내보내기');
    document
        .querySelector('#erd-layout-tab-export')
        .dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        );
    expect(document.querySelector('#erd-layout-panel')).not.toHaveClass(
        'visible'
    );
    expect(document.activeElement).toBe(opener);
});

it('offers a readable retry when loading the table list times out', async () => {
    const { fetch } = await sharingPanel();
    fetch.mockRejectedValueOnce(
        new DOMException('signal is aborted without reason', 'AbortError')
    );
    await document.querySelector('#erd-layout-action').onclick();
    expect(document.querySelector('#erd-layout-status').textContent).toContain(
        '다시 시도'
    );
    const retry = document.querySelector('#erd-layout-retry');
    expect(retry.hidden).toBe(false);
    await retry.onclick();
    expect(retry.hidden).toBe(true);
    expect(
        document.querySelectorAll('#erd-layout-picker [data-table]')
    ).toHaveLength(2);
});

it('accumulates canvas picks into chips, keeps them on blank clicks and removes them explicitly without loops', async () => {
    const received = [];
    const listener = (event) => received.push(event.detail);
    window.addEventListener('keeperd-layout-selection', listener);
    const fromCanvas = (diagramId, keys) =>
        window.dispatchEvent(
            new CustomEvent('keeperd-canvas-selection', {
                detail: { diagramId, keys },
            })
        );
    try {
        await sharingPanel();
        expect(received).toContainEqual({
            diagramId: 'debut-main',
            read: true,
        });
        received.length = 0;
        document
            .querySelector('#erd-layout-picker [data-schema="public"]')
            .click();
        expect(received).toEqual([
            {
                diagramId: 'debut-main',
                keys: ['["public","users"]'],
                active: true,
            },
        ]);
        document.querySelector('#erd-layout-focus').click();
        expect(received.at(-1)).toEqual({
            diagramId: 'debut-main',
            keys: ['["public","users"]'],
            focus: true,
        });
        received.length = 0;
        fromCanvas('different', ['["audit","users"]']);
        fromCanvas('debut-main', []);
        expect(
            document.querySelector('#erd-layout-export-selected').textContent
        ).toBe('1개 테이블 내보내기');
        expect(received).toHaveLength(0);
        fromCanvas('debut-main', ['["audit","users"]']);
        expect(
            document.querySelector('#erd-layout-export-selected').textContent
        ).toBe('2개 테이블 내보내기');
        expect(
            document.querySelectorAll('#erd-layout-picker [role=listitem]')
        ).toHaveLength(2);
        expect(received).toEqual([
            {
                diagramId: 'debut-main',
                keys: ['["public","users"]', '["audit","users"]'],
                active: true,
            },
        ]);
        fromCanvas('debut-main', ['["audit","users"]']);
        fromCanvas('debut-main', []);
        expect(received).toHaveLength(1);
        document
            .querySelector('#erd-layout-picker [data-remove-table]')
            .click();
        expect(
            document.querySelector('#erd-layout-export-selected').textContent
        ).toBe('1개 테이블 내보내기');
        expect(received.at(-1).keys).toEqual(['["audit","users"]']);
        document
            .querySelector('#erd-layout-picker .erd-layout-chip-name')
            .click();
        expect(received.at(-1)).toEqual({
            diagramId: 'debut-main',
            keys: ['["audit","users"]'],
            focus: true,
        });
        document.querySelector('#erd-layout-close').click();
        expect(received.at(-1)).toEqual({
            diagramId: 'debut-main',
            active: false,
        });
        fromCanvas('debut-main', ['["public","users"]']);
        expect(
            document.querySelector('#erd-layout-export-selected').textContent
        ).toBe('1개 테이블 내보내기');
    } finally {
        window.removeEventListener('keeperd-layout-selection', listener);
    }
});

it('adopts the existing canvas selection on open and publishes the basket once for highlighting', async () => {
    const commands = [];
    const listener = (event) => {
        commands.push(event.detail);
        if (event.detail.read)
            window.dispatchEvent(
                new CustomEvent('keeperd-canvas-selection', {
                    detail: {
                        diagramId: 'debut-main',
                        keys: ['["public","users"]'],
                    },
                })
            );
    };
    window.addEventListener('keeperd-layout-selection', listener);
    try {
        await sharingPanel();
        expect(commands).toEqual([
            { diagramId: 'debut-main', read: true },
            {
                diagramId: 'debut-main',
                keys: ['["public","users"]'],
                active: true,
            },
        ]);
        expect(
            document.querySelector('#erd-layout-export-selected').textContent
        ).toBe('1개 테이블 내보내기');
    } finally {
        window.removeEventListener('keeperd-layout-selection', listener);
    }
});

it('turns off canvas target highlights outside table export mode and restores the same basket when returning', async () => {
    await sharingPanel();
    const listener = vi.fn();
    window.addEventListener('keeperd-layout-selection', listener);
    try {
        document
            .querySelector('#erd-layout-picker [data-schema="public"]')
            .click();
        document.querySelector('#erd-layout-tab-import').click();
        expect(listener.mock.calls.at(-1)[0].detail.active).toBe(false);
        window.dispatchEvent(
            new CustomEvent('keeperd-canvas-selection', {
                detail: {
                    diagramId: 'debut-main',
                    keys: ['["audit","users"]'],
                },
            })
        );
        document.querySelector('#erd-layout-tab-export').click();
        expect(listener.mock.calls.at(-1)[0].detail).toEqual({
            diagramId: 'debut-main',
            keys: ['["public","users"]'],
            active: true,
        });
        document
            .querySelector('input[name=erd-layout-scope][value=all]')
            .click();
        expect(listener.mock.calls.at(-1)[0].detail.active).toBe(false);
        document
            .querySelector('input[name=erd-layout-scope][value=selected]')
            .click();
        expect(listener.mock.calls.at(-1)[0].detail.active).toBe(true);
        document.querySelector('#erd-layout-picker [data-clear]').click();
        expect(
            document.querySelectorAll('#erd-layout-picker [role=listitem]')
        ).toHaveLength(0);
        expect(listener.mock.calls.at(-1)[0].detail.keys).toEqual([]);
    } finally {
        window.removeEventListener('keeperd-layout-selection', listener);
    }
});

it('toggles a canvas table off and back on without dropping other shared tables', async () => {
    await sharingPanel();
    const listener = vi.fn();
    window.addEventListener('keeperd-layout-selection', listener);
    const toggle = (key) =>
        window.dispatchEvent(
            new CustomEvent('keeperd-canvas-selection', {
                detail: { diagramId: 'debut-main', keys: [key], toggle: true },
            })
        );
    try {
        toggle('["public","users"]');
        toggle('["audit","users"]');
        expect(
            document.querySelectorAll('#erd-layout-picker [role=listitem]')
        ).toHaveLength(2);
        toggle('["public","users"]');
        expect(
            document.querySelectorAll('#erd-layout-picker [role=listitem]')
        ).toHaveLength(1);
        expect(listener.mock.calls.at(-1)[0].detail.keys).toEqual([
            '["audit","users"]',
        ]);
        toggle('["public","users"]');
        expect(
            document.querySelectorAll('#erd-layout-picker [role=listitem]')
        ).toHaveLength(2);
        toggle('["audit","users"]');
        toggle('["public","users"]');
        expect(
            document.querySelector('#erd-layout-export-selected').disabled
        ).toBe(true);
        expect(listener.mock.calls.at(-1)[0].detail.keys).toEqual([]);
    } finally {
        window.removeEventListener('keeperd-layout-selection', listener);
    }
});
