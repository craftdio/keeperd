import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { branchPerformanceFixture } from './branch-performance-fixture.mjs';
import {
    localBranchDetails,
    registerLocalRepository,
} from './local-source.mjs';
import { createLocalBranchReader } from './local-branches.mjs';

test('worker preserves branch semantics, coalesces requests and refreshes refs and dirty schema without a TTL', async (t) => {
    const fixture = branchPerformanceFixture();
    const reader = createLocalBranchReader();
    t.after(async () => {
        await reader.close();
        fixture.close();
    });
    const registered = registerLocalRepository(fixture.repo.path);
    const config = { localRepositories: [registered] };
    const first = reader.read(config, registered.id);
    assert.equal(reader.read(config, registered.id), first);
    assert.deepEqual(await first, localBranchDetails(fixture.repo));
    fixture.git('branch', 'new-branch');
    fixture.git('branch', '-D', 'feature/9-9');
    fixture.git(
        'update-ref',
        'refs/remotes/origin/feature/0-0',
        fixture.git('rev-parse', 'feature/0-0')
    );
    writeFileSync(
        path.join(fixture.repo.path, 'db/migration/dirty.sql'),
        'CREATE TABLE another(id bigint);'
    );
    const refreshed = await reader.read(config, registered.id);
    assert.ok(refreshed.branches.some((b) => b.name === 'new-branch'));
    assert.ok(!refreshed.branches.some((b) => b.name === 'feature/9-9'));
    assert.equal(
        refreshed.branches.find((b) => b.name === 'main').hasWorkingChanges,
        true
    );
    assert.equal(
        refreshed.branches.find((b) => b.name === 'feature/0-0').remoteStatus,
        'same'
    );
    await assert.rejects(reader.read(config, 'unknown'), {
        code: 'LOCAL_NOT_REGISTERED',
    });
    await assert.rejects(
        reader.read(
            {
                localRepositories: [
                    {
                        ...registered,
                        repositoryUrl: 'https://github.com/example/changed',
                    },
                ],
            },
            registered.id
        ),
        { code: 'LOCAL_REPOSITORY_CHANGED' }
    );
});

test('worker capacity, timeout and shutdown settle pending callers and leave the event loop responsive', async (t) => {
    const fixture = branchPerformanceFixture();
    const workerFile = path.join(fixture.root, 'blocked.mjs');
    writeFileSync(workerFile, 'setInterval(() => {}, 1000);');
    const reader = createLocalBranchReader({
        concurrency: 1,
        capacity: 2,
        timeout: 200,
        workerURL: pathToFileURL(workerFile),
    });
    t.after(async () => {
        await reader.close();
        fixture.close();
    });
    const config = {
        localRepositories: [0, 1, 2].map((id) => ({
            id: String(id),
            path: fixture.repo.path,
        })),
    };
    const first = assert.rejects(reader.read(config, '0'), {
        code: 'LOCAL_BRANCH_TIMEOUT',
    });
    const second = assert.rejects(reader.read(config, '1'), {
        code: 'LOCAL_BRANCH_TIMEOUT',
    });
    await assert.rejects(reader.read(config, '2'), {
        code: 'LOCAL_BRANCH_BUSY',
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await Promise.all([first, second]);
    const pending = assert.rejects(reader.read(config, '2'), {
        code: 'LOCAL_REQUEST_FAILED',
    });
    await reader.close();
    await pending;
    await assert.rejects(reader.read(config, '0'), {
        code: 'LOCAL_BRANCH_BUSY',
    });
});
