import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { canonicalRepository, validateBranch } from './branches.mjs';
import { githubGitEnvironment } from './git-credentials.mjs';

export class LocalSourceError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
const fail = (code, message) => {
    throw new LocalSourceError(code, message);
};
const hash = (value) =>
    createHash('sha256').update(value).digest('hex').slice(0, 24);
const schemaSourceDefinitions = [
    {
        kind: 'atlas-schema',
        label: 'Atlas 선언 스키마',
        prefix: 'db/schema/',
        path: 'db/schema/*.sql',
    },
    {
        kind: 'sql-migrations',
        label: 'SQL 마이그레이션',
        prefix: 'db/migration/',
        path: 'db/migration/*.sql',
    },
];

export function selectSchemaSource(input) {
    const names = [...(input instanceof Map ? input.keys() : input)];
    for (const definition of schemaSourceDefinitions) {
        const files = names
            .filter(
                (name) =>
                    name.startsWith(definition.prefix) && name.endsWith('.sql')
            )
            .sort();
        if (files.length) return { ...definition, files };
    }
    fail(
        'SCHEMA_SOURCE_NOT_FOUND',
        '지원 가능한 SQL 스키마 입력이 없습니다. db/schema/*.sql 또는 db/migration/*.sql을 확인하세요.'
    );
}
const git = (repo, ...args) =>
    execFileSync('git', ['-C', repo, ...args], {
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 32 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: githubGitEnvironment(),
    });

export function registerLocalRepository(input) {
    if (typeof input !== 'string' || !path.isAbsolute(input))
        fail(
            'LOCAL_PATH_INVALID',
            '서버 컴퓨터의 clone/worktree 절대 경로를 입력하세요.'
        );
    let repo;
    try {
        repo = realpathSync(input);
    } catch {
        fail('LOCAL_PATH_UNAVAILABLE', '로컬 경로가 없거나 읽을 수 없습니다.');
    }
    let top;
    try {
        const marker = lstatSync(path.join(repo, '.git'));
        if (!marker.isDirectory() && !marker.isFile()) throw new Error();
    } catch {
        fail(
            'LOCAL_PATH_INVALID',
            '선택한 폴더 바로 안에 .git 폴더 또는 파일이 있어야 합니다. 저장소의 최상위 폴더를 선택하세요.'
        );
    }
    try {
        top = realpathSync(git(repo, 'rev-parse', '--show-toplevel').trim());
    } catch {
        fail(
            'LOCAL_NOT_REPOSITORY',
            '읽을 수 있는 Git clone/worktree 루트가 아닙니다.'
        );
    }
    if (repo !== top)
        fail(
            'LOCAL_PATH_INVALID',
            '하위 폴더가 아닌 Git clone/worktree 루트를 등록하세요.'
        );
    let repositoryUrl;
    try {
        const origin = git(repo, 'remote', 'get-url', 'origin').trim();
        repositoryUrl = canonicalRepository(
            origin.replace(/^git@github\.com:/, 'https://github.com/')
        );
    } catch {
        fail(
            'LOCAL_ORIGIN_INVALID',
            '인증정보 없는 GitHub HTTPS 또는 git@github.com origin이 필요합니다.'
        );
    }
    return { id: hash(repo), path: repo, repositoryUrl };
}

export function resolveLocalRepository(config, id) {
    const registered = config.localRepositories?.find((r) => r.id === id);
    if (!registered)
        fail('LOCAL_NOT_REGISTERED', '먼저 로컬 clone/worktree를 등록하세요.');
    const actual = registerLocalRepository(registered.path);
    if (
        actual.id !== registered.id ||
        actual.repositoryUrl !== registered.repositoryUrl
    )
        fail(
            'LOCAL_REPOSITORY_CHANGED',
            '등록 경로나 origin이 바뀌었습니다. 다시 등록하세요.'
        );
    return actual;
}

export function localBranches(repo) {
    const branches = git(
        repo.path,
        'for-each-ref',
        '--sort=-committerdate',
        '--format=%(refname:short)',
        'refs/heads'
    )
        .trim()
        .split('\n')
        .filter(Boolean);
    let current = '';
    try {
        current = git(
            repo.path,
            'symbolic-ref',
            '--quiet',
            '--short',
            'HEAD'
        ).trim();
    } catch {
        /* Detached HEAD has no worktree branch. */
    }
    return { branches, current, remoteStatus: 'unconfirmed' };
}

