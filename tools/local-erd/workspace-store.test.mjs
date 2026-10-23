import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openWorkspace } from './workspace-store.mjs';
const diagram = (id = 'debut-main', x = 100) => ({
    id,
    name: id,
    databaseType: 'postgresql',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tables: [
        {
            id: `${id}-table`,
            name: 'users',
            schema: 'public',
            x,
            y: 20,
            color: 'red',
            fields: [],
            indexes: [],
        },
    ],
    relationships: [],
    areas: [],
    notes: [],
});
function fixture(t, options) {
    const state = mkdtempSync(path.join(tmpdir(), 'keeperd-sqlite-'));
    let store = openWorkspace(state, options);
    t.after(() => {
        store.close();
        rmSync(state, { recursive: true, force: true });
    });
    return {
        get store() {
            return store;
        },
        reopen() {
            store.close();
            store = openWorkspace(state, options);
            return store;
        },
    };
}
const snapshot = (item, revision = '1') => ({
    snapshots: [
        {
            diagram: item,
            revision,
            repositoryUrl: 'https://github.com/example/backend',
        },
    ],
});

test('persists full ERD data and config through a real SQLite close/reopen', (t) => {
    const f = fixture(t);
    f.store.syncSnapshots(snapshot(diagram()));
    let value = f.store.view();
    value = f.store.mutate({
        revision: value.revision,
        action: 'updateTable',
        params: { id: 'debut-main-table', attributes: { x: 900 } },
    });
    f.store.mutate({
        revision: value.revision,
        action: 'updateConfig',
        params: { defaultDiagramId: 'debut-main' },
    });
    value = f.reopen().view();
    assert.equal(value.diagrams[0].tables[0].x, 900);
    assert.equal(value.config.defaultDiagramId, 'debut-main');
});
test('rejects stale writes from another browser and retains the winning edit', (t) => {
    const { store } = fixture(t);
    store.syncSnapshots(snapshot(diagram()));
    const revision = store.view().revision;
    store.mutate({
        revision,
        action: 'updateTable',
        params: { id: 'debut-main-table', attributes: { x: 555 } },
    });
    assert.throws(
        () =>
            store.mutate({
                revision,
                action: 'updateTable',
                params: { id: 'debut-main-table', attributes: { x: 2 } },
            }),
        (error) => error.code === 'WORKSPACE_CONFLICT'
    );
    assert.equal(store.view().diagrams[0].tables[0].x, 555);
});
const dated = (x, day) => ({
    ...diagram('debut-main', x),
    updatedAt: `2026-01-${day}T00:00:00.000Z`,
});
test('automatically selects the latest browser snapshot in either arrival order, with coherent deletions and recovery backups', (t) => {
    for (const order of [
        [dated(888, '03'), dated(777, '02')],
        [dated(777, '02'), dated(888, '03')],
    ]) {
        const { store } = fixture(t);
        store.syncSnapshots(snapshot(diagram()));
        const older = order.find((d) => d.tables[0].x === 777);
        older.notes = [{ id: 'deleted-note', content: 'old' }];
        older.tables.push({ ...diagram('removed').tables[0], name: 'removed' });
        let result;
        for (const original of order)
            result = store.migrate({
                diagrams: [original],
                filters: [
                    {
                        diagramId: original.id,
                        tableIds: [original.tables[0].id],
                        label: original.tables[0].x,
                    },
                ],
            });
        assert.equal(result.diagrams.length, 1);
        assert.equal(result.diagrams[0].tables[0].x, 888);
        assert.deepEqual(result.diagrams[0].notes, []);
        assert.equal(result.filters['debut-main'].label, 888);
        assert.ok(
            result.backups.some(
                (item) => store.readBackup(item.id).tables?.[0]?.x === 777
            )
        );
        const before = store.view();
        for (const original of order) store.migrate({ diagrams: [original] });
        assert.deepEqual(store.view(), before);
        store.removeMany(['debut-main']);
        assert.equal(store.migrate({ diagrams: order }).diagrams.length, 0);
    }
});
test('latest browser filter deletions and later server filter deletions survive legacy reloads', (t) => {
    const { store } = fixture(t);
    store.syncSnapshots(snapshot(diagram()));
    const older = dated(111, '02'),
        newer = dated(222, '03');
    const filters = [{ diagramId: older.id, tableIds: [older.tables[0].id] }];
    store.migrate({ diagrams: [older], filters });
    assert.equal(
        store.migrate({ diagrams: [newer] }).filters[older.id],
        undefined
    );
    assert.equal(
        store.migrate({ diagrams: [older], filters }).filters[older.id],
        undefined
    );
    store.mutate({
        revision: store.view().revision,
        actions: [
            {
                action: 'updateDiagramFilter',
                params: { diagramId: older.id, filter: filters[0] },
            },
            { action: 'deleteDiagramFilter', params: { diagramId: older.id } },
        ],
    });
    assert.equal(
        store.migrate({ diagrams: [newer], filters }).filters[older.id],
        undefined
    );
});
test('archives the old server layout before applying an incoming shared layout', (t) => {
    const { store } = fixture(t);
    store.syncSnapshots(snapshot(diagram()));
    store.migrate({ diagrams: [dated(111, '02')] });
    const repository = 'https://github.com/example/backend';
    const next = dated(999, '03');
    const state = store.migrate({
        diagrams: [next],
        layouts: [
            {
                id: repository,
                version: 2,
                tables: { '["public","users"]': { x: 999, y: 20 } },
                areas: [],
                notes: [],
            },
        ],
    });
    assert.equal(state.diagrams[0].tables[0].x, 999);
    assert.ok(
        state.backups.some(
            (item) => store.readBackup(item.id).tables?.[0]?.x === 111
        )
    );
});
test('migration of a known old Git revision preserves the current schema even after an unknown browser imported first', (t) => {
    const { store } = fixture(t);
    store.syncSnapshots(snapshot(diagram(), 'current'));
    const older = dated(111, '02');
    older.tables.push({ ...diagram('retired').tables[0], name: 'retired' });
    store.migrate({ diagrams: [older] });
    const incoming = {
        ...older,
        name: 'Newest browser work',
        updatedAt: dated(1, '03').updatedAt,
        tables: older.tables.map((table) => ({ ...table, x: 999 })),
        notes: [{ id: 'note', content: 'keep this edit' }],
    };
    const state = store.migrate({
        diagrams: [incoming],
        sourceRevisions: { 'debut-main': 'v2:old' },
    });
    assert.deepEqual(
        state.diagrams[0].tables.map((table) => table.name),
        ['users']
    );
    assert.equal(state.diagrams[0].tables[0].x, 999);
    assert.equal(state.diagrams[0].name, incoming.name);
    assert.equal(state.diagrams[0].updatedAt, incoming.updatedAt);
    assert.equal(state.diagrams[0].notes[0].content, 'keep this edit');
    assert.ok(
        state.backups.some((item) =>
            store
                .readBackup(item.id)
                .tables?.some((table) => table.name === 'retired')
        )
    );
    const sameRevision = { ...incoming, updatedAt: dated(1, '04').updatedAt };
    assert.equal(
        store.migrate({
            diagrams: [sameRevision],
            sourceRevisions: { 'debut-main': 'v2:current' },
        }).diagrams[0].tables.length,
        2
    );
});
test('equal timestamps keep the saved ERD without duplicates and archive the other browser', (t) => {
    const { store } = fixture(t);
    store.syncSnapshots(snapshot(diagram()));
    store.migrate({ diagrams: [dated(111, '02')] });
    const state = store.migrate({ diagrams: [dated(222, '02')] });
    assert.equal(state.diagrams.length, 1);
    assert.equal(state.diagrams[0].tables[0].x, 111);
    assert.ok(
        state.backups.some(
            (item) => store.readBackup(item.id).tables?.[0]?.x === 222
        )
    );
});
test('Git schema refresh does not advance user edit time or beat a newer browser import after restart', (t) => {
    const f = fixture(t);
    f.store.syncSnapshots(snapshot(diagram()));
    f.store.migrate({ diagrams: [dated(111, '02')] });
    f.store.syncSnapshots(
        snapshot({ ...diagram(), updatedAt: '2026-12-01T00:00:00.000Z' }, '2')
    );
    assert.equal(
        f.store.view().diagrams[0].updatedAt,
        dated(111, '02').updatedAt
    );
    const state = f.reopen().migrate({ diagrams: [dated(222, '03')] });
    assert.equal(state.diagrams[0].tables[0].x, 222);
});
test('a delayed legacy browser cannot overwrite a server edit, even when replacement JSON carries an old date', (t) => {
    const { store } = fixture(t);
    store.syncSnapshots(snapshot(diagram()));
    store.migrate({ diagrams: [dated(111, '02')] });
    const state = store.mutate({
        revision: store.view().revision,
        action: 'replaceDiagram',
        params: { id: 'debut-main', diagram: dated(999, '01') },
    });
    assert.ok(
        Date.parse(state.diagrams[0].updatedAt) >
            Date.parse(dated(222, '03').updatedAt)
    );
    assert.equal(
        store.migrate({ diagrams: [dated(222, '03')] }).diagrams[0].tables[0].x,
        999
    );
});
test('shared repository positions follow edit time across branches rather than import order', (t) => {
    const { store } = fixture(t);
    store.syncSnapshots(snapshot(diagram()));
    store.syncSnapshots(snapshot(diagram('debut-feature')));
    const newest = {
        ...diagram('debut-feature', 999),
        updatedAt: dated(1, '04').updatedAt,
    };
    const older = dated(111, '02');
    const state = store.migrate({ diagrams: [newest, older] });
    assert.deepEqual(
        state.diagrams.map((d) => d.tables[0].x),
        [999, 999]
    );
    const laterBrowser = {
        ...older,
        updatedAt: dated(1, '03').updatedAt,
        tables: [{ ...older.tables[0], x: 555 }],
    };
    assert.deepEqual(
        store
            .migrate({ diagrams: [laterBrowser] })
            .diagrams.map((d) => d.tables[0].x),
        [999, 999]
    );
});
test('migrates v2 layout-only table positions, config and every collection without dropping standalone diagrams', (t) => {
    const { store } = fixture(t);
    const original = {
        ...dated(777, '02'),
        relationships: [
            {
                id: 'relationship',
                sourceTableId: 'debut-main-table',
                targetTableId: 'debut-main-table',
            },
        ],
        dependencies: [{ id: 'dependency' }],
        customTypes: [{ id: 'type', name: 'enum' }],
        areas: [{ id: 'area', name: 'group' }],
        notes: [{ id: 'note', content: 'memo' }],
    };
    const repository = 'https://github.com/example/backend';
    const layout = {
        version: 2,
        id: repository,
        tables: { '["public","only_in_another_branch"]': { x: 432, y: 1 } },
        areas: [],
        notes: [],
    };
    let state = store.migrate({
        diagrams: [original],
        layouts: [layout],
        config: { id: 1, defaultDiagramId: original.id },
        filters: [{ diagramId: original.id, tableIds: ['debut-main-table'] }],
    });
    assert.deepEqual(state.diagrams[0], original);
    assert.equal(state.config.defaultDiagramId, original.id);
    assert.equal(
        state.layouts[0].tables['["public","only_in_another_branch"]'].x,
        432
    );
    const before = store.view();
    state = store.migrate({ diagrams: [original], layouts: [layout] });
    assert.deepEqual(state, before);
});
test('syncs new schema while keeping positions, notes and cross-branch repository layout', (t) => {
    const { store } = fixture(t);
    store.syncSnapshots(snapshot(diagram()));
    let view = store.migrate({
        diagrams: [
            {
                ...diagram('debut-main', 777),
                notes: [{ id: 'note', content: 'keep', x: 1, y: 2 }],
            },
        ],
    });
    store.syncSnapshots(
        snapshot(
            {
                ...diagram(),
                tables: [
                    ...diagram().tables,
                    { ...diagram('new').tables[0], name: 'new' },
                ],
            },
            '2'
        )
    );
    view = store.view();
    assert.equal(view.diagrams[0].tables.length, 2);
    assert.equal(view.diagrams[0].tables[0].x, 777);
    assert.equal(view.diagrams[0].notes[0].content, 'keep');
    store.syncSnapshots(snapshot(diagram('debut-feature', 5)));
    assert.equal(
        store.view().diagrams.find((d) => d.id === 'debut-feature').tables[0].x,
        777
    );
});
test('bounds backups by count and actual UTF-8 bytes, even across diagrams', (t) => {
    const { store } = fixture(t, {
        policy: { perDiagram: 2, count: 3, bytes: 2000 },
        warn: () => {},
    });
    for (let i = 0; i < 7; i++)
        store.migrate({
            diagrams: [],
            backups: [
                {
                    diagramId: `id-${i % 2}`,
                    key: `backup-${i}`,
                    value: '한'.repeat(200),
                },
            ],
        });
    const backups = store.view().backups;
    assert.ok(backups.length <= 3);
    assert.ok(backups.reduce((n, b) => n + b.bytes, 0) <= 2000);
    assert.ok(backups.filter((b) => b.diagramId === 'id-0').length <= 2);
});
test('backup write failure does not prevent schema import, reading or primary saving', (t) => {
    const { store } = fixture(t, { warn: () => {} });
    store.syncSnapshots(snapshot(diagram()));
    store.db.exec(
        "CREATE TRIGGER fail_backup BEFORE INSERT ON backups BEGIN SELECT RAISE(FAIL,'disk full'); END"
    );
    store.syncSnapshots(snapshot({ ...diagram(), name: 'new schema' }, '2'));
    let value = store.view();
    assert.equal(value.diagrams[0].name, 'new schema');
    assert.ok(value.warning);
    value = store.mutate({
        revision: value.revision,
        action: 'replaceDiagram',
        params: {
            id: 'debut-main',
            diagram: { ...value.diagrams[0], name: 'still writable' },
        },
    });
    assert.equal(value.diagrams[0].name, 'still writable');
});
test('failed required writes roll back the transaction and revision', (t) => {
    const { store } = fixture(t);
    store.syncSnapshots(snapshot(diagram()));
    const before = store.view();
    store.db.exec(
        "CREATE TRIGGER fail_primary BEFORE INSERT ON diagrams BEGIN SELECT RAISE(FAIL,'disk full'); END"
    );
    assert.throws(() =>
        store.mutate({
            revision: before.revision,
            action: 'updateTable',
            params: { id: 'debut-main-table', attributes: { x: 999 } },
        })
    );
    assert.deepEqual(store.view(), before);
});

