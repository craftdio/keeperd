const relatedStores = [
    'db_tables',
    'db_relationships',
    'db_dependencies',
    'areas',
    'db_custom_types',
    'notes',
    'diagram_filters',
];
const request = (r) =>
    new Promise((resolve, reject) => {
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
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
    const db = await open();
    if (!db) return [];
    try {
        if (!db.objectStoreNames.contains('diagrams')) return [];
        const names = [
            'diagrams',
            ...relatedStores.filter((s) => db.objectStoreNames.contains(s)),
        ];
        const tx = db.transaction(names, 'readonly');
        const done = complete(tx);
        const values = await Promise.all([
            ...names.map((s) => request(tx.objectStore(s).getAll())),
            done,
        ]);
        return values[0].map((diagram) => {
            const full = { ...diagram };
            names.slice(1).forEach((name, i) => {
                full[name] = values[i + 1].filter(
                    (row) => row.diagramId === diagram.id
                );
            });
            return {
                id: diagram.id,
                name: diagram.name,
                updatedAt: diagram.updatedAt,
                tables: full.db_tables?.length ?? 0,
                bytes: new Blob([JSON.stringify(full)]).size,
            };
        });
    } finally {
        db.close();
    }
}
export async function deleteBrowserDiagrams(ids) {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !id))
        throw new Error('삭제할 ERD ID를 확인하세요.');
    const selected = new Set(ids);
    const db = await open();
    if (db) {
        try {
            const names = ['diagrams', 'config', ...relatedStores].filter((s) =>
                db.objectStoreNames.contains(s)
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
                                    if (selected.has(row.defaultDiagramId)) {
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
            'debut-layout-backup:',
            'local-erd-source:',
        ])
            localStorage.removeItem(`${prefix}${id}`);
    const channel =
        typeof BroadcastChannel === 'function'
            ? new BroadcastChannel('local-erd-library')
            : null;
    channel?.postMessage({ deleted: ids });
    channel?.close();
}
