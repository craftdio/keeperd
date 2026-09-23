import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import html from './index.html?raw';

const url = 'https://github.com/example/backend.git';
const element = (id) => document.querySelector(`#${id}`);
const response = (payload, ok = true) => ({ ok, json: async () => payload });

beforeEach(() => {
    vi.resetModules();
    document.documentElement.innerHTML = html;
    localStorage.clear();
});
afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.innerHTML = '';
});

it('requires terminal login before loading repositories and recovers on retry', async () => {
    localStorage.setItem('local-erd-selected-repository', url);
    const fetch = vi.fn(async () =>
        response(
            { code: 'AUTH_REQUIRED', error: '로그인이 필요합니다.' },
            false
        )
    );
    vi.stubGlobal('fetch', fetch);
    await import('./home.js');
    await vi.waitFor(() =>
        expect(element('retry').textContent).toBe('로그인 다시 확인')
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(element('auth-guide').hidden).toBe(false);
    expect(element('auth-guide').textContent).toContain(
        'gh auth login --hostname github.com --git-protocol https --web'
    );
    expect(element('repository').disabled).toBe(true);
    expect(element('sync-controls').hidden).toBe(true);
    expect(localStorage.getItem('local-erd-selected-repository')).toBe(url);

    fetch.mockImplementation(async (path) => {
        if (path.startsWith('/api/account'))
            return response({
                name: 'Example',
                login: 'example',
                url: 'https://github.com/example',
                avatarUrl: '',
            });
        if (path.startsWith('/api/repositories'))
            return response({
                primaryUrl: url,
                repositories: [{ name: 'example/backend', url }],
            });
        return response({ snapshots: [] });
    });
    element('retry').click();
    await vi.waitFor(() => expect(element('repository').disabled).toBe(false));
    expect(element('account-name').textContent).toBe('Example');
    expect(element('auth-guide').hidden).toBe(true);
    expect(element('sync-controls').hidden).toBe(false);
    expect(element('repository').value).toBe(url);
    expect(fetch).toHaveBeenCalledWith('/api/account?refresh=1', {
        cache: 'no-store',
    });
    expect(fetch).toHaveBeenCalledWith('/api/repositories?refresh=1', {
        cache: 'no-store',
    });
});

it('refreshes the selected remote repository branches with account and repositories', async () => {
    const events = [];
    const listener = (event) => events.push(event.detail);
    window.addEventListener('local-erd-repository', listener);
    const fetch = vi.fn(async (path) =>
        path.startsWith('/api/account')
            ? response({
                  login: 'example',
                  name: 'Example',
                  url,
                  avatarUrl: '',
              })
            : path.startsWith('/api/repositories')
              ? response({
                    primaryUrl: url,
                    repositories: [{ name: 'example/backend', url }],
                })
              : response({ snapshots: [] })
    );
    vi.stubGlobal('fetch', fetch);
    await import('./home.js');
    await vi.waitFor(() => expect(events).toHaveLength(1));
    element('retry').click();
    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(events[1]).toMatchObject({
        repositoryUrl: url,
        refreshBranches: true,
    });
    expect(element('retry').textContent).toBe('계정·레포·선택 브랜치 새로고침');
    window.removeEventListener('local-erd-repository', listener);
});

it('does not mistake connection or permission failures for missing login', async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
            response(
                {
                    code: 'GITHUB_UNAVAILABLE',
                    error: '연결과 권한을 확인하세요.',
                },
                false
            )
        )
    );
    await import('./home.js');
    await vi.waitFor(() =>
        expect(element('retry').textContent).toBe('다시 시도')
    );
    expect(element('auth-guide').hidden).toBe(true);
    expect(element('repo-status').textContent).toBe(
        '연결과 권한을 확인하세요.'
    );
    expect(element('sync-controls').hidden).toBe(true);
});

it('lets a fresh KeepERD state start by selecting a GitHub repository', async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn(async (path) => {
            if (path === '/api/account')
                return response({
                    name: 'Example',
                    login: 'example',
                    url: 'https://github.com/example',
                    avatarUrl: '',
                });
            if (path === '/api/repositories')
                return response({
                    primaryUrl: null,
                    repositories: [{ name: 'example/backend', url }],
                });
            return response({ snapshots: [] });
        })
    );
    await import('./home.js');
    await vi.waitFor(() => expect(element('repository').disabled).toBe(false));
    expect(element('repository').value).toBe(url);
    expect(element('sync-controls').hidden).toBe(false);
});

