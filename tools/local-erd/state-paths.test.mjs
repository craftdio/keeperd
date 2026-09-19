import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { stateDirectory } from './state-paths.mjs';

test('uses the KeepERD application support directory on macOS', () => {
    assert.equal(
        stateDirectory({ env: {}, platform: 'darwin', home: '/Users/test' }),
        '/Users/test/Library/Application Support/KeepERD'
    );
});

test('requires an absolute test and automation override', () => {
    assert.equal(
        stateDirectory({
            env: { KEEPERD_STATE_DIR: '/tmp/keeperd-test' },
            platform: 'darwin',
            home: '/Users/test',
        }),
        path.normalize('/tmp/keeperd-test')
    );
    assert.throws(
        () =>
            stateDirectory({
                env: { KEEPERD_STATE_DIR: 'relative' },
                platform: 'darwin',
                home: '/Users/test',
            }),
        /절대 경로/
    );
});
