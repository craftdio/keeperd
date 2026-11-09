import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Public synthetic history: 100 feature refs sharing ten commit tips, three
// worktrees, local tracking refs and one dirty schema. No user checkout is read.
export function branchPerformanceFixture() {
    const root = mkdtempSync(path.join(tmpdir(), 'keeperd-branch-perf-'));
    const repoPath = path.join(root, 'repository');
    mkdirSync(repoPath);
    const git = (...args) =>
        execFileSync('git', ['-C', repoPath, ...args], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
    git('init', '-b', 'main');
    git('config', 'user.name', 'Performance fixture');
    git('config', 'user.email', 'performance@example.invalid');
    git(
        'remote',
        'add',
        'origin',
        'https://github.com/example/performance.git'
    );
    mkdirSync(path.join(repoPath, 'db/migration'), { recursive: true });
    writeFileSync(
        path.join(repoPath, 'db/migration/001.sql'),
        'CREATE TABLE example(id bigint);'
    );
    git('add', '.');
    git('commit', '-m', 'synthetic base');
    const base = git('rev-parse', 'HEAD');
    git('branch', 'develop');
    git('update-ref', 'refs/remotes/origin/main', base);
    git('update-ref', 'refs/remotes/origin/develop', base);
    const tree = git('rev-parse', 'HEAD^{tree}');
    for (let group = 0; group < 10; group++) {
        const tip = git(
            'commit-tree',
            tree,
            '-p',
            base,
            '-m',
            `synthetic tip ${group}`
        );
        for (let index = 0; index < 10; index++) {
            const branch = `feature/${group}-${index}`;
            git('branch', branch, tip);
            if (index % 2 === 0)
                git('update-ref', `refs/remotes/origin/${branch}`, base);
        }
    }
    git('worktree', 'add', path.join(root, 'worktree-a'), 'feature/0-0');
    git('worktree', 'add', path.join(root, 'worktree-b'), 'feature/0-1');
    writeFileSync(
        path.join(root, 'worktree-a/db/migration/002.sql'),
        'CREATE TABLE dirty(id bigint);'
    );
    return {
        root,
        repo: { path: repoPath },
        git,
        close: () => rmSync(root, { recursive: true, force: true }),
    };
}
