import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
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
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const source = path.dirname(fileURLToPath(import.meta.url));

function fixture(t) {
    const project = mkdtempSync(path.join(tmpdir(), 'keeperd-start-test-'));
    const tools = path.join(project, 'tools/local-erd');
    const state = path.join(project, 'state');
    const log = path.join(project, 'open.log');
    mkdirSync(tools, { recursive: true });
    mkdirSync(path.join(project, 'dist'), { recursive: true });
    mkdirSync(path.join(state, 'data'), { recursive: true });
    for (const name of readdirSync(source))
        if (/\.(?:mjs|js)$/.test(name) && !/\.test\.(?:mjs|js)$/.test(name))
            copyFileSync(path.join(source, name), path.join(tools, name));
    copyFileSync(
        path.join(source, 'index.html'),
        path.join(tools, 'index.html')
    );
    copyFileSync(
        path.join(tools, 'open-browser.mjs'),
        path.join(tools, 'open-browser-impl.mjs')
    );
    writeFileSync(
        path.join(tools, 'open-browser.mjs'),
        `export { parseStartOptions, startHelp } from './open-browser-impl.mjs';
import { appendFileSync } from 'node:fs';
export async function openDefaultBrowser(url) {
    appendFileSync(process.env.KEEPERD_OPEN_TEST_LOG, url + '\\n');
    return process.env.KEEPERD_OPEN_TEST_FAILURE ? 'failed' : 'opened';
}`
    );
    writeFileSync(path.join(project, 'dist/index.html'), '<body></body>');
    writeFileSync(
        path.join(project, 'dist/.keeperd-build.json'),
        '{"sourceRevision":null}'
    );
    writeFileSync(path.join(state, 'config.json'), '{}');
    writeFileSync(path.join(state, 'data/snapshots.json'), '{"snapshots":[]}');
    writeFileSync(log, '');
    t.after(() => rmSync(project, { recursive: true, force: true }));
    return { project, tools, state, log };
}

function start(local, args = [], env = {}) {
    const child = spawn(
        process.execPath,
        [path.join(local.tools, 'server.mjs'), ...args],
        {
            env: {
                ...process.env,
                LOCAL_ERD_PORT: '0',
                KEEPERD_STATE_DIR: local.state,
                KEEPERD_OPEN_TEST_LOG: local.log,
                ...env,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    return { child, output: () => ({ stdout, stderr }) };
}

async function ready(run) {
    const { child } = run;
    const deadline = Date.now() + 5000;
    while (!/http:\/\/localhost:\d+\//.test(run.output().stdout)) {
        if (child.exitCode !== null)
            throw new Error(`server exited: ${JSON.stringify(run.output())}`);
        if (Date.now() > deadline)
            throw new Error(
                `server start timeout: ${JSON.stringify(run.output())}`
            );
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return run.output().stdout.match(/http:\/\/localhost:\d+\//)[0];
}

async function stop(run) {
    if (run.child.exitCode === null) {
        const exited = once(run.child, 'exit');
        run.child.kill('SIGTERM');
        await exited;
    }
}

test(
    'opens once after binding the actual ephemeral port',
    { timeout: 10000 },
    async (t) => {
        const local = fixture(t);
        const run = start(local);
        t.after(() => stop(run));
        const url = await ready(run);
        assert.equal((await fetch(url)).status, 200);
        assert.equal(readFileSync(local.log, 'utf8'), `${url}\n`);
        assert.equal(run.output().stdout.match(/KeepERD: /g).length, 1);
    }
);

test(
    'serves the diagram without a fixed branch link and keeps the home route',
    { timeout: 10000 },
    async (t) => {
        const local = fixture(t);
        const run = start(local, ['--no-open']);
        t.after(() => stop(run));
        const url = await ready(run);
        const diagram = await fetch(new URL('diagrams/test', url)).then((r) =>
            r.text()
        );
        assert.doesNotMatch(diagram, /← 브랜치 목록/);
        assert.match(diagram, /vite:preloadError/);
        assert.match(diagram, /src="\/sync-ui\.js"/);
        const home = await fetch(url).then((r) => r.text());
        assert.match(home, /KeepERD/);
    }
);

test(
    '--no-open and browser failure leave the listening server available',
    { timeout: 10000 },
    async (t) => {
        const local = fixture(t);
        const quiet = start(local, ['--no-open']);
        const quietUrl = await ready(quiet);
        assert.equal((await fetch(quietUrl)).status, 200);
        assert.equal(readFileSync(local.log, 'utf8'), '');
        await stop(quiet);

        const failed = start(local, [], { KEEPERD_OPEN_TEST_FAILURE: '1' });
        t.after(() => stop(failed));
        const url = await ready(failed);
        assert.equal((await fetch(url)).status, 200);
        assert.equal(readFileSync(local.log, 'utf8'), `${url}\n`);
        assert.match(failed.output().stderr, /직접 여세요/);
    }
);

test(
    'help, invalid options and build failure do not open a browser',
    { timeout: 10000 },
    async (t) => {
        const local = fixture(t);
        const baseEnv = {
            ...process.env,
            KEEPERD_STATE_DIR: local.state,
            KEEPERD_OPEN_TEST_LOG: local.log,
        };
        for (const args of [['--help'], ['--unknown']]) {
            const result = spawnSync(
                process.execPath,
                [path.join(local.tools, 'server.mjs'), ...args],
                {
                    env: baseEnv,
                    encoding: 'utf8',
                    timeout: 3000,
                }
            );
            assert.equal(result.status, args[0] === '--help' ? 0 : 1);
        }
        writeFileSync(
            path.join(local.project, 'dist/.keeperd-build.json'),
            '{"sourceRevision":"stale"}'
        );
        writeFileSync(path.join(local.tools, 'build.mjs'), 'process.exit(1)');
        const failed = start(local);
        await once(failed.child, 'exit');
        assert.match(failed.output().stderr, /빌드에 실패/);
        assert.equal(readFileSync(local.log, 'utf8'), '');
    }
);

test(
    'a competing start cannot open a second tab',
    { timeout: 10000 },
    async (t) => {
        const local = fixture(t);
        const first = start(local);
        t.after(() => stop(first));
        const url = await ready(first);
        const second = start(local);
        await once(second.child, 'exit');
        assert.match(second.output().stderr, /이미 같은 사용자 데이터/);
        assert.equal(readFileSync(local.log, 'utf8'), `${url}\n`);
    }
);

test(
    'a port collision fails before opening a browser',
    { timeout: 10000 },
    async (t) => {
        const local = fixture(t);
        const occupied = createServer();
        await new Promise((resolve) =>
            occupied.listen(0, '127.0.0.1', resolve)
        );
        t.after(() => occupied.close());
        const run = start(local, [], {
            LOCAL_ERD_PORT: String(occupied.address().port),
        });
        await once(run.child, 'exit');
        assert.match(run.output().stderr, /EADDRINUSE/);
        assert.equal(readFileSync(local.log, 'utf8'), '');
    }
);
