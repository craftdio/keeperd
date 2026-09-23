import { afterEach, expect, it, vi } from 'vitest';
import { createRepositorySwitcher } from './repository-switcher.js';

const response = (payload) => ({
    ok: true,
    json: async () => payload,
});
const switchers = [];
const makeSwitcher = (options) => {
    const switcher = createRepositorySwitcher(options);
    switchers.push(switcher);
    return switcher;
};

afterEach(() => {
    for (const switcher of switchers.splice(0)) switcher.destroy();
    vi.unstubAllGlobals();
    document.documentElement.innerHTML = '';
});

it('switches organization, repository, and branch before syncing', async () => {
    const first = 'https://github.com/alpha/backend.git';
    const second = 'https://github.com/beta/warehouse.git';
    vi.stubGlobal(
        'fetch',
        vi.fn(async (path) => {
            if (path === '/api/repositories')
                return response({
                    repositories: [
                        {
                            name: 'alpha/backend',
                            url: first,
                            owner: {
                                login: 'alpha',
                                avatarUrl: 'https://example.com/alpha.png',
                                type: 'Organization',
                            },
                        },
                        {
                            name: 'beta/warehouse',
                            url: second,
                            private: true,
                            owner: {
                                login: 'beta',
                                avatarUrl: 'https://example.com/beta.png',
                                type: 'Organization',
                            },
                        },
                    ],
                });
            if (path.includes(encodeURIComponent(first)))
                return response({ branches: ['develop', 'main'] });
            if (path.includes(encodeURIComponent(second)))
                return response({ branches: ['feature/data', 'main'] });
            return response({ branches: [] });
        })
    );
    const onChoose = vi.fn();
    makeSwitcher({
        getCurrent: () => ({ repositoryUrl: first, branch: 'develop' }),
        onChoose,
    });

    window.dispatchEvent(new CustomEvent('local-erd-switcher'));
    const panel = document.querySelector('#erd-repository-panel');
    await vi.waitFor(() => expect(panel.hidden).toBe(false));
    await vi.waitFor(() =>
        expect(document.querySelector('#switcher-branch').value).toBe('develop')
    );

    const owner = document.querySelector('#switcher-owner');
    owner.value = 'beta';
    owner.dispatchEvent(new Event('change'));
    await vi.waitFor(() =>
        expect(document.querySelector('#switcher-repository').value).toBe(
            second
        )
    );
    await vi.waitFor(() =>
        expect(document.querySelector('#switcher-branch').value).toBe('main')
    );
    document.querySelector('#switcher-branch').value = 'feature/data';
    document.querySelector('.switcher-submit').click();

    await vi.waitFor(() =>
        expect(onChoose).toHaveBeenCalledWith({
            source: 'remote',
            repositoryUrl: second,
            branch: 'feature/data',
        })
    );
});

it('selects a registered local repository, worktree, and branch', async () => {
    const repositoryUrl = 'https://github.com/alpha/backend.git';
    vi.stubGlobal(
        'fetch',
        vi.fn(async (path) => {
            if (path === '/api/local/repositories')
                return response({
                    repositories: [
                        {
                            id: 'base-id',
                            repositoryUrl,
                            path: '/Users/alice/Documents/code/backend',
                            currentBranch: 'develop',
                            linkedWorktree: false,
                            directoryName: 'backend',
                        },
                        {
                            id: 'feature-id',
                            repositoryUrl,
                            path: '/private/tmp/backend-feature',
                            currentBranch: 'feat/local',
                            linkedWorktree: true,
                            directoryName: 'backend-feature',
                        },
                    ],
                });
            if (path === '/api/local/branches?local=feature-id')
                return response({
                    current: 'feat/local',
                    branches: [
                        {
                            name: 'develop',
                            remoteStatus: 'same',
                            ahead: 0,
                            behind: 0,
                            hasWorkingChanges: false,
                        },
                        {
                            name: 'feat/local',
                            remoteStatus: 'unpublished',
                            ahead: 1,
                            behind: 0,
                            hasWorkingChanges: true,
                        },
                    ],
                });
            return response({ current: 'develop', branches: [] });
        })
    );
    const onChoose = vi.fn();
    makeSwitcher({
        getCurrent: () => ({
            repositoryUrl,
            branch: 'feat/local',
            localId: 'feature-id',
            mode: 'worktree',
        }),
        onChoose,
    });

    window.dispatchEvent(new CustomEvent('local-erd-switcher'));
    await vi.waitFor(() =>
        expect(document.querySelector('#switcher-source').value).toBe('local')
    );
    await vi.waitFor(() =>
        expect(document.querySelector('#switcher-local-worktree').value).toBe(
            'feature-id'
        )
    );
    await vi.waitFor(() =>
        expect(document.querySelector('#switcher-branch').value).toBe(
            'feat/local'
        )
    );
    expect(
        document.querySelector('#switcher-local-worktree-trigger').textContent
    ).toContain('이 로컬 복제본의 커밋에서 읽습니다');
    expect(
        document.querySelector('#switcher-local-worktree-trigger').title
    ).toBe('/private/tmp/backend-feature');
    expect(document.querySelector('#switcher-worktree-mode')).toBeNull();

    document.querySelector('.switcher-submit').click();
    await vi.waitFor(() =>
        expect(onChoose).toHaveBeenCalledWith({
            source: 'local',
            repositoryUrl,
            localId: 'feature-id',
            branch: 'feat/local',
            mode: 'commit',
        })
    );
});

