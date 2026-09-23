import { createPicker, localCloneChoices } from './picker.js';

const repository = document.querySelector('#repository');
const organization = document.querySelector('#organization');
const search = document.querySelector('#repo-search');
const status = document.querySelector('#repo-status');
const retry = document.querySelector('#retry');
const sourceMode = document.querySelector('#source-mode');
const registration = document.querySelector('#local-registration');
const registrationShell = document.querySelector('#local-registration-shell');
const worktreeField = document.querySelector('#worktree-field');
const worktree = document.querySelector('#worktree');
let loadRequest = 0;
const isLocal = () => sourceMode.value === 'local';
function setSelectionLoading(loading) {
    document.querySelector('#selection-content').hidden = loading;
    document.querySelector('#selection-loading').hidden = !loading;
}
window.addEventListener('local-erd-branches-ready', () =>
    setSelectionLoading(false)
);
function showAccount(user) {
    document.querySelector('#account-name').textContent =
        user?.name || user?.login || '로컬 저장소';
    const login = document.querySelector('#login');
    login.textContent = user ? `@${user.login}` : '';
    login.removeAttribute('href');
    if (user) login.href = user.url;
    const avatar = document.querySelector('#avatar');
    const fallback = document.querySelector('#avatar-fallback');
    avatar.onload = null;
    avatar.style.display = 'none';
    avatar.removeAttribute('src');
    fallback.style.display = 'grid';
    if (!user) return;
    avatar.onload = () => {
        avatar.style.display = 'block';
        fallback.style.display = 'none';
    };
    avatar.onerror = () => {
        avatar.style.display = 'none';
        fallback.style.display = 'grid';
    };
    avatar.src = user.avatarUrl;
}
const value = (r) => r.value ?? r.url;
let repositories = [],
    localRepositories = [],
    snapshots = [],
    primaryUrl = '',
    selected = '',
    busy = false,
    owners = [],
    selectedOwner = '',
    selectedWorktree = '';
const slug = (url) =>
    url.replace('https://github.com/', '').replace(/\.git$/, '');
