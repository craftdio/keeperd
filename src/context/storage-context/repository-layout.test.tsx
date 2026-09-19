import React, { useContext } from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import Dexie from 'dexie';
import { StorageProvider } from './storage-provider';
import { storageContext, type StorageContext } from './storage-context';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    history.replaceState({}, '', '/');
});
it('persists edits in IndexedDB and restores them on another branch without losing absent tables', async () => {
    Dexie.dependencies.indexedDB = new IDBFactory();
    Dexie.dependencies.IDBKeyRange = IDBKeyRange;
    vi.stubEnv('VITE_LOCAL_ERD', 'true');
    localStorage.clear();
    const snapshots = ['feature', 'develop'].map((id) => ({
        repositoryUrl: 'https://github.com/example/backend.git',
        revision: '1',
        diagram: {
            id,
            name: id,
            databaseType: 'postgresql',
            createdAt: new Date(),
            updatedAt: new Date(),
            tables: (id === 'feature' ? ['users', 'profiles'] : ['users']).map(
                (name) => ({
                    id: id + name,
                    name,
                    schema: 'public',
                    x: 0,
                    y: 0,
                    color: 'red',
                    fields: [],
                    indexes: [],
                })
            ),
            areas: [],
            notes: [],
            relationships: [],
        },
    }));
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, json: async () => ({ snapshots }) }))
    );
    let api: StorageContext;
    function Probe() {
        api = useContext(storageContext);
        return null;
    }
    history.replaceState({}, '', '/diagrams/feature');
    render(
        <StorageProvider>
            <Probe />
        </StorageProvider>
    );
    await api!.getConfig();
    await api!.updateTable({
        id: 'featureusers',
        attributes: { x: 123, color: 'green' },
    });
    await api!.updateTable({ id: 'featureprofiles', attributes: { x: 456 } });
    cleanup();
    history.replaceState({}, '', '/diagrams/develop');
    render(
        <StorageProvider>
            <Probe />
        </StorageProvider>
    );
    await api!.getConfig();
    const tables = await api!.listTables('develop');
    expect(tables).toHaveLength(1);
    expect(tables[0]).toMatchObject({
        id: 'developusers',
        x: 123,
        color: 'green',
    });
    await api!.updateTable({ id: 'developusers', attributes: { x: 321 } });
    cleanup();
    history.replaceState({}, '', '/diagrams/feature');
    render(
        <StorageProvider>
            <Probe />
        </StorageProvider>
    );
    await api!.getConfig();
    expect((await api!.listTables('feature')).map((t) => t.x)).toEqual([
        456, 321,
    ]);
    // Simulate the old broken union and verify recovery uses one complete backup.
    cleanup();
    const db = new Dexie('ChartDB');
    await db.open();
    const repo = 'https://github.com/example/backend';
    await db.table('repository_layouts').update(repo, { version: 1 });
    const original = {
        ...snapshots[0].diagram,
        tables: snapshots[0].diagram.tables.map((table) => ({
            ...table,
            x: 55,
            parentAreaId: 'original-area',
        })),
        areas: [
            {
                id: 'original-area',
                name: 'Original',
                x: 40,
                y: 0,
                width: 800,
                height: 500,
                color: 'blue',
            },
        ],
    };
    localStorage.setItem(
        'debut-repo-layout-migration:feature',
        JSON.stringify(original)
    );
    render(
        <StorageProvider>
            <Probe />
        </StorageProvider>
    );
    await api!.getConfig();
    expect(
        (await api!.listTables('feature')).every((table) => table.x === 55)
    ).toBe(true);
    const recovered = await db.table('repository_layouts').get(repo);
    expect(recovered.version).toBe(2);
    expect(recovered.areas).toHaveLength(1);
    expect(recovered.areas[0]).toMatchObject({
        name: 'Original',
        x: 40,
        width: 800,
    });
    db.close();
});
