import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import {
    chmodSync,
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { githubGitEnvironment } from './git-credentials.mjs';

test('uses the authenticated GitHub CLI instead of interactive keychain helpers', () => {
    const environment = githubGitEnvironment({
        PATH: '/usr/bin',
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.sslVerify',
        GIT_CONFIG_VALUE_0: 'true',
        GIT_ASKPASS: '/inherited/gui-prompt',
        SSH_ASKPASS: '/inherited/ssh-prompt',
    });

    assert.equal(environment.PATH, '/usr/bin');
    assert.equal(environment.GIT_TERMINAL_PROMPT, '0');
    assert.equal(environment.GIT_ASKPASS, '');
    assert.equal(environment.SSH_ASKPASS, '');
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

function credentialFixture(t) {
    const root = mkdtempSync(path.join(os.tmpdir(), 'keeperd-credentials-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const trace = path.join(root, 'trace');
    const legacy = path.join(root, 'legacy-helper');
    const askpass = path.join(root, 'askpass');
    const gh = path.join(root, 'gh');
    writeFileSync(
        legacy,
        '#!/bin/sh\nprintf "legacy-%s\\n" "$1" >> "$KEEPERD_CREDENTIAL_TRACE"\nprintf "username=fixture\\npassword=synthetic-test-value\\n"\n'
    );
    writeFileSync(
        askpass,
        '#!/bin/sh\necho askpass >> "$KEEPERD_CREDENTIAL_TRACE"\nexit 1\n'
    );
    writeFileSync(
        gh,
        '#!/bin/sh\nprintf "gh-%s\\n" "$3" >> "$KEEPERD_CREDENTIAL_TRACE"\ncat >/dev/null\nif [ "${KEEPERD_GH_FAILURE:-0}" = 1 ]; then exit 1; fi\nif [ "$3" = get ]; then printf "username=fixture\\npassword=synthetic-test-value\\n"; fi\n'
    );
    for (const file of [legacy, askpass, gh]) chmodSync(file, 0o755);
    const environment = {
        PATH: `${root}${path.delimiter}${process.env.PATH}`,
        HOME: root,
        XDG_CONFIG_HOME: root,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: path.join(root, 'gitconfig'),
        GIT_ASKPASS: askpass,
        SSH_ASKPASS: askpass,
        GIT_TERMINAL_PROMPT: '0',
        KEEPERD_CREDENTIAL_TRACE: trace,
        KEEPERD_LEGACY_HELPER: legacy,
    };
    const configured = spawnSync(
        'git',
        [
            'config',
            '--global',
            'credential.helper',
            '!sh "$KEEPERD_LEGACY_HELPER"',
        ],
        { env: environment, encoding: 'utf8' }
    );
    assert.equal(configured.status, 0, configured.stderr);
    const configuredAskpass = spawnSync(
        'git',
        ['config', '--global', 'core.askPass', askpass],
        { env: environment, encoding: 'utf8' }
    );
    assert.equal(configuredAskpass.status, 0, configuredAskpass.stderr);
    return {
        environment,
        trace: () =>
            existsSync(trace)
                ? readFileSync(trace, 'utf8').trim().split('\n')
                : [],
        clear: () => rmSync(trace, { force: true }),
        run: (env, operation = 'fill') =>
            spawnSync('git', ['credential', operation], {
                cwd: root,
                env,
                encoding: 'utf8',
                timeout: 5000,
                input: `protocol=https\nhost=github.com\n${operation === 'fill' ? '' : 'username=fixture\npassword=synthetic-test-value\n'}\n`,
            }),
    };
}

test('actual Git bypasses the inherited helper for get, store and erase', (t) => {
    const fixture = credentialFixture(t);
    const control = fixture.run(fixture.environment);
    assert.equal(control.status, 0, control.stderr);
    assert.deepEqual(fixture.trace(), ['legacy-get']);
    fixture.clear();
    for (const operation of ['fill', 'approve', 'reject']) {
        const result = fixture.run(
            githubGitEnvironment(fixture.environment),
            operation
        );
        assert.equal(result.status, 0, result.stderr);
    }
    assert.deepEqual(fixture.trace(), ['gh-get', 'gh-store', 'gh-erase']);
});

test('failed GitHub CLI authentication never falls back to inherited helpers or GUI askpass', (t) => {
    const fixture = credentialFixture(t);
    const result = fixture.run(
        githubGitEnvironment({
            ...fixture.environment,
            KEEPERD_GH_FAILURE: '1',
        })
    );
    assert.notEqual(result.status, 0);
    assert.deepEqual(fixture.trace(), ['gh-get']);
    assert.match(result.stderr, /terminal prompts disabled/);
});
