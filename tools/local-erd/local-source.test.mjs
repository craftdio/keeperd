import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdtempSync,
    mkdirSync,
    writeFileSync,
    rmSync,
    symlinkSync,
    copyFileSync,
    readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
    registerLocalRepository,
    resolveLocalRepository,
    captureLocalSource,
    captureLocalCommit,
    localComparisonBase,
    localBranches,
    localBranchDetails,
    localDiagramKey,
    checkRemoteBranch,
    selectSchemaSource,
    describeLocalRepository,
} from './local-source.mjs';
import { mergeSnapshots } from './branches.mjs';

function fixture(run) {
    const root = mkdtempSync(path.join(tmpdir(), 'chartdb-local-source-'));
    const git = (...args) =>
        execFileSync('git', ['-C', root, ...args], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    const write = (name, value) => {
        mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
        writeFileSync(path.join(root, name), value);
    };
    try {
        git('init', '-b', 'main');
        git('config', 'user.name', 'Test');
        git('config', 'user.email', 'test@example.invalid');
        git('remote', 'add', 'origin', 'git@github.com:example/backend.git');
        write('db/migration/001.sql', 'CREATE TABLE users(id bigint);');
        write('.gitignore', '.env\ndb/migration/ignored.sql\n');
        git('add', '.');
        git('commit', '-m', 'initial');
        run({ root, git, write, repo: registerLocalRepository(root) });
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

test('captures local-only commits and worktree changes without changing checkout or staged state', () =>
    fixture(({ root, git, write, repo }) => {
        git('branch', 'feat/local-only');
        write(
            'db/migration/002.sql',
            'ALTER TABLE users ADD COLUMN name text;'
        );
        git('add', 'db/migration/002.sql');
        write(
            'db/migration/002.sql',
            'ALTER TABLE users ADD COLUMN title text;'
        );
        write('db/migration/003.sql', 'CREATE TABLE roles(id bigint);');
        write('db/migration/ignored.sql', 'SECRET');
        write('.env', 'TOKEN=SECRET');
        rmSync(path.join(root, 'db/migration/001.sql'));
        const before = git('status', '--porcelain');
        const input = captureLocalSource(repo, 'main', 'worktree');
        assert.equal(input.files.size, 2);
        assert.match(input.files.get('db/migration/002.sql'), /title/);
        assert.ok(!input.files.has('db/migration/001.sql'));
        assert.ok(!input.files.has('db/migration/ignored.sql'));
        const committed = captureLocalSource(repo, 'feat/local-only');
        assert.equal(committed.files.size, 1);
        assert.equal(git('status', '--porcelain'), before);
        assert.equal(localBranches(repo).current, 'main');
        assert.ok(localBranches(repo).branches.includes('feat/local-only'));
        const details = localBranchDetails(repo);
        assert.equal(
            details.branches.find((branch) => branch.name === 'feat/local-only')
                .remoteStatus,
            'unpublished'
        );
        assert.equal(
            details.branches.find((branch) => branch.name === 'main')
                .hasWorkingChanges,
            true
        );
        assert.equal(committed.source.remoteStatus, 'unconfirmed');
        assert.match(
            input.source.notice,
            /원격 GitHub에 반영되지 않은 로컬 변경/
        );
    }));

test('stable source keys isolate worktrees, branches and modes while fingerprints change', () =>
    fixture(({ repo, write }) => {
        const first = captureLocalSource(repo, 'main', 'worktree');
        write('db/migration/002.sql', 'CREATE TABLE roles(id bigint);');
        const second = captureLocalSource(repo, 'main', 'worktree');
        assert.equal(first.key, second.key);
        assert.notEqual(first.fingerprint, second.fingerprint);
        assert.notEqual(first.key, localDiagramKey(repo, 'main', 'commit'));
        assert.notEqual(
            first.key,
            localDiagramKey(
                {
                    ...repo,
                    repositoryUrl: 'https://github.com/example/other.git',
                },
                'main',
                'worktree'
            )
        );
        assert.notEqual(
            first.key,
            localDiagramKey(
                { ...repo, id: 'other-worktree' },
                'main',
                'worktree'
            )
        );
        const base = { repositoryUrl: repo.repositoryUrl, branch: 'main' };
        const remote = { ...base, diagram: { id: 'debut-main' } };
        const local = {
            ...base,
            source: first.source,
            diagram: { id: first.key },
        };
        const next = { ...local, source: second.source };
        assert.equal(mergeSnapshots([remote, local], [next]).length, 2);
        assert.deepEqual(mergeSnapshots([remote, local], [next])[0], remote);
        write('db/schema/users.sql', 'CREATE TABLE users(id bigint);');
        const declared = captureLocalSource(repo, 'main', 'worktree');
        write('db/migration/003.sql', 'CREATE TABLE ignored(id bigint);');
        const derivedMigrationChanged = captureLocalSource(
            repo,
            'main',
            'worktree'
        );
        assert.equal(declared.schemaSource.kind, 'atlas-schema');
        assert.equal(declared.fingerprint, derivedMigrationChanged.fingerprint);
        write(
            'db/schema/users.sql',
            'CREATE TABLE users(id bigint, name text);'
        );
        assert.notEqual(
            declared.fingerprint,
            captureLocalSource(repo, 'main', 'worktree').fingerprint
        );
    }));

test('finds the closest develop/main common commit and captures its schema', () =>
    fixture(({ repo, git, write }) => {
        git('branch', 'develop');
        git('checkout', '-b', 'feat/schema', 'develop');
        write('db/migration/002.sql', 'CREATE TABLE roles(id bigint);');
        git('add', 'db/migration/002.sql');
        git('commit', '-m', 'add roles');
        const base = localComparisonBase(repo, 'feat/schema');
        assert.equal(base.branch, 'develop');
        assert.equal(base.commit, git('rev-parse', 'develop').trim());
        const captured = captureLocalCommit(repo, base.commit);
        assert.equal(captured.sha, base.commit);
        assert.deepEqual(captured.schemaSource.files, ['db/migration/001.sql']);
    }));

test('prefers a current origin base over a stale or missing local base branch', () =>
    fixture(({ repo, git, write }) => {
        git('branch', 'develop');
        write('db/migration/002.sql', 'CREATE TABLE shared(id bigint);');
        git('add', 'db/migration/002.sql');
        git('commit', '-m', 'shared base');
        const remoteBase = git('rev-parse', 'HEAD').trim();
        git('update-ref', 'refs/remotes/origin/develop', remoteBase);
        git('checkout', '-b', 'feat/schema');
        write('db/migration/003.sql', 'CREATE TABLE feature(id bigint);');
        git('add', 'db/migration/003.sql');
        git('commit', '-m', 'feature schema');

        assert.deepEqual(localComparisonBase(repo, 'feat/schema'), {
            branch: 'develop',
            commit: remoteBase,
            distance: 1,
        });
        git('branch', '-D', 'develop');
        assert.deepEqual(localComparisonBase(repo, 'feat/schema'), {
            branch: 'develop',
            commit: remoteBase,
            distance: 1,
        });
    }));

test('prefers Atlas declarative schema files and falls back to SQL migrations', () => {
    assert.deepEqual(
        selectSchemaSource([
            'db/migration/001.sql',
            'db/schema/users.sql',
            'db/schema/00_organization.sql',
        ]),
        {
            kind: 'atlas-schema',
            label: 'Atlas 선언 스키마',
            prefix: 'db/schema/',
            path: 'db/schema/*.sql',
            files: ['db/schema/00_organization.sql', 'db/schema/users.sql'],
        }
    );
    assert.equal(
        selectSchemaSource(['db/migration/002.sql']).kind,
        'sql-migrations'
    );
    assert.throws(() => selectSchemaSource(['README.md']), {
        code: 'SCHEMA_SOURCE_NOT_FOUND',
    });
});

test('reports missing refs, mismatched worktree and missing SQL schema sources distinctly', () =>
    fixture(({ repo, git, root }) => {
        assert.throws(() => captureLocalSource(repo, 'missing'), {
            code: 'LOCAL_REF_NOT_FOUND',
        });
        git('branch', 'other');
        assert.throws(() => captureLocalSource(repo, 'other', 'worktree'), {
            code: 'LOCAL_WORKTREE_BRANCH_MISMATCH',
        });
        git('checkout', '--detach');
        assert.throws(() => captureLocalSource(repo, 'main', 'worktree'), {
            code: 'LOCAL_WORKTREE_BRANCH_MISMATCH',
        });
        git('checkout', 'main');
        rmSync(path.join(root, 'db/migration/001.sql'));
        assert.throws(() => captureLocalSource(repo, 'main', 'worktree'), {
            code: 'SCHEMA_SOURCE_NOT_FOUND',
        });
    }));

test('rejects invalid registration, changed origins and symlink inputs', () =>
    fixture(({ repo, root, git }) => {
        assert.throws(() => registerLocalRepository('relative'), {
            code: 'LOCAL_PATH_INVALID',
        });
        assert.throws(() => registerLocalRepository(path.join(root, 'db')), {
            code: 'LOCAL_PATH_INVALID',
        });
        assert.throws(
            () => resolveLocalRepository({ localRepositories: [] }, repo.id),
            { code: 'LOCAL_NOT_REGISTERED' }
        );
        symlinkSync(
            path.join(root, '.gitignore'),
            path.join(root, 'db/migration/link.sql')
        );
        assert.throws(() => captureLocalSource(repo, 'main', 'worktree'), {
            code: 'LOCAL_UNSAFE_PATH',
        });
        git(
            'remote',
            'set-url',
            'origin',
            'https://token@github.com/example/backend.git'
        );
        assert.throws(() => registerLocalRepository(root), {
            code: 'LOCAL_ORIGIN_INVALID',
        });
    }));

test('checks remote publication without fetch and keeps network failure unconfirmed', () =>
    fixture(({ repo, root, git, write }) => {
        const bare = path.join(root, 'bare');
        execFileSync('git', ['init', '--bare', bare], { stdio: 'ignore' });
        git('remote', 'set-url', 'origin', bare);
        git('push', 'origin', 'main');
        assert.equal(checkRemoteBranch(repo, 'main').remoteStatus, 'same');
        git('branch', 'local-only');
        assert.equal(
            checkRemoteBranch(repo, 'local-only').remoteStatus,
            'unpublished'
        );
        write('db/migration/002.sql', 'CREATE TABLE roles(id bigint);');
        git('add', 'db');
        git('commit', '-m', 'new migration');
        assert.equal(checkRemoteBranch(repo, 'main').remoteStatus, 'ahead');
        git('remote', 'set-url', 'origin', path.join(root, 'missing'));
        assert.equal(
            checkRemoteBranch(repo, 'main').remoteStatus,
            'unconfirmed'
        );
    }));

test('registers linked Git worktrees independently', () =>
    fixture(({ root, git, repo }) => {
        const worktree = path.join(root, 'linked');
        git('worktree', 'add', '-b', 'linked', worktree);
        const linked = registerLocalRepository(worktree);
        assert.notEqual(linked.id, repo.id);
        assert.deepEqual(
            {
                currentBranch: describeLocalRepository(repo).currentBranch,
                linkedWorktree: describeLocalRepository(repo).linkedWorktree,
            },
            { currentBranch: 'main', linkedWorktree: false }
        );
        assert.deepEqual(
            {
                currentBranch: describeLocalRepository(linked).currentBranch,
                directoryName: describeLocalRepository(linked).directoryName,
                linkedWorktree: describeLocalRepository(linked).linkedWorktree,
            },
            {
                currentBranch: 'linked',
                directoryName: 'linked',
                linkedWorktree: true,
            }
        );
        assert.equal(captureLocalSource(linked, 'linked').files.size, 1);
    }));

test('local init skips gh authentication and reuses its local snapshot', () =>
    fixture(({ root, write, repo }) => {
        const tools = path.join(root, 'tools/local-erd');
        mkdirSync(tools, { recursive: true });
        for (const file of [
            'init.mjs',
            'branches.mjs',
            'local-source.mjs',
            'git-credentials.mjs',
            'build-state.mjs',
            'cli-command.mjs',
            'state-paths.mjs',
            'state-lock.mjs',
        ])
            copyFileSync(
                new URL(file, import.meta.url),
                path.join(tools, file)
            );
        write('fake-bin/docker', `#!${process.execPath}\nprocess.exit(0);`);
        write('fake-bin/gh', `#!${process.execPath}\nprocess.exit(99);`);
        execFileSync('chmod', [
            '+x',
            path.join(root, 'fake-bin/docker'),
            path.join(root, 'fake-bin/gh'),
        ]);
        write('node_modules/typescript/bin/tsc', '');
        write(
            'tools/local-erd/build.mjs',
            `import fs from 'node:fs';fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.html','local');fs.writeFileSync('dist/.keeperd-build.json',JSON.stringify({sourceRevision:null}));`
        );
        write(
            'tools/local-erd/sync.mjs',
            `import fs from 'node:fs';fs.appendFileSync('sync-args.log',process.argv.join(' ')+'\\n');fs.mkdirSync('.local-erd/data',{recursive:true});fs.writeFileSync('.local-erd/data/snapshots.json',JSON.stringify({snapshots:[{branch:'main',source:{kind:'local',repositoryId:${JSON.stringify(repo.id)},mode:'commit'}}]}));`
        );
        const run = () =>
            spawnSync(
                process.execPath,
                [path.join(tools, 'init.mjs'), `--local=${root}`],
                {
                    cwd: root,
                    encoding: 'utf8',
                    env: {
                        ...process.env,
                        PATH: `${path.join(root, 'fake-bin')}:${process.env.PATH}`,
                        KEEPERD_STATE_DIR: path.join(root, '.local-erd'),
                    },
                }
            );
        const first = run();
        assert.equal(first.status, 0, first.stderr);
        const config = JSON.parse(
            readFileSync(path.join(root, '.local-erd/config.json'), 'utf8')
        );
        assert.equal(config.localRepositories[0].id, repo.id);
        assert.match(
            readFileSync(path.join(root, 'sync-args.log'), 'utf8'),
            new RegExp(`--local=${repo.id}`)
        );
        const second = run();
        assert.equal(second.status, 0, second.stderr);
        assert.equal(
            readFileSync(path.join(root, 'sync-args.log'), 'utf8')
                .trim()
                .split('\n').length,
            1
        );
    }));

test('local replay publishes isolated commit/worktree snapshots and preserves all data on failure', () =>
    fixture(({ root, write, repo, git }) => {
        const tools = path.join(root, 'tools/local-erd');
        mkdirSync(tools, { recursive: true });
        for (const file of [
            'sync.mjs',
            'atomic-publish.mjs',
            'branches.mjs',
            'cli-command.mjs',
            'local-source.mjs',
            'git-credentials.mjs',
            'state-paths.mjs',
            'state-lock.mjs',
            'schema-diff.js',
            'introspect.sql',
        ])
            copyFileSync(
                new URL(file, import.meta.url),
                path.join(tools, file)
            );
        write(
            '.local-erd/config.json',
            JSON.stringify({
                repositoryUrl: repo.repositoryUrl,
                localRepositories: [repo],
            })
        );
        const remote = {
            repositoryUrl: repo.repositoryUrl,
            branch: 'main',
            diagram: { id: 'debut-main' },
            revision: 'remote',
        };
        write(
            '.local-erd/data/snapshots.json',
            JSON.stringify({ snapshots: [remote] })
        );
        const raw = {
            tables: [{ oid: 1, name: 'users', schema: 'public', relkind: 'r' }],
            columns: [
                {
                    oid: 1,
                    num: 1,
                    name: 'id',
                    type: 'bigint',
                    pk: true,
                    nullable: false,
                },
            ],
            indexes: [],
            checks: [],
            foreignKeys: [],
        };
        write(
            'fake-bin/docker',
            `#!${process.execPath}\nconst fs=require('node:fs'),a=process.argv.slice(2);if(a.includes('-qAt'))console.log(${JSON.stringify(JSON.stringify(raw))});else if(a.includes('psql')){const sql=fs.readFileSync(0,'utf8');fs.appendFileSync('replay.log',sql+'\\n');if(sql.includes('FAIL_SUPER_SECRET')){console.error('FAIL_SUPER_SECRET');process.exit(1);}}`
        );
        execFileSync('chmod', ['+x', path.join(root, 'fake-bin/docker')]);
        const run = (...args) =>
            spawnSync(
                process.execPath,
                [
                    path.join(tools, 'sync.mjs'),
                    `--local=${repo.id}`,
                    '--branch=main',
                    ...args,
                ],
                {
                    cwd: root,
                    encoding: 'utf8',
                    env: {
                        ...process.env,
                        PATH: `${path.join(root, 'fake-bin')}:${process.env.PATH}`,
                        KEEPERD_STATE_DIR: path.join(root, '.local-erd'),
                    },
                }
            );
        const emptyLocal = spawnSync(
            process.execPath,
            [path.join(tools, 'sync.mjs'), '--local=', '--branch=main'],
            {
                cwd: root,
                encoding: 'utf8',
                env: {
                    ...process.env,
                    PATH: `${path.join(root, 'fake-bin')}:${process.env.PATH}`,
                    KEEPERD_STATE_DIR: path.join(root, '.local-erd'),
                },
            }
        );
        assert.equal(emptyLocal.status, 1);
        assert.match(emptyLocal.stderr, /LOCAL_NOT_REGISTERED/);
        let result = run();
        assert.equal(result.status, 0, result.stderr);
        const remoteCheck = Buffer.from(
            JSON.stringify({
                commit: git('rev-parse', 'main').trim(),
                remoteStatus: 'same',
                checkedAt: '2026-09-17T00:00:00.000Z',
            })
        ).toString('base64url');
        result = run(`--remote-check=${remoteCheck}`);
        assert.equal(result.status, 0, result.stderr);
        const confirmed = JSON.parse(
            readFileSync(
                path.join(root, '.local-erd/data/snapshots.json'),
                'utf8'
            )
        ).snapshots.find((snapshot) => snapshot.source?.kind === 'local');
        assert.match(confirmed.source.notice, /원격 브랜치에 포함된/);
        write(
            'db/migration/002.sql',
            'ALTER TABLE users ADD COLUMN title text;'
        );
        const status = git('status', '--porcelain');
        result = run('--worktree');
        assert.equal(result.status, 0, result.stderr);
        assert.match(
            readFileSync(path.join(root, 'replay.log'), 'utf8'),
            /ADD COLUMN title/
        );
        assert.equal(
            git('status', '--porcelain').replace(/\?\? replay.log\n/, ''),
            status.replace(/\?\? replay.log\n/, '')
        );
        const target = path.join(root, '.local-erd/data/snapshots.json');
        const snapshots = JSON.parse(readFileSync(target, 'utf8')).snapshots;
        assert.equal(snapshots.length, 3);
        assert.deepEqual(snapshots[0], remote);
        assert.notEqual(snapshots[1].diagram.id, snapshots[2].diagram.id);
        assert.notEqual(
            snapshots[1].diagram.tables[0].id,
            snapshots[2].diagram.tables[0].id
        );
        const before = readFileSync(target, 'utf8');
        write('db/migration/003.sql', 'FAIL_SUPER_SECRET');
        result = run('--worktree');
        assert.equal(result.status, 1);
        assert.ok(!result.stderr.includes('FAIL_SUPER_SECRET'));
        assert.equal(readFileSync(target, 'utf8'), before);
    }));
