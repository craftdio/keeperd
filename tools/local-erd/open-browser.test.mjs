import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import {
    openDefaultBrowser,
    parseStartOptions,
    shouldOpenBrowser,
} from './open-browser.mjs';

test('start options support help and --no-open but reject unknown arguments', () => {
    assert.deepEqual(parseStartOptions([]), { noOpen: false });
    assert.deepEqual(parseStartOptions(['--no-open']), { noOpen: true });
    assert.deepEqual(parseStartOptions(['--help']), { help: true });
    assert.throws(() => parseStartOptions(['--browser=Comet']), /Unknown/);
});

test('only an interactive macOS session opens the default browser', () => {
    assert.equal(shouldOpenBrowser({ platform: 'darwin', env: {} }), true);
    for (const env of [
        { CI: 'true' },
        { CI: '1' },
        { SSH_CONNECTION: 'remote' },
        { SSH_CLIENT: 'remote' },
        { SSH_TTY: '/dev/tty' },
    ])
        assert.equal(shouldOpenBrowser({ platform: 'darwin', env }), false);
    assert.equal(shouldOpenBrowser({ platform: 'linux', env: {} }), false);
});

test('opens one canonical loopback URL with macOS default browser and no shell', async () => {
    const calls = [];
    const result = openDefaultBrowser('http://localhost:41321/', {
        platform: 'darwin',
        env: {},
        spawnProcess: (command, args, options) => {
            calls.push({ command, args, options });
            const child = new EventEmitter();
            queueMicrotask(() => child.emit('close', 0));
            return child;
        },
    });
    assert.equal(await result, 'opened');
    assert.deepEqual(calls, [
        {
            command: '/usr/bin/open',
            args: ['http://localhost:41321/'],
            options: { stdio: 'ignore' },
        },
    ]);
});

test('skips headless launch and rejects external or malformed URLs', async () => {
    const neverSpawn = () => assert.fail('browser must not launch');
    assert.equal(
        await openDefaultBrowser('http://localhost:41321/', {
            platform: 'darwin',
            env: { CI: 'true' },
            spawnProcess: neverSpawn,
        }),
        'skipped'
    );
    for (const url of [
        'https://example.com/',
        'http://127.0.0.1:41321/',
        'http://localhost:0/',
        'http://localhost:65536/',
        'http://localhost:41321/?next=evil',
    ])
        assert.throws(() => openDefaultBrowser(url), /localhost/);
});

test('browser launch errors do not escape into the server', async () => {
    const url = 'http://localhost:41321/';
    assert.equal(
        await openDefaultBrowser(url, {
            platform: 'darwin',
            env: {},
            spawnProcess: () => {
                throw new Error('unavailable');
            },
        }),
        'failed'
    );
    assert.equal(
        await openDefaultBrowser(url, {
            platform: 'darwin',
            env: {},
            spawnProcess: () => {
                const child = new EventEmitter();
                queueMicrotask(() => child.emit('error', new Error('denied')));
                return child;
            },
        }),
        'failed'
    );
    assert.equal(
        await openDefaultBrowser(url, {
            platform: 'darwin',
            env: {},
            spawnProcess: () => {
                const child = new EventEmitter();
                queueMicrotask(() => child.emit('close', 1));
                return child;
            },
        }),
        'failed'
    );
});
