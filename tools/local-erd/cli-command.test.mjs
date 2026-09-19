import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localCommand } from './cli-command.mjs';

test('uses keeperd commands only when invoked through the package CLI', () => {
    assert.equal(localCommand('init', { env: {} }), 'npm run local:init');
    assert.equal(
        localCommand('start', { env: { KEEPERD_CLI: '1' } }),
        'keeperd start'
    );
});
