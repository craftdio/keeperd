import { sqliteWorkspaceFixture } from '../../src/test/sqlite-workspace-fixture.js';
import { readLegacyWorkspace } from './browser-migration.js';
let fixture;
vi.mock('./workspace-client.js', () => ({
    workspaceNotice: () => {},
    readWorkspace: async () => fixture.store.view(),
    writeWorkspace: async (action, params) =>
        fixture.store.mutate({
            action,
            params,
            revision: fixture.store.view().revision,
        }),
}));
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { browserDiagrams, deleteBrowserDiagrams } from './browser-store.js';
const stores = [
    'diagrams',
    'db_tables',
    'db_relationships',
    'db_dependencies',
    'areas',
    'db_custom_types',
    'notes',
    'diagram_filters',
    'config',
    'local_erd_backups',
];
const request = (r) =>
    new Promise((resolve, reject) => {
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    localStorage.clear();
    fixture = sqliteWorkspaceFixture();
});
afterEach(() => {
    fixture.close();
    vi.unstubAllGlobals();
});
async function seed() {
    const r = indexedDB.open('ChartDB', 1);
    r.onupgradeneeded = () => {
        for (const name of stores)
            r.result.createObjectStore(name, {
                keyPath:
                    name === 'diagram_filters'
                        ? 'diagramId'
                        : name === 'local_erd_backups'
                          ? 'key'
                          : 'id',
            });
    };
    const db = await request(r);
    const tx = db.transaction(stores, 'readwrite');
    for (const name of stores) {
        if (name === 'config') {
            tx.objectStore(name).put({
                id: 1,
                defaultDiagramId: 'debut-main',
                theme: 'dark',
            });
            continue;
        }
        for (const id of ['debut-main', 'debut-develop'])
            tx.objectStore(name).put(
                name === 'local_erd_backups'
                    ? {
                          key: `debut-erd-backup:${id}`,
                          diagramId: id,
                          value: 'backup fixture',
                      }
                    : name === 'diagrams'
                      ? {
                            id,
                            name: id,
                            databaseType: 'postgresql',
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        }
                      : {
                            id: `${name}:${id}`,
                            diagramId: id,
                            content: 'fixture',
                        }
            );
    }
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
    });
    db.close();
    fixture.store.migrate(
        JSON.parse(JSON.stringify(await readLegacyWorkspace()))
    );
}
it('lists authoritative SQLite diagrams and counts backups while retaining legacy browser originals', async () => {
    expect(await browserDiagrams()).toEqual([]);
    expect(await indexedDB.databases()).toEqual([]);
    await seed();
    const result = await browserDiagrams();
    expect(result).toHaveLength(2);
    expect(result[0].tables).toBe(1);
    expect(result[0].bytes).toBeGreaterThan(100);
    expect(result[0].backupBytes).toBe(new Blob(['backup fixture']).size);
    expect((await indexedDB.databases())[0].version).toBe(1);
});
it('deletes only selected diagram rows, related stores, default reference and backups', async () => {
    await seed();
    for (const id of ['debut-main', 'debut-develop'])
        for (const prefix of [
            'debut-erd-revision:',
            'debut-erd-backup:',
            'debut-layout-backup:',
            'local-erd-source:',
        ])
            localStorage.setItem(`${prefix}${id}`, 'fixture');
    localStorage.setItem('unrelated-setting', 'keep');
    await deleteBrowserDiagrams(['debut-main']);
    const db = await request(indexedDB.open('ChartDB'));
    const tx = db.transaction(stores, 'readonly');
    const values = await Promise.all(
        stores.map((name) => request(tx.objectStore(name).getAll()))
    );
    for (let i = 0; i < stores.length; i++) {
        if (stores[i] === 'config')
            expect(values[i]).toEqual([{ id: 1, theme: 'dark' }]);
        else {
            expect(values[i]).toHaveLength(1);
            expect(values[i][0].diagramId ?? values[i][0].id).toBe(
                'debut-develop'
            );
        }
    }
    db.close();
    expect(localStorage.getItem('debut-erd-backup:debut-main')).toBeNull();
    expect(localStorage.getItem('debut-layout-backup:debut-main')).toBeNull();
    expect(localStorage.getItem('debut-erd-revision:debut-main')).toBeNull();
    expect(localStorage.getItem('local-erd-source:debut-main')).toBeNull();
    expect(localStorage.getItem('debut-erd-backup:debut-develop')).toBe(
        'fixture'
    );
    expect(localStorage.getItem('debut-layout-backup:debut-develop')).toBe(
        'fixture'
    );
    expect(localStorage.getItem('unrelated-setting')).toBe('keep');
    expect((await browserDiagrams()).map((i) => i.id)).toEqual([
        'debut-develop',
    ]);
});
it('cleans browser backups when IndexedDB has not yet been created and validates IDs', async () => {
    localStorage.setItem('debut-erd-backup:debut-main', 'fixture');
    await expect(deleteBrowserDiagrams([''])).rejects.toThrow();
    expect(localStorage.getItem('debut-erd-backup:debut-main')).toBe('fixture');
    await deleteBrowserDiagrams(['debut-main']);
    expect(localStorage.getItem('debut-erd-backup:debut-main')).toBeNull();
    expect(await indexedDB.databases()).toEqual([]);
});
