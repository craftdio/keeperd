// Read the old browser stores without upgrading, writing, or deleting originals.
const collections = {
    db_tables: 'tables',
    db_relationships: 'relationships',
    db_dependencies: 'dependencies',
    areas: 'areas',
    db_custom_types: 'customTypes',
    notes: 'notes',
};
const prefixes = [
    'debut-erd-backup:',
    'debut-repo-layout-migration:',
    'debut-repo-layout-backup:',
    'debut-layout-backup:',
];
const result = (request) =>
    new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
async function openLegacy() {
    if (!globalThis.indexedDB) return null;
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ChartDB');
        let absent = false,
            settled = false;
        const timer = setTimeout(() => {
            settled = true;
            reject(
                new Error(
                    '이전 브라우저 DB가 잠겨 있습니다. 기존 탭을 닫고 새로고침하면 이전을 다시 시도합니다.'
                )
            );
        }, 2000);
        request.onupgradeneeded = (event) => {
            if (event.oldVersion === 0) {
                absent = true;
                request.transaction.abort();
            }
        };
        request.onsuccess = () => {
            clearTimeout(timer);
            if (settled) request.result.close();
            else resolve(request.result);
        };
        request.onerror = () => {
            clearTimeout(timer);
            if (absent) resolve(null);
            else reject(request.error);
        };
    });
}
export async function readLegacyWorkspace() {
    const payload = { diagrams: [], backups: [], filters: [], layouts: [] };
    const db = await openLegacy();
    let recoverLegacyLayout = false;
    try {
        if (db?.objectStoreNames.contains('diagrams')) {
            const names = [
                'diagrams',
                'config',
                'diagram_filters',
                'repository_layouts',
                'local_erd_backups',
                ...Object.keys(collections),
            ].filter((name) => db.objectStoreNames.contains(name));
            const tx = db.transaction(names, 'readonly');
            const done = new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onabort = () => reject(tx.error);
                tx.onerror = () => {};
            });
            const rows = Object.fromEntries(
                await Promise.all(
                    names.map(async (name) => [
                        name,
                        await result(tx.objectStore(name).getAll()),
                    ])
                )
            );
            await done;
            payload.diagrams = rows.diagrams.map((diagram) => {
                const full = { ...diagram };
                for (const [store, collection] of Object.entries(collections))
                    full[collection] = (rows[store] ?? [])
                        .filter((row) => row.diagramId === diagram.id)
                        .map((row) => {
                            const copy = { ...row };
                            delete copy.diagramId;
                            return copy;
                        });
                return full;
            });
            payload.backups = (rows.local_erd_backups ?? []).filter((row) =>
                prefixes.some((prefix) => row.key.startsWith(prefix))
            );
            payload.filters = rows.diagram_filters ?? [];
            payload.layouts = (rows.repository_layouts ?? []).filter(
                (layout) => layout.version === 2
            );
            payload.config = rows.config?.find((config) => config.id === 1);
            recoverLegacyLayout = (rows.repository_layouts ?? []).some(
                (layout) => layout.version !== 2
            );
        }
    } finally {
        db?.close();
    }
    try {
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index),
                prefix = prefixes.find((prefix) => key?.startsWith(prefix));
            if (prefix && !payload.backups.some((row) => row.key === key))
                payload.backups.push({
                    key,
                    diagramId: key.slice(prefix.length),
                    value: localStorage.getItem(key),
                });
        }
    } catch {
        payload.warning =
            '이전 localStorage 백업을 읽지 못했습니다. 원본은 브라우저에 남아 있습니다.';
    }
    if (recoverLegacyLayout) {
        payload.diagrams = payload.diagrams.map((diagram) => {
            const backup = payload.backups.find(
                (row) => row.key === `debut-repo-layout-migration:${diagram.id}`
            );
            try {
                const original = JSON.parse(backup?.value ?? 'null');
                return original?.id === diagram.id &&
                    Array.isArray(original.tables)
                    ? {
                          ...diagram,
                          tables: original.tables,
                          areas: original.areas ?? [],
                          notes: original.notes ?? [],
                      }
                    : diagram;
            } catch {
                return diagram;
            }
        });
    }
    return payload;
}