export function describeLocalRepository(registered) {
    const repo = registerLocalRepository(registered.path);
    const { current } = localBranches(repo);
    const gitDirectory = path.resolve(
        repo.path,
        git(repo.path, 'rev-parse', '--git-dir').trim()
    );
    const commonDirectory = path.resolve(
        repo.path,
        git(repo.path, 'rev-parse', '--git-common-dir').trim()
    );
    return {
        ...repo,
        currentBranch: current,
        directoryName: path.basename(repo.path),
        commonDirectory,
        linkedWorktree: gitDirectory !== commonDirectory,
    };
}

function relationToRemote(repo, commit, remoteCommit) {
    if (!remoteCommit)
        return { remoteStatus: 'unpublished', ahead: 0, behind: 0 };
    if (remoteCommit === commit)
        return { remoteStatus: 'same', ahead: 0, behind: 0 };
    try {
        const [behind, ahead] = git(
            repo.path,
            'rev-list',
            '--left-right',
            '--count',
            `${remoteCommit}...${commit}`
        )
            .trim()
            .split(/\s+/)
            .map(Number);
        return {
            remoteStatus:
                ahead && behind ? 'diverged' : ahead ? 'ahead' : 'behind',
            ahead,
            behind,
        };
    } catch {
        return { remoteStatus: 'unconfirmed', ahead: 0, behind: 0 };
    }
}

function branchWorktrees(repo) {
    const result = new Map();
    const records = git(repo.path, 'worktree', 'list', '--porcelain')
        .trim()
        .split(/\n\n+/);
    for (const record of records) {
        const lines = record.split('\n');
        const worktreePath = lines
            .find((line) => line.startsWith('worktree '))
            ?.slice(9);
        const branch = lines
            .find((line) => line.startsWith('branch refs/heads/'))
            ?.slice('branch refs/heads/'.length);
        if (!worktreePath || !branch) continue;
        let hasWorkingChanges = false;
        try {
            hasWorkingChanges = Boolean(
                git(
                    worktreePath,
                    'status',
                    '--porcelain=v1',
                    '--untracked-files=all',
                    '--',
                    'db/migration',
                    'db/schema'
                ).trim()
            );
        } catch {
            /* A prunable or temporarily unavailable worktree is not selectable. */
        }
        result.set(branch, { worktreePath, hasWorkingChanges });
    }
    return result;
}

function refCommits(repo, prefix) {
    const commits = new Map();
    const lines = git(
        repo.path,
        'for-each-ref',
        '--format=%(refname) %(objectname)',
        prefix
    )
        .trim()
        .split('\n')
        .filter(Boolean);
    for (const line of lines) {
        const separator = line.lastIndexOf(' ');
        commits.set(line.slice(0, separator), line.slice(separator + 1));
    }
    return commits;
}

function commonBase(repo, branch, branches) {
    const candidates = ['develop', 'main'].filter(
        (candidate) => candidate !== branch
    );
    const matches = [];
    for (const candidate of candidates) {
        try {
            const remoteRef = `refs/remotes/origin/${candidate}`;
            let candidateRef;
            try {
                git(
                    repo.path,
                    'rev-parse',
                    '--verify',
                    `${remoteRef}^{commit}`
                );
                candidateRef = remoteRef;
            } catch {
                if (!branches.includes(candidate)) continue;
                candidateRef = `refs/heads/${candidate}`;
            }
            const commit = git(
                repo.path,
                'merge-base',
                `refs/heads/${branch}`,
                candidateRef
            ).trim();
            const distance = Number(
                git(
                    repo.path,
                    'rev-list',
                    '--count',
                    `${commit}..refs/heads/${branch}`
                ).trim()
            );
            matches.push({ branch: candidate, commit, distance });
        } catch {
            /* Unrelated histories have no useful common base label. */
        }
    }
    return matches.sort(
        (a, b) =>
            a.distance - b.distance ||
            candidates.indexOf(a.branch) - candidates.indexOf(b.branch)
    )[0];
}

