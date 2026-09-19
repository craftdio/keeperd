import { createPicker, localCloneChoices } from './picker.js';
import { canonicalRepository } from './schema-diff.js';

const ownerOf = (repository) =>
    repository?.owner?.login ?? repository?.name?.split('/')[0] ?? '';
const slug = (url) =>
    url.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
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
const remoteLabel = (branch) =>
    branch.remoteStatus === 'unpublished'
        ? '원격에 없음'
        : branch.remoteStatus === 'ahead'
          ? `미푸시 커밋 ${branch.ahead}개`
          : branch.remoteStatus === 'same'
            ? '원격과 동일'
            : branch.remoteStatus === 'behind'
              ? `원격보다 ${branch.behind}개 뒤처짐`
              : branch.remoteStatus === 'diverged'
                ? '원격과 분기됨'
                : '확인 불가';
const localBranchLabel = (branch) =>
    [
        branch.name,
        remoteLabel(branch),
        branch.hasWorkingChanges ? '작업 중 변경 있음' : '',
    ]
        .filter(Boolean)
        .join(' · ');

async function json(url) {
    const response = await fetch(url, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok)
        throw new Error(payload.error || '저장소 정보를 불러오지 못했습니다.');
    return payload;
}

export function createRepositorySwitcher({ getCurrent, onChoose }) {
    const style = document.createElement('style');
    style.textContent = `#erd-repository-panel{position:fixed;inset:0;z-index:100003;display:grid;place-items:center;padding:24px;background:#070d18d9;font:14px system-ui;color:#e2e8f0;backdrop-filter:blur(5px)}#erd-repository-panel[hidden],#erd-repository-panel [hidden]{display:none!important}#erd-repository-panel section{box-sizing:border-box;width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow:visible;padding:24px;border:1px solid #334155;border-radius:16px;background:#111c30;box-shadow:0 24px 80px #0009}#erd-repository-panel header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}#erd-repository-panel h2{margin:0;font-size:19px}#erd-repository-panel header p{margin:6px 0 0;color:#94a3b8;font-size:12px}#erd-repository-panel label{display:block;margin:14px 0 8px;font-weight:650}#erd-repository-panel input,#erd-repository-panel select{box-sizing:border-box;width:100%;padding:11px 12px;border:1px solid #364152;border-radius:9px;background:#0b1425;color:#e2e8f0;font:14px system-ui}#erd-repository-panel input{margin-bottom:8px}#erd-repository-panel .picker{position:relative;margin-bottom:8px}#erd-repository-panel .picker-trigger{display:flex;align-items:center;gap:12px;width:100%;min-height:54px;padding:9px 12px;border:1px solid #364152;border-radius:10px;background:#0b1425;color:#e2e8f0;font:14px system-ui;text-align:left;cursor:pointer}#erd-repository-panel .picker-trigger:hover:not(:disabled),#erd-repository-panel .picker-trigger[aria-expanded=true]{border-color:#818cf8;background:#121d33}#erd-repository-panel .picker-trigger:disabled{opacity:.55;cursor:not-allowed}#erd-repository-panel .picker-trigger>svg{width:16px;height:16px;flex:none;color:#94a3b8}#erd-repository-panel .picker-row{display:flex;align-items:center;gap:12px;flex:1;min-width:0}#erd-repository-panel .picker-text{flex:1;min-width:0;overflow-wrap:anywhere}#erd-repository-panel .picker-text small{display:block;margin-top:2px;color:#94a3b8;font-size:11px}#erd-repository-panel .owner-avatar{width:34px;height:34px;border-radius:9px;object-fit:cover;flex:none;background:#25314b}#erd-repository-panel .owner-avatar-fallback{display:grid;place-items:center;color:#c7d2fe;font-weight:600}#erd-repository-panel .repo-lock{display:flex;margin-left:auto;color:#94a3b8}#erd-repository-panel .repo-lock svg{width:16px;height:16px}#erd-repository-panel .picker-list{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:2;max-height:250px;overflow-y:auto;padding:6px;border:1px solid #475569;border-radius:12px;background:#111c30;box-shadow:0 18px 44px #0009}#erd-repository-panel .picker-list [role=option]{display:flex;align-items:center;min-height:30px;padding:10px;border-radius:7px;cursor:pointer}#erd-repository-panel .picker-list [role=option]:hover,#erd-repository-panel .picker-list [role=option].active{background:#263453}#erd-repository-panel .picker-list [aria-selected=true]{color:#c7d2fe;background:#222944}#erd-repository-panel .switcher-owner-picker .picker-trigger{min-height:64px}#erd-repository-panel .switcher-owner-picker .picker-list [role=option]{box-sizing:border-box;min-height:60px;padding:8px 10px}#erd-repository-panel .switcher-owner-picker .picker-row{gap:12px}#erd-repository-panel .switcher-owner-picker .owner-avatar{box-sizing:border-box;width:44px;height:44px;border:2px solid #334155;border-radius:11px;object-fit:cover;background:#fff}#erd-repository-panel .switcher-owner-picker .picker-text{font-size:15px}#erd-repository-panel .switcher-worktree-mode{display:flex;align-items:center;gap:7px;margin:10px 0 0;font-weight:500}#erd-repository-panel .switcher-worktree-mode input{width:auto;margin:0;accent-color:#818cf8}#erd-repository-panel .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}#erd-repository-panel .switcher-close{flex:none;border:0;background:transparent;color:#94a3b8;font-size:24px;line-height:1;cursor:pointer}#erd-repository-panel .switcher-status{display:block;min-height:18px;margin:10px 0;color:#cbd5e1;font-size:12px}#erd-repository-panel footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}#erd-repository-panel footer button{padding:10px 15px;border:1px solid #475569;border-radius:9px;background:#172131;color:#e2e8f0;font:inherit;cursor:pointer}#erd-repository-panel footer .switcher-submit{border-color:#6366f1;background:#4f46e5;color:white;font-weight:650}#erd-repository-panel footer button:disabled{opacity:.55;cursor:not-allowed}`;
    document.head.append(style);

    const panel = document.createElement('div');
    panel.id = 'erd-repository-panel';
    panel.hidden = true;
    panel.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="erd-repository-title"><header><div><h2 id="erd-repository-title">ERD 이동</h2><p>원격 또는 로컬 Git을 선택하고 원하는 브랜치로 Sync합니다.</p></div><button class="switcher-close" type="button" aria-label="닫기">×</button></header><label for="switcher-source">ERD 입력 출처</label><select id="switcher-source"><option value="remote">GitHub 원격</option><option value="local">로컬 Git</option></select><div id="switcher-remote-fields"><label id="switcher-owner-label" for="switcher-owner">GitHub 조직 / 계정</label><select id="switcher-owner"></select><label id="switcher-repository-label" for="switcher-repository">GitHub 레포</label><input id="switcher-search" type="search" placeholder="레포 이름으로 검색" autocomplete="off"><select id="switcher-repository"></select></div><div id="switcher-local-fields" hidden><label id="switcher-local-repository-label" for="switcher-local-repository">로컬 레포</label><select id="switcher-local-repository"></select><label id="switcher-local-worktree-label" for="switcher-local-worktree">사용할 로컬 복제본</label><select id="switcher-local-worktree"></select></div><label for="switcher-branch">브랜치</label><select id="switcher-branch"></select><small class="switcher-status" role="status"></small><footer><button class="switcher-cancel" type="button">취소</button><button class="switcher-submit" type="button">Sync하고 ERD 열기</button></footer></section>`;
    document.body.append(panel);

    const section = panel.querySelector('section');
    const source = panel.querySelector('#switcher-source');
    const remoteFields = panel.querySelector('#switcher-remote-fields');
    const localFields = panel.querySelector('#switcher-local-fields');
    const owner = panel.querySelector('#switcher-owner');
    const repository = panel.querySelector('#switcher-repository');
    const branch = panel.querySelector('#switcher-branch');
    const search = panel.querySelector('#switcher-search');
    const localRepository = panel.querySelector('#switcher-local-repository');
    const localWorktree = panel.querySelector('#switcher-local-worktree');

    const status = panel.querySelector('.switcher-status');
    const submit = panel.querySelector('.switcher-submit');
    let repositories = [];
    let owners = [];
    let localRepositories = [];
    let localRepositoryOptions = [];
    let selectedOwner = '';
    let selectedRepository = '';
    let selectedLocalRepository = '';
    let selectedLocalId = '';
    let currentLocalBranch = '';
    let request = 0;

    const ownerPicker = createPicker(owner, 'switcher-owner-label', (value) => {
        const item = owners.find((candidate) => candidate.login === value);
        return (
            item && {
                ...item,
                detail:
                    item.type === 'Organization' ? 'Organization' : '개인 계정',
            }
        );
    });
    const repositoryPicker = createPicker(
        repository,
        'switcher-repository-label',
        (value) => repositories.find((candidate) => candidate.url === value)
    );
    const localRepositoryPicker = createPicker(
        localRepository,
        'switcher-local-repository-label',
        (value) => {
            const item = localRepositoryOptions.find(
                (candidate) => candidate.url === value
            );
            const count = localRepositories.filter(
                (candidate) =>
                    canonicalRepository(candidate.repositoryUrl) ===
                    canonicalRepository(value)
            ).length;
            return item && { detail: `등록된 worktree ${count}개` };
        }
    );
    const localWorktreePicker = createPicker(
        localWorktree,
        'switcher-local-worktree-label',
        (value) => {
            const item = localRepositories.find(
                (candidate) => candidate.id === value
            );
            return (
                item && {
                    detail: '이 로컬 복제본의 커밋에서 읽습니다',
                    title: item.path,
                }
            );
        }
    );

    const localEntry = () =>
        localRepositories.find((candidate) => candidate.id === selectedLocalId);

    function setBusy(busy) {
        const local = source.value === 'local';
        source.disabled = busy;
        owner.disabled = busy || local || !owners.length;
        repository.disabled = busy || local || !repositories.length;
        branch.disabled = busy || !branch.options.length;
        search.disabled = busy || local || !repositories.length;
        localRepository.disabled =
            busy || !local || !localRepositoryOptions.length;
        localWorktree.disabled = busy || !local || !localRepositories.length;
        submit.disabled = busy || !branch.value;
        ownerPicker.refresh();
        repositoryPicker.refresh();
        localRepositoryPicker.refresh();
        localWorktreePicker.refresh();
    }

    function renderRepositories({ open = false } = {}) {
        const query = search.value.trim().toLowerCase();
        const matches = repositories.filter(
            (item) =>
                ownerOf(item).toLowerCase() === selectedOwner.toLowerCase() &&
                item.name
                    .split('/')
                    .slice(1)
                    .join('/')
                    .toLowerCase()
                    .includes(query)
        );
        if (!matches.some((item) => item.url === selectedRepository))
            selectedRepository = matches[0]?.url ?? '';
        repository.replaceChildren(
            ...matches.map((item) => {
                const option = document.createElement('option');
                option.value = item.url;
                option.textContent = item.name.split('/').slice(1).join('/');
                return option;
            })
        );
        repository.value = selectedRepository;
        repositoryPicker.refresh({
            open,
            emptyLabel: query ? '검색 결과가 없습니다' : undefined,
        });
    }

    function renderLocalRepositories() {
        localRepositoryOptions = [
            ...new Map(
                localRepositories.map((item) => [
                    canonicalRepository(item.repositoryUrl),
                    {
                        url: item.repositoryUrl,
                        name: slug(item.repositoryUrl),
                    },
                ])
            ).values(),
        ].sort((a, b) => a.name.localeCompare(b.name));
        if (
            !localRepositoryOptions.some(
                (item) =>
                    canonicalRepository(item.url) ===
                    canonicalRepository(selectedLocalRepository)
            )
        )
            selectedLocalRepository = localRepositoryOptions[0]?.url ?? '';
        localRepository.replaceChildren(
            ...localRepositoryOptions.map((item) => {
                const option = document.createElement('option');
                option.value = item.url;
                option.textContent = item.name;
                return option;
            })
        );
        localRepository.value = selectedLocalRepository;
        localRepositoryPicker.refresh();
        renderLocalWorktrees();
    }

    function renderLocalWorktrees() {
        const matches = localCloneChoices(
            localRepositories.filter(
                (item) =>
                    canonicalRepository(item.repositoryUrl) ===
                    canonicalRepository(selectedLocalRepository)
            ),
            selectedLocalId
        );
        localWorktreePicker.element.hidden = matches.length <= 1;
        panel.querySelector('#switcher-local-worktree-label').hidden =
            matches.length <= 1;
        if (!matches.some((item) => item.id === selectedLocalId))
            selectedLocalId = matches[0]?.id ?? '';
        localWorktree.replaceChildren(
            ...matches.map((item) => {
                const option = document.createElement('option');
                option.value = item.id;
                option.textContent = compactLocalPath(item.path);
                return option;
            })
        );
        localWorktree.value = selectedLocalId;
        localWorktreePicker.refresh();
    }

    async function loadBranches(preferredBranch) {
        const currentRequest = ++request;
        const local = source.value === 'local';
        branch.replaceChildren();
        currentLocalBranch = '';
        status.textContent = local
            ? selectedLocalId
                ? '로컬 브랜치를 불러오는 중…'
                : 'worktree를 선택하세요.'
            : selectedRepository
              ? 'GitHub 브랜치를 불러오는 중…'
              : '레포를 선택하세요.';
        setBusy(true);
        const target = local ? selectedLocalId : selectedRepository;
        if (!target) {
            setBusy(false);
            return;
        }
        try {
            const payload = await json(
                local
                    ? `/api/local/branches?local=${encodeURIComponent(selectedLocalId)}`
                    : `/api/branches?repository=${encodeURIComponent(selectedRepository)}`
            );
            if (currentRequest !== request) return;
            currentLocalBranch = local ? (payload.current ?? '') : '';
            const localBranches = local
                ? payload.branches.map((item) =>
                      typeof item === 'string'
                          ? {
                                name: item,
                                remoteStatus: 'unconfirmed',
                                hasWorkingChanges: false,
                            }
                          : item
                  )
                : [];
            const names = local
                ? localBranches.map((item) => item.name)
                : payload.branches;
            branch.replaceChildren(
                ...(local ? localBranches : payload.branches).map((item) => {
                    const option = document.createElement('option');
                    option.value = local ? item.name : item;
                    option.textContent = local ? localBranchLabel(item) : item;
                    return option;
                })
            );
            branch.value = names.includes(preferredBranch)
                ? preferredBranch
                : names.includes(currentLocalBranch)
                  ? currentLocalBranch
                  : names.includes('develop')
                    ? 'develop'
                    : names.includes('main')
                      ? 'main'
                      : (names[0] ?? '');
            status.textContent = branch.value
                ? ''
                : '이 저장소에 브랜치가 없습니다.';
        } catch (error) {
            if (currentRequest !== request) return;
            status.textContent = error.message;
        } finally {
            if (currentRequest === request) setBusy(false);
        }
    }

    async function loadRemote(current) {
        status.textContent = 'GitHub 조직과 레포를 불러오는 중…';
        const payload = await json('/api/repositories');
        repositories = payload.repositories.map((item) => ({
            ...item,
            url: item.url.toLowerCase(),
        }));
        const currentUrl = canonicalRepository(current.repositoryUrl);
        selectedRepository =
            repositories.find(
                (item) => canonicalRepository(item.url) === currentUrl
            )?.url ??
            repositories[0]?.url ??
            '';
        owners = [
            ...new Map(
                repositories.map((item) => {
                    const login = ownerOf(item);
                    return [
                        login.toLowerCase(),
                        {
                            login,
                            avatarUrl:
                                item.owner?.avatarUrl ??
                                `https://github.com/${encodeURIComponent(login)}.png?size=80`,
                            type: item.owner?.type,
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
        selectedOwner = ownerOf(
            repositories.find((item) => item.url === selectedRepository)
        );
        owner.replaceChildren(
            ...owners.map((item) => {
                const option = document.createElement('option');
                option.value = item.login;
                option.textContent = item.login;
                return option;
            })
        );
        owner.value = selectedOwner;
        ownerPicker.refresh();
        renderRepositories();
        await loadBranches(
            canonicalRepository(selectedRepository) === currentUrl
                ? current.branch
                : undefined
        );
    }

    async function loadLocal(current) {
        status.textContent = '등록된 로컬 저장소를 불러오는 중…';
        const payload = await json('/api/local/repositories');
        localRepositories = payload.repositories;
        if (!localRepositories.length)
            throw new Error(
                '등록된 로컬 저장소가 없습니다. 메인 화면에서 먼저 등록하세요.'
            );
        const preferredId =
            current.localId ??
            localStorage.getItem('local-erd-selected-local') ??
            '';
        const preferred =
            localRepositories.find((item) => item.id === preferredId) ??
            localRepositories.find(
                (item) =>
                    canonicalRepository(item.repositoryUrl) ===
                    canonicalRepository(current.repositoryUrl)
            ) ??
            localRepositories[0];
        selectedLocalId = preferred.id;
        selectedLocalRepository = preferred.repositoryUrl;
        renderLocalRepositories();
        await loadBranches(current.branch, current.mode);
    }

    async function loadSource(current = getCurrent()) {
        const local = source.value === 'local';
        remoteFields.hidden = local;
        localFields.hidden = !local;
        branch.replaceChildren();
        setBusy(true);
        try {
            if (local) await loadLocal(current);
            else await loadRemote(current);
        } catch (error) {
            status.textContent = error.message;
            setBusy(false);
        }
    }

    async function open() {
        const current = getCurrent();
        panel.hidden = false;
        section.tabIndex = -1;
        section.focus();
        search.value = '';
        source.value = current.localId ? 'local' : 'remote';
        await loadSource(current);
    }

    function close() {
        panel.hidden = true;
    }

    source.onchange = () => loadSource();
    owner.onchange = () => {
        selectedOwner = owner.value;
        selectedRepository = '';
        search.value = '';
        ownerPicker.refresh();
        renderRepositories();
        loadBranches();
    };
    repository.onchange = () => {
        selectedRepository = repository.value;
        repositoryPicker.refresh();
        loadBranches();
    };
    search.oninput = () => {
        const before = selectedRepository;
        renderRepositories({ open: true });
        if (before !== selectedRepository) loadBranches();
    };
    localRepository.onchange = () => {
        selectedLocalRepository = localRepository.value;
        selectedLocalId = '';
        localRepositoryPicker.refresh();
        renderLocalWorktrees();
        loadBranches();
    };
    localWorktree.onchange = () => {
        selectedLocalId = localWorktree.value;
        localWorktreePicker.refresh();
        loadBranches();
    };
    branch.onchange = () => setBusy(false);
    panel.querySelector('.switcher-close').onclick = close;
    panel.querySelector('.switcher-cancel').onclick = close;
    panel.onmousedown = (event) => {
        if (event.target === panel) close();
    };
    panel.onkeydown = (event) => {
        if (event.key === 'Escape') close();
    };
    submit.onclick = async () => {
        setBusy(true);
        status.textContent = '선택한 브랜치로 이동을 준비하는 중…';
        try {
            const local = source.value === 'local';
            const selection = local
                ? {
                      source: 'local',
                      repositoryUrl: localEntry().repositoryUrl,
                      localId: selectedLocalId,
                      branch: branch.value,
                      mode: 'commit',
                  }
                : {
                      source: 'remote',
                      repositoryUrl: selectedRepository,
                      branch: branch.value,
                  };
            localStorage.setItem(
                local
                    ? 'local-erd-selected-local'
                    : 'local-erd-selected-repository',
                local ? selectedLocalId : selectedRepository
            );
            close();
            await onChoose(selection);
        } catch (error) {
            panel.hidden = false;
            status.textContent = error.message;
            setBusy(false);
        }
    };

    window.addEventListener('local-erd-switcher', open);
    return { open, close };
}
