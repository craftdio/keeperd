import { readLegacyWorkspace } from './browser-migration.js';
import {
    normalizeWorkspaceSelection,
    selectWorkspaceValue,
    workspaceCollections,
    selectDiagramValue,
} from './workspace-selection.js';
const key = Symbol.for('keeperd.workspace-client');
const shared = (globalThis[key] ??= {
    queue: Promise.resolve(),
    state: null,
    ready: null,
    halted: false,
    pending: [],
    timer: null,
});
shared.revision ??= shared.state?.revision ?? null;
shared.selections ??= new Map();
export function workspaceNotice(message) {
    if (typeof window !== 'undefined')
        window.dispatchEvent(
            new CustomEvent('keeperd:storage-notice', { detail: message })
        );
}
async function request(input, selection) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
        const url = selection
            ? `/api/workspace?selection=${encodeURIComponent(JSON.stringify(selection))}`
            : '/api/workspace';
        const response = await fetch(url, {
            cache: 'no-store',
            signal: controller.signal,
            ...(input
                ? {
                      method: 'POST',
                      headers: {
                          'Content-Type': 'application/json',
                          'X-Local-ERD': 'sync',
                      },
                      body: JSON.stringify(input),
                  }
                : {}),
        });
        const value = await response.json();
        if (!response.ok) {
            const error = new Error(
                value.error ?? '작업 데이터를 저장하지 못했습니다.'
            );
            error.code = value.code;
            throw error;
        }
        if (value.warning) workspaceNotice(value.warning);
        return value;
    } finally {
        clearTimeout(timer);
    }
}
function checkResponse(value) {
    if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0)
        throw new Error('작업 데이터 응답 형식을 확인하세요.');
}
function acceptRead(value, selection) {
    checkResponse(value);
    if (
        shared.revision !== null &&
        value.revision !== shared.revision &&
        shared.edited
    ) {
        shared.halted = true;
        workspaceNotice(
            '다른 브라우저 또는 Sync에서 작업 데이터가 변경됐습니다. 현재 화면을 JSON으로 내보낸 뒤 새로고침하세요.'
        );
        throw new Error('작업 데이터가 변경됐습니다. 새로고침이 필요합니다.');
    }
    if (value.revision !== shared.revision) {
        shared.state = null;
        shared.selections.clear();
    }
    shared.revision = value.revision;
    if (value.kind === 'selection-v1' && selection) {
        shared.selections.set(JSON.stringify(selection), value.value);
        return value.value;
    }
    // Older servers ignore selection/response options and return full state.
    if (!Array.isArray(value.diagrams))
        throw new Error('작업 데이터 응답 형식을 확인하세요.');
    shared.state = value;
    shared.selections.clear();
    return selection ? selectWorkspaceValue(value, selection) : value;
}
async function initialize() {
    if (!shared.ready)
        shared.ready = (async () => {
            const selection = { kind: 'config' };
            acceptRead(await request(undefined, selection), selection);
            try {
                const legacy = await readLegacyWorkspace();
                if (legacy.warning) workspaceNotice(legacy.warning);
                if (
                    legacy.diagrams.length ||
                    legacy.backups.length ||
                    legacy.layouts.length ||
                    legacy.config ||
                    legacy.filters.length
                ) {
                    acceptRead(
                        await request({
                            action: 'migrate',
                            params: legacy,
                        })
                    );
                }
            } catch (error) {
                workspaceNotice(
                    `브라우저 데이터 이전을 완료하지 못했습니다. 원본은 보존됐으며 새로고침하면 다시 시도합니다. ${error.message}`
                );
            }
            return shared.state;
        })().catch((error) => {
            shared.ready = null;
            throw error;
        });
    await shared.ready;
    return shared.state;
}
export async function readWorkspace({ refresh = false, selection } = {}) {
    const scope =
        selection === undefined
            ? undefined
            : normalizeWorkspaceSelection(selection);
    await initialize();
    // Reads and writes share the same barrier: an old GET must never arrive
    // after a local save and overwrite the new revision or poison its queue.
    const run = shared.queue.then(async () => {
        let value;
        const key = scope && JSON.stringify(scope);
        if (!refresh && shared.state)
            value = scope
                ? selectWorkspaceValue(shared.state, scope)
                : shared.state;
        else if (!refresh && scope && shared.selections.has(key))
            value = shared.selections.get(key);
        else {
            const fullDiagramKey =
                scope?.diagramId &&
                JSON.stringify({
                    kind: 'diagram',
                    diagramId: scope.diagramId,
                    includes: workspaceCollections,
                });
            const diagram =
                !refresh &&
                fullDiagramKey &&
                shared.selections.get(fullDiagramKey);
            if (diagram && scope.kind === 'diagram')
                value = selectDiagramValue(diagram, scope.includes);
            else if (diagram && scope.kind === 'collection')
                value = diagram[scope.collection] ?? [];
            else if (diagram && scope.kind === 'entity')
                value = diagram[scope.collection]?.find(
                    (item) => item.id === scope.id
                );
            else value = acceptRead(await request(undefined, scope), scope);
        }
        return structuredClone(value);
    });
    shared.queue = run.then(
        () => {},
        () => {}
    );
    return run;
}
function flush() {
    shared.timer = null;
    const pending = shared.pending.splice(0, 1000);
    const run = shared.queue.then(async () => {
        await initialize();
        if (shared.halted)
            throw new Error(
                '이전 저장이 실패해 추가 저장을 중지했습니다. 현재 화면을 JSON으로 내보낸 뒤 새로고침하세요.'
            );
        try {
            shared.edited = true;
            const value = await request({
                revision: shared.revision,
                response: 'ack-v1',
                actions: pending.map((item) => ({
                    action: item.action,
                    params: item.params,
                })),
            });
            checkResponse(value);
            if (value.kind === 'ack-v1') shared.state = null;
            else if (Array.isArray(value.diagrams)) shared.state = value;
            else throw new Error('작업 데이터 저장 응답을 확인하세요.');
            shared.revision = value.revision;
            shared.selections.clear();
            for (const item of pending) item.resolve();
        } catch (error) {
            shared.halted = true;
            workspaceNotice(
                `${error.message} 현재 화면의 변경 사항이 서버에 저장되지 않았습니다.`
            );
            throw error;
        }
    });
    shared.queue = run.catch((error) => {
        for (const item of pending) item.reject(error);
    });
    if (shared.pending.length) shared.timer = setTimeout(flush, 16);
}
export function writeWorkspace(action, params) {
    return new Promise((resolve, reject) => {
        shared.pending.push({
            action,
            params: structuredClone(params),
            resolve,
            reject,
        });
        if (!shared.timer) shared.timer = setTimeout(flush, 16);
    });
}
export async function workspaceBackup(id) {
    const response = await fetch(
        `/api/workspace?backup=${encodeURIComponent(id)}`,
        { cache: 'no-store' }
    );
    if (!response.ok) throw new Error('작업 데이터 백업을 읽지 못했습니다.');
    return (await response.json()).value;
}
