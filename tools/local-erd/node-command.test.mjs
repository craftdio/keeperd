import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { nodeCommand } from './node-command.mjs';

test('uses the running Node executable while it is still available', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'keeperd-node-command-'));
    try {
        const executable = path.join(root, 'node');
        writeFileSync(executable, '');
        chmodSync(executable, 0o755);
        assert.equal(nodeCommand(executable), executable);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('falls back to PATH after the running Node executable is removed', () => {
    assert.equal(nodeCommand('/missing/homebrew/cellar/node'), 'node');
});
