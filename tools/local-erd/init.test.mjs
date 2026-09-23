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
    'fresh initialization reuses a bundled build without dependencies and rejects repository CLI input',
    { skip: process.platform === 'win32' },
    () => {
        const root = mkdtempSync(path.join(tmpdir(), 'chartdb-init-test-'));
        try {
            const tools = path.join(root, 'tools/local-erd');
            const bin = path.join(root, 'bin');
            mkdirSync(tools, { recursive: true });
            mkdirSync(bin);
            for (const name of [
                'init.mjs',
                'branches.mjs',
                'local-source.mjs',
                'schema-replay.mjs',
                'git-credentials.mjs',
                'build-state.mjs',
                'cli-command.mjs',
                'state-paths.mjs',
                'state-lock.mjs',
            ])
                copyFileSync(
                    fileURLToPath(new URL(name, import.meta.url)),
                    path.join(tools, name)
                );
            const stub = `#!${process.execPath}\nconst fs=require('node:fs');fs.appendFileSync(process.env.INIT_TEST_LOG,process.argv.slice(1).join(' ')+'\\n');if(process.argv.includes('api'))console.log('[[{"name":"main"}]]');`;
            for (const command of ['git', 'gh', 'docker', 'npm'])
                writeFileSync(path.join(bin, command), stub, { mode: 0o755 });
            writeFileSync(
                path.join(tools, 'sync.mjs'),
                `import fs from 'node:fs';fs.mkdirSync('.local-erd/data',{recursive:true});fs.writeFileSync('.local-erd/data/snapshots.json',JSON.stringify({snapshots:[{branch:'main'}]}));`
            );
            writeFileSync(
                path.join(tools, 'build.mjs'),
                `import fs from 'node:fs';fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.html','local');fs.writeFileSync('dist/.keeperd-build.json',JSON.stringify({sourceRevision:null}));`
            );
            const log = path.join(root, 'commands.log');
            const run = (...args) =>
                spawnSync(
                    process.execPath,
                    [path.join(tools, 'init.mjs'), ...args],
                    {
                        cwd: root,
                        encoding: 'utf8',
                        env: {
                            ...process.env,
                            PATH: `${bin}:${process.env.PATH}`,
                            INIT_TEST_LOG: log,
                            KEEPERD_STATE_DIR: path.join(root, '.local-erd'),
                        },
                    }
                );
            const empty = run();
            assert.equal(empty.status, 0, empty.stderr);
            assert.deepEqual(
                JSON.parse(
                    readFileSync(
                        path.join(root, '.local-erd/config.json'),
                        'utf8'
                    )
                ),
                {}
            );
            assert.doesNotMatch(readFileSync(log, 'utf8'), / api /);
            assert.ok(existsSync(path.join(root, 'dist/.keeperd-build.json')));
            assert.deepEqual(
                JSON.parse(
                    readFileSync(
                        path.join(root, 'dist/.keeperd-build.json'),
                        'utf8'
                    )
                ),
                { sourceRevision: null }
            );
            const config = readFileSync(
                path.join(root, '.local-erd/config.json'),
                'utf8'
            );
            assert.match(readFileSync(log, 'utf8'), /ci --ignore-scripts/);
            const before = readFileSync(log, 'utf8');
            assert.equal(run().status, 0);
            assert.equal(
                readFileSync(log, 'utf8').split('ci --ignore-scripts').length,
                before.split('ci --ignore-scripts').length
            );
            assert.equal(
                run('--repository=https://github.com/example/other.git').status,
                1
            );
            assert.equal(
                readFileSync(path.join(root, '.local-erd/config.json'), 'utf8'),
                config
            );
            assert.equal(run('--rebuild').status, 0);
            assert.equal(run('--local=').status, 1);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    }
);
