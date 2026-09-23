import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemoryCache } from './memory-cache.mjs';

test('reuses values until expiry and supports explicit refresh', async () => {
    let time = 100;
    let calls = 0;
    const cache = createMemoryCache({ ttl: 50, now: () => time });
    const load = async () => ++calls;

    assert.deepEqual(await cache.get('repositories', load), {
        value: 1,
        cached: false,
    });
    assert.deepEqual(await cache.get('repositories', load), {
        value: 1,
        cached: true,
    });
    assert.deepEqual(await cache.get('repositories', load, { refresh: true }), {
        value: 2,
        cached: false,
    });
    time = 151;
    assert.deepEqual(await cache.get('repositories', load), {
        value: 3,
        cached: false,
    });
});

test('coalesces concurrent requests and does not cache failures', async () => {
    const cache = createMemoryCache();
    let resolve;
    let calls = 0;
    const pending = new Promise((done) => {
        resolve = done;
    });
    const load = () => {
        calls++;
        return pending;
    };
    const first = cache.get('branches', load);
    const second = cache.get('branches', load);
    resolve(['main']);
    assert.deepEqual((await first).value, ['main']);
    assert.deepEqual((await second).value, ['main']);
    assert.equal(calls, 1);

    let failures = 0;
    await assert.rejects(
        cache.get('account', async () => {
            failures++;
            throw new Error('offline');
        })
    );
    await assert.rejects(
        cache.get('account', async () => {
            failures++;
            throw new Error('offline');
        })
    );
    assert.equal(failures, 2);
});

test('a slow old request cannot overwrite a forced branch refresh', async () => {
    const cache = createMemoryCache();
    let finishOld;
    const old = cache.get(
        'branches',
        () => new Promise((resolve) => (finishOld = resolve))
    );
    await Promise.resolve();
    assert.deepEqual(
        await cache.get('branches', async () => ['new'], { refresh: true }),
        { value: ['new'], cached: false }
    );
    finishOld(['old']);
    assert.deepEqual((await old).value, ['old']);
    assert.deepEqual(await cache.get('branches', async () => ['unused']), {
        value: ['new'],
        cached: true,
    });
});
