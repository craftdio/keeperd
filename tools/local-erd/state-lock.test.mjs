import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { acquireStateLock, StateLockError } from './state-lock.mjs';

test('allows the owner child token and rejects another writer', () => {
    const state = mkdtempSync(path.join(tmpdir(), 'keeperd-lock-'));
    const owner = acquireStateLock(state, { command: 'start', port: 18777 });
    try {
        const child = acquireStateLock(state, {
            command: 'sync',
            env: { KEEPERD_LOCK_TOKEN: owner.token },
        });
        assert.equal(child.delegated, true);
        assert.throws(
            () => acquireStateLock(state, { command: 'sync', env: {} }),
            (error) =>
                error instanceof StateLockError &&
                error.message.includes('http://localhost:18777/')
        );
    } finally {
        owner.release();
        rmSync(state, { recursive: true, force: true });
    }
});

test('records the bound port only while the same owner holds the lock', () => {
    const state = mkdtempSync(path.join(tmpdir(), 'keeperd-lock-port-'));
    const owner = acquireStateLock(state, { command: 'start', port: 0 });
    const file = path.join(state, '.keeperd.lock');
    try {
        owner.updatePort(18778);
        const record = JSON.parse(readFileSync(file, 'utf8'));
        assert.equal(record.port, 18778);
        assert.equal(record.token, owner.token);
        assert.throws(() => owner.updatePort(0), /port is invalid/);
    } finally {
        owner.release();
        rmSync(state, { recursive: true, force: true });
    }
    assert.throws(() => owner.updatePort(18779), StateLockError);
});
