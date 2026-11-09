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
    layoutTableCatalog,
    parseLayoutPackage,
    previewLayoutPackage,
    restoreLayoutBackup,
    snapshotLayoutSource,
} from './layout-transfer.js';
import { tableKey } from './layout-package.js';

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

it('exports only selected table identities and positions, rejecting empty or stale selections', async () => {
    await seed();
    const selected = [tableKey({ schema: 'public', name: 'users' })];
    const partial = await exportLayoutPackage('source', source, {
        tableKeys: selected,
    });
    expect(partial.format).toBe('keeperd-table-layout');
    expect(partial.layout).toEqual({
        tables: [
            {
                schema: 'public',
                name: 'users',
                x: 100,
                y: 200,
                color: '#123456',
                width: 300,
                expanded: false,
                order: 3,
            },
        ],
    });
    await expect(
        exportLayoutPackage('source', source, { tableKeys: [] })
    ).rejects.toThrow('선택');
    await expect(
        exportLayoutPackage('source', source, { tableKeys: ['missing'] })
    ).rejects.toThrow('목록');
    for (const change of [
        { tables: [] },
        { tables: [{ ...partial.layout.tables[0], fields: [] }] },
        { ...partial.layout, areas: [] },
        { tables: [partial.layout.tables[0], partial.layout.tables[0]] },
        { tables: [{ ...partial.layout.tables[0], x: Infinity }] },
    ])
        expect(() =>
            parseLayoutPackage({ ...partial, layout: change })
        ).toThrow();
});

it('limits the selection catalog to current ERD tables even with shared repository layouts', async () => {
    await seed();
    await applyLayoutPackage(
        'target',
        source,
        await exportLayoutPackage('source', source)
    );
    const catalog = await layoutTableCatalog('source', source);
    expect(catalog.tables.map((table) => table.name)).toEqual(['users']);
    expect(catalog.currentTableKeys).toEqual([
        tableKey({ schema: 'public', name: 'users' }),
    ]);
});

it('partially applies and restores only matching schema/name positions, preserving every other collection', async () => {
    await seed();
    const partial = await exportLayoutPackage('source', source, {
        tableKeys: [tableKey({ schema: 'public', name: 'users' })],
    });
    const target = fixture.store.view().diagrams.find((d) => d.id === 'target');
    fixture.store.mutate({
        revision: fixture.store.view().revision,
        action: 'updateDiagram',
        params: {
            id: 'target',
            attributes: {
                tables: [
                    ...target.tables,
                    {
                        ...target.tables[0],
                        id: 'audit-users',
                        schema: 'audit',
                        x: 555,
                    },
                ],
                relationships: [
                    {
                        id: 'relation',
                        sourceTableId: 'target-users',
                        targetTableId: 'target-extra',
                    },
                ],
            },
        },
    });
    const before = fixture.store.view();
    const original = before.diagrams.find((d) => d.id === 'target');
    // A valid unmatched table is reported and skipped; no schema is created.
    partial.layout.tables.push({
        ...partial.layout.tables[0],
        name: 'not_in_target',
    });
    expect(await previewLayoutPackage('target', source, partial)).toMatchObject(
        {
            partial: true,
            matchedTables: 1,
            skippedTables: 1,
            counts: { tables: 2, areas: 0, notes: 0 },
        }
    );
    expect(await applyLayoutPackage('target', source, partial)).toEqual({
        matchedTables: 1,
        skippedTables: 1,
        areas: 0,
        notes: 0,
    });
    let current = fixture.store.view().diagrams.find((d) => d.id === 'target');
    expect(current.tables.find((t) => t.id === 'target-users')).toMatchObject({
        x: 100,
        color: '#123456',
        parentAreaId: original.tables[0].parentAreaId,
        fields: original.tables[0].fields,
    });
    expect(current.tables.filter((t) => t.id !== 'target-users')).toEqual(
        original.tables.filter((t) => t.id !== 'target-users')
    );
    for (const name of ['areas', 'notes', 'relationships'])
        expect(current[name]).toEqual(original[name]);
    fixture.store.mutate({
        revision: fixture.store.view().revision,
        action: 'updateTable',
        params: { id: 'target-extra', attributes: { x: 4321 } },
    });
    await restoreLayoutBackup('target', source);
    current = fixture.store.view().diagrams.find((d) => d.id === 'target');
    expect(current.tables.find((t) => t.id === 'target-users')).toMatchObject({
        x: 900,
        color: '#ffffff',
    });
    expect(current.tables.find((t) => t.id === 'target-extra').x).toBe(4321);
    expect(current.notes).toEqual(original.notes);
    await restoreLayoutBackup('target', source);
    expect(
        fixture.store.view().diagrams.find((d) => d.id === 'target').tables
    ).toEqual(current.tables);
});