test('renames a diagram atomically and retains its filter, rows and default selection', (t) => {
    const { store } = fixture(t);
    store.syncSnapshots(snapshot(diagram()));
    let state = store.mutate({
        revision: store.view().revision,
        actions: [
            {
                action: 'updateConfig',
                params: { defaultDiagramId: 'debut-main' },
            },
            {
                action: 'updateDiagramFilter',
                params: {
                    diagramId: 'debut-main',
                    filter: { tableIds: ['debut-main-table'] },
                },
            },
        ],
    });
    state = store.mutate({
        revision: state.revision,
        action: 'updateDiagram',
        params: { id: 'debut-main', attributes: { id: 'renamed' } },
    });
    assert.equal(state.diagrams.length, 1);
    assert.equal(state.diagrams[0].id, 'renamed');
    assert.equal(state.diagrams[0].tables.length, 1);
    assert.equal(state.config.defaultDiagramId, 'renamed');
    assert.deepEqual(state.filters.renamed.tableIds, ['debut-main-table']);
});

test('preserves new Area and note IDs across subsequent edits and rolls back a failed multi-edit batch', (t) => {
    const { store } = fixture(t);
    store.syncSnapshots(snapshot(diagram()));
    let state = store.mutate({
        revision: store.view().revision,
        actions: [
            {
                action: 'addArea',
                params: {
                    diagramId: 'debut-main',
                    area: { id: 'area', name: 'A' },
                },
            },
            {
                action: 'addNote',
                params: {
                    diagramId: 'debut-main',
                    note: { id: 'note', content: 'N' },
                },
            },
        ],
    });
    assert.equal(state.diagrams[0].areas[0].id, 'area');
    assert.equal(state.diagrams[0].notes[0].id, 'note');
    state = store.mutate({
        revision: state.revision,
        action: 'updateNote',
        params: { id: 'note', attributes: { content: 'kept' } },
    });
    assert.equal(state.diagrams[0].notes[0].content, 'kept');
    const before = store.view();
    assert.throws(() =>
        store.mutate({
            revision: before.revision,
            actions: [
                {
                    action: 'updateTable',
                    params: { id: 'debut-main-table', attributes: { x: 999 } },
                },
                {
                    action: 'updateNote',
                    params: { id: 'missing', attributes: { content: 'fail' } },
                },
            ],
        })
    );
    assert.deepEqual(store.view(), before);
});
