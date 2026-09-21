import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdtempSync,
    mkdirSync,
    copyFileSync,
    writeFileSync,
    readFileSync,
    existsSync,
    rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test(
    'publishes two repositories with equal branch/table names without replacing legacy IDs',
    { skip: process.platform === 'win32' },
    () => {
        const root = mkdtempSync(
            path.join(tmpdir(), 'chartdb-multi-repo-test-')
        );
        try {
            const tools = path.join(root, 'tools/local-erd');
            const bin = path.join(root, 'bin');
            mkdirSync(tools, { recursive: true });
            mkdirSync(bin);
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
                    fileURLToPath(new URL(file, import.meta.url)),
                    path.join(tools, file)
                );
            mkdirSync(path.join(root, '.local-erd/data'), { recursive: true });
            const primary = 'https://github.com/example/backend.git';
            const other = 'https://github.com/example/other.git';
            writeFileSync(
                path.join(root, '.local-erd/config.json'),
                JSON.stringify({ repositoryUrl: primary })
            );
            const raw = {
                tables: [
                    { oid: 1, name: 'users', schema: 'public', relkind: 'r' },
                    { oid: 2, name: 'roles', schema: 'public', relkind: 'r' },
                ],
                columns: [
                    {
                        oid: 1,
                        num: 1,
                        name: 'id',
                        type: 'bigint',
                        pk: true,
                        unique: true,
                        nullable: false,
                    },
                    {
                        oid: 2,
                        num: 1,
                        name: 'id',
                        type: 'bigint',
                        pk: true,
                        unique: true,
                        nullable: false,
                    },
                ],
                indexes: [],
                checks: [],
                foreignKeys: [],
            };
            const baseRaw = {
                ...raw,
                tables: raw.tables.slice(0, 1),
                columns: [{ ...raw.columns[0], type: 'integer' }],
            };
            const gitStub = `#!${process.execPath}\nconst fs=require('node:fs'),path=require('node:path'),a=process.argv.slice(2); if(a[0]==='clone')fs.mkdirSync(path.join(a.at(-1),'.git'),{recursive:true});else if(a.includes('get-url'))console.log(process.env.SYNC_TEST_REPOSITORY);else if(a.includes('merge-base'))console.log('def456');else if(a.includes('rev-list'))console.log('1');else if(a.includes('rev-parse'))console.log(a.join(' ').includes('develop')?'develop123':'abc123');else if(a.includes('ls-tree'))console.log(process.env.SYNC_TEST_FAIL?'':a.at(-1)==='db/schema'?'db/schema/users.sql':a.at(-1)==='db/migration'?'db/migration/001.sql':'');else if(a.includes('show'))console.log(a.at(-1).includes('db/schema/')?'CREATE TABLE users(id bigint); CREATE TABLE roles(id bigint);':'FAIL_IF_MIGRATION_IS_REPLAYED');`;
            const dockerStub = `#!${process.execPath}\nconst fs=require('node:fs'),a=process.argv.slice(2);if(a.includes('-qAt'))console.log(a[a.indexOf('-d')+1].endsWith('_base')?${JSON.stringify(JSON.stringify(baseRaw))}:${JSON.stringify(JSON.stringify(raw))});else if(a.includes('psql')&&fs.readFileSync(0,'utf8').includes('FAIL_IF_MIGRATION_IS_REPLAYED'))process.exit(1);`;
            writeFileSync(path.join(bin, 'git'), gitStub, { mode: 0o755 });
            writeFileSync(path.join(bin, 'docker'), dockerStub, {
                mode: 0o755,
            });
            const run = (url, fail = false) =>
                spawnSync(
                    process.execPath,
                    [
                        path.join(tools, 'sync.mjs'),
                        '--offline',
                        '--branch=main',
                        `--repository=${url}`,
                    ],
                    {
                        cwd: root,
                        encoding: 'utf8',
                        env: {
                            ...process.env,
                            PATH: `${bin}:${process.env.PATH}`,
                            SYNC_TEST_REPOSITORY: url,
                            SYNC_TEST_FAIL: fail ? '1' : '',
                            KEEPERD_STATE_DIR: path.join(root, '.local-erd'),
                        },
                    }
                );
            const file = path.join(root, '.local-erd/data/snapshots.json');
            const first = run(primary);
            assert.equal(first.status, 0, first.stderr);
            const original = JSON.parse(readFileSync(file, 'utf8'))
                .snapshots[0];
            assert.equal(original.diagram.id, 'debut-main');
            assert.deepEqual(original.schemaSource, {
                kind: 'atlas-schema',
                label: 'Atlas 선언 스키마',
                path: 'db/schema/*.sql',
                files: 1,
            });
            assert.equal(original.migrations, 0);
            assert.deepEqual(original.schemaAdditions, {
                newTableIds: [original.diagram.tables[1].id],
                newFieldIds: [],
                changedTableIds: [original.diagram.tables[0].id],
                changedFieldIds: [original.diagram.tables[0].fields[0].id],
                removedTables: 0,
                removedFields: 0,
                allTablesNew: false,
                comparison: {
                    kind: 'branch-base',
                    branch: 'develop',
                    revision: 'def456',
                },
            });
            // Simulate pre-multi-repository snapshots lacking repository metadata.
            const legacy = structuredClone(original);
            delete legacy.repositoryUrl;
            writeFileSync(file, JSON.stringify({ snapshots: [legacy] }));
            const second = run(other);
            assert.equal(second.status, 0, second.stderr);
            const snapshots = JSON.parse(readFileSync(file, 'utf8')).snapshots;
            assert.equal(snapshots.length, 2);
            assert.deepEqual(snapshots[0], original);
            assert.notEqual(snapshots[1].diagram.id, original.diagram.id);
            assert.notEqual(
                snapshots[1].diagram.tables[0].id,
                original.diagram.tables[0].id
            );
            assert.notEqual(
                snapshots[1].diagram.areas[0].id,
                original.diagram.areas[0].id
            );
            assert.ok(
                existsSync(
                    path.join(
                        root,
                        '.local-erd/data',
                        `${snapshots[1].diagram.id.replace(/^debut-/, '')}.chartdb.json`
                    )
                )
            );
            assert.equal(run(other).status, 0);
            const unchanged = JSON.parse(readFileSync(file, 'utf8')).snapshots;
            assert.equal(unchanged.length, 2);
            assert.deepEqual(unchanged[1].schemaAdditions, {
                newTableIds: [unchanged[1].diagram.tables[1].id],
                newFieldIds: [],
                changedTableIds: [unchanged[1].diagram.tables[0].id],
                changedFieldIds: [unchanged[1].diagram.tables[0].fields[0].id],
                removedTables: 0,
                removedFields: 0,
                allTablesNew: false,
                comparison: {
                    kind: 'branch-base',
                    branch: 'develop',
                    revision: 'def456',
                },
            });
            const beforeFailure = readFileSync(file, 'utf8');
            assert.equal(run(other, true).status, 1);
            assert.equal(readFileSync(file, 'utf8'), beforeFailure);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    }
);
