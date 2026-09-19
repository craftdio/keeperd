import { afterEach, expect, it, vi } from 'vitest';
import { createRepositorySwitcher } from './repository-switcher.js';

const response = (payload) => ({
    ok: true,
    json: async () => payload,
});

afterEach(() => {
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
    createRepositorySwitcher({
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
    createRepositorySwitcher({
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