export function localComparisonBase(repo, branch) {
    validateBranch(branch);
    const { branches } = localBranches(repo);
    if (!branches.includes(branch))
        fail('LOCAL_REF_NOT_FOUND', '로컬 브랜치를 찾을 수 없습니다.');
    return commonBase(repo, branch, branches);
}

export function localBranchDetails(repo) {
    const { branches, current } = localBranches(repo);
    const worktrees = branchWorktrees(repo);
    const localCommits = refCommits(repo, 'refs/heads');
    const remoteCommits = refCommits(repo, 'refs/remotes/origin');
    return {
        current,
        remoteBasis: 'local-tracking',
        branches: branches.map((name) => {
            const commit = localCommits.get(`refs/heads/${name}`) ?? '';
            const remoteCommit =
                remoteCommits.get(`refs/remotes/origin/${name}`) ?? '';
            const relation = relationToRemote(repo, commit, remoteCommit);
            const worktree = worktrees.get(name) ?? {
                worktreePath: null,
                hasWorkingChanges: false,
            };
            const base =
                relation.remoteStatus !== 'same' || worktree.hasWorkingChanges
                    ? commonBase(repo, name, branches)
                    : null;
            return {
                name,
                commit,
                remoteCommit: remoteCommit || null,
                ...relation,
                ...worktree,
                base: base
                    ? { branch: base.branch, commit: base.commit }
                    : null,
            };
        }),
    };
}

export function localDiagramKey(repo, branch, mode) {
    return `local-${hash(`${repo.repositoryUrl}:${repo.id}:${branch}:${mode}`)}`;
}

export function checkRemoteBranch(repo, branch) {
    validateBranch(branch);
    let commit;
    try {
        commit = git(
            repo.path,
            'rev-parse',
            '--verify',
            `refs/heads/${branch}^{commit}`
        ).trim();
    } catch {
        fail('LOCAL_REF_NOT_FOUND', '로컬 브랜치를 찾을 수 없습니다.');
    }
    const checkedAt = new Date().toISOString();
    try {
        const remote = git(
            repo.path,
            'ls-remote',
            '--exit-code',
            'origin',
            `refs/heads/${branch}`
        )
            .trim()
            .split(/\s+/)[0];
        return {
            commit,
            remoteCommit: remote,
            checkedAt,
            ...relationToRemote(repo, commit, remote),
        };
    } catch (error) {
        return {
            commit,
            checkedAt,
            remoteStatus: error.status === 2 ? 'unpublished' : 'unconfirmed',
        };
    }
}

