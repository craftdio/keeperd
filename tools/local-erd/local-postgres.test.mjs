import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdtempSync,
    mkdirSync,
    copyFileSync,
    writeFileSync,
    readFileSync,
    rmSync,
} from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { registerLocalRepository } from './local-source.mjs';

test(
    'real PostgreSQL reflects staged/unstaged SQL, untracked additions and tracked deletions',
    { skip: process.env.LOCAL_ERD_POSTGRES_TEST !== '1', timeout: 240000 },
    () => {
        const root = mkdtempSync(path.join(tmpdir(), 'chartdb-local-pg-'));
        try {
            const repo = path.join(root, 'backend');
            mkdirSync(path.join(repo, 'db/migration'), { recursive: true });
            const git = (...args) =>
                execFileSync('git', ['-C', repo, ...args], {
                    encoding: 'utf8',
                    stdio: ['ignore', 'pipe', 'pipe'],
                });
            const write = (name, sql) =>
                writeFileSync(path.join(repo, 'db/migration', name), sql);
            git('init', '-b', 'main');
            git('config', 'user.name', 'Test');
            git('config', 'user.email', 'test@example.invalid');
            git(
                'remote',
                'add',
                'origin',
                'https://github.com/example/backend.git'
            );
            write('001.sql', 'CREATE TABLE users(id bigint PRIMARY KEY);');
            write(
                '002.sql',
                'CREATE TABLE roles(id bigint PRIMARY KEY, user_id bigint REFERENCES users(id));'
            );
            git('add', '.');
            git('commit', '-m', 'initial');
            const local = registerLocalRepository(repo);
            const tools = path.join(root, 'tools/local-erd');
            mkdirSync(tools, { recursive: true });
            for (const file of [
                'sync.mjs',
                'alembic-replay.mjs',
                'airflow-replay.mjs',
                'atomic-publish.mjs',
                'branches.mjs',
                'local-source.mjs',
                'schema-replay.mjs',
                'sync-errors.mjs',
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
            mkdirSync(path.join(root, '.local-erd'));
            writeFileSync(
                path.join(root, '.local-erd/config.json'),
                JSON.stringify({
                    repositoryUrl: local.repositoryUrl,
                    localRepositories: [local],
                })
            );
            const run = (...args) =>
                execFileSync(
                    process.execPath,
                    [
                        path.join(tools, 'sync.mjs'),
                        `--local=${local.id}`,
                        '--branch=main',
                        ...args,
                    ],
                    {
                        cwd: root,
                        encoding: 'utf8',
                        timeout: 60000,
                        stdio: ['ignore', 'pipe', 'pipe'],
                        env: {
                            ...process.env,
                            KEEPERD_STATE_DIR: path.join(root, '.local-erd'),
                        },
                    }
                );
            run();
            write(
                '001.sql',
                'CREATE TABLE users(id bigint PRIMARY KEY, staged_column text);'
            );
            git('add', 'db/migration/001.sql');
            write(
                '001.sql',
                'CREATE TABLE users(id bigint PRIMARY KEY, staged_column text, title text);'
            );
            rmSync(path.join(repo, 'db/migration/002.sql'));
            write('003.sql', 'CREATE TABLE teams(id bigint PRIMARY KEY);');
            const before = git('status', '--porcelain');
            run('--worktree');
            assert.equal(git('status', '--porcelain'), before);
            const snapshots = JSON.parse(
                readFileSync(
                    path.join(root, '.local-erd/data/snapshots.json'),
                    'utf8'
                )
            ).snapshots;
            assert.equal(snapshots.length, 2);
            const commit = snapshots.find((s) => s.source.mode === 'commit');
            const worktree = snapshots.find(
                (s) => s.source.mode === 'worktree'
            );
            assert.equal(commit.relationships, 1);
            assert.equal(worktree.relationships, 0);
            assert.deepEqual(
                worktree.diagram.tables.map((t) => t.name).sort(),
                ['teams', 'users']
            );
            assert.deepEqual(
                worktree.diagram.tables
                    .find((t) => t.name === 'users')
                    .fields.map((f) => f.name),
                ['id', 'staged_column', 'title']
            );
            assert.notEqual(commit.diagram.id, worktree.diagram.id);
            const revision = worktree.revision;
            run('--worktree');
            const repeated = JSON.parse(
                readFileSync(
                    path.join(root, '.local-erd/data/snapshots.json'),
                    'utf8'
                )
            ).snapshots;
            assert.equal(repeated.length, 2);
            assert.equal(
                repeated.find((s) => s.source.mode === 'worktree').revision,
                revision
            );
            mkdirSync(path.join(repo, 'db/schema'));
            writeFileSync(
                path.join(repo, 'db/schema/users.sql'),
                'CREATE TABLE users(id bigint PRIMARY KEY, declared_column text);'
            );
            run('--worktree');
            const declared = JSON.parse(
                readFileSync(
                    path.join(root, '.local-erd/data/snapshots.json'),
                    'utf8'
                )
            ).snapshots.find((s) => s.source.mode === 'worktree');
            assert.equal(declared.schemaSource.kind, 'atlas-schema');
            assert.deepEqual(
                declared.diagram.tables.map((table) => table.name),
                ['users']
            );
            assert.deepEqual(
                declared.diagram.tables[0].fields.map((field) => field.name),
                ['id', 'declared_column']
            );
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    }
);