it('keeps hidden cross-branch tables, areas and notes intact during partial application and restore', async () => {
    await seed();
    const partial = await exportLayoutPackage('source', source, {
        tableKeys: [tableKey({ schema: 'public', name: 'users' })],
    });
    const initial = fixture.store
        .view()
        .diagrams.find((d) => d.id === 'target');
    fixture.store.syncSnapshots({
        snapshots: [
            {
                repositoryUrl: source.repositoryUrl,
                revision: 'other-1',
                diagram: {
                    ...initial,
                    id: 'other-branch',
                    tables: [
                        {
                            ...initial.tables[0],
                            id: 'other-only',
                            name: 'other_only',
                            x: 1234,
                            parentAreaId: 'hidden-area',
                        },
                    ],
                    areas: [
                        {
                            ...initial.areas[0],
                            id: 'hidden-area',
                            name: 'Hidden',
                        },
                    ],
                    notes: [
                        {
                            ...initial.notes[0],
                            id: 'shared-note',
                            content: 'keep hidden note',
                        },
                    ],
                },
            },
        ],
    });
    const before = fixture.store.view();
    const shared = before.layouts[0];
    const otherKey = tableKey({ schema: 'public', name: 'other_only' });
    await applyLayoutPackage('target', source, partial);
    let after = fixture.store.view();
    expect(after.layouts[0].tables[otherKey]).toEqual(shared.tables[otherKey]);
    expect(after.layouts[0].areas).toEqual(shared.areas);
    expect(after.layouts[0].notes).toEqual(shared.notes);
    expect(after.diagrams.find((d) => d.id === 'other-branch')).toEqual(
        before.diagrams.find((d) => d.id === 'other-branch')
    );
    await restoreLayoutBackup('target', source);
    after = fixture.store.view();
    expect(after.layouts[0].tables[otherKey]).toEqual(shared.tables[otherKey]);
    expect(after.layouts[0].areas).toEqual(shared.areas);
    expect(after.layouts[0].notes).toEqual(shared.notes);
});

it('leaves state untouched for unmatched files and aborts partial application when its backup fails', async () => {
    await seed();
    const partial = await exportLayoutPackage('source', source, {
        tableKeys: [tableKey({ schema: 'public', name: 'users' })],
    });
    const before = fixture.store.view();
    const missing = structuredClone(partial);
    missing.layout.tables[0].name = 'absent';
    await expect(
        applyLayoutPackage('target', source, missing)
    ).resolves.toMatchObject({ matchedTables: 0, skippedTables: 1 });
    expect(fixture.store.view()).toEqual(before);
    fixture.store.db.exec(
        "CREATE TRIGGER no_partial_backup BEFORE INSERT ON backups BEGIN SELECT RAISE(FAIL,'full'); END"
    );
    await expect(applyLayoutPackage('target', source, partial)).rejects.toThrow(
        '중단'
    );
    const after = fixture.store.view();
    expect(after.diagrams).toEqual(before.diagrams);
    expect(after.layouts).toEqual(before.layouts);
    expect(after.backups).toEqual(before.backups);
    expect(after.revision).toEqual(before.revision);
});