const compactLocalPath = (value) => {
    const normalized = value
        .replace(/^\/Users\/[^/]+(?=\/|$)/, '~')
        .replace(/^\/home\/[^/]+(?=\/|$)/, '~');
    if (normalized.length <= 56) return normalized;
    const parts = normalized.split('/').filter(Boolean);
    const last = parts.at(-1);
    if (normalized.startsWith('~/')) return `~/…/${last}`;
    if (normalized.startsWith('/')) return `/${parts[0]}/…/${last}`;
    return `${parts[0]}/…/${last}`;
};
const ownerOf = (repo) => repo?.owner?.login ?? repo?.name.split('/')[0] ?? '';
const ownerPicker = createPicker(
    organization,
    'organization-label',
    (value) => {
        const owner = owners.find((o) => o.login === value);
        return (
            owner && {
                ...owner,
                detail:
                    owner.type === 'Organization'
                        ? 'Organization'
                        : '개인 계정',
            }
        );
    }
);
const repoPicker = createPicker(
    repository,
    'repository-label',
    (selectedValue) => repositories.find((r) => value(r) === selectedValue)
);
const worktreePicker = createPicker(
    worktree,
    'worktree-label',
    (selectedValue) => {
        const entry = localRepositories.find((r) => r.id === selectedValue);
        return (
            entry && {
                detail: '이 로컬 복제본의 커밋에서 읽습니다',
                title: entry.path,
            }
        );
    }
);
function refreshControls() {
    organization.disabled = busy || isLocal() || !owners.length;
    repository.disabled = busy || !repositories.length;
    search.disabled = busy || !repositories.length;
    worktree.disabled =
        busy ||
        !isLocal() ||
        !localRepositories.some(
            (r) => r.repositoryUrl.toLowerCase() === selected.toLowerCase()
        );
    ownerPicker.refresh();
    repoPicker.refresh();
    worktreePicker.refresh();
}
function renderOwners() {
    owners = [
        ...new Map(
            repositories.map((r) => {
                const login = ownerOf(r);
                return [
                    login.toLowerCase(),
                    {
                        login,
                        avatarUrl:
                            r.owner?.avatarUrl ??
                            `https://github.com/${encodeURIComponent(login)}.png?size=80`,
                        type: r.owner?.type,
                    },
                ];
            })
        ).values(),
    ].sort(
        (a, b) =>
            Number(b.type === 'Organization') -
                Number(a.type === 'Organization') ||
            a.login.localeCompare(b.login)
    );
    selectedOwner = ownerOf(repositories.find((r) => r.url === selected));
    organization.replaceChildren(
        ...owners.map((owner) => {
            const option = document.createElement('option');
            option.value = owner.login;
            option.textContent = owner.login;
            return option;
        })
    );
    organization.value = selectedOwner;
    ownerPicker.refresh();
}
async function json(url) {
    const response = await fetch(url, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) {
        const error = new Error(
            payload.error || '로컬 서버 연결을 확인하세요.'
        );
        error.code = payload.code;
        throw error;
    }
    return payload;
}
function renderRepositories({ openResults = false } = {}) {
    const query = search.value.trim().toLowerCase();
    const matches = repositories.filter(
        (r) =>
            (isLocal() ||
                ownerOf(r).toLowerCase() === selectedOwner.toLowerCase()) &&
            r.name.toLowerCase().includes(query)
    );
    repository.replaceChildren(
        ...matches.map((r) => {
            const option = document.createElement('option');
            option.value = value(r);
            option.textContent = isLocal()
                ? r.name
                : r.name.split('/').slice(1).join('/');
            return option;
        })
    );
    repository.value = selected;
    repoPicker.refresh({
        open: openResults,
        emptyLabel: query
            ? matches.length
                ? `${matches.length}개 검색 결과`
                : '검색 결과가 없습니다'
            : undefined,
    });
}
function renderWorktrees() {
    const matches = localCloneChoices(
        localRepositories.filter(
            (r) => r.repositoryUrl.toLowerCase() === selected.toLowerCase()
        ),
        selectedWorktree || localStorage.getItem('local-erd-selected-local')
    );
    worktreeField.hidden = !isLocal() || matches.length <= 1;
    if (!matches.some((r) => r.id === selectedWorktree)) {
        const preferred = localStorage.getItem('local-erd-selected-local');
        selectedWorktree = matches.some((r) => r.id === preferred)
            ? preferred
            : (matches[0]?.id ?? '');
    }
    worktree.replaceChildren(
        ...matches.map((entry) => {
            const option = document.createElement('option');
            option.value = entry.id;
            option.textContent = compactLocalPath(entry.path);
            return option;
        })
    );
    worktree.value = selectedWorktree;
    worktreePicker.refresh();
}
function choose(refreshBranches = false) {
    selected = repository.value;
    if (isLocal()) renderWorktrees();
    repoPicker.refresh();
    localStorage.setItem(
        isLocal()
            ? 'local-erd-selected-local-repository'
            : 'local-erd-selected-repository',
        selected
    );
    if (isLocal() && selectedWorktree)
        localStorage.setItem('local-erd-selected-local', selectedWorktree);
    status.textContent = '';
    document.querySelector('#saved-link').href =
        `/saved?org=${encodeURIComponent(selectedOwner)}&repo=${encodeURIComponent(selected)}`;
    window.dispatchEvent(
        new CustomEvent('local-erd-repository', {
            detail: {
                repositoryUrl:
                    (isLocal()
                        ? localRepositories.find(
                              (r) => r.id === selectedWorktree
                          )?.repositoryUrl
                        : repositories.find((r) => value(r) === selected)
                              ?.url) ?? selected,
                primaryUrl,
                localId: isLocal() ? selectedWorktree : '',
                refreshBranches,
            },
        })
    );
}
async function load(refresh = false) {
    const request = ++loadRequest;
    setSelectionLoading(isLocal());
    registrationShell.hidden = !isLocal();
    worktreeField.hidden = !isLocal();
    document.querySelector('#organization-label').hidden = isLocal();
    document.querySelector('.organization-picker').hidden = isLocal();
    document.querySelector('#repository-label').textContent = isLocal()
        ? '로컬 Git 저장소'
        : '적용할 GitHub 레포';
    search.placeholder = isLocal()
        ? '로컬 저장소 이름으로 검색'
        : '레포 이름으로 검색';
    const cacheQuery = refresh ? '?refresh=1' : '';
    retry.disabled = true;
    search.disabled = true;
    repository.disabled = true;
    organization.disabled = true;
    ownerPicker.refresh();
    repoPicker.refresh();
    const controls = document.querySelector('#sync-controls');
    const guide = document.querySelector('#auth-guide');
    controls.hidden = true;
    window.dispatchEvent(new CustomEvent('local-erd-auth', { detail: false }));
    status.textContent = 'GitHub 인증을 확인하는 중…';
    const localDescription = document.querySelector('#local-description');
    localDescription.textContent = isLocal()
        ? 'GitHub 로그인 없이도 로컬 선언 스키마·마이그레이션을 조회할 수 있습니다.'
        : '';
    localDescription.hidden = !isLocal();
    try {
        if (isLocal()) {
            guide.hidden = true;
            // Account lookup is optional: authentication must never block local use.
            void json(`/api/account${cacheQuery}`)
                .then((user) => {
                    if (request === loadRequest)
                        showAccount(user?.login ? user : null);
                })
                .catch(() => {
                    if (request === loadRequest) showAccount(null);
                });
            const [repos, data] = await Promise.all([
                json('/api/local/repositories'),
                json('/data/snapshots.json'),
            ]);
            if (request !== loadRequest) return;
            primaryUrl = repos.primaryUrl;
            snapshots = data.snapshots;
            localRepositories = repos.repositories;
            repositories = [
                ...new Map(
                    localRepositories.map((r) => [
                        r.repositoryUrl.toLowerCase(),
                        {
                            url: r.repositoryUrl,
                            value: r.repositoryUrl,
                            name: slug(r.repositoryUrl),
                        },
                    ])
                ).values(),
            ];
            selectedWorktree =
                selectedWorktree ||
                localStorage.getItem('local-erd-selected-local') ||
                '';
            const preferredEntry = localRepositories.find(
                (r) => r.id === selectedWorktree
            );
            const preferred =
                selected ||
                localStorage.getItem('local-erd-selected-local-repository') ||
                preferredEntry?.repositoryUrl;
            selected = repositories.some((r) => value(r) === preferred)
                ? preferred
                : value(repositories[0] ?? { url: '' });
            renderRepositories();
            renderWorktrees();
            retry.textContent = '로컬 목록 새로고침';
            if (selected) {
                controls.hidden = false;
                choose();
                refreshControls();
            } else {
                status.textContent = '위에서 로컬 저장소를 등록하세요.';
                setSelectionLoading(false);
            }
            return;
        }
        // Check authentication first; don't request all repositories when signed out.
        const user = await json(`/api/account${cacheQuery}`);
        if (request !== loadRequest) return;
        guide.hidden = true;
        retry.textContent = '계정·레포·선택 브랜치 새로고침';
        showAccount(user);
        status.textContent = 'GitHub 레포를 불러오는 중…';
        const [repos, data] = await Promise.all([
            json(`/api/repositories${cacheQuery}`),
            json('/data/snapshots.json'),
        ]);
        if (request !== loadRequest) return;
        primaryUrl = repos.primaryUrl;
        snapshots = data.snapshots;
        repositories = repos.repositories.map((r) => ({
            ...r,
            url: r.url.toLowerCase(),
        }));
        localRepositories = [];
        selectedWorktree = '';
        for (const url of new Set(
            [
                primaryUrl,
                ...snapshots.map((s) => s.repositoryUrl ?? primaryUrl),
            ].filter((url) => typeof url === 'string' && url)
        )) {
            if (!repositories.some((r) => r.url === url))
                repositories.push({ url, name: slug(url) });
        }
        const preferred =
            selected || localStorage.getItem('local-erd-selected-repository');
        selected = repositories.some((r) => r.url === preferred)
            ? preferred
            : repositories.some((r) => r.url === primaryUrl)
              ? primaryUrl
              : (repositories[0]?.url ?? '');
        renderOwners();
        renderRepositories();
        controls.hidden = false;
        choose(refresh);
        refreshControls();
    } catch (error) {
        if (request !== loadRequest) return;
        const needsLogin = ['AUTH_REQUIRED', 'CLI_MISSING'].includes(
            error.code
        );
        guide.hidden = !needsLogin;
        if (needsLogin) {
            document.querySelector('#auth-description').textContent =
                error.code === 'CLI_MISSING'
                    ? 'GitHub CLI(gh)를 먼저 설치한 뒤, KeepERD 서버를 실행한 컴퓨터의 터미널에서 아래 명령으로 로그인하세요.'
                    : 'KeepERD 서버를 실행한 컴퓨터의 터미널에서 아래 명령을 실행하세요. 브라우저의 GitHub 로그인과는 별개입니다.';
        }
        document.querySelector('#account-name').textContent = needsLogin
            ? 'GitHub 로그인이 필요합니다'
            : isLocal()
              ? '로컬 저장소 연결을 확인하세요'
              : 'GitHub 연결을 확인하세요';
        document.querySelector('#login').textContent = '';
        document.querySelector('#login').removeAttribute('href');
        const avatar = document.querySelector('#avatar');
        avatar.onload = null;
        avatar.style.display = 'none';
        avatar.removeAttribute('src');
        document.querySelector('#avatar-fallback').style.display = 'grid';
        repositories = [];
        localRepositories = [];
        selectedWorktree = '';
        owners = [];
        organization.replaceChildren();
        ownerPicker.refresh();
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = needsLogin
            ? '로그인 후 레포를 선택하세요'
            : '레포를 불러오지 못했습니다';
        repository.replaceChildren(placeholder);
        repoPicker.refresh();
        worktree.replaceChildren();
        worktreePicker.refresh();
        document.querySelector('#saved-link').href = '/saved';
        status.textContent = error.message;
        setSelectionLoading(false);
        retry.textContent = needsLogin ? '로그인 다시 확인' : '다시 시도';
    } finally {
        if (request === loadRequest) retry.disabled = busy;
    }
}
repository.onchange = choose;
worktree.onchange = () => {
    selectedWorktree = worktree.value;
    choose();
};
sourceMode.onchange = () => {
    selected = '';
    selectedWorktree = '';
    localStorage.setItem('local-erd-source-mode', sourceMode.value);
    load();
};
const folderButton = document.querySelector('#choose-local-folder');
folderButton.onclick = async () => {
    folderButton.disabled = true;
    folderButton.textContent = '폴더 선택 창에서 선택해 주세요…';
    status.textContent = '';
    try {
        const result = await fetch('/api/local/folder', {
            method: 'POST',
            headers: { 'X-Local-ERD': 'sync' },
        });
        const payload = await result.json();
        if (!result.ok)
            throw new Error(payload.error || '폴더 선택 창을 열지 못했습니다.');
        if (payload.cancelled) return;
        document.querySelector('#local-path').value = payload.path;
        registration.requestSubmit();
    } catch (error) {
        status.textContent = error.message;
    } finally {
        folderButton.disabled = false;
        folderButton.textContent = '폴더 선택…';
    }
};
registration.onsubmit = async (event) => {
    event.preventDefault();
    const button = document.querySelector('#register-local');
    button.disabled = true;
    try {
        const response = await fetch('/api/local/repositories', {
            method: 'POST',
            headers: {
                'X-Local-ERD': 'sync',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path: document.querySelector('#local-path').value.trim(),
            }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        const added = payload.repositories?.at(-1);
        if (added) {
            selected = added.repositoryUrl;
            selectedWorktree = added.id;
        }
        document.querySelector('#local-path').value = '';
        registrationShell.open = false;
        await load();
    } catch (error) {
        status.textContent = error.message;
    } finally {
        button.disabled = busy;
    }
};
organization.onchange = () => {
    selectedOwner = organization.value;
    const current = repositories.find((r) => r.url === selected);
    selected =
        current &&
        ownerOf(current).toLowerCase() === selectedOwner.toLowerCase()
            ? selected
            : (repositories.find(
                  (r) =>
                      ownerOf(r).toLowerCase() === selectedOwner.toLowerCase()
              )?.url ?? '');
    search.value = '';
    ownerPicker.refresh();
    renderRepositories();
    choose();
};
search.oninput = () => renderRepositories({ openResults: true });
retry.onclick = () => load(true);
window.addEventListener('local-erd-busy', (event) => {
    busy = event.detail;
    refreshControls();
    retry.disabled = busy;
    sourceMode.disabled = busy;
    document.querySelector('#register-local').disabled = busy;
});
sourceMode.value =
    localStorage.getItem('local-erd-source-mode') === 'local'
        ? 'local'
        : 'remote';
load(false);
