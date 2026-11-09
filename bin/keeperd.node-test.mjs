import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandScript, commands } from './keeperd.mjs';
import { readKeeperdVersion } from '../tools/local-erd/keeperd-version.mjs';

const cli = fileURLToPath(new URL('./keeperd.mjs', import.meta.url));
const run = (...args) =>
    spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('keeperd resolves every public command to its existing local ERD script', () => {
    assert.deepEqual(Object.keys(commands), ['init', 'start', 'stop', 'sync']);
    for (const [command, script] of Object.entries(commands))
        assert.match(commandScript(command), new RegExp(`${script}$`));
    assert.equal(commandScript('unknown'), undefined);
});

test('keeperd prints its top-level help', () => {
    const result = run('--help');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage:\n {2}keeperd <command> \[options\]/);
    assert.match(result.stdout, /init\s{2,}Prepare KeepERD/);
    assert.match(result.stdout, /start\s+Start the local KeepERD server/);
    assert.match(result.stdout, /stop\s+Safely stop the local KeepERD server/);
    assert.match(result.stdout, /sync\s+Sync a repository branch/);
    assert.match(result.stdout, /-v, --version/);
});

test('keeperd prints the source-controlled version', () => {
    const version = readKeeperdVersion();
    for (const option of ['--version', '-v']) {
        const result = run(option);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, `KeepERD ${version}\n`);
    }
});

test('keeperd delegates init help to the existing initializer', () => {
    const result = run('init', '--help');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /keeperd init/);
    assert.match(
        result.stdout,
        /GitHub 저장소는 화면에서 선택한 뒤 Sync하세요/
    );
});

test('keeperd delegates stop help without touching user state', () => {
    const result = run('stop', '--help');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /keeperd stop/);
});

test('keeperd delegates start help without launching the server', () => {
    const result = run('start', '--help');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /keeperd start \[--no-open\]/);
});

test('keeperd rejects an unknown command without launching a script', () => {
    const result = run('unsupported');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown keeperd command: unsupported/);
    assert.match(result.stderr, /keeperd <command> \[options\]/);
});

test('version, help and invalid commands never invoke Git or GitHub authentication', (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'keeperd-cli-auth-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const bin = path.join(root, 'bin');
    mkdirSync(bin);
    const trace = path.join(root, 'auth-trace');
    for (const command of ['git', 'gh', 'git-credential-osxkeychain']) {
        const file = path.join(bin, command);
        writeFileSync(
            file,
            '#!/bin/sh\necho invoked >> "$KEEPERD_AUTH_TRACE"\nexit 91\n'
        );
        chmodSync(file, 0o755);
    }
    for (const [argument, status] of [
        ['--version', 0],
        ['-v', 0],
        ['--help', 0],
        ['version', 1],
    ]) {
        const result = spawnSync(process.execPath, [cli, argument], {
            env: {
                PATH: bin,
                HOME: root,
                KEEPERD_STATE_DIR: path.join(root, 'state'),
                KEEPERD_AUTH_TRACE: trace,
            },
            encoding: 'utf8',
            timeout: 5000,
        });
        assert.equal(result.status, status, result.stderr);
    }
    assert.equal(
        existsSync(trace),
        false,
        existsSync(trace) ? readFileSync(trace, 'utf8') : ''
    );
    assert.equal(existsSync(path.join(root, 'state')), false);
});
