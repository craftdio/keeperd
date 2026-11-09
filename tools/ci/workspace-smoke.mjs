import assert from 'node:assert/strict';
import process from 'node:process';
import {
    mkdtempSync,
    mkdirSync,
    writeFileSync,
    rmSync,
    existsSync,
} from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const bundle = process.argv[2];
assert.ok(bundle, 'Pass the extracted KeepERD release directory.');
assert.equal(
    existsSync(path.resolve(bundle, 'node_modules')),
    false,
    'Use an extracted archive without node_modules.'
);
const { openWorkspace } = await import(
    pathToFileURL(path.resolve(bundle, 'tools/local-erd/workspace-store.mjs'))
);
const directory = mkdtempSync(path.join(tmpdir(), 'keeperd-release-smoke-'));
let store, child;
const runtime = (file) => path.resolve(bundle, 'tools/local-erd', file);
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
    const repo = path.join(directory, 'synthetic-repository');
    mkdirSync(repo);
    const git = (...args) =>
        execFileSync('git', ['-C', repo, ...args], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
    git('init', '-b', 'main');
    git('config', 'user.name', 'Release smoke');
    git('config', 'user.email', 'release-smoke@example.invalid');
    git(
        'remote',
        'add',
        'origin',
        'https://github.com/example/keeperd-smoke.git'
    );
    mkdirSync(path.join(repo, 'db/migration'), { recursive: true });
    writeFileSync(
        path.join(repo, 'db/migration/001.sql'),
        'CREATE TABLE users(id bigint);'
    );
    git('add', '.');
    git('commit', '-m', 'synthetic schema');
    git('branch', 'feature');
    const { registerLocalRepository } = await import(
        pathToFileURL(runtime('local-source.mjs'))
    );
    const registered = registerLocalRepository(repo);
    writeFileSync(
        path.join(directory, 'config.json'),
        JSON.stringify({ localRepositories: [registered] })
    );
    const sharedDiagram = {
        ...diagram,
        id: 'debut-release-smoke',
        notes: [],
        areas: [],
        tables: [
            {
                id: 'users',
                name: 'users',
                schema: 'public',
                x: 10,
                y: 20,
                color: '#6366f1',
                fields: [],
                indexes: [],
            },
        ],
    };
    store.syncSnapshots({
        snapshots: [
            {
                diagram: sharedDiagram,
                revision: 'smoke-v1',
                repositoryUrl: registered.repositoryUrl,
            },
        ],
    });
    store.close();
    store = null;

    // Run the actual extracted server: no source checkout/node_modules fallback.
    child = spawn(process.execPath, [runtime('server.mjs'), '--no-open'], {
        cwd: path.resolve(bundle),
        env: {
            ...process.env,
            CI: 'true',
            KEEPERD_STATE_DIR: directory,
            LOCAL_ERD_PORT: '0',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
        stderr = (stderr + chunk).slice(-4000);
    });
    const base = await new Promise((resolve, reject) => {
        const timer = setTimeout(
            () =>
                reject(
                    new Error(`Packaged server startup timed out: ${stderr}`)
                ),
            10000
        );
        const fail = (error) => {
            clearTimeout(timer);
            reject(error);
        };
        child.once('error', fail);
        child.once('exit', (code) =>
            fail(new Error(`Packaged server exited (${code}): ${stderr}`))
        );
        child.stdout.on('data', (chunk) => {
            const match = String(chunk).match(/http:\/\/localhost:\d+/);
            if (match) {
                clearTimeout(timer);
                resolve(match[0]);
            }
        });
    });
    const get = async (route) => {
        const response = await fetch(`${base}${route}`, {
            signal: AbortSignal.timeout(10000),
        });
        assert.equal(
            response.status,
            200,
            `${route}: ${await response.clone().text()}`
        );
        return response.json();
    };
    const selection = {
        kind: 'entity',
        diagramId: sharedDiagram.id,
        collection: 'tables',
        id: 'users',
    };
    const readTable = () =>
        get(
            `/api/workspace?selection=${encodeURIComponent(JSON.stringify(selection))}`
        );
    const initial = await readTable();
    assert.equal(initial.kind, 'selection-v1');
    assert.equal(initial.value.x, 10);
    const post = (revision, action, params) =>
        fetch(`${base}/api/workspace`, {
            method: 'POST',
            signal: AbortSignal.timeout(10000),
            headers: {
                'Content-Type': 'application/json',
                'X-Local-ERD': 'sync',
            },
            body: JSON.stringify({
                revision,
                response: 'ack-v1',
                action,
                params,
            }),
        });
    const layout = {
        format: 'keeperd-table-layout',
        version: 1,
        repository: { url: registered.repositoryUrl },
        layout: {
            tables: [
                {
                    schema: 'public',
                    name: 'users',
                    x: 300,
                    y: 400,
                    color: '#6366f1',
                    width: null,
                    expanded: null,
                    order: null,
                },
            ],
        },
    };
    const applied = await post(initial.revision, 'applyTableLayout', {
        id: sharedDiagram.id,
        package: layout,
    });
    assert.equal(applied.status, 200);
    const receipt = await applied.json();
    assert.equal(receipt.kind, 'ack-v1');
    assert.equal(receipt.diagrams, undefined);
    assert.equal((await readTable()).value.x, 300);
    assert.equal(
        (await post(initial.revision, 'updateConfig', {})).status,
        409
    );
    const snapshot = await get('/api/workspace');
    assert.equal(
        snapshot.diagrams.length,
        2,
        'legacy full snapshot remains readable'
    );
    const backup = snapshot.backups.find(
        (item) => item.kind === 'layout-partial'
    );
    assert.ok(backup);
    const restored = await post(receipt.revision, 'restoreTableLayout', {
        id: sharedDiagram.id,
        backupId: backup.id,
    });
    assert.equal(restored.status, 200);
    assert.equal((await restored.json()).kind, 'ack-v1');
    assert.equal((await readTable()).value.x, 10);

    for (const file of [
        'layout-package.js',
        'layout-table-picker.js',
        'workspace-selection.js',
        'workspace-client.js',
    ]) {
        const response = await fetch(`${base}/${file}`, {
            signal: AbortSignal.timeout(10000),
        });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /javascript/);
    }
    const branches = () => get(`/api/local/branches?local=${registered.id}`);
    assert.equal((await branches()).branches.length, 2);
    git('branch', 'new-branch');
    writeFileSync(
        path.join(repo, 'db/migration/002.sql'),
        'CREATE TABLE roles(id bigint);'
    );
    const refreshed = await branches();
    assert.ok(
        refreshed.branches.some((branch) => branch.name === 'new-branch')
    );
    assert.equal(
        refreshed.branches.find((branch) => branch.name === 'main')
            .hasWorkingChanges,
        true
    );
    console.log(
        'Extracted release: SQLite restart, scoped reads, ACK/409, partial layout apply/restore, browser module MIME and fresh branch workers passed without node_modules.'
    );
} finally {
    if (child && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill();
        const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
        try {
            await exited;
        } finally {
            clearTimeout(timer);
        }
    }
    store?.close();
    rmSync(directory, { recursive: true, force: true });
}
