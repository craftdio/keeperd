import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import {
    copyFileSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const sourceRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..'
);
const cli = path.join(sourceRoot, 'bin/keeperd.mjs');
const runtime = path.join(sourceRoot, 'tools/local-erd');

function fixture(t) {
    const root = mkdtempSync(path.join(tmpdir(), 'keeperd-stop-test-'));
    const tools = path.join(root, 'tools/local-erd');
    const state = path.join(root, 'state');
    mkdirSync(tools, { recursive: true });
    mkdirSync(path.join(root, 'dist'), { recursive: true });
    mkdirSync(path.join(state, 'data'), { recursive: true });
    for (const name of readdirSync(runtime))
        if (/\.(?:mjs|js)$/.test(name) && !/\.test\.(?:mjs|js)$/.test(name))
            copyFileSync(path.join(runtime, name), path.join(tools, name));
    writeFileSync(
        path.join(root, 'dist/index.html'),
        '<body>existing ERD</body>'
    );
    writeFileSync(
        path.join(root, 'dist/.keeperd-build.json'),
        '{"sourceRevision":null}'
    );
    writeFileSync(
        path.join(state, 'config.json'),
        JSON.stringify({
            repositoryUrl: 'https://github.com/example/backend.git',
        })
    );
    writeFileSync(
        path.join(state, 'data/snapshots.json'),
        JSON.stringify({
            snapshots: [{ branch: 'main', diagram: { id: 'saved-main' } }],
        })
    );
    writeFileSync(
        path.join(tools, 'sync.mjs'),
        'setTimeout(() => process.exit(0), 1500);'
    );
    t.after(() => rmSync(root, { recursive: true, force: true }));
    return { root, state, tools, lock: path.join(state, '.keeperd.lock') };
}

async function startServer(t, fixtureRoot) {
    const child = spawn(
        process.execPath,
        [path.join(fixtureRoot.tools, 'server.mjs')],
        {
            env: {
                ...process.env,
                CI: 'true',
                KEEPERD_STATE_DIR: fixtureRoot.state,
                LOCAL_ERD_PORT: '0',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        }
    );
    t.after(() => child.kill('SIGTERM'));
    let output = '';
    let errors = '';
    child.stderr.on('data', (chunk) => (errors += chunk));
    const url = await new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`server start timeout: ${errors}`)),
            5000
        );
        child.stdout.on('data', (chunk) => {
            output += chunk;
            const match = output.match(/http:\/\/localhost:\d+/);
            if (match) {
                clearTimeout(timer);
                resolve(match[0]);
            }
        });
        child.once('error', reject);
        child.once('exit', (code) =>
            reject(new Error(`server exited ${code}: ${errors}`))
        );
    });
    return { child, url };
}

const stop = (state) =>
    spawnSync(process.execPath, [cli, 'stop'], {
        env: { ...process.env, KEEPERD_STATE_DIR: state },
        encoding: 'utf8',
        timeout: 10000,
    });
const waitExited = async (child) => {
    if (child.exitCode === null && child.signalCode === null)
        await once(child, 'exit');
};

test(
    'stop verifies the owner, releases the port, and preserves data across restart',
    { timeout: 20000 },
    async (t) => {
        const local = fixture(t);
        const originalConfig = readFileSync(
            path.join(local.state, 'config.json'),
            'utf8'
        );
        const originalSnapshots = readFileSync(
            path.join(local.state, 'data/snapshots.json'),
            'utf8'
        );
        const first = await startServer(t, local);
        const lock = JSON.parse(readFileSync(local.lock, 'utf8'));
        assert.equal(lock.port, Number(new URL(first.url).port));
        assert.equal(lock.pid, first.child.pid);
        const nonce = randomBytes(16).toString('hex');
        assert.equal(
            (
                await fetch(`${first.url}/_keeperd/stop?nonce=${nonce}`, {
                    headers: { Origin: 'https://other.example' },
                })
            ).status,
            403
        );
        assert.equal(
            (await fetch(`${first.url}/_keeperd/stop?nonce=${nonce}`)).status,
            200
        );
        assert.equal(
            (
                await fetch(`${first.url}/_keeperd/stop`, {
                    method: 'POST',
                    headers: {
                        'X-KeeperD-Stop-Nonce': nonce,
                        'X-KeeperD-Stop-Proof': '0'.repeat(64),
                    },
                })
            ).status,
            403
        );
        assert.equal(
            (await fetch(`${first.url}/_keeperd/stop`, { method: 'POST' }))
                .status,
            400
        );
        const stopped = stop(local.state);
        assert.equal(stopped.status, 0, stopped.stderr);
        assert.match(stopped.stdout, /서버가 종료됐습니다/);
        await waitExited(first.child);
        await assert.rejects(fetch(first.url));
        const second = await startServer(t, local);
        assert.equal((await fetch(second.url)).status, 200);
        assert.equal(stop(local.state).status, 0);
        await waitExited(second.child);
        assert.equal(
            readFileSync(path.join(local.state, 'config.json'), 'utf8'),
            originalConfig
        );
        assert.equal(
            readFileSync(path.join(local.state, 'data/snapshots.json'), 'utf8'),
            originalSnapshots
        );
        assert.match(
            stop(local.state).stdout,
            /실행 중인 KeepERD 서버가 없습니다/
        );
    }
);

