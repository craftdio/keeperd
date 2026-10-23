import assert from 'node:assert/strict';
import process from 'node:process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const bundle = process.argv[2];
assert.ok(bundle, 'Pass the extracted KeepERD release directory.');
const { openWorkspace } = await import(
    pathToFileURL(path.resolve(bundle, 'tools/local-erd/workspace-store.mjs'))
);
const directory = mkdtempSync(path.join(tmpdir(), 'keeperd-release-smoke-'));
let store;
try {
    store = openWorkspace(directory);
    const diagram = {
        id: 'release-smoke',
        name: 'Packaged SQLite workspace',
        databaseType: 'postgresql',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        tables: [],
        notes: [{ id: 'note', content: 'Persisted without node_modules' }],
    };
    store.migrate({ diagrams: [diagram] });
    assert.equal(
        store.db.prepare('SELECT sqlite_version() version').get().version,
        '3.54.0'
    );
    store.close();
    store = openWorkspace(directory);
    assert.deepEqual(store.view().diagrams, [diagram]);
    console.log(
        'Extracted release: SQLite migration and restart persistence passed.'
    );
} finally {
    store?.close();
    rmSync(directory, { recursive: true, force: true });
}
