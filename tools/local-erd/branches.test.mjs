import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    branchKey,
    validateBranch,
    repositorySlug,
    mergeSnapshots,
    diagramKey,
    repositoryKey,
    canonicalRepository,
    githubFailure,
    sortBranchesByUpdatedAt,
} from './branches.mjs';

test('keeps existing IDs and safely isolates special branch names', () => {
    assert.equal(branchKey('main'), 'main');
    assert.equal(branchKey('develop'), 'develop');
    const branches = [
        'feat/#123-schema',
        'feat/schema',
        'feat-schema',
        '기능/스키마',
    ];
    assert.equal(new Set(branches.map(branchKey)).size, branches.length);
    for (const b of branches) {
        assert.match(branchKey(b), /^branch-[a-f0-9]{24}$/);
        assert.equal(branchKey(b), branchKey(b));
    }
});
test('distinguishes missing CLI and invalid authentication from connection/permission failures', () => {
    assert.equal(githubFailure({ code: 'ENOENT' }).code, 'CLI_MISSING');
    for (const stderr of [
        'To get started, run gh auth login',
        'Bad credentials (HTTP 401)',
        'The authentication token is invalid',
    ]) {
        const error = githubFailure({ stderr });
        assert.equal(error.status, 401);
        assert.equal(error.code, 'AUTH_REQUIRED');
        assert.ok(!error.error.includes(stderr));
    }
    for (const stderr of [
        'Could not resolve host',
        'Forbidden (HTTP 403)',
        'Not Found (HTTP 404)',
    ])
        assert.equal(githubFailure({ stderr }).code, 'GITHUB_UNAVAILABLE');
});
test('sorts branches by their latest commit time and uses names only as a stable tie-breaker', () => {
    assert.deepEqual(
        sortBranchesByUpdatedAt([
            { name: 'main', updatedAt: '2026-09-01T00:00:00Z' },
            { name: 'feat/older', updatedAt: '2026-08-01T00:00:00Z' },
            { name: 'feat/newer', updatedAt: '2026-09-02T00:00:00Z' },
            { name: 'develop', updatedAt: '2026-09-01T00:00:00Z' },
        ]).map((branch) => branch.name),
        ['feat/newer', 'develop', 'main', 'feat/older']
    );
});
test('isolates equal branch names across repositories while keeping legacy layouts', () => {
    const primary = 'https://github.com/Example/Backend.git';
    const other = 'https://github.com/example/other.git';
    assert.equal(
        canonicalRepository(primary),
        'https://github.com/example/backend.git'
    );
    assert.equal(
        repositoryKey(primary),
        repositoryKey('https://github.com/example/backend')
    );
    assert.equal(diagramKey(primary, 'main', primary), 'main');
    assert.match(diagramKey(primary, 'main'), /^repo-[a-f0-9]{24}-main$/);
    assert.equal(diagramKey(primary, 'feat/#1', primary), branchKey('feat/#1'));
    assert.notEqual(
        diagramKey(other, 'main', primary),
        diagramKey(primary, 'main', primary)
    );
    assert.notEqual(
        diagramKey(other, 'feat/#1', primary),
        diagramKey(other, 'main', primary)
    );
    assert.ok(diagramKey(other, 'feat/#1', primary).length <= 63);
    const snapshots = [
        { repositoryUrl: primary, branch: 'main', revision: 'a' },
        { repositoryUrl: other, branch: 'main', revision: 'b' },
    ];
    const updated = mergeSnapshots(snapshots, [
        {
            repositoryUrl: canonicalRepository(primary),
            branch: 'main',
            revision: 'c',
        },
    ]);
    assert.deepEqual(
        updated.map((s) => s.revision),
        ['c', 'b']
    );
});
test('rejects invalid refs and option/path injection', () => {
    for (const b of [
        null,
        '',
        '--help',
        '../main',
        'a..b',
        '/main',
        'a/',
        'a//b',
        'a.lock',
        'a b',
        'a\nb',
        'a~1',
        'a@{1}',
        'a\\b',
    ])
        assert.throws(() => validateBranch(b));
});
test('only accepts credential-free GitHub repository URLs', () => {
    assert.equal(
        repositorySlug('https://github.com/example/backend.git'),
        'example/backend'
    );
    assert.throws(() =>
        repositorySlug('https://token@github.com/example/backend')
    );
    assert.throws(() => repositorySlug('https://example.com/example/backend'));
});
test('updating a branch preserves all other snapshots without duplicates', () => {
    const previous = [
        { branch: 'main', revision: 'a' },
        { branch: 'develop', revision: 'b' },
    ];
    const next = mergeSnapshots(previous, [
        { branch: 'develop', revision: 'c' },
        { branch: 'feat/#1', revision: 'd' },
    ]);
    assert.deepEqual(
        next.map((s) => s.revision),
        ['a', 'c', 'd']
    );
    assert.equal(previous[1].revision, 'b');
    assert.deepEqual(mergeSnapshots(next, next), next);
});
