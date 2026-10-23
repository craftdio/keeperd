import { Database } from 'node:sqlite';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdtempSync,
    mkdirSync,
    copyFileSync,
    writeFileSync,
    rmSync,
    readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { registerLocalRepository } from './local-source.mjs';

test(
    'local API registration, refs, validation, origin guard and source-isolated jobs work without gh',
    { timeout: 15000 },
    async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'chartdb-local-api-'));
        let child;
        try {
            const tools = path.join(root, 'tools/local-erd');
            mkdirSync(tools, { recursive: true });
            mkdirSync(path.join(root, 'src/lib'), { recursive: true });
            for (const name of [
                'local-branch-merge.ts',
                'repository-layout.ts',
            ])
                copyFileSync(
                    new URL('../../src/lib/' + name, import.meta.url),
                    path.join(root, 'src/lib', name)
                );

            for (const file of [
                'server.mjs',
                'node-runtime.mjs',
                'workspace-store.mjs',
                'branches.mjs',
                'folder-picker.mjs',
                'library-store.mjs',
                'local-source.mjs',
                'schema-replay.mjs',
                'sync-errors.mjs',
                'git-credentials.mjs',
                'memory-cache.mjs',
                'build-state.mjs',
                'cli-command.mjs',
                'state-paths.mjs',
                'state-lock.mjs',
                'stop-control.mjs',
                'node-command.mjs',
                'open-browser.mjs',
            ])
                copyFileSync(
                    new URL(file, import.meta.url),
                    path.join(tools, file)
                );
            writeFileSync(
                path.join(tools, 'sync.mjs'),
                'console.log("PROGRESS 90 captured local input");'
            );
            writeFileSync(
                path.join(tools, 'build.mjs'),
                `import fs from 'node:fs';fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/.keeperd-build.json',JSON.stringify({sourceRevision:null}));`
            );
            mkdirSync(path.join(root, 'dist'));
            writeFileSync(path.join(root, 'dist/index.html'), '<body></body>');
            mkdirSync(path.join(root, '.local-erd'));
            writeFileSync(
                path.join(root, 'dist/.keeperd-build.json'),
                JSON.stringify({ sourceRevision: 'stale-build' })
            );
            const configFile = path.join(root, '.local-erd/config.json');
            writeFileSync(configFile, JSON.stringify({}));
            const repo = path.join(root, 'backend');
            mkdirSync(repo);
            const git = (...args) =>
                execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' });
            git('init', '-b', 'main');
            git('config', 'user.name', 'Test');
            git('config', 'user.email', 'test@example.invalid');
            git(
                'remote',
                'add',
                'origin',
                'https://github.com/example/backend.git'
            );
            writeFileSync(path.join(repo, 'tracked'), 'test');
            git('add', '.');
            git('commit', '-m', 'initial');
            git('branch', 'local-only');
            child = spawn(process.execPath, [path.join(tools, 'server.mjs')], {
                env: {
                    ...process.env,
                    CI: 'true',
                    LOCAL_ERD_PORT: '0',
                    KEEPERD_STATE_DIR: path.join(root, '.local-erd'),
                },
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            let stderr = '';
            child.stderr.on('data', (chunk) => (stderr += chunk));
            const listeningUrl = await new Promise((resolve, reject) => {
                child.stdout.on('data', (chunk) => {
                    const match = chunk
                        .toString()
                        .match(/http:\/\/localhost:\d+/);
                    if (match) resolve(match[0]);
                });
                child.once('error', reject);
                child.once('exit', () =>
                    reject(
                        new Error(
                            `server exited before listening${stderr ? `: ${stderr}` : ''}`
                        )
                    )
                );
            });
            const base = `http://localhost:${new URL(listeningUrl).port}`;
            // The server is authoritative across independent browser requests.
            assert.equal(
                (await fetch(`${base}/data/%2e%2e%2fkeeperd.sqlite`)).status,
                403
            );
            const workspaceResponse = await fetch(`${base}/api/workspace`);
            assert.equal(workspaceResponse.status, 200);
            const firstWorkspace = await workspaceResponse.json();
            const workspaceDiagram = {
                id: 'workspace-test',
                name: 'SQLite ERD',
                databaseType: 'postgresql',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                tables: [],
            };
            const saveWorkspace = (revision) =>
                fetch(`${base}/api/workspace`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Local-ERD': 'sync',
                    },
                    body: JSON.stringify({
                        action: 'addDiagram',
                        revision,
                        params: { diagram: workspaceDiagram },
                    }),
                });
            assert.equal(
                (await saveWorkspace(firstWorkspace.revision)).status,
                200
            );
            assert.equal(
                (await saveWorkspace(firstWorkspace.revision)).status,
                409
            );
            assert.equal(
                (await (await fetch(`${base}/api/workspace`)).json())
                    .diagrams[0].name,
                'SQLite ERD'
            );
            assert.equal(
                (
                    await fetch(`${base}/api/workspace`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: '{}',
                    })
                ).status,
                403
            );
            assert.equal(
                (
                    await fetch(`${base}/api/workspace`, {
                        headers: { Origin: 'https://other.invalid' },
                    })
                ).status,
                403
            );
            // A failed required schema write must still allow reading the last saved ERD.
            const probeDB = new Database(
                path.join(root, '.local-erd/keeperd.sqlite')
            );
            probeDB.exec(
                "CREATE TRIGGER fail_schema_write BEFORE INSERT ON diagrams BEGIN SELECT RAISE(FAIL,'disk full'); END"
            );
            writeFileSync(
                path.join(root, '.local-erd/data/snapshots.json'),
                JSON.stringify({
                    snapshots: [
                        {
                            diagram: {
                                ...workspaceDiagram,
                                name: 'uncommitted schema',
                            },
                            revision: '2',
                        },
                    ],
                })
            );
            const fallbackResponse = await fetch(`${base}/api/workspace`);
            assert.equal(fallbackResponse.status, 200);
            const fallback = await fallbackResponse.json();
            assert.equal(fallback.diagrams[0].name, 'SQLite ERD');
            assert.match(fallback.warning, /기존에 저장된 ERD/);
            assert.equal((await saveWorkspace(fallback.revision)).status, 500);
            probeDB.exec('DROP TRIGGER fail_schema_write');
            probeDB.close();
            writeFileSync(
                path.join(root, '.local-erd/data/snapshots.json'),
                JSON.stringify({ snapshots: [] })
            );
            const legacyUrl = `http://127.0.0.1:${new URL(listeningUrl).port}`;
            const redirected = await fetch(`${legacyUrl}/?branch=main`, {
                redirect: 'manual',
            });
            assert.equal(redirected.status, 308);
            assert.equal(
                redirected.headers.get('location'),
                `${base}/?branch=main`
            );
            assert.deepEqual(
                JSON.parse(
                    readFileSync(
                        path.join(root, 'dist/.keeperd-build.json'),
                        'utf8'
                    )
                ),
                { sourceRevision: null }
            );
            const post = (body, headers = {}) =>
                fetch(`${base}/api/local/repositories`, {
                    method: 'POST',
                    headers: {
                        'X-Local-ERD': 'sync',
                        'Content-Type': 'application/json',
                        ...headers,
                    },
                    body: JSON.stringify(body),
                });
            const rejected = await post(
                { path: repo },
                { Origin: 'https://evil.invalid' }
            );
            assert.equal(rejected.status, 403);
            assert.deepEqual(await rejected.json(), {
                code: 'REQUEST_ORIGIN_REJECTED',
                error: 'Local ERD 서버와 같은 브라우저 주소에서 요청하세요.',
            });
            assert.equal((await post({ path: 'relative' })).status, 400);
            const response = await post({ path: repo });
            assert.equal(response.status, 200);
            const registeredPayload = await response.json();
            assert.equal(registeredPayload.primaryUrl, null);
            const registered = registeredPayload.repositories[0];
            assert.equal(registered.id, registerLocalRepository(repo).id);
            assert.equal(registered.currentBranch, 'main');
            assert.equal(registered.directoryName, 'backend');
            assert.equal(registered.linkedWorktree, false);
            assert.equal(
                JSON.parse(readFileSync(configFile, 'utf8')).localRepositories
                    .length,
                1
            );
            const branches = await fetch(
                `${base}/api/local/branches?local=${registered.id}`
            ).then((r) => r.json());
            assert.deepEqual(
                branches.branches.map((branch) => branch.name),
                ['local-only', 'main']
            );
            assert.equal(branches.branches[0].remoteStatus, 'unpublished');
            assert.equal(branches.current, 'main');
            assert.equal(
                (await fetch(`${base}/api/local/branches?local=unknown`))
                    .status,
                400
            );
            const job = await fetch(
                `${base}/api/sync?branch=main&local=${registered.id}&mode=worktree`,
                { method: 'POST', headers: { 'X-Local-ERD': 'sync' } }
            ).then((r) => r.json());
            assert.match(job.diagramId, /^debut-local-/);
            assert.equal(job.source.mode, 'worktree');
            const end = Date.now() + 5000;
            let result;
            do {
                result = await fetch(`${base}/api/sync`).then((r) => r.json());
                if (result.status === 'running')
                    await new Promise((resolve) => setTimeout(resolve, 20));
            } while (result.status === 'running' && Date.now() < end);
            assert.equal(result.status, 'success');
            assert.equal(
                (
                    await fetch(
                        `${base}/api/sync?branch=main&local=${registered.id}&mode=bad`,
                        { method: 'POST', headers: { 'X-Local-ERD': 'sync' } }
                    )
                ).status,
                400
            );
            const invalidBranch = await fetch(
                `${base}/api/sync?branch=../invalid`,
                { method: 'POST', headers: { 'X-Local-ERD': 'sync' } }
            );
            assert.equal(invalidBranch.status, 400);
            assert.deepEqual(await invalidBranch.json(), {
                code: 'INVALID_BRANCH',
                error: '브랜치 이름을 확인하세요.',
            });
        } finally {
            if (child && child.exitCode === null) {
                const stopped = once(child, 'exit');
                child.kill();
                await stopped;
            }
            rmSync(root, { recursive: true, force: true });
        }
    }
);
