import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyGitError } from './sync-errors.mjs';

test('classifies GitHub auth, permission, network, branch, and generic failures', () => {
    const classify = (stderr, args = ['fetch']) =>
        classifyGitError({ stderr }, args).code;
    assert.equal(classify('Authentication failed'), 'GITHUB_AUTH_REQUIRED');
    assert.equal(classify('repository not found'), 'GITHUB_PERMISSION_DENIED');
    assert.equal(classify('Could not resolve host'), 'GITHUB_NETWORK_FAILED');
    assert.equal(
        classify("couldn't find remote ref feature", ['fetch']),
        'GIT_BRANCH_NOT_FOUND'
    );
    assert.equal(classify('unexpected failure'), 'GIT_OPERATION_FAILED');
});
