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
];
const request = (r) =>
    new Promise((resolve, reject) => {
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    localStorage.clear();
});
afterEach(() => {
    vi.unstubAllGlobals();
});
async function seed() {
    const r = indexedDB.open('ChartDB', 1);
    r.onupgradeneeded = () => {
        for (const name of stores)
            r.result.createObjectStore(name, {
                keyPath: name === 'diagram_filters' ? 'diagramId' : 'id',
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
                name === 'diagrams'
                    ? { id, name: id, updatedAt: new Date() }
                    : { id: `${name}:${id}`, diagramId: id, content: 'fixture' }
            );
    }
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
    });
    db.close();
}
it('reads existing diagrams and counts related rows without creating or upgrading the database', async () => {
    expect(await browserDiagrams()).toEqual([]);
    expect(await indexedDB.databases()).toEqual([]);
    await seed();
    const result = await browserDiagrams();
    expect(result).toHaveLength(2);
    expect(result[0].tables).toBe(1);
    expect(result[0].bytes).toBeGreaterThan(100);
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