it('loads registered local worktrees without GitHub authentication', async () => {
    localStorage.setItem('local-erd-source-mode', 'local');
    const fetch = vi.fn(async (path) =>
        path === '/api/account'
            ? response({ error: 'Login required' }, false, 401)
            : path === '/api/local/repositories'
              ? response({
                    primaryUrl: url,
                    repositories: [
                        {
                            id: 'local-id',
                            commonDirectory: '/repo/.git',
                            repositoryUrl: url,
                            path: '/Users/alice/Documents/code/backend',
                            currentBranch: 'main',
                            directoryName: 'backend',
                            linkedWorktree: false,
                        },
                        {
                            id: 'worktree-id',
                            commonDirectory: '/repo/.git',
                            repositoryUrl: url,
                            path: '/private/tmp/codex/worktrees/a-very-long-folder/backend-feature',
                            currentBranch: 'feat/local-preview',
                            directoryName: 'backend-feature',
                            linkedWorktree: true,
                        },
                    ],
                })
              : response({
                    snapshots: [
                        {
                            branch: 'main',
                            revision: 'abc',
                            tables: 1,
                            relationships: 0,
                            migrations: 1,
                            repositoryUrl: url,
                            diagram: { id: 'debut-main' },
                        },
                    ],
                })
    );
    vi.stubGlobal('fetch', fetch);
    await import('./home.js');
    await vi.waitFor(() => expect(element('repository').disabled).toBe(false));
    expect(fetch.mock.calls.map(([path]) => path)).toContain('/api/account');
    expect(element('auth-guide').hidden).toBe(true);
    expect(element('account-name').textContent).toBe('로컬 저장소');
    expect(element('local-description').textContent).toContain(
        'GitHub 로그인 없이도'
    );
    expect(element('login').textContent).toBe('');
    expect(
        [...element('repository').options].map((option) => option.value)
    ).toEqual([url]);
    expect(element('repository').value).toBe(url);
    expect(
        [...element('worktree').options].map((option) => option.value)
    ).toEqual(['local-id']);
    expect(element('worktree-field').hidden).toBe(true);
    expect(element('repository-trigger').textContent).not.toContain('/code/');
    expect(element('local-registration-shell').hidden).toBe(false);
    expect(element('sync-controls').hidden).toBe(false);
    expect(element('selection-content').hidden).toBe(true);
    expect(element('selection-loading').hidden).toBe(false);
    window.dispatchEvent(new CustomEvent('local-erd-branches-ready'));
    expect(element('selection-content').hidden).toBe(false);
    expect(element('selection-loading').hidden).toBe(true);
});

