import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { hasCurrentBuild, writeBuildMarker } from './build-state.mjs';

test('current ChartDB commit determines whether a local build can be reused', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'chartdb-build-state-'));
    try {
        execFileSync('git', ['init', '-b', 'main'], { cwd: root });
        execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
        execFileSync('git', ['config', 'user.email', 'test@example.invalid'], {
            cwd: root,
        });
        mkdirSync(path.join(root, 'dist'));
        writeFileSync(path.join(root, 'dist/index.html'), 'first');
        writeFileSync(path.join(root, 'source'), 'first');
        execFileSync('git', ['add', '.'], { cwd: root });
        execFileSync('git', ['commit', '-m', 'first'], { cwd: root });

        writeBuildMarker(root);
        assert.equal(hasCurrentBuild(root), true);

        writeBuildMarker(root, 'build-started-on-another-revision');
        assert.equal(hasCurrentBuild(root), false);

        writeFileSync(path.join(root, 'source'), 'second');
        execFileSync('git', ['add', 'source'], { cwd: root });
        execFileSync('git', ['commit', '-m', 'second'], { cwd: root });
        assert.equal(hasCurrentBuild(root), false);

        writeBuildMarker(root);
        assert.equal(hasCurrentBuild(root), true);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
