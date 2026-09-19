import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
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