it('ignores a delayed remote account response after switching to local mode', async () => {
    let finish;
    vi.stubGlobal(
        'fetch',
        vi.fn((path) => {
            if (path === '/api/account')
                if (finish)
                    return Promise.resolve(
                        response({
                            name: 'Current user',
                            login: 'current',
                            avatarUrl:
                                'https://avatars.githubusercontent.com/u/1',
                            url,
                        })
                    );
                else
                    return new Promise((resolve) => {
                        finish = resolve;
                    });
            return Promise.resolve(
                path === '/api/local/repositories'
                    ? response({ primaryUrl: url, repositories: [] })
                    : response({ snapshots: [] })
            );
        })
    );
    await import('./home.js');
    element('source-mode').value = 'local';
    element('source-mode').dispatchEvent(new Event('change'));
    await vi.waitFor(() =>
        expect(element('repo-status').textContent).toContain('등록하세요')
    );
    finish(
        response({ name: 'Stale remote', login: 'stale', avatarUrl: '', url })
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(element('account-name').textContent).toBe('Current user');
    expect(element('login').textContent).toBe('@current');
    expect(element('avatar').getAttribute('src')).toBe(
        'https://avatars.githubusercontent.com/u/1'
    );
    expect(element('auth-guide').hidden).toBe(true);
});

it('groups repositories by owner, renders avatars and right-aligned private icons', async () => {
    const other = 'https://github.com/another/frontend.git';
    const personal = 'https://github.com/example/chartdb.git';
    vi.stubGlobal(
        'fetch',
        vi.fn(async (path) => {
            if (path === '/api/account')
                return response({
                    name: 'Example',
                    login: 'example',
                    url: '',
                    avatarUrl: '',
                });
            if (path === '/api/repositories')
                return response({
                    primaryUrl: url,
                    repositories: [
                        {
                            name: 'example/backend',
                            url,
                            private: true,
                            owner: {
                                login: 'example',
                                type: 'Organization',
                                avatarUrl:
                                    'https://avatars.githubusercontent.com/u/1',
                            },
                        },
                        {
                            name: 'another/frontend',
                            url: other,
                            owner: {
                                login: 'another',
                                type: 'Organization',
                                avatarUrl:
                                    'https://avatars.githubusercontent.com/u/2',
                            },
                        },
                        {
                            name: 'example/chartdb',
                            url: personal,
                            owner: {
                                login: 'example',
                                type: 'Organization',
                                avatarUrl:
                                    'https://avatars.githubusercontent.com/u/1',
                            },
                        },
                    ],
                });
            return response({ snapshots: [] });
        })
    );
    const chosen = vi.fn();
    window.addEventListener('local-erd-repository', chosen);
    await import('./home.js');
    await vi.waitFor(() => expect(element('repository').disabled).toBe(false));
    expect([...element('organization').options].map((o) => o.value)).toEqual([
        'another',
        'example',
    ]);
    expect([...element('repository').options].map((o) => o.value)).toEqual([
        url,
        personal,
    ]);
    expect(element('organization-trigger').querySelector('img').src).toContain(
        '/u/1'
    );
    expect(
        element('organization-trigger').querySelectorAll('.owner-avatar')
    ).toHaveLength(1);
    expect(
        element('repository-trigger').querySelector('.repo-lock svg')
    ).not.toBeNull();
    expect(element('repository-trigger').textContent).not.toContain('Private');
    element('repo-search').value = 'ba';
    element('repo-search').dispatchEvent(new Event('input'));
    expect([...element('repository').options].map((o) => o.value)).toEqual([
        url,
    ]);
    expect(element('repository-list').hidden).toBe(false);
    expect(element('repository-trigger').getAttribute('aria-expanded')).toBe(
        'true'
    );
    element('repo-search').value = 'ch';
    element('repo-search').dispatchEvent(new Event('input'));
    expect([...element('repository').options].map((o) => o.value)).toEqual([
        personal,
    ]);
    expect(element('repository-list').textContent).toContain('chartdb');
    expect(element('repository-list').textContent).not.toContain('backend');
    element('repo-search').value = '';
    element('repo-search').dispatchEvent(new Event('input'));
    element('repository').value = personal;
    element('repository').dispatchEvent(new Event('change'));
    element('organization').dispatchEvent(new Event('change'));
    expect(element('repository').value).toBe(personal);
    element('organization-trigger').click();
    expect(
        element('organization-list')
            .querySelector('[role="option"]')
            .querySelectorAll('.owner-avatar')
    ).toHaveLength(1);
    expect(
        element('organization-trigger').closest('.organization-picker')
    ).toHaveClass('open');
    expect(
        [...element('organization-list').children].map((item) => item.title)
    ).toEqual(['another', 'example']);
    [...element('organization-list').children]
        .find((item) => item.textContent.includes('another'))
        .click();
    expect(
        element('organization-trigger').closest('.organization-picker')
    ).not.toHaveClass('open');
    expect(element('organization').value).toBe('another');
    expect([...element('repository').options].map((o) => o.value)).toEqual([
        other,
    ]);
    expect(element('repository').value).toBe(other);
    expect(
        element('repository-trigger').querySelector('.repo-lock')
    ).toBeNull();
    expect(chosen.mock.calls.at(-1)[0].detail.repositoryUrl).toBe(other);
    element('repo-search').value = 'backend';
    element('repo-search').dispatchEvent(new Event('input'));
    expect([...element('repository').options].map((o) => o.value)).toEqual([]);
    expect(element('repository-trigger').textContent).toContain(
        '검색 결과가 없습니다'
    );
    window.dispatchEvent(new CustomEvent('local-erd-busy', { detail: true }));
    expect(element('organization-trigger').disabled).toBe(true);
    expect(element('repository-trigger').disabled).toBe(true);
    window.dispatchEvent(new CustomEvent('local-erd-busy', { detail: false }));
    expect(element('organization-trigger').disabled).toBe(false);
    window.removeEventListener('local-erd-repository', chosen);
});

it('supports keyboard selection, Escape and outside dismissal', async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn(async (path) => {
            if (path === '/api/account')
                return response({
                    name: 'Example',
                    login: 'example',
                    url: '',
                    avatarUrl: '',
                });
            if (path === '/api/repositories')
                return response({
                    primaryUrl: url,
                    repositories: [
                        { name: 'example/backend', url },
                        {
                            name: 'example/frontend',
                            url: 'https://github.com/example/frontend.git',
                        },
                    ],
                });
            return response({ snapshots: [] });
        })
    );
    await import('./home.js');
    await vi.waitFor(() => expect(element('repository').disabled).toBe(false));
    const trigger = element('repository-trigger');
    const key = (value) =>
        trigger.dispatchEvent(
            new KeyboardEvent('keydown', { key: value, bubbles: true })
        );
    key('ArrowDown');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    key('End');
    key('Enter');
    expect(element('repository').value).toBe(
        'https://github.com/example/frontend.git'
    );
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click();
    key('Escape');
    expect(element('repository-list').hidden).toBe(true);
    trigger.click();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(element('repository-list').hidden).toBe(true);
});
