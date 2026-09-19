import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdtempSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publishFiles } from './atomic-publish.mjs';

test('publishes all files and removes transaction artifacts', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'chartdb-publish-'));
    try {
        const diagram = path.join(root, 'main.chartdb.json');
        const manifest = path.join(root, 'snapshots.json');
        writeFileSync(diagram, 'old diagram');
        writeFileSync(manifest, 'old manifest');

        publishFiles([
            { target: diagram, content: 'new diagram' },
            { target: manifest, content: 'new manifest' },
        ]);

        assert.equal(readFileSync(diagram, 'utf8'), 'new diagram');
        assert.equal(readFileSync(manifest, 'utf8'), 'new manifest');
        assert.deepEqual(readdirSync(root).sort(), [
            'main.chartdb.json',
            'snapshots.json',
        ]);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('restores every previous file when a publish rename fails midway', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'chartdb-publish-'));
    try {
        const diagram = path.join(root, 'main.chartdb.json');
        const manifest = path.join(root, 'snapshots.json');
        writeFileSync(diagram, 'old diagram');
        writeFileSync(manifest, 'old manifest');
        let stagedRenames = 0;
        const rename = (source, target) => {
            if (source.endsWith('.stage') && ++stagedRenames === 2)
                throw new Error('simulated rename failure');
            renameSync(source, target);
        };

        assert.throws(
            () =>
                publishFiles(
                    [
                        { target: diagram, content: 'new diagram' },
                        { target: manifest, content: 'new manifest' },
                    ],
                    { rename, token: 'failure-test' }
                ),
            /simulated rename failure/
        );
        assert.equal(readFileSync(diagram, 'utf8'), 'old diagram');
        assert.equal(readFileSync(manifest, 'utf8'), 'old manifest');
        assert.deepEqual(readdirSync(root).sort(), [
            'main.chartdb.json',
            'snapshots.json',
        ]);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
