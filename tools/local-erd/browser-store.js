import {
    readWorkspace,
    writeWorkspace,
    workspaceNotice,
} from './workspace-client.js';
const relatedStores = [
    'db_tables',
    'db_relationships',
    'db_dependencies',
    'areas',
    'db_custom_types',
    'notes',
    'diagram_filters',
    'local_erd_backups',
];
const complete = (tx) =>
    new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onabort = () =>
            reject(tx.error ?? new Error('브라우저 DB 작업이 취소됐습니다.'));
        tx.onerror = () => {};
    });
async function open() {
    if (!globalThis.indexedDB)
        throw new Error('이 브라우저에서 IndexedDB에 접근할 수 없습니다.');
    return new Promise((resolve, reject) => {
        const r = indexedDB.open('ChartDB');
        let absent = false;
        r.onupgradeneeded = (event) => {
            if (event.oldVersion === 0) {
                absent = true;
                r.transaction.abort();
            }
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => (absent ? resolve(null) : reject(r.error));
        r.onblocked = () =>
            reject(new Error('다른 ChartDB 탭을 닫고 다시 시도하세요.'));
    });
}
export async function browserDiagrams() {
    const state = await readWorkspace({ refresh: true });
    return state.diagrams.map((diagram) => ({
        id: diagram.id,
        name: diagram.name,
        updatedAt: diagram.updatedAt,
        tables: diagram.tables?.length ?? 0,
        bytes: new Blob([JSON.stringify(diagram)]).size,
        backupBytes: state.backups
            .filter((item) => item.diagramId === diagram.id)
            .reduce((size, item) => size + item.bytes, 0),
    }));
}
export async function deleteBrowserDiagrams(ids) {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !id))
        throw new Error('삭제할 ERD ID를 확인하세요.');
    await readWorkspace({ refresh: true });
    for (const id of ids) await writeWorkspace('deleteDiagram', { id });
    const selected = new Set(ids);
    let db;
    try {
        db = await open();
        if (db) {
            try {
                const names = ['diagrams', 'config', ...relatedStores].filter(
                    (s) => db.objectStoreNames.contains(s)
                );
                if (names.length) {
                    const tx = db.transaction(names, 'readwrite');
                    const done = complete(tx);
                    const operations = names.map(
                        (name) =>
                            new Promise((resolve, reject) => {
                                const store = tx.objectStore(name);
                                const r = store.openCursor();
                                r.onerror = () => reject(r.error);
                                r.onsuccess = () => {
                                    const cursor = r.result;
                                    if (!cursor) return resolve();
                                    const row = cursor.value;
                                    if (name === 'config') {
                                        if (
                                            selected.has(row.defaultDiagramId)
                                        ) {
                                            delete row.defaultDiagramId;
                                            cursor.update(row);
                                        }
                                    } else if (
                                        selected.has(
                                            name === 'diagrams'
                                                ? row.id
                                                : row.diagramId
                                        )
                                    )
                                        cursor.delete();
                                    cursor.continue();
                                };
                            })
                    );
                    await Promise.all([...operations, done]);
                }
            } finally {
                db.close();
            }
        }
        for (const id of ids)
            for (const prefix of [
                'debut-erd-revision:',
                'debut-erd-backup:',
                'debut-repo-layout-migration:',
                'debut-repo-layout-backup:',
                'debut-layout-backup:',
                'local-erd-source:',
            ])
                localStorage.removeItem(`${prefix}${id}`);
    } catch {
        workspaceNotice(
            '서버 작업 데이터는 삭제됐지만 이전 브라우저 원본 정리를 완료하지 못했습니다.'
        );
    }
    const channel =
        typeof BroadcastChannel === 'function'
            ? new BroadcastChannel('local-erd-library')
            : null;
    channel?.postMessage({ deleted: ids });
    channel?.close();
}
