import { sqliteWorkspaceFixture } from '../../src/test/sqlite-workspace-fixture.js';
import { readLegacyWorkspace } from './browser-migration.js';
let fixture;
vi.mock('./workspace-client.js', () => ({
    readWorkspace: async () => fixture.store.view(),
    writeWorkspace: async (action, params) =>
        fixture.store.mutate({
            action,
            params: JSON.parse(JSON.stringify(params)),
            revision: fixture.store.view().revision,
        }),
    workspaceBackup: async (id) => fixture.store.readBackup(id),
}));
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
    applyLayoutPackage,
    checkLayoutCompatibility,
    exportLayoutPackage,
    hasLayoutBackup,
    parseLayoutPackage,
    restoreLayoutBackup,
    snapshotLayoutSource,
} from './layout-transfer.js';

const source = {
    repositoryUrl: 'https://github.com/example/backend.git',
    branch: 'feat/layout',
    commit: 'abc123',
    revision: 'abc123',
    basis: 'github-remote',
};
const request = (value) =>
    new Promise((resolve, reject) => {
        value.onsuccess = () => resolve(value.result);
        value.onerror = () => reject(value.error);
    });

beforeEach(() => {
    fixture = sqliteWorkspaceFixture();
    vi.stubGlobal('indexedDB', new IDBFactory());
    localStorage.removeItem('debut-layout-backup:target');
});
afterEach(() => {
    fixture.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

async function seed() {
    const opening = indexedDB.open('ChartDB', 1);
    opening.onupgradeneeded = () => {
        for (const name of [
            'diagrams',
            'db_tables',
            'areas',
            'notes',
            'repository_layouts',
        ])
            opening.result.createObjectStore(name, { keyPath: 'id' });
    };
    const db = await request(opening);
    const tx = db.transaction(
        ['diagrams', 'db_tables', 'areas', 'notes'],
        'readwrite'
    );
    for (const id of ['source', 'target'])
        tx.objectStore('diagrams').put({
            id,
            name: id,
            databaseType: 'postgresql',
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    tx.objectStore('areas').put({
        id: 'source-area',
        diagramId: 'source',
        name: 'Users',
        x: 10,
        y: 20,
        width: 500,
        height: 400,
        color: '#112233',
        order: 2,
    });
    tx.objectStore('areas').put({
        id: 'target-area',
        diagramId: 'target',
        name: 'Old',
        x: 800,
        y: 800,
        width: 100,
        height: 100,
        color: '#999999',
    });
    tx.objectStore('notes').put({
        id: 'source-note',
        diagramId: 'source',
        content: '공유 메모',
        x: 30,
        y: 40,
        width: 200,
        height: 100,
        color: '#abcdef',
    });
    tx.objectStore('notes').put({
        id: 'target-note',
        diagramId: 'target',
        content: '기존 메모',
        x: 900,
        y: 900,
        width: 100,
        height: 50,
        color: '#000000',
    });
    tx.objectStore('db_tables').put({
        id: 'source-users',
        diagramId: 'source',
        schema: 'public',
        name: 'users',
        x: 100,
        y: 200,
        width: 300,
        color: '#123456',
        expanded: false,
        order: 3,
        parentAreaId: 'source-area',
        fields: [],
    });
    tx.objectStore('db_tables').put({
        id: 'target-users',
        diagramId: 'target',
        schema: 'public',
        name: 'users',
        x: 900,
        y: 950,
        width: 220,
        color: '#ffffff',
        expanded: true,
        parentAreaId: 'target-area',
        fields: [],
    });
    tx.objectStore('db_tables').put({
        id: 'target-extra',
        diagramId: 'target',
        schema: 'public',
        name: 'extra',
        x: 700,
        y: 700,
        color: '#777777',
        parentAreaId: 'target-area',
        fields: [],
    });
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
    });
    db.close();
    fixture.store.migrate(
        JSON.parse(JSON.stringify(await readLegacyWorkspace()))
    );
    fixture.store.db
        .prepare('UPDATE diagrams SET repository=? WHERE id=?')
        .run('https://github.com/example/backend', 'target');
}

async function rows(name) {
    const state = fixture.store.view();
    if (name === 'repository_layouts') return state.layouts;
    const collection = { db_tables: 'tables', areas: 'areas', notes: 'notes' }[
        name
    ];
    return state.diagrams.flatMap((diagram) =>
        (diagram[collection] ?? []).map((row) => ({
            ...row,
            diagramId: diagram.id,
        }))
    );
}

it('exports and applies repository layout data without replacing schema IDs', async () => {
    await seed();
    const layout = await exportLayoutPackage('source', source);
    expect(layout.layout.tables).toEqual([
        expect.objectContaining({
            schema: 'public',
            name: 'users',
            x: 100,
            color: '#123456',
            parentAreaKey: 'area-1',
        }),
    ]);
    expect(layout.layout.notes[0].content).toBe('공유 메모');
    expect(layout.repository).toEqual({ url: source.repositoryUrl });
    expect(checkLayoutCompatibility(layout, source)).toEqual(
        expect.objectContaining({ compatible: true, sameRepository: true })
    );

    const result = await applyLayoutPackage('target', source, layout);
    expect(result).toEqual({
        matchedTables: 1,
        skippedTables: 0,
        areas: 1,
        notes: 1,
    });
    expect(await hasLayoutBackup('target')).toBe(true);
    const tables = await rows('db_tables');
    const target = tables.find((table) => table.id === 'target-users');
    expect(target).toEqual(
        expect.objectContaining({
            id: 'target-users',
            x: 100,
            y: 200,
            color: '#123456',
            expanded: false,
        })
    );
    expect(target.parentAreaId).not.toBe('source-area');
    expect(
        tables.find((table) => table.id === 'target-extra').parentAreaId
    ).toBeUndefined();
    expect(
        (await rows('areas')).filter((area) => area.diagramId === 'source')
    ).toHaveLength(1);
    expect(
        (await rows('areas')).find((area) => area.diagramId === 'target')
    ).toEqual(expect.objectContaining({ name: 'Users' }));
    expect(
        (await rows('notes')).find((note) => note.diagramId === 'target')
    ).toEqual(expect.objectContaining({ content: '공유 메모' }));
    expect((await rows('repository_layouts'))[0]).toEqual(
        expect.objectContaining({
            id: 'https://github.com/example/backend',
            areas: [expect.objectContaining({ name: 'Users' })],
        })
    );
    const repositoryExport = await exportLayoutPackage('target', source);
    expect(repositoryExport).toEqual(
        expect.objectContaining({
            format: 'keeperd-repository-layout',
            repository: { url: source.repositoryUrl },
            layout: expect.objectContaining({
                tables: expect.arrayContaining([
                    expect.objectContaining({
                        name: 'users',
                        x: 100,
                        color: '#123456',
                    }),
                ]),
            }),
        })
    );

    await restoreLayoutBackup('target', source);
    expect(await hasLayoutBackup('target')).toBe(true);
    expect(
        (await rows('db_tables')).find((table) => table.id === 'target-users')
    ).toEqual(expect.objectContaining({ x: 900, color: '#ffffff' }));
    expect(
        (await rows('notes')).find((note) => note.diagramId === 'target')
    ).toEqual(expect.objectContaining({ content: '기존 메모' }));
});

it('accepts every branch of the same repository and rejects other repositories', async () => {
    await seed();
    const layout = await exportLayoutPackage('source', source);
    expect(
        checkLayoutCompatibility(layout, {
            ...source,
            commit: 'different',
        })
    ).toEqual(
        expect.objectContaining({ compatible: true, sameRepository: true })
    );
    const sameRepositoryTarget = {
        ...source,
        branch: 'main',
        commit: 'different',
    };
    await expect(
        applyLayoutPackage('target', sameRepositoryTarget, layout)
    ).resolves.toEqual(
        expect.objectContaining({ matchedTables: 1, areas: 1, notes: 1 })
    );
    await restoreLayoutBackup('target', sameRepositoryTarget);
    await expect(
        applyLayoutPackage(
            'target',
            {
                ...source,
                repositoryUrl: 'https://github.com/other/backend.git',
            },
            layout
        )
    ).rejects.toThrow('레포');
    expect(() => parseLayoutPackage('{}')).toThrow('지원하지 않는');
    expect(() =>
        parseLayoutPackage({
            ...layout,
            format: 'chartdb-layout',
            source,
            repository: undefined,
        })
    ).toThrow('지원하지 않는');
    expect(() =>
        parseLayoutPackage({
            ...layout,
            layout: {
                ...layout.layout,
                tables: [
                    {
                        ...layout.layout.tables[0],
                        parentAreaKey: 'missing-area',
                    },
                ],
            },
        })
    ).toThrow('Area 연결');
});

it('exports, applies and restores with browser storage blocked, while backup failure remains optional', async () => {
    await seed();
    const layout = await exportLayoutPackage('source', source);
    vi.stubGlobal('localStorage', {
        getItem() {
            throw new Error('blocked');
        },
        setItem() {
            throw new Error('full');
        },
        removeItem() {
            throw new Error('blocked');
        },
    });
    vi.stubGlobal('indexedDB', undefined);
    await expect(applyLayoutPackage('target', source, layout)).resolves.toEqual(
        expect.objectContaining({ matchedTables: 1 })
    );
    await expect(restoreLayoutBackup('target', source)).resolves.toEqual(
        expect.objectContaining({ matchedTables: 2 })
    );
    fixture.store.db.exec(
        "CREATE TRIGGER no_backup BEFORE INSERT ON backups BEGIN SELECT RAISE(FAIL,'full'); END"
    );
    await expect(applyLayoutPackage('target', source, layout)).resolves.toEqual(
        expect.objectContaining({ matchedTables: 1 })
    );
    expect(fixture.store.view().warning).toContain('자동 백업');
});

it('derives a portable source identity from remote and local snapshots', () => {
    expect(
        snapshotLayoutSource({
            repositoryUrl: source.repositoryUrl,
            branch: source.branch,
            revision: source.commit,
        })
    ).toEqual(expect.objectContaining({ ...source, basis: 'github-remote' }));
    expect(
        snapshotLayoutSource({
            repositoryUrl: source.repositoryUrl,
            branch: source.branch,
            revision: `${source.commit}:fingerprint`,
            source: { kind: 'local', mode: 'worktree', commit: source.commit },
        })
    ).toEqual(
        expect.objectContaining({
            repositoryUrl: source.repositoryUrl,
            branch: source.branch,
            commit: source.commit,
            revision: `${source.commit}:fingerprint`,
            basis: 'local-worktree',
        })
    );
});