it('refreshes remote branches, preserves selection, and explains a deleted branch', async () => {
    const repositoryUrl = 'https://github.com/alpha/backend.git';
    let branches = ['main'];
    const fetch = vi.fn(async (path) =>
        path === '/api/repositories'
            ? response({
                  repositories: [{ name: 'alpha/backend', url: repositoryUrl }],
              })
            : response({
                  branches: path.includes('refresh=1') ? branches : ['main'],
              })
    );
    vi.stubGlobal('fetch', fetch);
    makeSwitcher({
        getCurrent: () => ({ repositoryUrl, branch: 'main' }),
        onChoose: vi.fn(),
    });
    window.dispatchEvent(new CustomEvent('local-erd-switcher'));
    const branch = document.querySelector('#switcher-branch');
    const refresh = document.querySelector('#switcher-branch-refresh');
    await vi.waitFor(() => expect(branch.value).toBe('main'));
    branches = ['main', 'feature/new'];
    refresh.click();
    await vi.waitFor(() =>
        expect([...branch.options].map((item) => item.value)).toContain(
            'feature/new'
        )
    );
    expect(branch.value).toBe('main');
    branches = ['feature/new'];
    refresh.click();
    await vi.waitFor(() => expect(branch.value).toBe('feature/new'));
    expect(document.querySelector('.switcher-status').textContent).toContain(
        'main'
    );
    expect(
        fetch.mock.calls.filter(([path]) => path.includes('refresh=1'))
    ).toHaveLength(2);
});

it('re-reads local branches and retains existing choices when refresh fails', async () => {
    const repositoryUrl = 'https://github.com/alpha/backend.git';
    let branches = ['main'];
    let fail = false;
    const fetch = vi.fn(async (path) =>
        path === '/api/local/repositories'
            ? response({
                  repositories: [
                      {
                          id: 'local-id',
                          repositoryUrl,
                          path: '/repo',
                          currentBranch: 'main',
                      },
                  ],
              })
            : fail
              ? { ok: false, json: async () => ({ error: 'Git unavailable' }) }
              : response({ current: 'main', branches })
    );
    vi.stubGlobal('fetch', fetch);
    makeSwitcher({
        getCurrent: () => ({
            repositoryUrl,
            branch: 'main',
            localId: 'local-id',
        }),
        onChoose: vi.fn(),
    });
    window.dispatchEvent(new CustomEvent('local-erd-switcher'));
    const branch = document.querySelector('#switcher-branch');
    const refresh = document.querySelector('#switcher-branch-refresh');
    await vi.waitFor(() => expect(branch.value).toBe('main'));
    branches = ['main', 'local-new'];
    refresh.click();
    await vi.waitFor(() =>
        expect([...branch.options].map((item) => item.value)).toContain(
            'local-new'
        )
    );
    fail = true;
    refresh.click();
    await vi.waitFor(() =>
        expect(document.querySelector('.switcher-status').textContent).toBe(
            'Git unavailable'
        )
    );
    expect(branch.value).toBe('main');
    expect(
        fetch.mock.calls.filter(([path]) =>
            path.startsWith('/api/local/branches')
        )
    ).toHaveLength(3);
});

it('ignores a late branch response after selecting another repository', async () => {
    const first = 'https://github.com/alpha/first.git';
    const second = 'https://github.com/alpha/second.git';
    let finishFirst;
    vi.stubGlobal(
        'fetch',
        vi.fn((path) => {
            if (path === '/api/repositories')
                return Promise.resolve(
                    response({
                        repositories: [
                            { name: 'alpha/first', url: first },
                            { name: 'alpha/second', url: second },
                        ],
                    })
                );
            if (path.includes(encodeURIComponent(first)))
                return new Promise((resolve) => {
                    finishFirst = resolve;
                });
            return Promise.resolve(response({ branches: ['second-branch'] }));
        })
    );
    makeSwitcher({
        getCurrent: () => ({ repositoryUrl: first, branch: 'main' }),
        onChoose: vi.fn(),
    });
    window.dispatchEvent(new CustomEvent('local-erd-switcher'));
    await vi.waitFor(() => expect(finishFirst).toBeTypeOf('function'));
    const repository = document.querySelector('#switcher-repository');
    repository.value = second;
    repository.dispatchEvent(new Event('change'));
    const branch = document.querySelector('#switcher-branch');
    await vi.waitFor(() => expect(branch.value).toBe('second-branch'));
    finishFirst(response({ branches: ['stale-branch'] }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(branch.value).toBe('second-branch');
});
