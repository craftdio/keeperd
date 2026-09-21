import assert from 'node:assert/strict';
import { test } from 'node:test';
import { githubGitEnvironment } from './git-credentials.mjs';

test('uses the authenticated GitHub CLI instead of interactive keychain helpers', () => {
    const environment = githubGitEnvironment({
        PATH: '/usr/bin',
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.sslVerify',
        GIT_CONFIG_VALUE_0: 'true',
    });

    assert.equal(environment.PATH, '/usr/bin');
    assert.equal(environment.GIT_TERMINAL_PROMPT, '0');
    assert.equal(environment.GIT_CONFIG_COUNT, '3');
    assert.equal(environment.GIT_CONFIG_KEY_0, 'http.sslVerify');
    assert.equal(environment.GIT_CONFIG_VALUE_0, 'true');
    assert.equal(
        environment.GIT_CONFIG_KEY_1,
        'credential.https://github.com.helper'
    );
    assert.equal(environment.GIT_CONFIG_VALUE_1, '');
    assert.equal(
        environment.GIT_CONFIG_KEY_2,
        'credential.https://github.com.helper'
    );
    assert.equal(environment.GIT_CONFIG_VALUE_2, '!gh auth git-credential');
});

test('replaces an invalid inherited config count safely', () => {
    const environment = githubGitEnvironment({ GIT_CONFIG_COUNT: 'invalid' });
    assert.equal(environment.GIT_CONFIG_COUNT, '2');
    assert.equal(environment.GIT_CONFIG_VALUE_0, '');
    assert.equal(environment.GIT_CONFIG_VALUE_1, '!gh auth git-credential');
});
