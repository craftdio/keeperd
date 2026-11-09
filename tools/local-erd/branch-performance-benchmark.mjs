import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { branchPerformanceFixture } from './branch-performance-fixture.mjs';
import { localBranchDetails } from './local-source.mjs';
import { registerLocalRepository } from './local-source.mjs';
import { createLocalBranchReader } from './local-branches.mjs';

const fixture = branchPerformanceFixture();
const reader = createLocalBranchReader();
try {
    const registered = registerLocalRepository(fixture.repo.path);
    const trace = path.join(fixture.root, 'git-trace.log');
    process.env.GIT_TRACE = trace;
    const started = performance.now();
    let timerDelay;
    const timer = new Promise((resolve) =>
        setTimeout(() => {
            timerDelay = performance.now() - started;
            resolve();
        }, 10)
    );
    const value = process.argv.includes('--worker')
        ? await reader.read({ localRepositories: [registered] }, registered.id)
        : await localBranchDetails(fixture.repo);
    const ms = performance.now() - started;
    await timer;
    assert.equal(value.branches.length, 102);
    assert.equal(value.branches.filter((b) => b.hasWorkingChanges).length, 1);
    assert.equal(
        value.branches.find((b) => b.name === 'feature/0-0').base.branch,
        'develop'
    );
    console.log(
        JSON.stringify(
            {
                node: process.version,
                branches: 102,
                distinctFeatureTips: 10,
                worktrees: 3,
                ms,
                timerDelayMs: timerDelay,
                gitProcesses: readFileSync(trace, 'utf8')
                    .split('\n')
                    .filter((line) => line.includes('built-in: git')).length,
            },
            null,
            2
        )
    );
} finally {
    await reader.close();
    delete process.env.GIT_TRACE;
    fixture.close();
}
