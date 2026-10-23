import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { sqliteWorkspaceFixture } from '../../src/test/sqlite-workspace-fixture.js';
let fixture, calls;
const diagram = {
    id: 'debut-main',
    name: 'main',
    databaseType: 'postgresql',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tables: [
        {
            id: 'users',
            name: 'users',
            x: 100,
            y: 20,
            color: 'red',
            fields: [],
            indexes: [],
        },
    ],
    notes: [],
    areas: [],
};
async function client() {
    vi.resetModules();
    delete globalThis[Symbol.for('keeperd.workspace-client')];
    return import('./workspace-client.js');
}
beforeEach(() => {
    fixture = sqliteWorkspaceFixture();
    fixture.store.syncSnapshots({
        snapshots: [
            {
                diagram,
                revision: '1',
                repositoryUrl: 'https://github.com/example/backend',
            },
        ],
    });
    calls = [];
    localStorage.clear();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url, options = {}) => {
            calls.push({ url, options });
            try {
                const input = options.body && JSON.parse(options.body);
                const value = input
                    ? input.action === 'migrate'
                        ? fixture.store.migrate(input.params)
                        : fixture.store.mutate(input)
                    : fixture.store.view();
                return {
                    ok: true,
                    status: 200,
                    json: async () => JSON.parse(JSON.stringify(value)),
                };
            } catch (error) {
                return {
                    ok: false,
                    status: error.status ?? 500,
                    json: async () => ({
                        code: error.code,
                        error: error.message,
                    }),
                };
            }
        })
    );
});
afterEach(() => {
    fixture.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete globalThis[Symbol.for('keeperd.workspace-client')];
});