function capture(repo, branch, mode) {
    validateBranch(branch);
    if (!['commit', 'worktree'].includes(mode))
        fail('LOCAL_MODE_INVALID', '로컬 입력 모드를 확인하세요.');
    let sha;
    try {
        sha = git(
            repo.path,
            'rev-parse',
            '--verify',
            `refs/heads/${branch}^{commit}`
        ).trim();
    } catch {
        fail('LOCAL_REF_NOT_FOUND', '로컬 브랜치를 찾을 수 없습니다.');
    }
    if (mode === 'worktree' && localBranches(repo).current !== branch)
        fail(
            'LOCAL_WORKTREE_BRANCH_MISMATCH',
            '작업 중 변경은 현재 checkout 브랜치에서만 포함할 수 있습니다. Detached HEAD는 브랜치 커밋 모드를 사용하세요.'
        );
    const files = new Map();
    if (mode === 'commit') {
        const entries = git(
            repo.path,
            'ls-tree',
            '-rz',
            sha,
            '--',
            'db/migration',
            'db/schema'
        )
            .split('\0')
            .filter(Boolean);
        for (const entry of entries) {
            const match = /^(\d+) blob ([\da-f]+)\t([\s\S]+)$/.exec(entry);
            if (!match || !match[3].endsWith('.sql')) continue;
            if (!['100644', '100755'].includes(match[1]))
                fail(
                    'LOCAL_UNSAFE_PATH',
                    'SQL 입력에 symlink 등 안전하지 않은 파일이 있습니다.'
                );
            files.set(match[3], git(repo.path, 'cat-file', 'blob', match[2]));
        }
    } else {
        const names = git(
            repo.path,
            'ls-files',
            '-z',
            '--cached',
            '--others',
            '--exclude-standard',
            '--',
            'db/migration',
            'db/schema'
        )
            .split('\0')
            .filter((name) => name.endsWith('.sql'));
        for (const name of [...new Set(names)].sort()) {
            const absolute = path.resolve(repo.path, name);
            if (!absolute.startsWith(repo.path + path.sep))
                fail(
                    'LOCAL_UNSAFE_PATH',
                    '등록 경로 밖의 파일은 읽지 않습니다.'
                );
            try {
                // Check every component, not only the leaf: parent symlinks can escape.
                let component = repo.path;
                for (const part of name.split('/')) {
                    component = path.join(component, part);
                    if (lstatSync(component).isSymbolicLink())
                        fail(
                            'LOCAL_UNSAFE_PATH',
                            'SQL 입력에 symlink가 있습니다.'
                        );
                }
                if (!lstatSync(absolute).isFile())
                    fail(
                        'LOCAL_UNSAFE_PATH',
                        'SQL 입력은 일반 파일이어야 합니다.'
                    );
                try {
                    git(
                        repo.path,
                        'check-ignore',
                        '--no-index',
                        '--quiet',
                        '--',
                        name
                    );
                    continue;
                } catch (error) {
                    if (error.status !== 1) throw error;
                }
                files.set(name, readFileSync(absolute, 'utf8'));
            } catch (error) {
                if (error.code === 'ENOENT') continue; // Tracked deletion is part of the worktree input.
                if (error instanceof LocalSourceError) throw error;
                fail(
                    'LOCAL_CAPTURE_FAILED',
                    '로컬 SQL 입력을 읽을 수 없습니다. 권한과 변경 상태를 확인하세요.'
                );
            }
        }
    }
    const schemaSource = selectSchemaSource(files);
    const fingerprint = hash(
        JSON.stringify(
            schemaSource.files.map((name) => [name, files.get(name)])
        )
    );
    return { sha, fingerprint, files, schemaSource };
}

export function captureLocalCommit(repo, revision) {
    if (typeof revision !== 'string' || !/^[\da-f]{7,64}$/i.test(revision))
        fail('LOCAL_REF_NOT_FOUND', '비교 기준 커밋을 찾을 수 없습니다.');
    let sha;
    try {
        sha = git(
            repo.path,
            'rev-parse',
            '--verify',
            `${revision}^{commit}`
        ).trim();
    } catch {
        fail('LOCAL_REF_NOT_FOUND', '비교 기준 커밋을 찾을 수 없습니다.');
    }
    const files = new Map();
    const entries = git(
        repo.path,
        'ls-tree',
        '-rz',
        sha,
        '--',
        'db/migration',
        'db/schema'
    )
        .split('\0')
        .filter(Boolean);
    for (const entry of entries) {
        const match = /^(\d+) blob ([\da-f]+)\t([\s\S]+)$/.exec(entry);
        if (!match || !match[3].endsWith('.sql')) continue;
        if (!['100644', '100755'].includes(match[1]))
            fail(
                'LOCAL_UNSAFE_PATH',
                '비교 기준 SQL 입력에 symlink 등 안전하지 않은 파일이 있습니다.'
            );
        files.set(match[3], git(repo.path, 'cat-file', 'blob', match[2]));
    }
    return { sha, files, schemaSource: selectSchemaSource(files) };
}

export function captureLocalSource(repo, branch, mode = 'commit') {
    const first = capture(repo, branch, mode);
    const second = capture(repo, branch, mode);
    if (first.sha !== second.sha || first.fingerprint !== second.fingerprint)
        fail(
            'LOCAL_INPUT_CHANGED',
            '캡처 중 입력이 변경됐습니다. 다시 동기화하세요.'
        );
    return {
        ...first,
        key: localDiagramKey(repo, branch, mode),
        source: {
            kind: 'local',
            repositoryId: repo.id,
            mode,
            commit: first.sha,
            fingerprint: first.fingerprint,
            capturedAt: new Date().toISOString(),
            remoteStatus: 'unconfirmed',
            notice:
                mode === 'worktree'
                    ? '로컬 작업 폴더 기준입니다. 미커밋 변경은 원격 GitHub에 반영되지 않은 로컬 변경입니다.'
                    : '로컬 브랜치 커밋 기준입니다. 원격 GitHub 반영 여부는 미확인입니다.',
        },
    };
}
