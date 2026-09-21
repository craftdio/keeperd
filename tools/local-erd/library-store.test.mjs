import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdtemp,
    writeFile,
    readFile,
    readdir,
    rm,
    symlink,
    unlink,
    realpath,
} from 'node:fs/promises';
import path from 'node:path';
import { mkdir, copyFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { listSaved, deleteSaved } from './library-store.mjs';
async function fixture(t) {
    const data = await mkdtemp(
        path.join(await realpath(tmpdir()), 'chartdb-library-test-')
    );
    t.after(() => rm(data, { recursive: true, force: true }));
    const snapshots = ['main', 'develop'].map((branch) => ({
        branch,
        diagram: { id: `debut-${branch}`, name: branch },
        tables: 3,
        revision: 'fixture',
        schemaSource: {
            kind: 'atlas-schema',
            label: 'Atlas 선언 스키마',
            path: 'db/schema/*.sql',
            files: 2,
        },
    }));
    await writeFile(
        path.join(data, 'snapshots.json'),
        JSON.stringify({ snapshots })
    );
    for (const branch of ['main', 'develop'])
        await writeFile(
            path.join(data, `${branch}.chartdb.json`),
            JSON.stringify({ id: `debut-${branch}` })
        );
    await writeFile(path.join(data, 'unrelated.txt'), 'keep');
    return data;
}
test('lists compact metadata and removes only selected snapshots and files', async (t) => {
    const data = await fixture(t);
    const listed = await listSaved(
        data,
        'https://github.com/example/backend.git'
    );
    assert.equal(listed.items.length, 2);
    assert.equal(
        listed.items[0].repositoryUrl,
        'https://github.com/example/backend.git'
    );
    assert.equal(listed.items[0].diagram, undefined);
    assert.equal(listed.items[0].schemaSource.kind, 'atlas-schema');
    assert.ok(listed.items[0].bytes > 0);
    const remaining = await readFile(path.join(data, 'develop.chartdb.json'));
    const deleted = await deleteSaved(data, ['debut-main']);
    assert.deepEqual(deleted.deleted, ['debut-main']);
    assert.equal(deleted.cleanupPending, false);
    assert.ok(deleted.releasedBytes > 0);
    assert.deepEqual(
        (await listSaved(data, 'fixture')).items.map((i) => i.id),
        ['debut-develop']
    );
    assert.deepEqual(
        await readFile(path.join(data, 'develop.chartdb.json')),
        remaining
    );
    assert.equal(
        await readFile(path.join(data, 'unrelated.txt'), 'utf8'),
        'keep'
    );
    assert.deepEqual((await readdir(data)).sort(), [
        'develop.chartdb.json',
        'snapshots.json',
        'unrelated.txt',
    ]);
});
test('validates the whole selection before deleting and rejects stale IDs and symlinks', async (t) => {
    const data = await fixture(t);
    const before = await readFile(path.join(data, 'snapshots.json'));
    for (const ids of [
        [],
        ['debut-main', 'debut-missing'],
        ['debut-main', '../config'],
        ['debut-../../config'],
        new Array(101).fill('debut-main'),
    ])
        await assert.rejects(deleteSaved(data, ids));
    assert.deepEqual(await readFile(path.join(data, 'snapshots.json')), before);
    await unlink(path.join(data, 'main.chartdb.json'));
    await symlink(
        path.join(data, 'unrelated.txt'),
        path.join(data, 'main.chartdb.json')
    );
    await assert.rejects(deleteSaved(data, ['debut-main']), {
        code: 'INVALID_SNAPSHOT_FILE',
    });
    assert.equal(
        await readFile(path.join(data, 'unrelated.txt'), 'utf8'),
        'keep'
    );
    assert.deepEqual(await readFile(path.join(data, 'snapshots.json')), before);
});
test('removes stale manifest entries with missing JSON without touching other files', async (t) => {
    const data = await fixture(t);
    await unlink(path.join(data, 'main.chartdb.json'));
    await deleteSaved(data, ['debut-main']);
    assert.deepEqual(
        (await listSaved(data, 'fixture')).items.map((i) => i.id),
        ['debut-develop']
    );
});

test('serves the management page without GitHub auth and protects deletion APIs', async (t) => {
    const project = await mkdtemp(
        path.join(await realpath(tmpdir()), 'chartdb-library-api-')
    );
    let child;
    t.after(async () => {
        child?.kill('SIGTERM');
        await rm(project, { recursive: true, force: true });
    });
    const root = path.join(project, 'tools/local-erd');
    const data = path.join(project, '.local-erd/data');
    await mkdir(root, { recursive: true });
    await mkdir(data, { recursive: true });
    await mkdir(path.join(project, 'dist'));
    const reserve = createServer();
    await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve));
    const port = reserve.address().port;
    await new Promise((resolve) => reserve.close(resolve));
    const source = path.dirname(new URL(import.meta.url).pathname);
    for (const name of [
        'branches.mjs',
        'folder-picker.mjs',
        'library-store.mjs',
        'local-source.mjs',
        'memory-cache.mjs',
        'build-state.mjs',
        'cli-command.mjs',
        'state-paths.mjs',
        'state-lock.mjs',
        'node-command.mjs',
    ])
        await copyFile(path.join(source, name), path.join(root, name));
    await writeFile(
        path.join(root, 'server.mjs'),
        (await readFile(path.join(source, 'server.mjs'), 'utf8')).replaceAll(
            '18777',
            String(port)
        )
    );
    await writeFile(path.join(root, 'library.html'), '<h1>Saved fixture</h1>');
    await writeFile(
        path.join(root, 'sync.mjs'),
        'setTimeout(() => process.exit(0), 300);'
    );
    await writeFile(path.join(project, 'dist/index.html'), 'fixture');
    await writeFile(
        path.join(project, 'dist/.keeperd-build.json'),
        JSON.stringify({ sourceRevision: null })
    );
    await writeFile(
        path.join(project, '.local-erd/config.json'),
        JSON.stringify({
            repositoryUrl: 'https://github.com/example/backend.git',
        })
    );
    await writeFile(
        path.join(data, 'snapshots.json'),
        JSON.stringify({
            snapshots: [
                { branch: 'main', diagram: { id: 'debut-main', name: 'main' } },
            ],
        })
    );
    await writeFile(path.join(data, 'main.chartdb.json'), 'fixture');
    child = spawn(process.execPath, [path.join(root, 'server.mjs')], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            KEEPERD_STATE_DIR: path.join(project, '.local-erd'),
        },
    });
    await new Promise((resolve, reject) => {
        let errors = '';
        const timeout = setTimeout(
            () => reject(new Error(`Server start timeout\n${errors}`)),
            5000
        );
        child.stderr.on('data', (chunk) => (errors += chunk));
        child.stdout.once('data', () => {
            clearTimeout(timeout);
            resolve();
        });
        child.once('error', reject);
        child.once('exit', (code) => {
            clearTimeout(timeout);
            reject(new Error(`Server exited with ${code}\n${errors}`));
        });
    });
    const base = `http://127.0.0.1:${port}`;
    assert.match(await (await fetch(`${base}/saved`)).text(), /Saved fixture/);
    assert.equal(
        (await (await fetch(`${base}/api/library`)).json()).items.length,
        1
    );
    const post = (ids, headers = {}) =>
        fetch(`${base}/api/library`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Local-ERD': 'sync',
                ...headers,
            },
            body: JSON.stringify({ ids }),
        });
    assert.equal(
        (await post(['debut-main'], { Origin: 'https://outside.example' }))
            .status,
        403
    );
    assert.equal(
        (await post(['debut-main'], { 'X-Local-ERD': 'wrong' })).status,
        403
    );
    assert.equal((await post(['../config'])).status, 400);
    assert.equal(
        (
            await fetch(`${base}/api/sync?branch=main`, {
                method: 'POST',
                headers: { 'X-Local-ERD': 'sync' },
            })
        ).status,
        202
    );
    assert.equal((await post(['debut-main'])).status, 409);
    for (let n = 0; n < 50; n++) {
        const job = await (await fetch(`${base}/api/sync`)).json();
        if (job.status !== 'running') break;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal((await post(['debut-main'])).status, 200);
    assert.deepEqual(
        (await (await fetch(`${base}/api/library`)).json()).items,
        []
    );
});