async function seedLegacy(original, extra = {}) {
    const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('ChartDB', 15);
        request.onupgradeneeded = () => {
            for (const name of [
                'diagrams',
                'db_tables',
                'db_relationships',
                'db_dependencies',
                'areas',
                'db_custom_types',
                'notes',
                'repository_layouts',
                'config',
            ])
                request.result.createObjectStore(name, { keyPath: 'id' });
            request.result.createObjectStore('diagram_filters', {
                keyPath: 'diagramId',
            });
            request.result.createObjectStore('local_erd_backups', {
                keyPath: 'key',
            });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    const tx = db.transaction([...db.objectStoreNames], 'readwrite');
    const root = { ...original };
    for (const [store, collection] of Object.entries({
        db_tables: 'tables',
        db_relationships: 'relationships',
        db_dependencies: 'dependencies',
        areas: 'areas',
        db_custom_types: 'customTypes',
        notes: 'notes',
    })) {
        for (const row of original[collection] ?? [])
            tx.objectStore(store).put({ ...row, diagramId: original.id });
        delete root[collection];
    }
    tx.objectStore('diagrams').put(root);
    for (const [store, rows] of Object.entries(extra))
        for (const row of rows) tx.objectStore(store).put(row);
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
    });
    db.close();
}
it('silently upgrades separate browsers into one latest ERD and preserves both browser originals', async () => {
    const listener = vi.fn();
    window.addEventListener('keeperd:storage-notice', listener);
    const newer = new IDBFactory(),
        older = new IDBFactory();
    try {
        vi.stubGlobal('indexedDB', newer);
        const latest = {
            ...diagram,
            updatedAt: '2026-01-03T00:00:00.000Z',
            tables: [{ ...diagram.tables[0], x: 900 }],
        };
        await seedLegacy(latest, {
            config: [{ id: 1, defaultDiagramId: diagram.id }],
            diagram_filters: [{ diagramId: diagram.id, tableIds: ['users'] }],
            repository_layouts: [
                {
                    version: 2,
                    id: 'https://github.com/example/backend',
                    tables: {
                        '["","users"]': { x: 900, y: 20 },
                        '["","missing"]': { x: 456, y: 20 },
                    },
                    areas: [],
                    notes: [],
                },
            ],
            local_erd_backups: [
                {
                    key: 'debut-layout-backup:debut-main',
                    diagramId: diagram.id,
                    value: JSON.stringify(diagram),
                },
            ],
        });
        let api = await client();
        let state = await api.readWorkspace();
        expect(state.diagrams[0].tables[0].x).toBe(900);
        expect(state.layouts[0].tables['["","missing"]'].x).toBe(456);
        expect(state.filters[diagram.id].tableIds).toEqual(['users']);
        vi.stubGlobal('indexedDB', older);
        await seedLegacy({
            ...diagram,
            updatedAt: '2026-01-02T00:00:00.000Z',
            tables: [{ ...diagram.tables[0], x: 300 }],
        });
        api = await client();
        state = await api.readWorkspace();
        expect(state.diagrams).toHaveLength(1);
        expect(state.diagrams[0].tables[0].x).toBe(900);
        expect(listener).not.toHaveBeenCalled();
        const before = fixture.store.view().revision;
        vi.stubGlobal('indexedDB', newer);
        api = await client();
        expect((await api.readWorkspace()).diagrams[0].tables[0].x).toBe(900);
        expect(fixture.store.view().revision).toBe(before);
        const { readLegacyWorkspace } = await import('./browser-migration.js');
        expect((await readLegacyWorkspace()).diagrams[0].tables[0].x).toBe(900);
        vi.stubGlobal('indexedDB', older);
        expect((await readLegacyWorkspace()).diagrams[0].tables[0].x).toBe(300);
    } finally {
        window.removeEventListener('keeperd:storage-notice', listener);
    }
});
it('retries a failed migration on reload without marking partial imports complete', async () => {
    await seedLegacy({
        ...diagram,
        tables: [{ ...diagram.tables[0], x: 666 }],
    });
    fixture.store.db.exec(
        "CREATE TRIGGER fail_migration BEFORE INSERT ON diagrams BEGIN SELECT RAISE(FAIL,'disk full'); END"
    );
    let api = await client();
    expect((await api.readWorkspace()).diagrams[0].tables[0].x).toBe(100);
    expect(
        fixture.store.db.prepare('SELECT count(*) AS count FROM imports').get()
            .count
    ).toBe(0);
    fixture.store.db.exec('DROP TRIGGER fail_migration');
    api = await client();
    expect((await api.readWorkspace()).diagrams[0].tables[0].x).toBe(666);
});
it('batches consecutive edits atomically and exposes the persisted data to a fresh browser', async () => {
    const first = await client();
    await first.readWorkspace();
    const before = fixture.store.view().revision;
    await Promise.all([
        first.writeWorkspace('updateTable', {
            id: 'users',
            attributes: { x: 700 },
        }),
        first.writeWorkspace('addNote', {
            diagramId: 'debut-main',
            note: { id: 'note', content: 'saved', x: 1, y: 2 },
        }),
    ]);
    expect(fixture.store.view().revision).toBe(before + 1);
    expect(calls.filter((call) => call.options.method === 'POST')).toHaveLength(
        1
    );
    vi.stubGlobal('indexedDB', new IDBFactory());
    const second = await client();
    const state = await second.readWorkspace();
    expect(state.diagrams[0].tables[0].x).toBe(700);
    expect(state.diagrams[0].notes[0].content).toBe('saved');
});
it('retains existing ERDs and saves while IndexedDB and localStorage are unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', {
        get length() {
            throw new Error('blocked');
        },
    });
    const api = await client();
    expect((await api.readWorkspace()).diagrams).toHaveLength(1);
    await api.writeWorkspace('updateTable', {
        id: 'users',
        attributes: { x: 400 },
    });
    expect(fixture.store.view().diagrams[0].tables[0].x).toBe(400);
});
it('migrates read-only browser data once without upgrading or removing the originals', async () => {
    const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('ChartDB', 14);
        req.onupgradeneeded = () => {
            req.result.createObjectStore('diagrams', { keyPath: 'id' });
            req.result.createObjectStore('db_tables', { keyPath: 'id' });
            req.result.createObjectStore('repository_layouts', {
                keyPath: 'id',
            });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(
        ['diagrams', 'db_tables', 'repository_layouts'],
        'readwrite'
    );
    tx.objectStore('diagrams').put({ ...diagram, tables: undefined });
    tx.objectStore('db_tables').put({
        ...diagram.tables[0],
        diagramId: diagram.id,
        x: 333,
    });
    tx.objectStore('repository_layouts').put({ id: 'legacy-repo', version: 1 });
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
    });
    db.close();
    localStorage.setItem(
        'debut-erd-backup:debut-main',
        JSON.stringify(diagram)
    );
    localStorage.setItem(
        'debut-repo-layout-migration:debut-main',
        JSON.stringify({
            ...diagram,
            tables: [{ ...diagram.tables[0], x: 999 }],
        })
    );
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('Full', 'QuotaExceededError');
    });
    const first = await client();
    expect((await first.readWorkspace()).diagrams[0].tables[0].x).toBe(999);
    const second = await client();
    expect((await second.readWorkspace()).diagrams).toHaveLength(1);
    expect((await indexedDB.databases())[0].version).toBe(14);
    expect(localStorage.getItem('debut-erd-backup:debut-main')).toBeTruthy();
});
it('rejects an old browser revision and stops subsequent writes without overwriting the winner', async () => {
    const first = await client();
    await first.readWorkspace();
    const second = await client();
    await second.readWorkspace();
    await first.writeWorkspace('updateTable', {
        id: 'users',
        attributes: { x: 777 },
    });
    await expect(
        second.writeWorkspace('updateTable', {
            id: 'users',
            attributes: { x: 2 },
        })
    ).rejects.toThrow('다른 탭');
    await expect(
        second.writeWorkspace('updateTable', {
            id: 'users',
            attributes: { x: 3 },
        })
    ).rejects.toThrow('추가 저장');
    expect(fixture.store.view().diagrams[0].tables[0].x).toBe(777);
});
it('rolls back every edit in a failed batch and reports unsaved changes', async () => {
    const api = await client();
    await api.readWorkspace();
    const before = fixture.store.view();
    const listener = vi.fn();
    window.addEventListener('keeperd:storage-notice', listener);
    try {
        const results = await Promise.allSettled([
            api.writeWorkspace('updateTable', {
                id: 'users',
                attributes: { x: 123 },
            }),
            api.writeWorkspace('updateTable', {
                id: 'missing',
                attributes: { x: 9 },
            }),
        ]);
        expect(results.every((item) => item.status === 'rejected')).toBe(true);
        expect(fixture.store.view()).toEqual(before);
        expect(listener).toHaveBeenCalled();
    } finally {
        window.removeEventListener('keeperd:storage-notice', listener);
    }
});
it('maps every editor collection and revives dates through the server storage adapter', async () => {
    await client();
    const { createServerStorage } =
        await import('../../src/context/storage-context/server-storage.ts');
    const storage = createServerStorage();
    expect(
        (await storage.getDiagram('debut-main', { includeTables: true }))
            .createdAt
    ).toBeInstanceOf(Date);
    for (const [type, key] of Object.entries({
        Table: 'table',
        Relationship: 'relationship',
        Dependency: 'dependency',
        Area: 'area',
        CustomType: 'customType',
        Note: 'note',
    })) {
        const id = `new-${type}`;
        await storage[`add${type}`]({
            diagramId: 'debut-main',
            [key]: { id, name: id, fields: [], indexes: [] },
        });
        expect(
            (await storage[`get${type}`]({ diagramId: 'debut-main', id })).id
        ).toBe(id);
        await storage[`update${type}`]({ id, attributes: { name: 'updated' } });
        expect(
            (await storage[`get${type}`]({ diagramId: 'debut-main', id })).name
        ).toBe('updated');
        await storage[`delete${type}`]({ diagramId: 'debut-main', id });
        expect(
            await storage[`get${type}`]({ diagramId: 'debut-main', id })
        ).toBeUndefined();
    }
});