test(
    'a reused PID or unrelated listener is never signalled',
    { timeout: 15000 },
    async (t) => {
        const local = fixture(t);
        const server = await startServer(t, local);
        const original = readFileSync(local.lock, 'utf8');
        writeFileSync(
            local.lock,
            JSON.stringify({ ...JSON.parse(original), pid: process.pid })
        );
        const mismatch = stop(local.state);
        assert.equal(mismatch.status, 1);
        assert.match(mismatch.stderr, /확인할 수 없습니다|다른 프로세스/);
        assert.equal((await fetch(server.url)).status, 200);
        writeFileSync(local.lock, original);
        assert.equal(stop(local.state).status, 0);
        await waitExited(server.child);

        const unrelated = createServer((req, res) =>
            res
                .writeHead(200, { 'Content-Type': 'application/json' })
                .end(
                    JSON.stringify({ pid: process.pid, proof: '0'.repeat(64) })
                )
        );
        await new Promise((resolve) =>
            unrelated.listen(0, '127.0.0.1', resolve)
        );
        t.after(() => {
            if (unrelated.listening) unrelated.close();
        });
        const unrelatedPort = unrelated.address().port;
        writeFileSync(
            local.lock,
            JSON.stringify({
                pid: process.pid,
                port: unrelatedPort,
                token: randomUUID(),
                command: 'start',
            })
        );
        const refused = stop(local.state);
        assert.equal(refused.status, 1);
        assert.match(
            refused.stderr,
            /확인 응답|확인할 수 없습니다|다른 프로세스/
        );
        assert.equal(process.kill(process.pid, 0), true);
        await new Promise((resolve) => unrelated.close(resolve));
        writeFileSync(
            local.lock,
            JSON.stringify({
                pid: 99999999,
                port: unrelatedPort,
                token: randomUUID(),
                command: 'start',
            })
        );
        const stale = stop(local.state);
        assert.equal(stale.status, 1);
        assert.match(stale.stderr, /오래된 잠금/);
        writeFileSync(
            local.lock,
            JSON.stringify({
                pid: process.pid,
                port: unrelatedPort,
                token: randomUUID(),
                command: 'sync',
            })
        );
        const syncLock = stop(local.state);
        assert.equal(syncLock.status, 1);
        assert.match(syncLock.stderr, /Sync·초기화 작업/);
    }
);

test(
    'stop refuses an active Sync and stays inside the selected state directory',
    { timeout: 20000 },
    async (t) => {
        const firstState = fixture(t);
        const secondState = fixture(t);
        const first = await startServer(t, firstState);
        const second = await startServer(t, secondState);
        const job = await fetch(`${first.url}/api/sync?branch=main`, {
            method: 'POST',
            headers: { 'X-Local-ERD': 'sync' },
        });
        assert.equal(job.status, 202);
        const busy = stop(firstState.state);
        assert.equal(busy.status, 1);
        assert.match(busy.stderr, /Sync 또는 저장소 작업/);
        assert.equal((await fetch(first.url)).status, 200);
        assert.equal((await fetch(second.url)).status, 200);
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            if (
                (await fetch(`${first.url}/api/sync`).then((r) => r.json()))
                    .status !== 'running'
            )
                break;
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        assert.equal(stop(firstState.state).status, 0);
        await waitExited(first.child);
        assert.equal((await fetch(second.url)).status, 200);
        assert.equal(stop(secondState.state).status, 0);
        await waitExited(second.child);
    }
);
