import { readLegacyWorkspace } from './browser-migration.js';
const key = Symbol.for('keeperd.workspace-client');
const shared = (globalThis[key] ??= {
    queue: Promise.resolve(),
    state: null,
    ready: null,
    halted: false,
    pending: [],
    timer: null,
});
export function workspaceNotice(message) {
    if (typeof window !== 'undefined')
        window.dispatchEvent(
            new CustomEvent('keeperd:storage-notice', { detail: message })
        );
}
async function request(input) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
        const response = await fetch('/api/workspace', {
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
async function initialize() {
    if (!shared.ready)
        shared.ready = (async () => {
            shared.state = await request();
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
                    shared.state = await request({
                        action: 'migrate',
                        params: legacy,
                    });
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
export async function readWorkspace({ refresh = false } = {}) {
    await initialize();
    await shared.queue;
    if (refresh) {
        const fresh = await request();
        if (fresh.revision !== shared.state.revision && shared.edited) {
            shared.halted = true;
            workspaceNotice(
                '다른 브라우저 또는 Sync에서 작업 데이터가 변경됐습니다. 현재 화면을 JSON으로 내보낸 뒤 새로고침하세요.'
            );
            throw new Error(
                '작업 데이터가 변경됐습니다. 새로고침이 필요합니다.'
            );
        }
        shared.state = fresh;
    }
    return structuredClone(shared.state);
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
            shared.state = await request({
                revision: shared.state.revision,
                actions: pending.map((item) => ({
                    action: item.action,
                    params: item.params,
                })),
            });
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
