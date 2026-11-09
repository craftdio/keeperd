import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openWorkspace } from './workspace-store.mjs';
import { performanceSnapshots } from './performance-fixture.mjs';

function fixture(t) {
    const root = mkdtempSync(path.join(tmpdir(), 'keeperd-selection-'));
    const store = openWorkspace(root);
    t.after(() => {
        store.close();
        rmSync(root, { recursive: true, force: true });
    });
    store.syncSnapshots(performanceSnapshots({ tables: 100, diagrams: 14 }));
    return store;
}

test('scoped reads return the requested metadata, diagram, collection or entity without other schemas', (t) => {
    const store = fixture(t),
        full = store.view();
    const entity = {
        kind: 'entity',
        diagramId: 'debut-perf-0',
        collection: 'tables',
        id: 'debut-perf-0-table-0',
    };
    const result = store.view(entity);
    assert.equal(result.kind, 'selection-v1');
    assert.deepEqual(result.value, full.diagrams[0].tables[0]);
    assert.equal(result.revision, full.revision);
    assert.ok(
        JSON.stringify(result).length < JSON.stringify(full).length / 100
    );
    const metadata = store.view({ kind: 'diagrams' }).value;
    assert.equal(metadata.length, 14);
    assert.ok(
        metadata.every((d) => !('tables' in d) && !('relationships' in d))
    );
    assert.deepEqual(store.view({ kind: 'config' }).value, full.config);
    assert.deepEqual(
        store.view({
            kind: 'diagram',
            diagramId: 'debut-perf-0',
            includes: ['tables'],
        }).value.tables,
        full.diagrams[0].tables
    );
    assert.equal(
        store.view({ kind: 'diagram', diagramId: 'absent' }).value,
        undefined
    );
    assert.deepEqual(
        store.view({ ...entity, kind: 'collection' }).value,
        full.diagrams[0].tables
    );
    assert.equal(store.view({ ...entity, id: 'absent' }).value, undefined);
    for (const invalid of [
        null,
        [],
        { kind: 'unknown' },
        { kind: 'entity', diagramId: 'x', id: 'y', collection: '__proto__' },
        { kind: 'diagrams', includes: ['backups'] },
    ])
        assert.throws(() => store.view(invalid), {
            code: 'INVALID_WORKSPACE_INPUT',
            status: 400,
        });
});

test('revision-only writes preserve cross-branch layouts, legacy snapshots, conflicts and atomic failure', (t) => {
    const store = fixture(t);
    const revision = store.view().revision;
    const edit = {
        action: 'updateTable',
        params: { id: 'debut-perf-0-table-0', attributes: { x: 800 } },
    };
    const receipt = store.mutate({ ...edit, revision, response: 'ack-v1' });
    assert.deepEqual(receipt, { kind: 'ack-v1', revision: revision + 1 });
    const other = store.view({
        kind: 'entity',
        diagramId: 'debut-perf-1',
        collection: 'tables',
        id: 'debut-perf-1-table-0',
    }).value;
    assert.equal(other.x, 800);
    assert.equal(other.fields[0].id, 'debut-perf-1-table-0-field-0');
    assert.throws(
        () => store.mutate({ ...edit, revision, response: 'ack-v1' }),
        { code: 'WORKSPACE_CONFLICT', status: 409 }
    );
    const before = store.view();
    assert.throws(() =>
        store.mutate({
            revision: receipt.revision,
            response: 'ack-v1',
            actions: [edit, { action: 'unsupported' }],
        })
    );
    assert.deepEqual(store.view(), before);
    const legacy = store.mutate({ ...edit, revision: receipt.revision });
    assert.equal(legacy.diagrams.length, 14);
    assert.equal(legacy.diagrams[1].tables[0].x, 800);
    assert.equal(legacy.kind, undefined);
});
