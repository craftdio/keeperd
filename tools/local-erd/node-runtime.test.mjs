import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNodeRuntime, requiredNodeVersion } from './node-runtime.mjs';

test('accepts only the exact verified Node runtime, including patch version', () => {
    assert.equal(requiredNodeVersion, '26.12.1');
    assert.doesNotThrow(() => assertNodeRuntime('26.12.1'));
    for (const version of ['24.22.1', '26.9.0', '26.12.0', '26.12.2', '27.0.0'])
        assert.throws(
            () => assertNodeRuntime(version),
            /requires Node.js 26.12.1/
        );
});

test('development, npm, Docker and CI agree on the pinned runtime', () => {
    const read = (file) =>
        readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
    assert.equal(read('.nvmrc').trim(), requiredNodeVersion);
    assert.equal(read('.node-version').trim(), requiredNodeVersion);
    assert.equal(
        JSON.parse(read('package.json')).engines.node,
        requiredNodeVersion
    );
    assert.equal(
        JSON.parse(read('package-lock.json')).packages[''].engines.node,
        requiredNodeVersion
    );
    assert.ok(
        read('Dockerfile').startsWith(`FROM node:${requiredNodeVersion}-alpine`)
    );
    for (const workflow of ['ci.yaml', 'release.yml'])
        assert.match(
            read(`.github/workflows/${workflow}`),
            /node-version-file: .nvmrc/
        );
});
