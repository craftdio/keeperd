import { browserDiagrams, deleteBrowserDiagrams } from './browser-store.js';
const element = (id) => document.getElementById(id);
const org = element('org-filter'),
    repo = element('repo-filter'),
    branch = element('branch-filter');
const cards = element('cards'),
    status = element('status'),
    remove = element('delete'),
    all = element('select-all');
const dialog = element('delete-dialog'),
    page = document.querySelector('main'),
    dialogSummary = element('delete-summary'),
    dialogTargets = element('delete-targets'),
    dialogCancel = element('delete-cancel'),
    dialogConfirm = element('delete-confirm');
let items = [],
    selected = new Set(),
    busy = false,
    deleting = false,
    browserAvailable = false,
    pendingTargets = [];
const params = new URLSearchParams(location.search);
org.value = params.get('org') ?? '';
branch.value = params.get('branch') ?? '';
const initialOrg = params.get('org') ?? '',
    initialRepo = params.get('repo') ?? '';
let initialized = false;
export const formatBytes = (bytes) =>
    bytes >= 1048576
        ? `${(bytes / 1048576).toFixed(1)} MB`
        : bytes >= 1024
          ? `${(bytes / 1024).toFixed(1)} KB`
          : `${bytes} B`;
function setStatus(message, tone = '') {
    status.textContent = message;
    status.classList.toggle('error', tone === 'error');
    status.classList.toggle('success', tone === 'success');
}
function sourceOf(item) {
    try {
        const u = new URL(item.repositoryUrl);
        const parts = u.pathname
            .replace(/\.git$/, '')
            .split('/')
            .filter(Boolean);
        return {
            org: parts[0] ?? '출처 미상',
            repo: item.repositoryUrl,
            label: parts.join('/'),
        };
    } catch {
        return {
            org: '출처 미상',
            repo: 'unknown',
            label: '수동 ERD / 출처 미상',
        };
    }
}
function options(select, values, title) {
    const previous = select.value;
    const first = document.createElement('option');
    first.value = '';
    first.textContent = title;
    select.replaceChildren(
        first,
        ...values.map(([value, label]) => {
            const o = document.createElement('option');
            o.value = value;
            o.textContent = label;
            return o;
        })
    );
    select.value = values.some(([v]) => v === previous) ? previous : '';
}
function filterRepos() {
    options(
        repo,
        [
            ...new Map(
                items
                    .filter((i) => !org.value || i.org === org.value)
                    .map((i) => [i.repo, i.label])
            ).entries(),
        ].sort((a, b) => a[1].localeCompare(b[1])),
        '전체 레포'
    );
}
function visible() {
    const query = branch.value.trim().toLowerCase();
    return items.filter(
        (i) =>
            (!org.value || i.org === org.value) &&
            (!repo.value || i.repo === repo.value) &&
            (i.branch ?? '브랜치 미상').toLowerCase().includes(query)
    );
}
function controls() {
    const shown = visible();
    all.checked = shown.length > 0 && shown.every((i) => selected.has(i.id));
    all.indeterminate = shown.some((i) => selected.has(i.id)) && !all.checked;
    all.disabled = busy || !browserAvailable || !shown.length;
    remove.disabled =
        busy || !browserAvailable || !selected.size || selected.size > 100;
    remove.classList.toggle('loading', deleting);
    remove.setAttribute('aria-busy', deleting ? 'true' : 'false');
    remove.textContent = deleting
        ? '삭제 중…'
        : `선택 삭제 (${selected.size}${selected.size > 100 ? ' / 최대 100개' : ''})`;
    for (const node of [org, repo, branch, element('refresh')])
        node.disabled = busy;
}
function render(updateStatus = true) {
    const shown = visible();
    cards.replaceChildren(
        ...shown.map((item) => {
            const article = document.createElement('article');
            const row = document.createElement('label');
            row.className = 'select-row';
            const check = document.createElement('input');
            check.type = 'checkbox';
            check.checked = selected.has(item.id);
            check.disabled = busy || !browserAvailable;
            check.setAttribute(
                'aria-label',
                `${item.label} · ${item.branch ?? item.name} 선택`
            );
            check.onchange = () => {
                if (check.checked) selected.add(item.id);
                else selected.delete(item.id);
                controls();
            };
            const owner = document.createElement('span');
            owner.className = 'card-owner';
            owner.textContent = item.label;
            row.append(check, owner);
            const title = document.createElement('h2');
            title.textContent = item.branch ?? item.name ?? '브랜치 미상';
            const tags = document.createElement('div');
            for (const text of [
                item.server ? 'Sync 결과 스키마 파일' : null,
                item.browser ? '이 브라우저의 작업 데이터' : null,
                item.source?.kind === 'local'
                    ? `로컬 ${item.source.mode === 'worktree' ? '작업 중' : '커밋'}`
                    : null,
                item.schemaSource
                    ? `${item.schemaSource.label} · ${item.schemaSource.files}개`
                    : null,
            ].filter(Boolean)) {
                const tag = document.createElement('span');
                tag.className = 'tag';
                tag.textContent = text;
                tags.append(tag);
            }
            const meta = document.createElement('p');
            meta.className = 'meta';
            meta.textContent = `${item.tables ?? 0} tables · Sync 결과 ${formatBytes(item.serverBytes)} · 브라우저 작업 약 ${formatBytes(item.browserBytes)}${item.revision ? ` · ${item.revision.slice(0, 12)}` : ''}`;
            const links = document.createElement('div');
            links.className = 'card-links';
            const open = document.createElement('a');
            open.className = 'button open';
            open.href = `/diagrams/${encodeURIComponent(item.id)}`;
            open.textContent = 'ERD 열기 →';
            links.append(open);
            if (item.server) {
                const download = document.createElement('a');
                download.href = `/data/${encodeURIComponent(item.id.slice(6))}.chartdb.json`;
                download.download = '';
                download.textContent =
                    '이 브랜치에서 마지막으로 Sync한 스키마 JSON';
                links.append(download);
            }
            article.append(row, title, tags, meta, links);
            return article;
        })
    );
    if (!shown.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = items.length
            ? '필터에 맞는 저장된 ERD가 없습니다.'
            : '저장된 ERD가 없습니다. Sync 화면에서 첫 ERD를 만들어 보세요.';
        cards.append(empty);
    }
    if (browserAvailable && updateStatus)
        setStatus(
            `${shown.length}개 표시 · 전체 ${items.length}개${selected.size ? ` · 선택 ${selected.size}개` : ''}${selected.size > 100 ? ' · 한 번에 최대 100개 삭제할 수 있습니다.' : ''}`
        );
    controls();
}
async function load() {
    busy = true;
    controls();
    setStatus('저장된 ERD와 용량을 확인하는 중…');
    try {
        const response = await fetch('/api/library', { cache: 'no-store' });
        if (!response.ok)
            throw new Error(
                '서버 목록을 불러오지 못했습니다. 서버 상태를 확인하세요.'
            );
        const data = await response.json();
        let local = [];
        try {
            local = await browserDiagrams();
            browserAvailable = true;
        } catch {
            browserAvailable = false;
            setStatus(
                '브라우저 DB를 읽지 못해 서버 목록만 표시합니다. 삭제는 비활성화했습니다. 다른 탭을 닫고 다시 시도하세요.'
            );
        }
        const map = new Map(
            data.items.map((i) => {
                try {
                    localStorage.setItem(
                        `local-erd-source:${i.id}`,
                        JSON.stringify({
                            repositoryUrl: i.repositoryUrl,
                            branch: i.branch,
                            source: i.source,
                        })
                    );
                } catch {
                    /* Optional source cache must not prevent cleanup when storage is full. */
                }
                return [
                    i.id,
                    {
                        ...i,
                        server: true,
                        serverBytes: i.bytes,
                        browserBytes: 0,
                    },
                ];
            })
        );
        for (const i of local) {
            let metadata = {};
            try {
                metadata = JSON.parse(
                    localStorage.getItem(`local-erd-source:${i.id}`) ?? '{}'
                );
            } catch {
                /* An orphan remains manageable as unknown. */
            }
            map.set(i.id, {
                ...i,
                ...metadata,
                ...map.get(i.id),
                browser: true,
                browserBytes: i.bytes,
                serverBytes: map.get(i.id)?.serverBytes ?? 0,
            });
        }
        items = [...map.values()].map((i) => ({ ...i, ...sourceOf(i) }));
        selected = new Set(
            [...selected].filter((id) => items.some((i) => i.id === id))
        );
        options(
            org,
            [...new Set(items.map((i) => i.org))].sort().map((v) => [v, v]),
            '전체 조직 / 계정'
        );
        if (!initialized)
            org.value =
                [...org.options].find(
                    (o) => o.value.toLowerCase() === initialOrg.toLowerCase()
                )?.value ?? '';
        filterRepos();
        if (!initialized)
            repo.value =
                [...repo.options].find(
                    (o) => o.value.toLowerCase() === initialRepo.toLowerCase()
                )?.value ?? '';
        initialized = true;
        const serverBytes = items.reduce((n, i) => n + i.serverBytes, 0),
            browserBytes = items.reduce((n, i) => n + i.browserBytes, 0),
            backupBytes = items.reduce(
                (size, item) =>
                    size +
                    new Blob([
                        localStorage.getItem(`debut-erd-backup:${item.id}`) ??
                            '',
                        localStorage.getItem(
                            `debut-layout-backup:${item.id}`
                        ) ?? '',
                    ]).size,
                0
            );
        element('usage').textContent =
            `전체 Sync 결과 파일 ${formatBytes(serverBytes)} · 이 브라우저의 작업 데이터 약 ${formatBytes(browserBytes)} · 자동 백업 ${formatBytes(backupBytes)}`;
    } catch (error) {
        setStatus(error.message, 'error');
        browserAvailable = false;
    } finally {
        busy = false;
        render();
    }
}
org.onchange = () => {
    repo.value = '';
    filterRepos();
    selected.clear();
    render();
};
repo.onchange = branch.oninput = () => {
    selected.clear();
    render();
};
all.onchange = () => {
    for (const item of visible())
        if (all.checked) selected.add(item.id);
        else selected.delete(item.id);
    render();
};
element('refresh').onclick = load;
function closeDialog({ restoreFocus = true } = {}) {
    dialog.hidden = true;
    page.inert = false;
    pendingTargets = [];
    if (restoreFocus) remove.focus();
}
function openDialog(targets) {
    pendingTargets = targets;
    page.inert = true;
    dialogSummary.textContent = `${targets.length}개 ERD를 삭제합니다.`;
    dialogTargets.textContent = targets
        .slice(0, 10)
        .map((item) => `${item.label} · ${item.branch ?? item.name}`)
        .join('\n');
    if (targets.length > 10)
        dialogTargets.textContent += `\n… 외 ${targets.length - 10}개`;
    dialog.hidden = false;
    setStatus('삭제할 ERD와 삭제 범위를 확인하세요.');
    dialogCancel.focus();
}
remove.onclick = () => {
    const targets = items.filter((i) => selected.has(i.id));
    if (busy || !browserAvailable || !targets.length || targets.length > 100)
        return;
    openDialog(targets);
};
dialogCancel.onclick = () => closeDialog();
dialog.onclick = (event) => {
    if (event.target === dialog) closeDialog();
};
dialog.onkeydown = (event) => {
    if (event.key === 'Escape' && !dialog.hidden && !busy) closeDialog();
};
dialogConfirm.onclick = async () => {
    const targets = pendingTargets;
    if (busy || !targets.length) return;
    closeDialog({ restoreFocus: false });
    busy = true;
    deleting = true;
    render(false);
    setStatus('삭제 준비 중…');
    try {
        const ids = targets.map((i) => i.id);
        const serverIds = targets.filter((i) => i.server).map((i) => i.id);
        let cleanupPending = false;
        if (serverIds.length) {
            setStatus('Sync 결과 스키마 파일을 삭제하는 중…');
            const response = await fetch('/api/library', {
                method: 'POST',
                headers: {
                    'X-Local-ERD': 'sync',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ids: serverIds }),
            });
            let result = {};
            try {
                result = await response.json();
            } catch {
                if (!response.ok)
                    throw new Error(
                        `서버 삭제 요청에 실패했습니다. (${response.status})`
                    );
            }
            if (!response.ok)
                throw new Error(result.error ?? '서버 삭제에 실패했습니다.');
            cleanupPending = result.cleanupPending;
        }
        setStatus('이 브라우저의 ERD 작업 데이터를 삭제하는 중…');
        try {
            await deleteBrowserDiagrams(ids);
        } catch {
            throw new Error(
                '서버 삭제 후 브라우저 정리에 실패했습니다. 새로고침 후 남은 ERD를 다시 삭제하세요.'
            );
        }
        selected.clear();
        setStatus('삭제 결과를 확인하는 중…');
        await load();
        setStatus(
            `${ids.length}개 ERD를 삭제했습니다.${cleanupPending ? ' 일부 서버 임시 파일 정리가 남았습니다. 저장 폴더 권한을 확인하세요.' : ''}`,
            cleanupPending ? 'error' : 'success'
        );
    } catch (error) {
        await load();
        setStatus(
            error instanceof Error
                ? error.message
                : '삭제에 실패했습니다. 새로고침 후 다시 시도하세요.',
            'error'
        );
    } finally {
        deleting = false;
        busy = false;
        render(false);
        remove.focus();
    }
};
load();
